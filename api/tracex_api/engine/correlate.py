"""Cross-source correlation detectors."""
from __future__ import annotations

from collections import defaultdict

from tracex_api.engine.dataset import Dataset, clean_num, iso


def call_to_debit(ds: Dataset, window_s: int = 10800) -> list[dict]:
    """A debit from a person's account shortly after (or during) a call that person received.

    Latency is measured from the end of the call. A debit made while the call was still connected
    is measured from the call's start, and — because the caller was on the line as the money left —
    it supersedes any earlier calls as the explanation for that debit.
    """
    def build():
        calls_to = defaultdict(list)
        for c in ds.calls:
            callee = ds.by_phone.get(c.b_party)
            if callee:
                calls_to[callee].append(c)
        links = []
        for t in ds.txns:
            if t.direction != "DEBIT":
                continue
            person = ds.by_account.get(t.src_account)
            if not person:
                continue
            candidates = []
            for c in calls_to.get(person, []):
                if ds.by_phone.get(c.a_party) == person:
                    continue
                if t.time >= c.end:
                    latency, during = (t.time - c.end).total_seconds(), False
                elif t.time >= c.start:
                    latency, during = (t.time - c.start).total_seconds(), True
                else:
                    continue
                if latency > window_s:
                    continue
                candidates.append((latency, during, c))
            if any(d for _, d, _ in candidates):
                candidates = [x for x in candidates if x[1]]
            for latency, _, c in candidates:
                links.append({
                    "person": person,
                    "call_rec_id": c.rec_id,
                    "call_end": iso(c.end),
                    "caller": c.a_party,
                    "debit_rec_id": t.rec_id,
                    "debit_time": iso(t.time),
                    "amount": clean_num(t.amount),
                    "latency_s": int(latency),
                    "src_account": t.src_account,
                    "dst_account": t.dst_account or None,
                    "narration": t.narration,
                })
        links.sort(key=lambda l: (l["latency_s"], l["person"], l["call_rec_id"], l["debit_rec_id"]))
        return links
    return ds.memo(("call_to_debit", window_s), build)


def fanout(ds: Dataset, window_s: int = 1800, min_ratio: float = 0.7, max_ratio: float = 1.5) -> list[dict]:
    """Money received and passed straight on: a credit followed by debits from the same account."""
    def build():
        debits_from = defaultdict(list)
        for t in ds.txns:
            if t.direction == "DEBIT" and t.src_account:
                debits_from[t.src_account].append(t)
        links = []
        for t in ds.txns:
            if t.direction != "CREDIT" or not t.dst_account or t.amount <= 0:
                continue
            person = ds.by_account.get(t.dst_account)
            if not person:
                continue
            outs = [d for d in debits_from.get(t.dst_account, []) if 0 <= (d.time - t.time).total_seconds() <= window_s]
            if not outs:
                continue
            total = sum(d.amount for d in outs)
            ratio = round(total / t.amount, 4)
            if not (min_ratio <= ratio <= max_ratio):
                continue
            links.append({
                "person": person,
                "inbound_rec_id": t.rec_id,
                "inbound_time": iso(t.time),
                "inbound_amount": clean_num(t.amount),
                "inbound_account": t.dst_account,
                "outbound_rec_ids": [d.rec_id for d in outs],
                "outbound_total": clean_num(round(total, 2)),
                "passthrough_ratio": ratio,
                "window_s": window_s,
                "hop_count": len(outs),
            })
        links.sort(key=lambda l: (-l["hop_count"], l["person"], l["inbound_time"]))
        return links
    return ds.memo(("fanout", window_s, min_ratio, max_ratio), build)


def imei_persistence(ds: Dataset, min_sims: int = 2) -> list[dict]:
    """Handsets seen with several SIMs — burner rotation."""
    def build():
        numbers, imsis = defaultdict(set), defaultdict(set)
        for c in ds.calls:
            numbers[c.imei].add(c.a_party)
            imsis[c.imei].add(c.imsi)
        for s in ds.sessions:
            numbers[s.imei].add(s.msisdn)
            imsis[s.imei].add(s.imsi)
        devices = []
        for imei in imsis:
            if len(imsis[imei]) < min_sims:
                continue
            persons = sorted({ds.by_phone[n] for n in numbers[imei] if n in ds.by_phone} | ({ds.by_device[imei]} if imei in ds.by_device else set()))
            devices.append({
                "imei": imei,
                "sim_count": len(imsis[imei]),
                "numbers": sorted(numbers[imei]),
                "imsis": sorted(imsis[imei]),
                "persons": persons,
            })
        devices.sort(key=lambda d: (-d["sim_count"], d["imei"]))
        return devices
    return ds.memo(("imei_persistence", min_sims), build)
