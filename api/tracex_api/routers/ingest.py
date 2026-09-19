"""Routes tagged "ingest"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from tracex_api import audit, db, evidence
from tracex_api.auth import User, current_user
from tracex_api.engine import documents, graphs
from tracex_api.engine.dataset import current

router = APIRouter(tags=["ingest"])


@router.get("/ingest/status", summary="Status")
def status(user: User = Depends(current_user)):
    sources = {}
    for source in ["alpr", "bank", "cdr", "ipdr", "social"]:
        batches = evidence.batches(source)
        sources[source] = {"records": sum(b["records"] for b in batches), "batches": len(batches)}
    try:
        graph, error = graphs.stats(current()), None
    except Exception as exc:  # the status strip must render even if analytics fail
        graph, error = {"nodes": 0, "relationships": 0, "by_label": {}}, str(exc)
    return {
        "sources": sources,
        "total_records": sum(s["records"] for s in sources.values()),
        "graph": graph,
        "graph_engine": "local",
        "graph_error": error,
    }


@router.post("/ingest/upload", summary="Upload")
async def upload(source_type: str = Form(...), file: UploadFile = File(...), user: User = Depends(current_user)):
    """Ingest a CSV for one source as a new hash-chained batch."""
    if source_type not in evidence.SOURCES or source_type == "alpr":
        raise HTTPException(status_code=400, detail=f"source_type must be one of {evidence.TABULAR}")
    content = await file.read()
    parsed = evidence.parse_csv(evidence.SOURCES[source_type], content)
    result = evidence.ingest_rows(source_type, file.filename or f"{source_type}.csv", parsed, user.username, evidence.file_sha256(content))
    audit.record(user.username, "ingest.upload", "batch", result["batch_id"],
                 f"{source_type} {result['filename']} rows={result['rows_persisted']} skipped={result['skipped_existing']}")
    return result


@router.get("/ingest/chain/{source_type}/{batch_id}/verify", summary="Verify Chain")
def verify_chain(source_type: str, batch_id: str, user: User = Depends(current_user)):
    batch = next((b for b in evidence.batches(source_type) if b["batch_id"] == batch_id), None)
    if batch is None:
        raise HTTPException(status_code=404, detail="no such batch")
    result = evidence.verify_batch(batch)
    return {"source_type": source_type, "batch_id": batch_id, "records": batch["records"], "chain_intact": result["intact"], "chain_head": batch["chain_head"]}


@router.post("/ingest/document", summary="Upload Document")
async def upload_document(source_type: str = Form("bank"), file: UploadFile = File(...), user: User = Depends(current_user)):
    """Ingest a statement as it actually arrives — PDF, spreadsheet or scan."""
    content = await file.read()
    analysis = documents.analyze(content, file.filename or "document", current())
    rows = analysis.get("rows") or []
    if not rows:
        raise HTTPException(status_code=422, detail=f"no {source_type} rows could be read from this document ({analysis['extraction_method']})")
    source = evidence.SOURCES[source_type]
    parsed = [{c: str(r.get(c, "")) for c in source.columns} for r in rows]
    result = evidence.ingest_rows(source_type, file.filename or "document", parsed, user.username, evidence.file_sha256(content))
    result["extraction_method"] = analysis["extraction_method"]
    audit.record(user.username, "ingest.document", "batch", result["batch_id"], f"{file.filename} method={analysis['extraction_method']} rows={len(parsed)}")
    return result


@router.post("/ingest/analyze-document", summary="Analyze Case Document")
async def analyze_case_document(
    file: UploadFile = File(...),
    ingest: bool = Form(False),
    source_type: str = Form("bank"),
    case_id: int | None = Form(None),
    entity_id: str | None = Form(None),
    user: User = Depends(current_user),
):
    """Read a case document and report what is in it — any format, no schema."""
    content = await file.read()
    ds = current()
    analysis = documents.analyze(content, file.filename or "document", ds)
    ingested = None
    if ingest and analysis.get("rows"):
        source = evidence.SOURCES.get(source_type)
        if source:
            parsed = [{c: str(r.get(c, "")) for c in source.columns} for r in analysis["rows"]]
            ingested = evidence.ingest_rows(source_type, file.filename or "document", parsed, user.username, evidence.file_sha256(content))
    doc = documents.store(analysis, user.username, case_id=case_id, ingested_batch_id=ingested["batch_id"] if ingested else None)
    audit.record(user.username, "document.analyze", "document", analysis["sha256"][:32],
                 f"{analysis['filename']} {analysis['size_bytes']}B method={analysis['extraction_method']} identifiers={analysis['identifier_count']}")
    return {**analysis, "document_id": doc["id"], "ingested": ingested}
