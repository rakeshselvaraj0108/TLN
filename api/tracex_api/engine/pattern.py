"""Pattern of life: ALPR reads joined to financial events.

Neither source alone places a person at a cash-out: banking says money left, ALPR says a vehicle
was there. Corroboration strength is judged against each plate's own baseline at each camera, so a
vehicle that habitually passes a camera is weak evidence however close in time it sits.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone

from tracex_api.engine.dataset import Dataset, Read, clean_num, iso
from tracex_api.engine.views import haversine_km

THRESHOLDS = {"corroboration_window_min": 15, "camera_covers_poi_km": 0.5, "max_plausible_kmh": 200, "habitual_day_share": 0.4}
MIN_CONFIDENCE = 0.85
STRENGTH_RANK = {"strong": 0, "moderate": 1, "weak": 2}
NOTE = ("Corroboration strength is computed against each plate's own baseline at each camera. A vehicle that habitually passes a camera "
        "is reported as weak evidence, however close in time it sits to the event.")


def utc(dt: datetime) -> str:
    return iso(dt) + "+00:00"


def _read_ref(r: Read) -> dict:
    return {"record_id": r.rec_id, "ts": utc(r.time), "camera_id": r.camera_id, "confidence": r.confidence}


def reads_by_plate(ds: Dataset) -> dict[str, list[Read]]:
    def build():
        out = defaultdict(list)
        for r in sorted(ds.reads, key=lambda r: (r.time, r.rec_id)):
            out[r.plate].append(r)
        return dict(out)
    return ds.memo("reads_by_plate", build)


# ---- per-vehicle baseline -------------------------------------------------------------------------
def vehicle(ds: Dataset, plate: str) -> dict | None:
    reads = reads_by_plate(ds).get(plate)
    if not reads:
        return None
    days = {r.time.date() for r in reads}
    by_cam = defaultdict(list)
    for r in reads:
        by_cam[r.camera_id].append(r)
    places = []
    for cam, rs in by_cam.items():
        cam_days = {r.time.date() for r in rs}
        places.append({
            "camera_id": cam, "poi": ds.cameras.get(cam, {}).get("poi_name"), "visits": len(rs), "distinct_days": len(cam_days),
            "first_seen": utc(rs[0].time), "last_seen": utc(rs[-1].time), "typical_hours": sorted({r.time.hour for r in rs}),
            "habitual": len(cam_days) / len(days) >= THRESHOLDS["habitual_day_share"],
        })
    places.sort(key=lambda p: (-p["visits"], -p["distinct_days"], p["first_seen"]))
    # Usual hours: hours that recur (at least 2 reads, or 5% of all reads). If they don't explain 70% of the
    # plate's movement there is no usable daily rhythm, and every observed hour counts as usual.
    hour_counts = Counter(r.time.hour for r in reads)
    min_reads = max(2, -(-len(reads) * 5 // 100))
    recurring = [h for h, n in hour_counts.items() if n >= min_reads]
    rhythm = sum(hour_counts[h] for h in recurring) / len(reads) >= 0.7
    active_hours = sorted(recurring if rhythm else hour_counts)
    habitual = [p["camera_id"] for p in places if p["habitual"]]
    anomalies = []
    if rhythm:
        for r in reads:
            if r.time.hour not in active_hours:
                anomalies.append({"kind": "off_pattern_hour", "record_id": r.rec_id, "ts": utc(r.time), "camera_id": r.camera_id,
                                  "detail": f"seen at {r.time.hour:02d}:00, outside this subject's usual hours ({', '.join(f'{h:02d}' for h in active_hours)})"})
    for p in sorted([p for p in places if p["visits"] == 1], key=lambda p: p["first_seen"]):
        anomalies.append({"kind": "one_off_location", "camera_id": p["camera_id"], "ts": p["first_seen"],
                          "detail": f"single visit to {p['camera_id']}, not part of the usual route"})
    route = f"Habitual route: {', '.join(habitual)}." if habitual else "No habitual route — movement is irregular."
    return {
        "plate": plate, "entity_id": ds.by_plate.get(plate), "total_reads": len(reads), "active_days": len(days), "places": places,
        "active_hours": active_hours, "anomalies": anomalies,
        "summary": f"{len(reads)} reads across {len(days)} active day(s) at {len(by_cam)} camera(s). {route} {len(anomalies)} departure(s) from that pattern.",
        "thresholds": THRESHOLDS, "engine": "local",
    }


# ---- contradictions ---------------------------------------------------------------------------------
def contradictions(ds: Dataset, plates: list[str] | None = None) -> list[dict]:
    items = []
    for plate, reads in reads_by_plate(ds).items():
        if plates is not None and plate not in plates:
            continue
        for a, b in zip(reads, reads[1:]):
            ca, cb = ds.cameras.get(a.camera_id), ds.cameras.get(b.camera_id)
            if not ca or not cb or a.camera_id == b.camera_id:
                continue
            km = haversine_km(ca["lat"], ca["lon"], cb["lat"], cb["lon"])
            seconds = (b.time - a.time).total_seconds()
            if seconds <= 0:
                continue
            kmh = km / (seconds / 3600)
            if kmh > THRESHOLDS["max_plausible_kmh"]:
                items.append({
                    "plate": plate, "implied_kmh": round(kmh, 1), "separation_km": round(km, 2), "gap_seconds": int(seconds),
                    "from": _read_ref(a), "to": _read_ref(b),
                    "detail": f"{plate} read {km:.1f} km apart in {int(seconds)}s ({round(kmh)} km/h implied). One read is wrong, or the plate is cloned — the track through here is unsafe.",
                })
    return items


# ---- corroboration ------------------------------------------------------------------------------------
def corroborations(ds: Dataset, plates: list[str], when: datetime, detail: str) -> list[dict]:
    window = THRESHOLDS["corroboration_window_min"] * 60
    out = []
    for plate in plates:
        profile = vehicle(ds, plate)
        habitual = {p["camera_id"] for p in profile["places"] if p["habitual"]} if profile else set()
        by_cam = defaultdict(list)
        for r in reads_by_plate(ds).get(plate, []):
            if abs((r.time - when).total_seconds()) <= window:
                by_cam[r.camera_id].append(r)
        for cam_id, rs in by_cam.items():
            cam = ds.cameras.get(cam_id, {})
            if not cam.get("poi_id"):
                continue
            nearest = min(rs, key=lambda r: abs((r.time - when).total_seconds()))
            minutes = round((nearest.time - when).total_seconds() / 60)
            paired = any(r.time <= when for r in rs) and any(r.time >= when for r in rs) and len(rs) >= 2
            if nearest.confidence < MIN_CONFIDENCE:
                strength = "weak"
                reason = f"nearest read has confidence {nearest.confidence:.2f} — below the {MIN_CONFIDENCE:.2f} threshold, so the plate itself is not reliable"
            elif cam_id in habitual:
                strength = "weak"
                reason = f"{plate} habitually passes this camera, so a read near the event says little on its own"
            elif paired:
                strength = "strong"
                reason = (f"{plate} was read arriving and departing around the event ({len(rs)} reads within "
                          f"{THRESHOLDS['corroboration_window_min']} min), and is not a habitual presence at this camera")
            else:
                strength = "moderate"
                reason = f"{plate} was read once within {abs(minutes)} min of the event, but without an arrive/depart pair"
            out.append({
                "claim": f"vehicle {plate} present at {cam.get('poi_name')}", "strength": strength, "reason": reason,
                "event_time": utc(when), "event_detail": detail, "plate": plate, "camera_id": cam_id, "poi": cam.get("poi_id"),
                "reads": [_read_ref(r) for r in rs], "evidence_rows": [r.sha for r in rs], "minutes_from_event": minutes,
            })
    out.sort(key=lambda c: (STRENGTH_RANK[c["strength"]], abs(c["minutes_from_event"])))
    return out


def entity_timeline(ds: Dataset, entity_id: str) -> dict:
    p = ds.persons[entity_id]
    accounts = set(p.accounts)
    events = []
    debits = 0
    corroborated = 0
    for t in ds.txns:
        if t.direction != "DEBIT" or t.src_account not in accounts:
            continue
        debits += 1
        corr = corroborations(ds, p.plates, t.time, f"debit {t.amount} via {t.channel}")
        if any(c["strength"] == "strong" for c in corr):
            corroborated += 1
        events.append({"kind": "txn", "rec_id": t.rec_id, "ts": utc(t.time), "amount": clean_num(t.amount), "channel": t.channel,
                       "narration": t.narration, "account": t.src_account, "row_sha256": t.sha, "corroborations": corr})
    reads = [r for plate in p.plates for r in reads_by_plate(ds).get(plate, [])]
    for r in reads:
        cam = ds.cameras.get(r.camera_id, {})
        events.append({"kind": "alpr", "rec_id": r.rec_id, "ts": utc(r.time), "plate": r.plate, "camera_id": r.camera_id,
                       "poi": cam.get("poi_name"), "confidence": r.confidence, "row_sha256": r.sha})
    # A txn and an ALPR read landing in the same minute is rare; where it happens, the txn reads first.
    events.sort(key=lambda e: (e["ts"], 0 if e["kind"] == "txn" else 1, e["rec_id"]))
    return {
        "entity_id": entity_id, "engine": "local", "events": events,
        "counts": {"alpr_reads": len(reads), "debits": debits, "corroborated_debits": corroborated},
        "contradictions": contradictions(ds, p.plates), "thresholds": THRESHOLDS, "note": NOTE,
    }


def corroborate_at(ds: Dataset, at: datetime, camera_id: str) -> dict:
    window = THRESHOLDS["corroboration_window_min"] * 60
    cam = ds.cameras.get(camera_id)
    reads = [r for r in ds.reads if r.camera_id == camera_id and abs((r.time - at).total_seconds()) <= window]
    plates = sorted({r.plate for r in reads})
    corr = [c for c in corroborations(ds, plates, at, f"moment at {camera_id}") if c["camera_id"] == camera_id]
    return {"at": utc(at), "camera_id": camera_id, "camera": cam, "reads": [_read_ref(r) | {"plate": r.plate, "entity_id": ds.by_plate.get(r.plate)} for r in reads],
            "corroborations": corr, "thresholds": THRESHOLDS, "engine": "local"}


def cameras(ds: Dataset) -> dict:
    out = []
    for cam_id, cam in sorted(ds.cameras.items()):
        rs = sorted([r for r in ds.reads if r.camera_id == cam_id], key=lambda r: (r.time, r.rec_id))
        plates = Counter(r.plate for r in rs)
        order = {}
        for r in rs:
            order.setdefault(r.plate, len(order))
        top = sorted(plates, key=lambda p: (-plates[p], order[p]))[:5]
        entities = []
        for p in sorted(plates, key=lambda p: (-plates[p], order[p])):
            e = ds.by_plate.get(p)
            if e and e not in entities:
                entities.append(e)
        out.append({
            **cam, "reads": len(rs), "vehicles": len(plates),
            "first_read": iso(rs[0].time) if rs else None, "last_read": iso(rs[-1].time) if rs else None,
            "mean_confidence": round(sum(r.confidence for r in rs) / len(rs), 3) if rs else None,
            "top_plates": [{"plate": p, "reads": plates[p], "entity_id": ds.by_plate.get(p)} for p in top],
            "entities": entities, "rec_ids": sorted(r.rec_id for r in rs),
        })
    return {"cameras": out, "count": len(out), "engine": "local", "reads": len(ds.reads)}


def summary(ds: Dataset) -> dict:
    return {"reads": len(ds.reads), "vehicles": len({r.plate for r in ds.reads}), "cameras": len(ds.cameras),
            "pois": len({c["poi_id"] for c in ds.cameras.values() if c.get("poi_id")}), "engine": "local",
            "generated_at": datetime.now(timezone.utc).isoformat()}
