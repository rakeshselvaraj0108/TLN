"""Threshold rules over raw rows. Observations, not findings."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import timedelta

from tracex_api.engine.dataset import Dataset, clean_num

THRESHOLDS = {
    "high_call_volume": 50,
    "repeated_contact": 20,
    "odd_hour_activity": 10,
    "odd_hour_range": "00:00–05:00",
    "bulk_upload_bytes": 104857600,
    "high_session_count": 100,
    "large_transfer_inr": 200000,
    "rapid_disbursal": "5 debits / 60 min",
}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
RAPID_DEBITS, RAPID_WINDOW = 5, timedelta(minutes=60)


def _finding(rule, subject, source, severity, value, threshold, unit, description, key=None):
    return {"id": f"{rule}:{key or subject}", "rule": rule, "subject": subject, "source": source, "severity": severity,
            "value": value, "threshold": threshold, "unit": unit, "description": description}


def scan(ds: Dataset, source: str = "all") -> list[dict]:
    findings = []
    if source in ("all", "cdr"):
        per_day = Counter((c.a_party, c.start.date()) for c in ds.calls)
        for (msisdn, day), n in per_day.items():
            if n > THRESHOLDS["high_call_volume"]:
                findings.append(_finding("high_call_volume", msisdn, "cdr", "high", n, THRESHOLDS["high_call_volume"], "calls",
                                         f"{msisdn} placed {n} calls on {day}.", f"{msisdn}:{day}"))
        pairs = Counter((c.a_party, c.b_party, c.start.date()) for c in ds.calls)
        for (a, b, day), n in pairs.items():
            if n > THRESHOLDS["repeated_contact"]:
                findings.append(_finding("repeated_contact", a, "cdr", "medium", n, THRESHOLDS["repeated_contact"], "calls",
                                         f"{a} contacted {b} {n} times on {day}.", f"{a}:{b}:{day}"))
        odd = Counter(c.a_party for c in ds.calls if c.start.hour < 5)
        for msisdn, n in odd.items():
            if n > THRESHOLDS["odd_hour_activity"]:
                findings.append(_finding("odd_hour_activity", msisdn, "cdr", "medium", n, THRESHOLDS["odd_hour_activity"], "calls",
                                         f"{msisdn} placed {n} calls between 00:00 and 05:00."))
    if source in ("all", "ipdr"):
        uploaded = defaultdict(float)
        sessions = Counter()
        for s in ds.sessions:
            uploaded[s.msisdn] += float(s.bytes_up)
            sessions[s.msisdn] += 1
        limit = THRESHOLDS["bulk_upload_bytes"]
        for msisdn, total in uploaded.items():
            value = int(total)
            if value > limit:
                findings.append(_finding("bulk_upload", msisdn, "ipdr", "critical" if value >= 4 * limit else "high", value, limit, "bytes",
                                         f"{msisdn} uploaded {round(value / 1048576)} MB. Uplink is the direction that matters for exfiltration; downlink volume is not flagged."))
        for msisdn, n in sessions.items():
            if n > THRESHOLDS["high_session_count"]:
                findings.append(_finding("high_session_count", msisdn, "ipdr", "medium", n, THRESHOLDS["high_session_count"], "sessions",
                                         f"{msisdn} opened {n} data sessions."))
    if source in ("all", "bank"):
        for t in ds.txns:
            if t.amount >= THRESHOLDS["large_transfer_inr"]:
                subject = t.src_account or t.dst_account
                findings.append(_finding("large_transfer", subject, "bank", "high", clean_num(t.amount), THRESHOLDS["large_transfer_inr"], "INR",
                                         f"Single transfer of ₹{t.amount:,.0f} from {subject} — {t.narration}."))
        debits = defaultdict(list)
        for t in ds.txns:
            if t.direction == "DEBIT" and t.src_account:
                debits[t.src_account].append(t.time)
        for account, times in debits.items():
            times.sort()
            best, lo = 0, 0
            for hi, stamp in enumerate(times):
                while stamp - times[lo] > RAPID_WINDOW:
                    lo += 1
                best = max(best, hi - lo + 1)
            if best >= RAPID_DEBITS:
                findings.append(_finding("rapid_disbursal", account, "bank", "medium", best, RAPID_DEBITS, "debits",
                                         f"{account} sent {best} debits inside a 60-minute window."))
    findings.sort(key=lambda f: (SEVERITY_RANK[f["severity"]], -f["value"]))
    return findings
