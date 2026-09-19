from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional
from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey, Enum, Text, Boolean,
    BigInteger, Index, UniqueConstraint, CheckConstraint, func
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import DeclarativeBase, relationship, Mapped, mapped_column
import uuid


class Base(DeclarativeBase):
    pass


class EpistemicClass(PyEnum):
    OBSERVED = "observed"
    INFERRED = "inferred"
    HYPOTHESIS = "hypothesis"
    CONCLUSION = "conclusion"


class SourceKind(PyEnum):
    CDR = "cdr"
    IPDR = "ipdr"
    BANK = "bank"
    SOCIAL = "social"
    ALPR = "alpr"
    AGENT = "agent"
    MANUAL = "manual"


class UserRole(PyEnum):
    INVESTIGATOR = "investigator"
    SUPERVISOR = "supervisor"


class CaseStatus(PyEnum):
    OPEN = "open"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"
    ARCHIVED = "archived"


class ActionType(PyEnum):
    FREEZE_ACCOUNT = "freeze_account"
    REQUEST_CDR = "request_cdr"
    REQUEST_IPDR = "request_ipdr"
    REQUEST_BANK = "request_bank"
    SAR_DRAFT = "sar_draft"
    ENTITY_PIN = "entity_pin"
    CASE_NOTE = "case_note"
    EXPORT_EVIDENCE = "export_evidence"


class ActionStatus(PyEnum):
    PENDING = "pending"
    AUTHORIZED = "authorized"
    EXECUTING = "executing"
    COMPLETED = "completed"
    REJECTED = "rejected"
    REVOKED = "revoked"


class IngestionStatus(PyEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_username", "username", unique=True),
        Index("ix_users_email", "email", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.INVESTIGATOR)
    full_name: Mapped[Optional[str]] = mapped_column(String(255))
    badge_number: Mapped[Optional[str]] = mapped_column(String(64))
    department: Mapped[Optional[str]] = mapped_column(String(128))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    cases = relationship("Case", foreign_keys="Case.owner_id", back_populates="owner")
    notes = relationship("CaseNote", back_populates="author")
    actions = relationship("CaseAction", foreign_keys="CaseAction.requester_id", back_populates="requester")


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_token", "token", unique=True),
        Index("ix_sessions_user_id", "user_id"),
        CheckConstraint("expires_at > created_at", name="ck_session_expires_after_created"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(String(512), nullable=False)
    password_hash_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    user = relationship("User", back_populates="sessions")


class IngestionBatch(Base):
    __tablename__ = "ingestion_batches"
    __table_args__ = (
        Index("ix_ingestion_batches_batch_hash", "batch_hash", unique=True),
        Index("ix_ingestion_batches_source_type", "source_type"),
        Index("ix_ingestion_batches_status", "status"),
        CheckConstraint("rejected_rows >= 0", name="ck_rejected_rows_nonneg"),
        CheckConstraint("accepted_rows >= 0", name="ck_accepted_rows_nonneg"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source_type: Mapped[SourceKind] = mapped_column(Enum(SourceKind), nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    accepted_rows: Mapped[int] = mapped_column(Integer, default=0)
    rejected_rows: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[IngestionStatus] = mapped_column(Enum(IngestionStatus), default=IngestionStatus.PENDING)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    prev_batch_hash: Mapped[Optional[str]] = mapped_column(String(64))
    chain_position: Mapped[int] = mapped_column(Integer, default=0)
    ingested_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    rejected_rows_detail = relationship("RejectedRow", back_populates="batch", cascade="all, delete-orphan")


class RejectedRow(Base):
    __tablename__ = "rejected_rows"
    __table_args__ = (
        Index("ix_rejected_rows_batch_id", "batch_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("ingestion_batches.id", ondelete="CASCADE"), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    rejection_reason: Mapped[str] = mapped_column(Text, nullable=False)
    row_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    batch = relationship("IngestionBatch", back_populates="rejected_rows_detail")


class SourceRecord(Base):
    __tablename__ = "source_records"
    __table_args__ = (
        Index("ix_source_records_batch_id", "batch_id"),
        Index("ix_source_records_row_sha256", "row_sha256", unique=True),
        Index("ix_source_records_source_type", "source_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("ingestion_batches.id", ondelete="CASCADE"), nullable=False)
    row_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    source_type: Mapped[SourceKind] = mapped_column(Enum(SourceKind), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    batch = relationship("IngestionBatch")


class Entity(Base):
    __tablename__ = "entities"
    __table_args__ = (
        Index("ix_entities_canonical_id", "canonical_id", unique=True),
        Index("ix_entities_risk_band", "risk_band"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_id: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    risk_score: Mapped[Optional[float]] = mapped_column(nullable=True)
    risk_band: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    shap_factors: Mapped[Optional[dict]] = mapped_column(JSONB)
    counterfactual_boundary: Mapped[Optional[dict]] = mapped_column(JSONB)
    exculpatory_reduction: Mapped[Optional[float]] = mapped_column(nullable=True)
    final_adjusted_score: Mapped[Optional[float]] = mapped_column(nullable=True)
    # NOTE: named extra_metadata, not metadata — `metadata` is reserved on every
    # SQLAlchemy DeclarativeBase subclass (it shadows Base.metadata, the schema
    # registry) and raises InvalidRequestError at class-definition time, which
    # means `import app.models` — and therefore the whole app — could not boot.
    extra_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    claims = relationship("Claim", back_populates="entity")
    case_entities = relationship("CaseEntity", back_populates="entity")


class Claim(Base):
    __tablename__ = "claims"
    __table_args__ = (
        Index("ix_claims_entity_id", "entity_id"),
        Index("ix_claims_epistemic_class", "epistemic_class"),
        Index("ix_claims_source_record_id", "source_record_id"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_confidence_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False)
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    epistemic_class: Mapped[EpistemicClass] = mapped_column(Enum(EpistemicClass), nullable=False)
    source_kind: Mapped[SourceKind] = mapped_column(Enum(SourceKind), nullable=False)
    source_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"))
    confidence: Mapped[float] = mapped_column(nullable=False, default=1.0)
    derived_from: Mapped[Optional[list]] = mapped_column(JSONB)
    contradicted_by: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("claims.id", ondelete="SET NULL"))
    support_count: Mapped[int] = mapped_column(Integer, default=0)
    contradiction_count: Mapped[int] = mapped_column(Integer, default=0)
    is_retracted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    entity = relationship("Entity", back_populates="claims")
    contradiction = relationship("Claim", remote_side=[id], backref="contradictions")


class Case(Base):
    __tablename__ = "cases"
    __table_args__ = (
        Index("ix_cases_case_number", "case_number", unique=True),
        Index("ix_cases_status", "status"),
        Index("ix_cases_owner_id", "owner_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_number: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[CaseStatus] = mapped_column(Enum(CaseStatus), default=CaseStatus.OPEN)
    owner_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    supervisor_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    disposition: Mapped[Optional[str]] = mapped_column(String(128))
    extra_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default={})

    owner = relationship("User", foreign_keys=[owner_id], back_populates="cases")
    supervisor = relationship("User", foreign_keys=[supervisor_id])
    entities = relationship("CaseEntity", back_populates="case", cascade="all, delete-orphan")
    notes = relationship("CaseNote", back_populates="case", cascade="all, delete-orphan")
    actions = relationship("CaseAction", back_populates="case", cascade="all, delete-orphan")
    timeline = relationship("CaseTimeline", back_populates="case", cascade="all, delete-orphan")
    evidence_packages = relationship("EvidencePackage", back_populates="case", cascade="all, delete-orphan")


class CaseEntity(Base):
    __tablename__ = "case_entities"
    __table_args__ = (
        Index("ix_case_entities_case_id", "case_id"),
        Index("ix_case_entities_entity_id", "entity_id"),
        UniqueConstraint("case_id", "entity_id", name="uq_case_entity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    added_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    case = relationship("Case", back_populates="entities")
    entity = relationship("Entity", back_populates="case_entities")
    adder = relationship("User")


class CaseNote(Base):
    __tablename__ = "case_notes"
    __table_args__ = (
        Index("ix_case_notes_case_id", "case_id"),
        Index("ix_case_notes_author_id", "author_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    case = relationship("Case", back_populates="notes")
    author = relationship("User", back_populates="notes")


class CaseAction(Base):
    __tablename__ = "case_actions"
    __table_args__ = (
        Index("ix_case_actions_case_id", "case_id"),
        Index("ix_case_actions_entity_id", "entity_id"),
        Index("ix_case_actions_status", "status"),
        Index("ix_case_actions_requester_id", "requester_id"),
        CheckConstraint("rationale IS NULL OR length(rationale) >= 10", name="ck_rationale_min_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL"))
    action_type: Mapped[ActionType] = mapped_column(Enum(ActionType), nullable=False)
    status: Mapped[ActionStatus] = mapped_column(Enum(ActionStatus), default=ActionStatus.PENDING)
    requester_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    authorizer_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    executor_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    rationale: Mapped[Optional[str]] = mapped_column(Text)
    parameters: Mapped[dict] = mapped_column(JSONB, default={})
    result: Mapped[Optional[dict]] = mapped_column(JSONB)
    reversible: Mapped[bool] = mapped_column(Boolean, default=True)
    weight: Mapped[float] = mapped_column(default=1.0)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    authorized_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    case = relationship("Case", back_populates="actions")
    entity = relationship("Entity")
    requester = relationship("User", foreign_keys=[requester_id], back_populates="actions")
    authorizer = relationship("User", foreign_keys=[authorizer_id])
    executor = relationship("User", foreign_keys=[executor_id])


class CaseTimeline(Base):
    __tablename__ = "case_timeline"
    __table_args__ = (
        Index("ix_case_timeline_case_id", "case_id"),
        Index("ix_case_timeline_event_time", "event_time"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL"))
    extra_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default={})
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="timeline")
    actor = relationship("User")
    entity = relationship("Entity")


class EvidencePackage(Base):
    __tablename__ = "evidence_packages"
    __table_args__ = (
        Index("ix_evidence_packages_case_id", "case_id"),
        Index("ix_evidence_packages_generated_by", "generated_by"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    package_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    format: Mapped[str] = mapped_column(String(16), nullable=False)
    bsa_certificate: Mapped[Optional[str]] = mapped_column(Text)
    chain_head_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    entity_count: Mapped[int] = mapped_column(Integer, default=0)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    generated_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    case = relationship("Case", back_populates="evidence_packages")
    generator = relationship("User")


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_timestamp", "timestamp"),
        Index("ix_audit_log_actor_id", "actor_id"),
        Index("ix_audit_log_entity_type_entity_id", "entity_type", "entity_id"),
        Index("ix_audit_log_action", "action"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actor_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[Optional[str]] = mapped_column(String(64))
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(PGUUID(as_uuid=True))
    old_values: Mapped[Optional[dict]] = mapped_column(JSONB)
    new_values: Mapped[Optional[dict]] = mapped_column(JSONB)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    request_id: Mapped[Optional[str]] = mapped_column(String(64))
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    actor = relationship("User")


class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (
        Index("ix_model_versions_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    model_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    feature_names: Mapped[list] = mapped_column(JSONB, nullable=False)
    training_seed: Mapped[int] = mapped_column(Integer, nullable=False)
    training_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class RetentionPolicy(Base):
    __tablename__ = "retention_policies"
    __table_args__ = (
        Index("ix_retention_policies_entity_type", "entity_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    min_retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
    max_retention_days: Mapped[Optional[int]] = mapped_column(Integer)
    requires_supervisor_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())