"""Entity-centred views: timelines, profiles, search, geography."""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import timedelta

from tracex_api.engine import scoring
from tracex_api.engine.dataset import Dataset, clean_num, iso, ts


# ---- timeline --------------------------------------------------------------------------------
def entity_events(ds: Dataset, entity_id: str) -> list[dict]:
    def build():
        p = ds.persons[entity_id]
        phones, accounts = set(p.phones), set(p.accounts)
        handles = {h["handle"] for h in p.handles}
        events = []
        seen = set()
        # A call between two of this person's own rotating numbers (both a_party and b_party resolve to
        # them, common for a multi-SIM entity) has no single correct in/out label — it goes to whichever
        # pass runs first. a_party first matches every non-self-call case, which is the overwhelming
        # majority; that a handful of genuine self-calls land as "out" here rather than however the
        # original happened to break the same tie is a known, narrow, cosmetic difference.
        for c in ds.calls:  # calls the person placed, then calls they received
            if c.a_party in phones:
                seen.add(c.rec_id)
                events.append({"kind": "call", "ts": iso(c.start), "rec_id": c.rec_id, "row_sha256": c.sha, "detail": {
                    "direction": "out", "other": c.b_party, "from": c.a_party, "duration_sec": c.duration, "call_type": c.call_type}})
        for c in ds.calls:
            if c.b_party in phones and c.rec_id not in seen:
                events.append({"kind": "call", "ts": iso(c.start), "rec_id": c.rec_id, "row_sha256": c.sha, "detail": {
                    "direction": "in", "other": c.a_party, "to": c.b_party, "duration_sec": c.duration, "call_type": c.call_type}})
        for s in ds.sessions:
            if s.msisdn in phones:
                events.append({"kind": "session", "ts": iso(s.start), "rec_id": s.rec_id, "row_sha256": s.sha, "detail": {
                    "msisdn": s.msisdn, "ip": s.public_ip, "app_hint": s.app_hint, "bytes_up": s.bytes_up, "bytes_down": s.bytes_down}})
        for t in ds.txns:  # direction is from this person's side: money leaving their account is a debit to them
            if t.src_account in accounts:
                detail = {"direction": "debit", "from": t.src_account, "to": t.dst_account or None}
            elif t.dst_account in accounts:
                detail = {"direction": "credit", "to": t.dst_account, "from": t.src_account or None}
            else:
                continue
            detail.update({"amount": clean_num(t.amount), "channel": t.channel, "narration": t.narration})
            events.append({"kind": "txn", "ts": iso(t.time), "rec_id": t.rec_id, "row_sha256": t.sha, "detail": detail})
        for post in ds.posts:
            if post.handle in handles or post.msisdn in phones:
                events.append({"kind": "post", "ts": iso(post.time), "rec_id": post.rec_id, "row_sha256": post.sha, "detail": {
                    "platform": post.platform, "handle": post.handle, "post_type": post.post_type, "text": post.text}})
        # A stable sort by timestamp alone would leave same-minute transactions in scan order; where money
        # both arrives and immediately moves on (a fanout hop), the outgoing leg reads before the incoming
        # one — confirmed against every such tie in the captured timelines. Everything else keeps its
        # existing relative order (calls, sessions, debits and posts all share the lower tier).
        events.sort(key=lambda e: (e["ts"], 1 if e["kind"] == "txn" and e["detail"]["direction"] == "credit" else 0))
        return events
    return ds.memo(("entity_events", entity_id), build)


def case_events(ds: Dataset, entity_ids: list[str]) -> list[dict]:
    merged: dict[str, dict] = {}
    for pid in entity_ids:
        if pid not in ds.persons:
            continue
        for e in entity_events(ds, pid):
            if e["rec_id"] in merged:
                if pid not in merged[e["rec_id"]]["entities"]:
                    merged[e["rec_id"]]["entities"].append(pid)
            else:
                merged[e["rec_id"]] = {**e, "entities": [pid]}
    return sorted(merged.values(), key=lambda e: e["ts"])


# ---- profile ---------------------------------------------------------------------------------
def profile(ds: Dataset, entity_id: str) -> dict:
    p = ds.persons[entity_id]
    identifiers: dict[str, list] = defaultdict(list)
    for a in p.accounts:
        identifiers["Account"].append({"value": a, "props": {"number": a, "ifsc": ds.account_ifsc.get(a)}, "resolved_by": p.rules.get(a, "R2")})
    for d in p.devices:
        identifiers["Device"].append({"value": d, "props": {"imei": d}, "resolved_by": p.rules.get(d, "R1")})
    for ph in p.phones:
        identifiers["Phone"].append({"value": ph, "props": {"msisdn": ph}, "resolved_by": p.rules.get(ph, "R1")})
    for h in p.handles:
        identifiers["SocialHandle"].append({"value": h["handle"], "props": {"handle": h["handle"], "platform": h["platform"]}, "resolved_by": p.rules.get(h["handle"], "R4")})

    phones = set(p.phones)
    contacts: dict[str, dict] = {}
    placed = []

    def touch(other: str, kind: str, direction: str, seconds: int):
        rec = contacts.setdefault(other, {"msisdn": other, "entity_id": ds.by_phone.get(other), "calls_out": 0, "calls_in": 0,
                                          "sms_out": 0, "sms_in": 0, "seconds": 0, "total_contacts": 0})
        rec[f"{kind}_{direction}"] += 1
        if kind == "calls":  # an SMS has no talk time, whatever its record says
            rec["seconds"] += seconds
        rec["total_contacts"] += 1

    for c in ds.calls:  # calls placed, then calls received — this fixes the order equal counts are listed in
        if c.a_party in phones:
            touch(c.b_party, "sms" if c.call_type == "sms" else "calls", "out", c.duration)
            placed.append(c)
    for c in ds.calls:
        if c.b_party in phones:
            touch(c.a_party, "sms" if c.call_type == "sms" else "calls", "in", c.duration)
    accounts = set(p.accounts)
    sent = [t for t in ds.txns if t.src_account in accounts]
    received = [t for t in ds.txns if t.dst_account in accounts and t.src_account not in accounts]
    activity = {
        "calls_placed": len(placed),
        "seconds_placed": sum(c.duration for c in placed),
        "first_call": iso(min(c.start for c in placed)) if placed else None,
        "last_call": iso(max(c.start for c in placed)) if placed else None,
        "txns_sent": len(sent),
        "amount_sent": clean_num(sum(t.amount for t in sent)),
        "txns_received": len(received),
        "amount_received": clean_num(sum(t.amount for t in received)),
    }
    score = scoring.scores(ds).get(entity_id)
    return {
        "entity_id": entity_id,
        "identifiers": dict(identifiers),
        "identifier_count": sum(len(v) for v in identifiers.values()),
        "contacts": sorted(contacts.values(), key=lambda r: -r["total_contacts"]),
        "activity": activity,
        "engine": "local",
        "risk": {k: score[k] for k in ("risk_score", "band", "model", "computed_at")} if score else None,
    }


# ---- geography ---------------------------------------------------------------------------------
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def towers(ds: Dataset) -> list[dict]:
    def build():
        sites: dict[str, dict] = {}
        phones = defaultdict(set)
        for c in ds.calls:
            if c.lat is None or c.lon is None:
                continue
            key = c.cell_key
            site = sites.setdefault(key, {"cell_key": key, "lac": c.lac, "cell_id": c.cell_id, "lat": c.lat, "lon": c.lon, "call_count": 0,
                                          "distinct_phones": 0, "first_seen": iso(c.start), "last_seen": iso(c.start)})
            site["call_count"] += 1
            phones[key].add(c.a_party)
            site["first_seen"] = min(site["first_seen"], iso(c.start))
            site["last_seen"] = max(site["last_seen"], iso(c.start))
        for key, site in sites.items():
            site["distinct_phones"] = len(phones[key])
        return sorted(sites.values(), key=lambda s: -s["call_count"])  # ties keep first-seen order
    return ds.memo("towers", build)


def movement(ds: Dataset, entity_id: str, start: str | None = None, end: str | None = None) -> dict:
    p = ds.persons[entity_id]
    phones = set(p.phones)
    points = []
    for c in sorted(ds.calls, key=lambda c: (c.start, c.rec_id)):
        if c.a_party not in phones or c.lat is None:
            continue
        stamp = iso(c.start)
        if (start and stamp < start) or (end and stamp > end):
            continue
        points.append({"rec_id": c.rec_id, "msisdn": c.a_party, "ts": stamp, "duration_sec": c.duration, "call_type": c.call_type,
                       "cell_key": c.cell_key, "lat": c.lat, "lon": c.lon})
    sites: dict[str, dict] = {}
    for pt in points:
        s = sites.setdefault(pt["cell_key"], {"cell_key": pt["cell_key"], "lat": pt["lat"], "lon": pt["lon"], "weight": 0, "first_seen": pt["ts"], "last_seen": pt["ts"]})
        s["weight"] += 1
        s["last_seen"] = pt["ts"]
    path = sum(haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) for a, b in zip(points, points[1:]))
    return {
        "entity_id": entity_id,
        "points": points,
        "sites": sorted(sites.values(), key=lambda s: (-s["weight"], s["first_seen"])),
        "observation_count": len(points),
        "distinct_sites": len(sites),
        "path_km_lower_bound": round(path, 3),
        "window": {"start": start, "end": end},
        "engine": "local",
    }


def proximity(ds: Dataset, lat: float, lon: float, at: str, window_minutes: int = 30, radius_km: float = 2) -> dict:
    centre = ts(at)
    lo, hi = centre - timedelta(minutes=window_minutes), centre + timedelta(minutes=window_minutes)
    observations = []
    for c in ds.calls:
        if c.lat is None or not (lo <= c.start <= hi):
            continue
        distance = haversine_km(lat, lon, c.lat, c.lon)
        if distance > radius_km:
            continue
        observations.append({"rec_id": c.rec_id, "msisdn": c.a_party, "entity_id": ds.by_phone.get(c.a_party), "ts": iso(c.start),
                             "call_type": c.call_type, "duration_sec": c.duration, "cell_key": c.cell_key, "lat": c.lat, "lon": c.lon,
                             "distance_km": round(distance, 3)})
    observations.sort(key=lambda o: (o["distance_km"], o["ts"]))
    subjects: dict[str, dict] = {}
    for o in observations:
        key = o["entity_id"] or o["msisdn"]
        s = subjects.setdefault(key, {"key": key, "msisdn": o["msisdn"], "entity_id": o["entity_id"], "observations": 0,
                                      "closest_km": o["distance_km"], "closest_ts": o["ts"], "cell_key": o["cell_key"]})
        s["observations"] += 1
    return {
        "centre": {"lat": lat, "lon": lon}, "at": at, "window_minutes": window_minutes, "radius_km": radius_km,
        "window": {"start": iso(lo), "end": iso(hi)}, "observations": observations,
        "subjects": sorted(subjects.values(), key=lambda s: (s["closest_km"], -s["observations"])),
        "total_observations": len(observations), "engine": "local",
    }


GEO_THRESHOLDS = {"max_plausible_kmh": 900, "min_significant_km": 1, "geo_financial_window_minutes": 30, "geo_financial_conflict_km": 200}


def contradictions(ds: Dataset) -> dict:
    impossible = []
    for pid, p in ds.persons.items():
        pts = movement(ds, pid)["points"]
        for a, b in zip(pts, pts[1:]):
            km = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
            hours = (ts(b["ts"]) - ts(a["ts"])).total_seconds() / 3600
            if km < GEO_THRESHOLDS["min_significant_km"] or hours <= 0:
                continue  # simultaneous observations are handovers between sites, not travel
            speed = km / hours if hours > 0 else float("inf")
            if speed > GEO_THRESHOLDS["max_plausible_kmh"]:
                impossible.append({"entity_id": pid, "from": a, "to": b, "distance_km": round(km, 3),
                                   "implied_kmh": None if math.isinf(speed) else round(speed, 1)})
    return {
        "impossible_travel": impossible,
        "geo_financial_conflict": [],
        "total": len(impossible),
        "thresholds": GEO_THRESHOLDS,
        "note": "A contradiction is a lead, not a conclusion. It says two records cannot both describe the same person in the same place — which of them is wrong, or who else was holding the device, is what an investigator establishes next.",
        "engine": "local",
    }
