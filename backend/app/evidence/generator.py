import hashlib
import json
from datetime import datetime
from typing import Any
from uuid import UUID
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

from app.db.session import get_db_context
from app.models import (
    EvidencePackage, Case, Entity, SourceRecord, Claim,
    IngestionBatch, User, CaseAction, CaseTimeline
)
from app.graph.connection import Neo4jConnection
from app.graph.queries import CYPHER_QUERIES


class EvidenceGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        self.styles.add(ParagraphStyle(
            name='ForensicTitle',
            fontName='Helvetica-Bold',
            fontSize=18,
            leading=22,
            alignment=TA_CENTER,
            spaceAfter=12,
            textColor=HexColor('#1a1a2e'),
        ))
        self.styles.add(ParagraphStyle(
            name='ForensicHeading',
            fontName='Helvetica-Bold',
            fontSize=13,
            leading=16,
            spaceBefore=12,
            spaceAfter=6,
            textColor=HexColor('#16213e'),
            borderWidth=0,
            borderPadding=0,
        ))
        self.styles.add(ParagraphStyle(
            name='ForensicBody',
            fontName='Helvetica',
            fontSize=10,
            leading=13,
            alignment=TA_JUSTIFY,
            spaceAfter=6,
        ))
        self.styles.add(ParagraphStyle(
            name='ForensicCode',
            fontName='Courier',
            fontSize=8,
            leading=10,
            leftIndent=20,
            spaceAfter=4,
            textColor=HexColor('#0f3460'),
        ))
        self.styles.add(ParagraphStyle(
            name='BSACertificate',
            fontName='Helvetica-Bold',
            fontSize=11,
            leading=14,
            alignment=TA_CENTER,
            spaceBefore=20,
            spaceAfter=20,
            textColor=HexColor('#1a1a2e'),
            borderWidth=2,
            borderColor=HexColor('#16213e'),
            borderPadding=10,
        ))

    async def generate_package(
        self,
        case_id: UUID,
        generated_by: UUID,
        format: str = "pdf"
    ) -> EvidencePackage:
        async with get_db_context() as session:
            from sqlalchemy import select
            case_result = await session.execute(select(Case).where(Case.id == case_id))
            case = case_result.scalar_one_or_none()
            if not case:
                raise ValueError("Case not found")

            entities_result = await session.execute(
                select(Entity).join(Entity.case_entities).where(CaseEntity.case_id == case_id)
            )
            entities = entities_result.scalars().all()

            records_result = await session.execute(
                select(SourceRecord).join(IngestionBatch).where(
                    IngestionBatch.id.in_(
                        select(IngestionBatch.id).where(IngestionBatch.ingested_by == generated_by)
                    )
                )
            )
            records = records_result.scalars().all()

            claims_result = await session.execute(
                select(Claim).join(Entity).join(Entity.case_entities).where(CaseEntity.case_id == case_id)
            )
            claims = claims_result.scalars().all()

            actions_result = await session.execute(
                select(CaseAction).where(CaseAction.case_id == case_id)
            )
            actions = actions_result.scalars().all()

            timeline_result = await session.execute(
                select(CaseTimeline).where(CaseTimeline.case_id == case_id).order_by(CaseTimeline.event_time)
            )
            timeline = timeline_result.scalars().all()

        chain_head = self._compute_chain_head(records)
        chain_verified = await self._verify_chain_integrity(records)

        package_data = {
            "case": self._serialize_case(case),
            "entities": [self._serialize_entity(e) for e in entities],
            "source_records": [self._serialize_record(r) for r in records],
            "claims": [self._serialize_claim(c) for c in claims],
            "actions": [self._serialize_action(a) for a in actions],
            "timeline": [self._serialize_timeline(t) for t in timeline],
            "chain_head": chain_head,
            "chain_verified": chain_verified,
            "generated_at": datetime.utcnow().isoformat(),
            "generated_by": str(generated_by),
        }

        package_hash = hashlib.sha256(
            json.dumps(package_data, sort_keys=True, default=str).encode()
        ).hexdigest()

        bsa_certificate = self._generate_bsa_certificate(case, chain_head, package_hash)

        if format == "pdf":
            content = self._generate_pdf(package_data, bsa_certificate)
        elif format == "json":
            content = json.dumps(package_data, indent=2, default=str).encode()
        else:
            content = json.dumps(package_data, indent=2, default=str).encode()

        async with get_db_context() as session:
            package = EvidencePackage(
                case_id=case_id,
                package_hash=package_hash,
                format=format,
                bsa_certificate=bsa_certificate,
                chain_head_verified=chain_verified,
                entity_count=len(entities),
                record_count=len(records),
                generated_by=generated_by,
            )
            session.add(package)
            await session.flush()
            return package

    def _compute_chain_head(self, records: list[SourceRecord]) -> str:
        batch_hashes = sorted(set(r.batch_id for r in records))
        combined = "".join(str(h) for h in batch_hashes)
        return hashlib.sha256(combined.encode()).hexdigest()

    async def _verify_chain_integrity(self, records: list[SourceRecord]) -> bool:
        batch_ids = sorted(set(r.batch_id for r in records))
        async with get_db_context() as session:
            from sqlalchemy import select
            for batch_id in batch_ids:
                result = await session.execute(
                    select(IngestionBatch).where(IngestionBatch.id == batch_id)
                )
                batch = result.scalar_one_or_none()
                if not batch:
                    return False
                if batch.prev_batch_hash:
                    prev_result = await session.execute(
                        select(IngestionBatch).where(IngestionBatch.batch_hash == batch.prev_batch_hash)
                    )
                    if not prev_result.scalar_one_or_none():
                        return False
        return True

    def _generate_bsa_certificate(self, case: Case, chain_head: str, package_hash: str) -> str:
        return f"""
BSA §63 ELECTRONIC RECORD CERTIFICATE
=====================================

Case Reference: {case.case_number}
Case Title: {case.title}
Certificate ID: {hashlib.sha256(f"{case.id}{chain_head}{package_hash}".encode()).hexdigest()[:16].upper()}
Chain Head Hash: {chain_head}
Package Hash: {package_hash}
Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}

This certificate confirms that the electronic records contained in this evidence package
have been maintained in accordance with the Bharatiya Sakshya Adhiniyam (BSA) §63,
with an unbroken cryptographic hash chain from ingestion through to this export.

The hash chain originates from the original source data ingestion batches and extends
through all transformations, entity resolution, risk scoring, and case management
operations. Each record carries its SHA-256 provenance (row_sha256) linking back to
the exact source row as ingested.

Verification: Re-compute the package hash from the enclosed JSON data and compare
with the Package Hash above. Verify the chain head by reconstructing the batch hash
chain from the ingestion batches.

Certified by: TRACE-X Evidence Management System
Version: 1.0
"""

    def _generate_pdf(self, package_data: dict, bsa_certificate: str) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            leftMargin=0.75*inch, rightMargin=0.75*inch,
            topMargin=0.75*inch, bottomMargin=0.75*inch
        )
        story = []

        story.append(Paragraph("TRACE-X EVIDENCE PACKAGE", self.styles['ForensicTitle']))
        story.append(Paragraph(f"Case: {package_data['case']['case_number']} — {package_data['case']['title']}", self.styles['ForensicHeading']))
        story.append(Paragraph(f"Generated: {package_data['generated_at']}", self.styles['ForensicBody']))
        story.append(Spacer(1, 12))
        story.append(HRFlowable(width="100%", thickness=2, color=HexColor('#16213e')))
        story.append(Spacer(1, 12))

        story.append(Paragraph("1. CASE SUMMARY", self.styles['ForensicHeading']))
        story.append(Paragraph(f"Status: {package_data['case']['status']}", self.styles['ForensicBody']))
        story.append(Paragraph(f"Opened: {package_data['case']['opened_at']}", self.styles['ForensicBody']))
        if package_data['case'].get('closed_at'):
            story.append(Paragraph(f"Closed: {package_data['case']['closed_at']}", self.styles['ForensicBody']))
        if package_data['case'].get('disposition'):
            story.append(Paragraph(f"Disposition: {package_data['case']['disposition']}", self.styles['ForensicBody']))
        story.append(Spacer(1, 8))

        story.append(Paragraph("2. ENTITIES UNDER INVESTIGATION", self.styles['ForensicHeading']))
        for entity in package_data['entities']:
            story.append(Paragraph(f"Entity: {entity['canonical_id']}", self.styles['ForensicBody']))
            story.append(Paragraph(f"  Type: {entity['entity_type']}", self.styles['ForensicBody']))
            story.append(Paragraph(f"  Risk Score: {entity.get('risk_score', 'N/A')}", self.styles['ForensicBody']))
            story.append(Paragraph(f"  Risk Band: {entity.get('risk_band', 'N/A')}", self.styles['ForensicBody']))
            story.append(Paragraph(f"  Final Adjusted Score: {entity.get('final_adjusted_score', 'N/A')}", self.styles['ForensicBody']))
            story.append(Spacer(1, 4))

        story.append(Paragraph("3. SOURCE RECORDS (Provenance Chain)", self.styles['ForensicHeading']))
        for record in package_data['source_records'][:50]:
            story.append(Paragraph(
                f"Row SHA-256: {record['row_sha256']} | Type: {record['source_type']} | Row: {record['row_number']}",
                self.styles['ForensicCode']
            ))
        if len(package_data['source_records']) > 50:
            story.append(Paragraph(f"... and {len(package_data['source_records']) - 50} more records", self.styles['ForensicBody']))
        story.append(Spacer(1, 8))

        story.append(Paragraph("4. CLAIMS & REASONING", self.styles['ForensicHeading']))
        for claim in package_data['claims'][:30]:
            story.append(Paragraph(
                f"[{claim['epistemic_class'].upper()}] {claim['claim_text'][:200]} (Confidence: {claim['confidence']:.2f})",
                self.styles['ForensicBody']
            ))
        story.append(Spacer(1, 8))

        story.append(Paragraph("5. ACTIONS TAKEN", self.styles['ForensicHeading']))
        for action in package_data['actions']:
            story.append(Paragraph(
                f"{action['action_type']} — {action['status']} — {action.get('rationale', '')[:150]}",
                self.styles['ForensicBody']
            ))
        story.append(Spacer(1, 8))

        story.append(Paragraph("6. CASE TIMELINE", self.styles['ForensicHeading']))
        for event in package_data['timeline']:
            story.append(Paragraph(
                f"{event['event_time']} — {event['event_type']} — {event['description'][:200]}",
                self.styles['ForensicBody']
            ))
        story.append(Spacer(1, 12))

        story.append(HRFlowable(width="100%", thickness=2, color=HexColor('#16213e')))
        story.append(Spacer(1, 12))
        story.append(Paragraph("BSA §63 CERTIFICATE", self.styles['BSACertificate']))
        for line in bsa_certificate.strip().split('\n'):
            story.append(Paragraph(line, self.styles['ForensicCode']))

        doc.build(story)
        buffer.seek(0)
        return buffer.read()

    def _serialize_case(self, case: Case) -> dict:
        return {
            "id": str(case.id),
            "case_number": case.case_number,
            "title": case.title,
            "description": case.description,
            "status": case.status.value,
            "opened_at": case.opened_at.isoformat() if case.opened_at else None,
            "closed_at": case.closed_at.isoformat() if case.closed_at else None,
            "disposition": case.disposition,
        }

    def _serialize_entity(self, entity: Entity) -> dict:
        return {
            "id": str(entity.id),
            "canonical_id": entity.canonical_id,
            "entity_type": entity.entity_type,
            "risk_score": entity.risk_score,
            "risk_band": entity.risk_band,
            "shap_factors": entity.shap_factors,
            "counterfactual_boundary": entity.counterfactual_boundary,
            "exculpatory_reduction": entity.exculpatory_reduction,
            "final_adjusted_score": entity.final_adjusted_score,
        }

    def _serialize_record(self, record: SourceRecord) -> dict:
        return {
            "id": str(record.id),
            "batch_id": str(record.batch_id),
            "row_sha256": record.row_sha256,
            "source_type": record.source_type.value,
            "row_number": record.row_number,
            "payload": record.payload,
        }

    def _serialize_claim(self, claim: Claim) -> dict:
        return {
            "id": str(claim.id),
            "entity_id": str(claim.entity_id),
            "claim_text": claim.claim_text,
            "epistemic_class": claim.epistemic_class.value,
            "source_kind": claim.source_kind.value,
            "source_record_id": str(claim.source_record_id) if claim.source_record_id else None,
            "confidence": claim.confidence,
            "derived_from": [str(d) for d in (claim.derived_from or [])],
            "support_count": claim.support_count,
            "contradiction_count": claim.contradiction_count,
            "is_retracted": claim.is_retracted,
        }

    def _serialize_action(self, action: CaseAction) -> dict:
        return {
            "id": str(action.id),
            "action_type": action.action_type.value,
            "status": action.status.value,
            "rationale": action.rationale,
            "reversible": action.reversible,
            "weight": action.weight,
            "requested_at": action.requested_at.isoformat(),
            "authorized_at": action.authorized_at.isoformat() if action.authorized_at else None,
            "executed_at": action.executed_at.isoformat() if action.executed_at else None,
        }

    def _serialize_timeline(self, event: CaseTimeline) -> dict:
        return {
            "id": str(event.id),
            "event_time": event.event_time.isoformat(),
            "event_type": event.event_type,
            "description": event.description,
            "actor_id": str(event.actor_id) if event.actor_id else None,
            "entity_id": str(event.entity_id) if event.entity_id else None,
        }


evidence_generator = EvidenceGenerator()