from datetime import datetime
from enum import Enum as PyEnum
from typing import Any
from uuid import UUID, uuid4
from dataclasses import dataclass, field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Claim, Entity, EpistemicClass, SourceKind, Case, AuditLog


class ClaimStatus(PyEnum):
    ACTIVE = "active"
    RETRACTED = "retracted"
    SUPERSEDED = "superseded"


@dataclass
class ReasoningClaim:
    id: UUID
    entity_id: UUID
    claim_text: str
    epistemic_class: EpistemicClass
    source_kind: SourceKind
    source_record_id: UUID | None
    confidence: float
    derived_from: list[UUID] = field(default_factory=list)
    contradicted_by: UUID | None = None
    support_count: int = 0
    contradiction_count: int = 0
    is_retracted: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


class ReasoningKernel:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.claims_cache: dict[UUID, ReasoningClaim] = {}

    async def load_entity_claims(self, entity_id: UUID) -> list[ReasoningClaim]:
        result = await self.session.execute(
            select(Claim).where(Claim.entity_id == entity_id)
        )
        claims = result.scalars().all()

        reasoning_claims = []
        for claim in claims:
            rc = ReasoningClaim(
                id=claim.id,
                entity_id=claim.entity_id,
                claim_text=claim.claim_text,
                epistemic_class=claim.epistemic_class,
                source_kind=claim.source_kind,
                source_record_id=claim.source_record_id,
                confidence=claim.confidence,
                derived_from=claim.derived_from or [],
                contradicted_by=claim.contradicted_by,
                support_count=claim.support_count,
                contradiction_count=claim.contradiction_count,
                is_retracted=claim.is_retracted,
                created_at=claim.created_at,
                updated_at=claim.updated_at,
            )
            reasoning_claims.append(rc)
            self.claims_cache[claim.id] = rc

        return reasoning_claims

    async def add_claim(
        self,
        entity_id: UUID,
        claim_text: str,
        epistemic_class: EpistemicClass,
        source_kind: SourceKind,
        confidence: float,
        source_record_id: UUID | None = None,
        derived_from: list[UUID] | None = None,
        actor_id: UUID | None = None,
    ) -> ReasoningClaim:
        if epistemic_class == EpistemicClass.OBSERVED and source_kind == SourceKind.AGENT:
            raise ValueError("Agent cannot create observed claims - agents read records, cannot observe")

        if epistemic_class == EpistemicClass.CONCLUSION:
            if not derived_from:
                raise ValueError("Conclusions must cite supporting claims")
            min_confidence = await self._get_min_cited_confidence(derived_from)
            if confidence > min_confidence:
                confidence = min_confidence

        claim = Claim(
            entity_id=entity_id,
            claim_text=claim_text,
            epistemic_class=epistemic_class,
            source_kind=source_kind,
            source_record_id=source_record_id,
            confidence=confidence,
            derived_from=derived_from or [],
        )
        self.session.add(claim)
        await self.session.flush()

        rc = ReasoningClaim(
            id=claim.id,
            entity_id=entity_id,
            claim_text=claim_text,
            epistemic_class=epistemic_class,
            source_kind=source_kind,
            source_record_id=source_record_id,
            confidence=confidence,
            derived_from=derived_from or [],
        )
        self.claims_cache[claim.id] = rc

        await self._update_support_counts(claim.id, derived_from or [])

        if actor_id:
            await self._audit(actor_id, "claim_created", "claim", claim.id, new_values={"text": claim_text})

        return rc

    async def contradict_claim(
        self,
        claim_id: UUID,
        contradiction_text: str,
        source_kind: SourceKind,
        confidence: float,
        source_record_id: UUID | None = None,
        actor_id: UUID | None = None,
    ) -> ReasoningClaim:
        original = self.claims_cache.get(claim_id)
        if not original:
            result = await self.session.execute(select(Claim).where(Claim.id == claim_id))
            original_claim = result.scalar_one_or_none()
            if not original_claim:
                raise ValueError(f"Claim {claim_id} not found")
            original = ReasoningClaim(
                id=original_claim.id,
                entity_id=original_claim.entity_id,
                claim_text=original_claim.claim_text,
                epistemic_class=original_claim.epistemic_class,
                source_kind=original_claim.source_kind,
                source_record_id=original_claim.source_record_id,
                confidence=original_claim.confidence,
            )
            self.claims_cache[claim_id] = original

        contradiction = await self.add_claim(
            entity_id=original.entity_id,
            claim_text=contradiction_text,
            epistemic_class=EpistemicClass.INFERRED,
            source_kind=source_kind,
            confidence=confidence,
            source_record_id=source_record_id,
            derived_from=[claim_id],
        )

        original.contradiction_count += 1
        original.contradicted_by = contradiction.id

        await self.session.execute(
            select(Claim).where(Claim.id == claim_id)
        )
        db_claim = await self.session.get(Claim, claim_id)
        if db_claim:
            db_claim.contradiction_count = original.contradiction_count
            db_claim.contradicted_by = contradiction.id
            db_claim.confidence = max(0.05, db_claim.confidence * 0.8)

        if actor_id:
            await self._audit(actor_id, "claim_contradicted", "claim", claim_id,
                            new_values={"contradiction_id": str(contradiction.id)})

        return contradiction

    async def retract_claim(self, claim_id: UUID, actor_id: UUID) -> None:
        claim = self.claims_cache.get(claim_id)
        if not claim:
            result = await self.session.execute(select(Claim).where(Claim.id == claim_id))
            claim = result.scalar_one_or_none()
            if not claim:
                raise ValueError(f"Claim {claim_id} not found")

        claim.is_retracted = True
        db_claim = await self.session.get(Claim, claim_id)
        if db_claim:
            db_claim.is_retracted = True
            db_claim.confidence = 0.05

        if actor_id:
            await self._audit(actor_id, "claim_retracted", "claim", claim_id, new_values={"retracted": True})

    async def get_confidence_bounds(self, entity_id: UUID) -> dict[str, float]:
        claims = await self.load_entity_claims(entity_id)
        active_claims = [c for c in claims if not c.is_retracted]

        if not active_claims:
            return {"lower": 0.0, "upper": 0.0, "support": 0, "contradiction": 0}

        support = sum(c.support_count for c in active_claims)
        contradiction = sum(c.contradiction_count for c in active_claims)

        max_confidence = max(c.confidence for c in active_claims)
        min_confidence = min(c.confidence for c in active_claims)

        contradiction_factor = 1.0 - (contradiction / max(support + contradiction, 1)) * 0.95
        lower = max(0.05, min_confidence * contradiction_factor)
        upper = max_confidence * contradiction_factor

        return {
            "lower": lower,
            "upper": upper,
            "support": support,
            "contradiction": contradiction,
        }

    async def _get_min_cited_confidence(self, claim_ids: list[UUID]) -> float:
        min_conf = 1.0
        for cid in claim_ids:
            claim = self.claims_cache.get(cid)
            if not claim:
                result = await self.session.execute(select(Claim).where(Claim.id == cid))
                claim = result.scalar_one_or_none()
            if claim:
                min_conf = min(min_conf, claim.confidence)
        return min_conf

    async def _update_support_counts(self, claim_id: UUID, derived_from: list[UUID]) -> None:
        for parent_id in derived_from:
            parent = self.claims_cache.get(parent_id)
            if parent:
                parent.support_count += 1
                db_parent = await self.session.get(Claim, parent_id)
                if db_parent:
                    db_parent.support_count = parent.support_count

    async def _audit(
        self, actor_id: UUID, action: str, entity_type: str,
        entity_id: UUID, old_values: dict | None = None, new_values: dict | None = None
    ) -> None:
        audit = AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            success=True,
        )
        self.session.add(audit)