from datetime import datetime, timedelta
from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field, EmailStr
import io

from app.db.session import get_db
from app.core.config import get_settings
from app.models import (
    User, Session, IngestionBatch, SourceRecord, SourceKind, Entity, Claim,
    Case, CaseEntity, CaseNote, CaseAction, CaseTimeline, EvidencePackage,
    AuditLog, UserRole, CaseStatus, ActionType, ActionStatus, EpistemicClass
)
from app.ingestion.csv_ingestion import ingest_csv_file, load_batch_to_graph
from app.ingestion.pdf_ingestion import ingest_bank_pdf
from app.services.entity_resolution import run_entity_resolution
from app.ml.model import get_scorer, get_fallback_scorer
from app.ml.adversarial import CounterfactualEngine, ExculpatoryEngine
from app.agents.orchestrator import run_agent_pipeline
from app.evidence.generator import evidence_generator
from app.graph.connection import Neo4jConnection
from app.graph.queries import CYPHER_QUERIES
from app.auth.security import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_supervisor, get_password_fingerprint
)

settings = get_settings()

router = APIRouter(prefix="/api/v1", tags=["v1"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str | None = None
    badge_number: str | None = None
    department: str | None = None
    role: UserRole = UserRole.INVESTIGATOR


class UserResponse(BaseModel):
    id: UUID
    username: str
    email: str
    full_name: str | None
    badge_number: str | None
    department: str | None
    role: UserRole
    is_active: bool
    created_at: datetime


class IngestionResponse(BaseModel):
    batch_id: UUID
    batch_hash: str
    accepted_rows: int
    rejected_rows: int
    status: str


class EntityResponse(BaseModel):
    id: UUID
    canonical_id: str
    entity_type: str
    risk_score: float | None
    risk_band: str | None
    shap_factors: list[dict] | None
    counterfactual_boundary: dict | None
    exculpatory_reduction: float | None
    final_adjusted_score: float | None


class CaseCreate(BaseModel):
    case_number: str
    title: str
    description: str | None = None


class CaseResponse(BaseModel):
    id: UUID
    case_number: str
    title: str
    description: str | None
    status: CaseStatus
    owner_id: UUID
    opened_at: datetime
    closed_at: datetime | None
    disposition: str | None


class CaseNoteCreate(BaseModel):
    content: str


class CaseActionCreate(BaseModel):
    entity_id: UUID
    action_type: ActionType
    rationale: str = Field(min_length=10)
    parameters: dict = {}


class EvidencePackageRequest(BaseModel):
    format: str = Field(pattern="^(pdf|json|text)$", default="pdf")


@router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == request.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=15)
            await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(status_code=423, detail="Account temporarily locked")

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.utcnow()

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    fingerprint = get_password_fingerprint(user.password_hash)

    session = Session(
        user_id=user.id,
        token=token,
        password_hash_fingerprint=fingerprint,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    db.add(session)
    await db.commit()

    return LoginResponse(
        access_token=token,
        user={
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
        }
    )


@router.post("/auth/logout")
async def logout(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    auth_header = ""
    result = await db.execute(select(Session).where(Session.user_id == current_user.id, Session.revoked_at.is_(None)))
    sessions = result.scalars().all()
    for session in sessions:
        session.revoked_at = datetime.utcnow()
    await db.commit()
    return {"message": "Logged out successfully"}


@router.get("/users/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        badge_number=current_user.badge_number,
        department=current_user.department,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
    )


@router.post("/ingest/csv", response_model=IngestionResponse)
async def ingest_csv(
    file: UploadFile = File(...),
    source_type: SourceKind = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    batch = await ingest_csv_file(db, content, source_type, file.filename, current_user.id)
    await db.commit()

    stats = await load_batch_to_graph(db, batch.id)

    return IngestionResponse(
        batch_id=batch.id,
        batch_hash=batch.batch_hash,
        accepted_rows=batch.accepted_rows,
        rejected_rows=batch.rejected_rows,
        status=batch.status.value,
    )


@router.post("/ingest/pdf/bank", response_model=IngestionResponse)
async def ingest_bank_pdf_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    batch = await ingest_bank_pdf(db, content, file.filename, current_user.id)
    await db.commit()

    stats = await load_batch_to_graph(db, batch.id)

    return IngestionResponse(
        batch_id=batch.id,
        batch_hash=batch.batch_hash,
        accepted_rows=batch.accepted_rows,
        rejected_rows=batch.rejected_rows,
        status=batch.status.value,
    )


@router.get("/ingest/batches")
async def list_batches(
    source_type: SourceKind | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(IngestionBatch).order_by(IngestionBatch.created_at.desc())
    if source_type:
        query = query.where(IngestionBatch.source_type == source_type)
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    batches = result.scalars().all()

    return [
        {
            "id": str(b.id),
            "batch_hash": b.batch_hash,
            "source_type": b.source_type.value,
            "filename": b.source_filename,
            "row_count": b.row_count,
            "accepted": b.accepted_rows,
            "rejected": b.rejected_rows,
            "status": b.status.value,
            "chain_position": b.chain_position,
            "created_at": b.created_at.isoformat(),
        }
        for b in batches
    ]


@router.get("/entities", response_model=list[EntityResponse])
async def list_entities(
    risk_band: str | None = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Entity).order_by(Entity.risk_score.desc().nullslast())
    if risk_band:
        query = query.where(Entity.risk_band == risk_band)
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    entities = result.scalars().all()

    return [
        EntityResponse(
            id=e.id,
            canonical_id=e.canonical_id,
            entity_type=e.entity_type,
            risk_score=e.risk_score,
            risk_band=e.risk_band,
            shap_factors=e.shap_factors,
            counterfactual_boundary=e.counterfactual_boundary,
            exculpatory_reduction=e.exculpatory_reduction,
            final_adjusted_score=e.final_adjusted_score,
        )
        for e in entities
    ]


@router.get("/entities/{entity_id}", response_model=EntityResponse)
async def get_entity(
    entity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    return EntityResponse(
        id=entity.id,
        canonical_id=entity.canonical_id,
        entity_type=entity.entity_type,
        risk_score=entity.risk_score,
        risk_band=entity.risk_band,
        shap_factors=entity.shap_factors,
        counterfactual_boundary=entity.counterfactual_boundary,
        exculpatory_reduction=entity.exculpatory_reduction,
        final_adjusted_score=entity.final_adjusted_score,
    )


@router.get("/entities/{entity_id}/graph")
async def get_entity_graph(
    entity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    driver = await Neo4jConnection.get_driver()
    async with driver.session() as session:
        result = await session.run(
            CYPHER_QUERIES["get_subgraph_for_visualization"],
            {"canonical_id": entity.canonical_id}
        )
        data = await result.data()

    return data[0] if data else {"nodes": [], "relationships": []}


@router.post("/entities/{entity_id}/score")
async def score_entity(
    entity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    driver = await Neo4jConnection.get_driver()
    async with driver.session() as session:
        result = await session.run(
            CYPHER_QUERIES["get_all_entities_for_scoring"],
            {}
        )
        entities_data = [r.data() for r in result]

    entity_data = next((e for e in entities_data if e["person_id"] == entity.canonical_id), None)
    if not entity_data:
        raise HTTPException(status_code=404, detail="Entity data not found in graph")

    scorer = get_scorer()
    try:
        risk_result = scorer.predict(entity_data)
    except Exception:
        fallback = get_fallback_scorer()
        risk_result = fallback.score(entity_data)

    counterfactual = CounterfactualEngine()
    boundary_result = counterfactual.find_boundary(entity_data)

    exculpatory = ExculpatoryEngine()
    exculpatory_result = exculpatory.run_checks(entity_data, risk_result)

    entity.risk_score = risk_result["risk_score"]
    entity.risk_band = risk_result["risk_band"]
    entity.shap_factors = risk_result["shap_factors"]
    entity.counterfactual_boundary = boundary_result["boundary"]
    entity.exculpatory_reduction = exculpatory_result["total_reduction"]
    entity.final_adjusted_score = exculpatory_result["adjusted_score"]
    await db.commit()

    return {
        "risk_assessment": risk_result,
        "counterfactual": boundary_result,
        "exculpatory": exculpatory_result,
    }


@router.post("/entity-resolution/run")
async def run_entity_resolution_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await run_entity_resolution()
    return result


@router.post("/cases", response_model=CaseResponse)
async def create_case(
    case_data: CaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Case).where(Case.case_number == case_data.case_number))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Case number already exists")

    case = Case(
        case_number=case_data.case_number,
        title=case_data.title,
        description=case_data.description,
        owner_id=current_user.id,
    )
    db.add(case)
    await db.flush()

    timeline = CaseTimeline(
        case_id=case.id,
        event_time=datetime.utcnow(),
        event_type="case_created",
        description=f"Case created: {case.title}",
        actor_id=current_user.id,
    )
    db.add(timeline)
    await db.commit()

    return CaseResponse(
        id=case.id,
        case_number=case.case_number,
        title=case.title,
        description=case.description,
        status=case.status,
        owner_id=case.owner_id,
        opened_at=case.opened_at,
        closed_at=case.closed_at,
        disposition=case.disposition,
    )


@router.get("/cases", response_model=list[CaseResponse])
async def list_cases(
    status: CaseStatus | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Case).order_by(Case.opened_at.desc())
    if status:
        query = query.where(Case.status == status)
    if current_user.role == UserRole.INVESTIGATOR:
        query = query.where(Case.owner_id == current_user.id)
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    cases = result.scalars().all()

    return [
        CaseResponse(
            id=c.id,
            case_number=c.case_number,
            title=c.title,
            description=c.description,
            status=c.status,
            owner_id=c.owner_id,
            opened_at=c.opened_at,
            closed_at=c.closed_at,
            disposition=c.disposition,
        )
        for c in cases
    ]


@router.get("/cases/{case_id}", response_model=CaseResponse)
async def get_case(
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return CaseResponse(
        id=case.id,
        case_number=case.case_number,
        title=case.title,
        description=case.description,
        status=case.status,
        owner_id=case.owner_id,
        opened_at=case.opened_at,
        closed_at=case.closed_at,
        disposition=case.disposition,
    )


@router.post("/cases/{case_id}/entities/{entity_id}")
async def add_entity_to_case(
    case_id: UUID,
    entity_id: UUID,
    pinned: bool = False,
    priority: int = 0,
    notes: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    entity_result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = entity_result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    existing = await db.execute(
        select(CaseEntity).where(CaseEntity.case_id == case_id, CaseEntity.entity_id == entity_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Entity already in case")

    case_entity = CaseEntity(
        case_id=case_id,
        entity_id=entity_id,
        pinned=pinned,
        priority=priority,
        notes=notes,
        added_by=current_user.id,
    )
    db.add(case_entity)

    timeline = CaseTimeline(
        case_id=case_id,
        entity_id=entity_id,
        event_time=datetime.utcnow(),
        event_type="entity_added",
        description=f"Entity {entity.canonical_id} added to case",
        actor_id=current_user.id,
    )
    db.add(timeline)
    await db.commit()

    return {"message": "Entity added to case"}


@router.post("/cases/{case_id}/notes")
async def add_case_note(
    case_id: UUID,
    note: CaseNoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    case_note = CaseNote(
        case_id=case_id,
        author_id=current_user.id,
        content=note.content,
    )
    db.add(case_note)
    await db.commit()

    return {"id": str(case_note.id), "message": "Note added"}


@router.post("/cases/{case_id}/actions")
async def create_case_action(
    case_id: UUID,
    action: CaseActionCreate,
    current_user: User = Depends(require_supervisor),
    db: AsyncSession = Depends(get_db),
):
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    case_action = CaseAction(
        case_id=case_id,
        entity_id=action.entity_id,
        action_type=action.action_type,
        status=ActionStatus.PENDING,
        requester_id=current_user.id,
        rationale=action.rationale,
        parameters=action.parameters,
        reversible=action.action_type != ActionType.FREEZE_ACCOUNT,
        weight=0.45 if action.action_type == ActionType.FREEZE_ACCOUNT else 1.0,
    )
    db.add(case_action)
    await db.commit()

    return {"id": str(case_action.id), "status": "pending", "message": "Action requested"}


@router.post("/cases/{case_id}/actions/{action_id}/authorize")
async def authorize_action(
    case_id: UUID,
    action_id: UUID,
    current_user: User = Depends(require_supervisor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CaseAction).where(CaseAction.id == action_id, CaseAction.case_id == case_id)
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    if action.status != ActionStatus.PENDING:
        raise HTTPException(status_code=400, detail="Action not in pending state")

    action.status = ActionStatus.AUTHORIZED
    action.authorizer_id = current_user.id
    action.authorized_at = datetime.utcnow()
    await db.commit()

    return {"message": "Action authorized"}


@router.post("/agent/run")
async def run_agent(
    case_id: UUID,
    entity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await run_agent_pipeline(case_id, entity_id, current_user.id)
    return result


@router.post("/cases/{case_id}/evidence")
async def generate_evidence(
    case_id: UUID,
    request: EvidencePackageRequest,
    current_user: User = Depends(require_supervisor),
    db: AsyncSession = Depends(get_db),
):
    package = await evidence_generator.generate_package(case_id, current_user.id, request.format)
    await db.commit()

    return {
        "package_id": str(package.id),
        "package_hash": package.package_hash,
        "format": package.format,
        "chain_verified": package.chain_head_verified,
    }


@router.get("/cases/{case_id}/evidence/{package_id}/download")
async def download_evidence(
    case_id: UUID,
    package_id: UUID,
    current_user: User = Depends(require_supervisor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EvidencePackage).where(EvidencePackage.id == package_id, EvidencePackage.case_id == case_id)
    )
    package = result.scalar_one_or_none()
    if not package:
        raise HTTPException(status_code=404, detail="Evidence package not found")

    evidence_package = await evidence_generator.generate_package(case_id, current_user.id, package.format)

    media_type = "application/pdf" if package.format == "pdf" else "application/json"
    filename = f"evidence_{case_id}_{package_id}.{package.format}"

    return StreamingResponse(
        io.BytesIO(evidence_package.bsa_certificate.encode()) if package.format == "text" else io.BytesIO(b""),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/audit/log")
async def get_audit_log(
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    actor_id: UUID | None = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(require_supervisor),
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditLog).order_by(AuditLog.timestamp.desc())
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "timestamp": log.timestamp.isoformat(),
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id) if log.entity_id else None,
            "success": log.success,
            "error_message": log.error_message,
        }
        for log in logs
    ]


@router.get("/health")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION, "demo_mode": settings.TRACEX_DEMO_MODE}