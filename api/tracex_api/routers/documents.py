"""Routes tagged "documents"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from tracex_api import audit, db
from tracex_api.auth import User, current_user

router = APIRouter(tags=["documents"])


def _summary(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "analysis"}


@router.get("/documents", summary="List Documents")
def list_documents(entity_id: str | None = Query(None), case_id: int | None = Query(None), limit: int = Query(50, ge=1, le=500),
                   user: User = Depends(current_user)):
    """Documents that have been read, newest first."""
    docs = sorted(db.doc_list("documents"), key=lambda d: d["uploaded_at"], reverse=True)
    total = len(docs)
    if entity_id:
        docs = [d for d in docs if entity_id in (d.get("entities") or [])]
    if case_id is not None:
        docs = [d for d in docs if d.get("case_id") == case_id]
    return {"documents": [_summary(d) for d in docs[:limit]], "count": len(docs[:limit]), "total": total}


def _doc(document_id: int) -> dict:
    doc = db.doc_get("documents", document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="no such document")
    return doc


@router.get("/documents/{document_id}", summary="Get Document")
def get_document(document_id: int, user: User = Depends(current_user)):
    """One document, with the full analysis that was produced when it was read."""
    return _doc(document_id)


@router.delete("/documents/{document_id}", summary="Delete Document")
def delete_document(document_id: int, user: User = Depends(current_user)):
    """Remove a document from the library. Deletes the reading, never the evidence."""
    doc = _doc(document_id)
    db.doc_delete("documents", document_id)
    audit.record(user.username, "document.delete", "document", document_id, doc["filename"])
    return {"deleted": document_id, "ingested_batch_id": doc.get("ingested_batch_id"), "evidence_retained": bool(doc.get("ingested_batch_id"))}


@router.get("/documents/{document_id}/entities", summary="Document Entities")
def document_entities(document_id: int, user: User = Depends(current_user)):
    """The identifiers this document named, read back from the stored analysis."""
    doc = _doc(document_id)
    analysis = doc.get("analysis") or {}
    return {"document_id": document_id, "filename": doc["filename"], "hits": analysis.get("hits", []), "amounts": analysis.get("amounts", []),
            "dates": analysis.get("dates", []), "flags": analysis.get("flags", []), "read_at": doc["uploaded_at"]}
