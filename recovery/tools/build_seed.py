"""Build api/tracex_api/seed_data/ from the captured live API responses (recovery/api-snapshot).

Raw evidence (records, ALPR reads) is reproduced byte-for-byte including its ingest hashes.
Reference data that only existed inside the original service (subject registry, trained-model
scores, compliance catalogue, benchmark ground truth, …) is carried over as captured.

usage: python build_seed.py
"""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "recovery" / "api-snapshot"
OUT = ROOT / "api" / "tracex_api" / "seed_data"
SOURCES = ["cdr", "ipdr", "bank", "social"]


def body(name: str):
    return json.loads((SNAP / name).read_text(encoding="utf-8"))["body"]


def write_json(rel: str, data) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- raw records + batches -------------------------------------------------------------
    batches = []
    for source in SOURCES:
        export = body(f"records_{source}_export.json")
        rows = list(csv.DictReader(io.StringIO(export)))
        page = body(f"records_{source}_page=1_page_size=10.json")
        columns = page["columns"]
        (OUT / "records").mkdir(parents=True, exist_ok=True)
        with (OUT / "records" / f"{source}.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=columns + ["row_sha256", "batch_id", "source_filename"])
            writer.writeheader()
            for row in rows:
                writer.writerow({k: row[k] for k in columns + ["row_sha256", "batch_id", "source_filename"]})
        first = page["rows"][0]
        batches.append({
            "source_type": source,
            "batch_id": first["_batch_id"],
            "filename": first["_source_filename"],
            "ingested_at": first["_ingested_at"],
            "records": len(rows),
        })

    # ---- ALPR -------------------------------------------------------------------------------
    reads = {}
    for f in SNAP.glob("pattern_timeline_P*.json"):
        for e in json.loads(f.read_text(encoding="utf-8"))["body"]["events"]:
            if e["kind"] == "alpr":
                reads[e["rec_id"]] = {
                    "record_id": e["rec_id"], "read_time": e["ts"].replace("+00:00", ""), "plate": e["plate"],
                    "camera_id": e["camera_id"], "confidence": e["confidence"], "row_sha256": e["row_sha256"],
                }
    integrity = body("integrity_verify.json")
    alpr_batch = next(b for b in integrity["batches"] if b["source_type"] == "alpr")
    batches.append({
        "source_type": "alpr", "batch_id": alpr_batch["batch_id"], "filename": alpr_batch["filename"],
        "ingested_at": batches[0]["ingested_at"], "records": len(reads),
    })
    write_json("records/alpr.json", sorted(reads.values(), key=lambda r: r["record_id"]))
    cert = body("evidence_bsa-certificate_case_id=1.json")["certificate"]["batches"]
    stamps = {b["batch_id"]: (b["first_ingested_at"], b["last_ingested_at"], i) for i, b in enumerate(cert)}
    for b in batches:
        first, last, order = stamps[b["batch_id"]]
        b.update({"ingested_at": first, "last_ingested_at": last, "storage_order": order})
    write_json("batches.json", sorted(batches, key=lambda b: b["storage_order"]))

    cameras = body("pattern_cameras.json")["cameras"]
    write_json("cameras.json", [
        {k: c[k] for k in ["camera_id", "name", "lat", "lon", "facing", "poi_id", "poi_name", "poi_category"]}
        for c in cameras
    ])
    vehicles = {}
    for f in SNAP.glob("pattern_vehicle_*.json"):
        v = json.loads(f.read_text(encoding="utf-8"))["body"]
        vehicles[v["plate"]] = v["entity_id"]
    write_json("vehicles.json", [{"plate": p, "entity_id": e} for p, e in sorted(vehicles.items())])

    # ---- subject registry (resolved people, names, declared roles) ---------------------------
    persons = {n["props"]["entity_id"]: n["props"] for n in body("graph_subgraph_limit=400.json")["nodes"] if n["labels"] == ["Person"]}
    subjects = []
    for pid in sorted(persons):
        profile = body(f"profiles_{pid}.json")
        identifiers = [
            {"kind": kind, "value": item["value"], "props": item["props"], "resolved_by": item["resolved_by"]}
            for kind, items in profile["identifiers"].items() for item in items
        ]
        subjects.append({
            "entity_id": pid, "name": persons[pid]["name"], "role": persons[pid]["role"],
            "member_count": persons[pid]["member_count"], "identifiers": identifiers,
        })
    write_json("subjects.json", subjects)

    # ---- model outputs as scored by the original XGBoost model --------------------------------
    queue = body("intel_queue.json")["items"]
    scores = []
    for item in queue:
        intel = body(f"intel_entity_{item['entity_id']}.json")
        scores.append({**item, "features": intel["features"]})
    write_json("model_scores.json", scores)

    # ---- static reference catalogues -----------------------------------------------------------
    write_json("catalog/pipeline_info.json", body("agents_pipeline_info.json"))
    write_json("catalog/ask_examples.json", body("ask_examples.json"))
    write_json("catalog/model_card.json", body("model_monitor.json")["model"])
    write_json("catalog/model_monitor.json", body("model_monitor.json"))
    write_json("catalog/reasoning_providers.json", body("reasoning_providers.json"))
    write_json("catalog/verify_panel.json", body("verify_panel.json"))
    write_json("catalog/verify_selfeval.json", body("verify_selfeval.json"))
    write_json("catalog/benchmark_run.json", body("benchmark_run.json"))
    write_json("catalog/benchmark_report.json", body("benchmark_report.json"))
    write_json("catalog/retention_policy.json", body("retention_policy.json"))
    write_json("catalog/auth_users.json", body("auth_users.json"))
    write_json("catalog/auth_posture.json", body("auth_posture.json"))
    write_json("catalog/compliance_controls.json", body("compliance_controls.json"))
    write_json("catalog/compliance_program.json", body("compliance_program.json"))
    write_json("catalog/compliance_report.json", body("compliance_report.txt.json"))
    write_json("catalog/response_campaigns.json", body("response-agent_campaigns.json"))
    write_json("catalog/counterfactuals.json", {
        f"P{i:04d}": body(f"evidence_counterfactual_P{i:04d}.json") for i in range(1, 21)
    })

    # ---- operational state at capture time -----------------------------------------------------
    cases = []
    for c in body("cases.json"):
        cases.append(body(f"cases_{c['id']}.json"))
    write_json("state/cases.json", cases)
    write_json("state/audit.json", body("audit.json")["items"])
    documents = [body(f"documents_{d['id']}.json") for d in body("documents.json")["documents"]]
    write_json("state/documents.json", documents)
    write_json("state/ask_history.json", body("ask_history.json"))
    sessions = []
    for s in body("reasoning_sessions.json"):
        key = s["session_key"]
        safe = key.replace(":", "_")
        def maybe(name):
            p = next(iter(SNAP.glob(name)), None)
            return json.loads(p.read_text(encoding="utf-8"))["body"] if p else None
        sessions.append({
            "summary": s,
            "detail": maybe(f"reasoning_sessions_{safe}.json"),
            "claims": maybe(f"reasoning_sessions_{safe}_claims.json"),
            "hypotheses": maybe(f"reasoning_sessions_{safe}_hypotheses.json"),
            "trace": maybe(f"reasoning_sessions_{safe}_trace.json"),
        })
    write_json("state/reasoning_sessions.json", sessions)
    investigations = [body(f"response-agent_investigations_{i['id']}.json") for i in body("response-agent_investigations.json")["items"]]
    write_json("state/response_investigations.json", investigations)

    print(f"seed written to {OUT}")
    for p in sorted(OUT.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(OUT)}  {p.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
