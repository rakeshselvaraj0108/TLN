"""Entity features and risk scores.

Features are computed from the evidence (18 of them, defined in `ml/schema.py`). Three scorers can turn a feature
vector into a score, and `TRACEX_SCORER` chooses between them:

  recorded  the original deployment's XGBoost outputs (seed_data/model_scores.json), replayed for an entity whose
            computed features are unchanged since that model scored it. That model's weights were never
            recoverable, so this is a recording, not something this repository can retrain.
  trained   the model THIS repository trains — `python -m tracex_api.ml.train` — served by `ml/model.py`
            (monotone-constrained XGBoost, isotonic-calibrated, exact TreeSHAP explanations). Reported as
            model="xgboost-local".
  rules     the transparent hand-weighted logistic scorer below; the last-resort fallback if the trained artifacts
            are missing or fail their integrity check.

Modes:  auto (default) = recorded where the features are unchanged, otherwise trained, otherwise rules;
        trained        = trained for every entity (the pure-ML view; recorded scores are ignored);
        replay         = recorded where unchanged, otherwise rules (the legacy behaviour);
        rules          = rules only (an ablation).
`auto` keeps the numbers a reviewer sees identical to the deployed application's for the seeded case, while every
new or changed entity — and the shadow evaluation exposed at /ml/shadow — goes through the real trained model.
"""
from __future__ import annotations

import json
import math
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from tracex_api.engine import correlate
from tracex_api.engine.dataset import Dataset

SEED = Path(__file__).resolve().parents[1] / "seed_data"
FEATURES = [
    "n_phones", "n_devices", "n_accounts", "n_ips_shared", "max_imei_sim_count", "has_call_debit_coupling",
    "call_debit_speed_score", "n_call_debit_links", "max_passthrough_ratio", "max_fanout_hop_count",
    "total_fanout_inbound_inr", "inbound_txn_count", "outbound_txn_count", "distinct_counterparties",
    "counterparty_stability", "txn_velocity", "coupled_calls_out", "callee_money_movers",
]
# Features whose definitions were recovered exactly; the rest are approximations of the original.
EXACT = [f for f in FEATURES if f not in {"counterparty_stability", "txn_velocity", "coupled_calls_out", "callee_money_movers"}]
BANDS = {"low": (0.0, 0.33), "elevated": (0.33, 0.66), "high": (0.66, 1.0)}
FAST_LATENCY_S = 600
WINDOW_S = 10800
SCORER_MODES = ("auto", "trained", "replay", "rules")
TRAINED_LABEL = "xgboost-local"


def scorer_mode() -> str:
    mode = os.environ.get("TRACEX_SCORER", "auto").strip().lower()
    return mode if mode in SCORER_MODES else "auto"

# Transparent rule scorer: logit contribution per unit of (capped) feature value.
RULE_WEIGHTS = {
    "n_phones": (0.35, 10), "n_devices": (0.2, 5), "n_accounts": (0.1, 5), "n_ips_shared": (0.9, 3),
    "max_imei_sim_count": (0.35, 10), "has_call_debit_coupling": (0.4, 1), "call_debit_speed_score": (0.8, 1),
    "n_call_debit_links": (0.05, 20), "max_passthrough_ratio": (1.6, 1.5), "max_fanout_hop_count": (0.45, 10),
    "total_fanout_inbound_inr": (0.0000025, 1_000_000), "inbound_txn_count": (0.03, 50), "outbound_txn_count": (0.02, 50),
    "distinct_counterparties": (0.15, 10), "counterparty_stability": (-0.6, 1), "txn_velocity": (0.08, 10),
    "coupled_calls_out": (1.2, 3), "callee_money_movers": (1.2, 3),
}
RULE_BIAS = -3.2


def band_of(score: float) -> str:
    if score >= 0.66:
        return "high"
    if score >= 0.33:
        return "elevated"
    return "low"


def _seed() -> dict[str, dict]:
    return {s["entity_id"]: s for s in json.loads((SEED / "model_scores.json").read_text(encoding="utf-8"))}


def features(ds: Dataset) -> dict[str, dict]:
    def build():
        c2d = correlate.call_to_debit(ds, WINDOW_S)
        fan = correlate.fanout(ds)
        sims = defaultdict(set)
        for c in ds.calls:
            sims[c.imei].add(c.imsi)
        for s in ds.sessions:
            sims[s.imei].add(s.imsi)
        ip_people = defaultdict(set)
        for s in ds.sessions:
            p = ds.by_phone.get(s.msisdn)
            if p:
                ip_people[s.public_ip].add(p)
        links_by = defaultdict(list)
        for l in c2d:
            links_by[l["person"]].append(l)
        fan_by = defaultdict(list)
        for l in fan:
            fan_by[l["person"]].append(l)
        fanout_people = {l["person"] for l in fan}
        caller_links = defaultdict(list)
        for l in c2d:
            caller = ds.by_phone.get(l["caller"])
            if caller:
                caller_links[caller].append(l)

        result = {}
        for pid, p in ds.persons.items():
            accts = set(p.accounts)
            ins = [t for t in ds.txns if t.direction == "CREDIT" and t.dst_account in accts]
            outs = [t for t in ds.txns if t.direction == "DEBIT" and t.src_account in accts]
            links = links_by[pid]
            fl = fan_by[pid]
            my_ips = {s.public_ip for s in ds.sessions if s.msisdn in p.phones}
            min_lat = min((l["latency_s"] for l in links), default=None)
            dst_counts = Counter(t.dst_account for t in outs if t.dst_account)
            n_dst = sum(dst_counts.values())
            days = Counter(t.time.date() for t in ins + outs)
            big_fast = [l for l in caller_links[pid] if l["latency_s"] <= FAST_LATENCY_S and l["amount"] >= 100_000]
            result[pid] = {
                "n_phones": len(p.phones),
                "n_devices": len(p.devices),
                "n_accounts": len(p.accounts),
                "n_ips_shared": sum(1 for ip in my_ips if len(ip_people[ip]) > 1),
                "max_imei_sim_count": max((len(sims[d]) for d in p.devices), default=0),
                "has_call_debit_coupling": 1 if links else 0,
                "call_debit_speed_score": 0 if min_lat is None else round(min(1.0, 1 - (min_lat - FAST_LATENCY_S) / (WINDOW_S - FAST_LATENCY_S)), 4),
                "n_call_debit_links": len(links),
                "max_passthrough_ratio": max((l["passthrough_ratio"] for l in fl), default=0),
                "max_fanout_hop_count": max((l["hop_count"] for l in fl), default=0),
                "total_fanout_inbound_inr": sum(l["inbound_amount"] for l in fl),
                "inbound_txn_count": len(ins),
                "outbound_txn_count": len(outs),
                "distinct_counterparties": len(dst_counts),
                "counterparty_stability": round(1 - len(dst_counts) / (2 * n_dst), 4) if n_dst else 0,
                "txn_velocity": round(max(days.values()) if days else 0, 4),
                "coupled_calls_out": len({l["person"] for l in big_fast}),
                "callee_money_movers": len({l["person"] for l in caller_links[pid] if l["person"] in fanout_people or any(
                    x["person"] == l["person"] and x["amount"] >= 100_000 for x in c2d)} & {l["person"] for l in big_fast}),
            }
        return result
    return ds.memo("features", build)


def _rule_score(feats: dict) -> tuple[float, list[dict]]:
    contributions = []
    logit = RULE_BIAS
    for name in FEATURES:
        weight, cap = RULE_WEIGHTS[name]
        value = feats[name]
        contribution = weight * min(float(value), cap)
        logit += contribution
        contributions.append((name, value, contribution))
    score = 1 / (1 + math.exp(-logit))
    top = sorted(contributions, key=lambda x: -abs(x[2]))[:6]
    factors = [{"feature": n, "value": v, "shap": round(c, 4), "direction": "raises" if c >= 0 else "lowers"} for n, v, c in top]
    return round(score, 4), factors


def _ml():
    from tracex_api.ml import model as ml_model  # lazy: importing xgboost costs ~1s and the rules path never needs it

    return ml_model.get_model()


def score_features(feats: dict, model: str = "rules") -> float:
    """Score one feature vector with the scorer that produced `model` — used to probe the live scorer (counterfactuals)."""
    if model == TRAINED_LABEL:
        m = _ml()
        if m is not None:
            return float(m.predict([feats])[0])
    return _rule_score(feats)[0]


def _trained_batch(rows: list[dict]):
    """(score, factors) for each row from the trained model, or None when it is unavailable."""
    m = _ml()
    return m.explain(rows) if m is not None else None


def scores(ds: Dataset) -> dict[str, dict]:
    """entity_id -> {entity_id, risk_score, band, model, computed_at, top_factors, features}."""
    def build():
        seed = _seed()
        mode = scorer_mode()
        now = datetime.now(timezone.utc).isoformat()
        feats_by = features(ds)
        out, pending = {}, []
        for pid, feats in feats_by.items():
            original = seed.get(pid)
            if mode in ("auto", "replay") and original and all(original["features"].get(f) == feats[f] for f in EXACT):
                out[pid] = {
                    "entity_id": pid, "risk_score": original["risk_score"], "band": original["band"], "model": original["model"],
                    "computed_at": original["computed_at"], "top_factors": original["top_factors"], "features": original["features"],
                }
            else:
                pending.append(pid)
        trained = _trained_batch([feats_by[p] for p in pending]) if pending and mode in ("auto", "trained") else None
        for i, pid in enumerate(pending):
            if trained is not None:
                score, factors = trained[i]
                label = TRAINED_LABEL
            else:
                score, factors = _rule_score(feats_by[pid])
                label = "rules"
            out[pid] = {"entity_id": pid, "risk_score": score, "band": band_of(score), "model": label,
                        "computed_at": now, "top_factors": factors, "features": feats_by[pid]}
        return out
    return ds.memo(("scores", scorer_mode()), build)


def scores_shadow(ds: Dataset) -> dict[str, dict] | None:
    """The trained model's score for EVERY entity, regardless of TRACEX_SCORER — the basis of the shadow evaluation.
    None when the trained artifacts are unavailable."""
    def build():
        feats_by = features(ds)
        pids = list(feats_by)
        trained = _trained_batch([feats_by[p] for p in pids])
        if trained is None:
            return None
        now = datetime.now(timezone.utc).isoformat()
        return {p: {"entity_id": p, "risk_score": s, "band": band_of(s), "model": TRAINED_LABEL, "computed_at": now,
                    "top_factors": f, "features": feats_by[p]} for p, (s, f) in zip(pids, trained)}
    return ds.memo("scores_shadow", build)


def ranked(ds: Dataset) -> list[dict]:
    return sorted(scores(ds).values(), key=lambda s: (-s["risk_score"], s["entity_id"]))
