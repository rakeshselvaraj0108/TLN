"""Synthetic archetype sampler.

There is no labelled real-world corpus for this problem (and there must not be one in a public repo), so the
model is trained on entities drawn from hand-authored archetypes of the "digital arrest" scam typology: the
handler who runs the coercive calls, the SIM farm that shields them, mules and layering accounts that pass the
money on, and — just as important — the legitimate look-alikes that a naive detector flags (busy businesses,
charities that pool donations, households sharing a handset, roaming travellers).

The class-conditional distributions below are written from domain knowledge of the typology. They deliberately
OVERLAP (a fraction of mules leave almost no trace; a fraction of legitimate businesses show a fan-out pattern),
so the task is not trivially separable and a model that scores 1.000 here would be a red flag, not a result.

The 20 seeded case entities are never used to fit anything or to choose a threshold — they are the external
validation set (see train.py). They are NOT an independent test, though: the author had seen their feature vectors
before writing the archetypes (to check units and typical magnitudes), so the archetypes resemble them. Read the
external check as a plausibility test.

Revision note (v2): the first version scored a near-perfect AUC and ranked `inbound_txn_count` as the top feature —
the model had learned "high volume => legitimate" because every business was high-volume and every mule low-volume.
That shortcut is also an evasion route (a busy mule would slip through), so v2 adds high-volume mules and layering
accounts and more legitimate look-alikes with pass-through patterns. The change was made from the per-archetype
error analysis on the synthetic test split, not by tuning against the external set.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from tracex_api.ml.schema import FEATURES, FRAUD_ROLES

SAMPLER_VERSION = 2

# Population mix (fraction of entities). Fraud is over-represented relative to any real population because
# this is a case pool an investigator is already working, not a random sample of the public.
MIX = {
    "mule": 0.12, "layering": 0.04, "handler": 0.04, "sim_farm": 0.03, "associate": 0.07,
    "victim": 0.08, "legit_business": 0.14, "legit_charity": 0.06, "legit_family": 0.14,
    "legit_household": 0.10, "traveller": 0.04, "bystander": 0.14,
}


def _ri(rng, lo, hi, n):
    return rng.integers(lo, hi + 1, n).astype(float)


def _rf(rng, lo, hi, n):
    return rng.uniform(lo, hi, n)


def _bern(rng, p, n):
    return (rng.random(n) < p).astype(float)


def _amount(rng, n, lo=40_000, hi=900_000):
    """Rupee amounts: log-uniform, rounded to the nearest 100."""
    return np.round(np.exp(rng.uniform(np.log(lo), np.log(hi), n)), -2)


def _finish(d: dict, rng, n: int) -> dict:
    """Make the derived features internally consistent, the way the real feature builder produces them."""
    links = d["n_call_debit_links"]
    d["has_call_debit_coupling"] = (links > 0).astype(float)
    d["call_debit_speed_score"] = np.where(links > 0, d["call_debit_speed_score"], 0.0)
    out = d["outbound_txn_count"]
    d["max_fanout_hop_count"] = np.minimum(d["max_fanout_hop_count"], np.maximum(out, 0))
    has_fan = d["max_fanout_hop_count"] > 0
    d["max_passthrough_ratio"] = np.where(has_fan, d["max_passthrough_ratio"], 0.0)
    d["total_fanout_inbound_inr"] = np.where(has_fan, d["total_fanout_inbound_inr"], 0.0)
    d["distinct_counterparties"] = np.minimum(d["distinct_counterparties"], out)
    d["counterparty_stability"] = np.where(out > 0, np.round(1 - d["distinct_counterparties"] / (2 * np.maximum(out, 1)), 4), 0.0)
    total = d["inbound_txn_count"] + out
    d["txn_velocity"] = np.where(total > 0, np.minimum(total, np.maximum(1, d["txn_velocity"])), 0.0)
    d["max_imei_sim_count"] = np.maximum(d["max_imei_sim_count"], np.where(d["n_devices"] > 0, 1, 0))
    return d


def _base(n):
    z = np.zeros(n)
    return {f: z.copy() for f in FEATURES}


def mule(rng, n):
    d = _base(n)
    dormant = _bern(rng, 0.25, n)  # a mule that has not yet moved much: almost no behavioural trace
    d["n_phones"] = _ri(rng, 1, 2, n); d["n_devices"] = _ri(rng, 1, 2, n); d["n_accounts"] = _ri(rng, 1, 2, n)
    d["n_ips_shared"] = np.where(dormant > 0, _bern(rng, 0.3, n), _ri(rng, 0, 2, n))
    d["max_imei_sim_count"] = _ri(rng, 1, 2, n)
    d["n_call_debit_links"] = _ri(rng, 0, 5, n) * _bern(rng, 0.65, n)
    d["call_debit_speed_score"] = _rf(rng, 0.3, 1.0, n)
    d["max_fanout_hop_count"] = np.where(dormant > 0, 0, _ri(rng, 1, 6, n))
    d["max_passthrough_ratio"] = _rf(rng, 0.88, 1.05, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n)
    busy = _bern(rng, 0.22, n) * (1 - dormant)  # mule-as-a-service: one account cycling many victims' money
    d["inbound_txn_count"] = np.where(dormant > 0, _ri(rng, 0, 2, n), np.where(busy > 0, _ri(rng, 12, 90, n), _ri(rng, 1, 7, n)))
    d["outbound_txn_count"] = np.where(dormant > 0, _ri(rng, 0, 3, n), np.where(busy > 0, _ri(rng, 15, 100, n), _ri(rng, 1, 9, n)))
    d["distinct_counterparties"] = np.where(busy > 0, _ri(rng, 8, 35, n), _ri(rng, 1, 6, n))
    d["txn_velocity"] = np.where(busy > 0, _ri(rng, 4, 12, n), _ri(rng, 1, 4, n))
    d["coupled_calls_out"] = np.zeros(n)
    return _finish(d, rng, n)


def layering(rng, n):
    d = _base(n)
    d["n_phones"] = _ri(rng, 1, 2, n); d["n_devices"] = _ri(rng, 1, 2, n); d["n_accounts"] = _ri(rng, 1, 3, n)
    d["n_ips_shared"] = _ri(rng, 0, 1, n)
    d["max_imei_sim_count"] = _ri(rng, 1, 2, n)
    d["n_call_debit_links"] = _ri(rng, 0, 3, n)
    d["call_debit_speed_score"] = _rf(rng, 0.2, 0.9, n)
    d["max_fanout_hop_count"] = _ri(rng, 2, 8, n) * _bern(rng, 0.8, n)
    d["max_passthrough_ratio"] = _rf(rng, 0.9, 1.05, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n, 80_000, 1_200_000)
    busy = _bern(rng, 0.35, n)
    d["inbound_txn_count"] = np.where(busy > 0, _ri(rng, 15, 120, n), _ri(rng, 3, 11, n))
    d["outbound_txn_count"] = np.where(busy > 0, _ri(rng, 20, 140, n), _ri(rng, 4, 14, n))
    d["distinct_counterparties"] = np.where(busy > 0, _ri(rng, 10, 45, n), _ri(rng, 3, 9, n))
    d["txn_velocity"] = np.where(busy > 0, _ri(rng, 5, 14, n), _ri(rng, 2, 8, n))
    return _finish(d, rng, n)


def handler(rng, n):
    d = _base(n)
    d["n_phones"] = _ri(rng, 3, 8, n); d["n_devices"] = _ri(rng, 1, 2, n); d["n_accounts"] = _ri(rng, 0, 1, n)
    d["n_ips_shared"] = _ri(rng, 0, 2, n)
    d["max_imei_sim_count"] = np.maximum(1, d["n_phones"] - _ri(rng, 0, 2, n))
    d["inbound_txn_count"] = _ri(rng, 0, 2, n) * d["n_accounts"]
    d["outbound_txn_count"] = _ri(rng, 0, 2, n) * d["n_accounts"]
    d["distinct_counterparties"] = _ri(rng, 0, 2, n)
    d["coupled_calls_out"] = _ri(rng, 0, 3, n) * _bern(rng, 0.8, n)
    d["callee_money_movers"] = np.minimum(d["coupled_calls_out"], _ri(rng, 0, 2, n))
    return _finish(d, rng, n)


def sim_farm(rng, n):
    d = _base(n)
    d["n_phones"] = _ri(rng, 5, 12, n); d["n_devices"] = _ri(rng, 1, 3, n); d["n_accounts"] = _ri(rng, 0, 1, n)
    d["n_ips_shared"] = _ri(rng, 1, 3, n) * _bern(rng, 0.8, n)
    d["max_imei_sim_count"] = np.maximum(1, d["n_phones"] - _ri(rng, 0, 3, n))
    d["inbound_txn_count"] = _ri(rng, 0, 1, n) * d["n_accounts"]
    d["outbound_txn_count"] = _ri(rng, 0, 1, n) * d["n_accounts"]
    d["distinct_counterparties"] = _ri(rng, 0, 1, n)
    return _finish(d, rng, n)


def associate(rng, n):
    d = _base(n)
    weak = _bern(rng, 0.35, n)  # peripheral: few money signals
    d["n_phones"] = _ri(rng, 1, 2, n); d["n_devices"] = _ri(rng, 1, 2, n); d["n_accounts"] = _ri(rng, 1, 2, n)
    d["n_ips_shared"] = _ri(rng, 0, 2, n) * _bern(rng, 0.5, n)
    d["max_imei_sim_count"] = _ri(rng, 1, 2, n)
    d["n_call_debit_links"] = _ri(rng, 1, 16, n)
    d["call_debit_speed_score"] = _rf(rng, 0.2, 1.0, n)
    d["max_fanout_hop_count"] = np.where(weak > 0, 0, _ri(rng, 0, 6, n))
    d["max_passthrough_ratio"] = _rf(rng, 0.88, 1.05, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n, 60_000, 700_000)
    d["inbound_txn_count"] = _ri(rng, 0, 6, n); d["outbound_txn_count"] = _ri(rng, 1, 12, n)
    d["distinct_counterparties"] = _ri(rng, 1, 8, n)
    d["txn_velocity"] = _ri(rng, 1, 5, n)
    d["coupled_calls_out"] = _bern(rng, 0.15, n)
    return _finish(d, rng, n)


def victim(rng, n):
    d = _base(n)
    d["n_phones"] = np.ones(n); d["n_devices"] = np.ones(n); d["n_accounts"] = np.ones(n)
    d["n_call_debit_links"] = _ri(rng, 0, 4, n)
    d["call_debit_speed_score"] = _rf(rng, 0.6, 1.0, n)
    d["inbound_txn_count"] = _ri(rng, 0, 3, n); d["outbound_txn_count"] = _ri(rng, 3, 9, n)
    d["distinct_counterparties"] = _ri(rng, 1, 3, n)
    d["txn_velocity"] = _ri(rng, 1, 3, n)
    return _finish(d, rng, n)


def legit_business(rng, n):
    d = _base(n)
    d["n_phones"] = _ri(rng, 1, 3, n); d["n_devices"] = _ri(rng, 1, 3, n); d["n_accounts"] = _ri(rng, 1, 2, n)
    d["n_ips_shared"] = _bern(rng, 0.08, n)
    d["max_imei_sim_count"] = _ri(rng, 1, 2, n)
    d["n_call_debit_links"] = _ri(rng, 6, 40, n)
    d["call_debit_speed_score"] = _rf(rng, 0.4, 1.0, n)
    lookalike = _bern(rng, 0.28, n)  # customer money in, supplier payments straight out: a fan-out that is innocent
    d["max_fanout_hop_count"] = lookalike * _ri(rng, 2, 4, n)
    d["max_passthrough_ratio"] = _rf(rng, 0.85, 1.1, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n, 100_000, 1_500_000)
    d["inbound_txn_count"] = _ri(rng, 20, 200, n); d["outbound_txn_count"] = _ri(rng, 30, 200, n)
    d["distinct_counterparties"] = _ri(rng, 10, 40, n)
    d["txn_velocity"] = _ri(rng, 3, 12, n)
    return _finish(d, rng, n)


def legit_charity(rng, n):
    d = _base(n)
    d["n_phones"] = _ri(rng, 1, 2, n); d["n_devices"] = _ri(rng, 1, 2, n); d["n_accounts"] = _ri(rng, 1, 2, n)
    d["n_ips_shared"] = _bern(rng, 0.1, n)
    d["n_call_debit_links"] = _ri(rng, 2, 12, n)
    d["call_debit_speed_score"] = _rf(rng, 0.3, 1.0, n)
    pooled = _bern(rng, 0.22, n)  # donations pooled and disbursed in one go
    d["max_fanout_hop_count"] = pooled * _ri(rng, 3, 6, n)
    d["max_passthrough_ratio"] = _rf(rng, 0.85, 1.05, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n, 100_000, 800_000)
    d["inbound_txn_count"] = _ri(rng, 20, 80, n); d["outbound_txn_count"] = _ri(rng, 5, 25, n)
    d["distinct_counterparties"] = _ri(rng, 3, 15, n)
    d["txn_velocity"] = _ri(rng, 3, 10, n)
    return _finish(d, rng, n)


def legit_family(rng, n):
    d = _base(n)
    d["n_phones"] = np.ones(n); d["n_devices"] = np.ones(n); d["n_accounts"] = _ri(rng, 0, 1, n)
    d["n_ips_shared"] = _bern(rng, 0.05, n)
    d["n_call_debit_links"] = _ri(rng, 0, 8, n)
    d["call_debit_speed_score"] = _rf(rng, 0.3, 1.0, n)
    d["inbound_txn_count"] = _ri(rng, 0, 6, n) * d["n_accounts"]; d["outbound_txn_count"] = _ri(rng, 0, 8, n) * d["n_accounts"]
    d["distinct_counterparties"] = _ri(rng, 0, 5, n)
    d["txn_velocity"] = _ri(rng, 1, 3, n)
    relay = _bern(rng, 0.10, n) * (d["outbound_txn_count"] > 0)  # money relayed for a relative / group booking
    d["max_fanout_hop_count"] = relay * _ri(rng, 1, 2, n)
    d["max_passthrough_ratio"] = _rf(rng, 0.85, 1.05, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n, 20_000, 300_000)
    d["inbound_txn_count"] = np.maximum(d["inbound_txn_count"], relay)
    return _finish(d, rng, n)


def legit_household(rng, n):
    d = _base(n)
    d["n_phones"] = _ri(rng, 2, 4, n); d["n_devices"] = _ri(rng, 1, 2, n); d["n_accounts"] = _ri(rng, 0, 2, n)
    d["n_ips_shared"] = _bern(rng, 0.15, n)  # one household router
    d["max_imei_sim_count"] = np.maximum(1, d["n_phones"] - _ri(rng, 0, 1, n))  # one handset passed round the family
    d["n_call_debit_links"] = _ri(rng, 0, 8, n)
    d["call_debit_speed_score"] = _rf(rng, 0.3, 1.0, n)
    d["inbound_txn_count"] = _ri(rng, 0, 10, n) * (d["n_accounts"] > 0); d["outbound_txn_count"] = _ri(rng, 0, 9, n) * (d["n_accounts"] > 0)
    d["distinct_counterparties"] = _ri(rng, 0, 6, n)
    d["txn_velocity"] = _ri(rng, 1, 3, n)
    relay = _bern(rng, 0.10, n) * (d["outbound_txn_count"] > 0)  # money relayed for a relative / group booking
    d["max_fanout_hop_count"] = relay * _ri(rng, 1, 2, n)
    d["max_passthrough_ratio"] = _rf(rng, 0.85, 1.05, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n, 20_000, 300_000)
    d["inbound_txn_count"] = np.maximum(d["inbound_txn_count"], relay)
    return _finish(d, rng, n)


def traveller(rng, n):
    d = _base(n)
    d["n_phones"] = _ri(rng, 2, 3, n); d["n_devices"] = np.ones(n); d["n_accounts"] = _ri(rng, 1, 2, n)
    d["n_ips_shared"] = _bern(rng, 0.2, n)  # roaming through shared hotel / airport egress
    d["max_imei_sim_count"] = d["n_phones"]  # a roaming SIM swapped into the same handset
    d["n_call_debit_links"] = _ri(rng, 0, 5, n)
    d["call_debit_speed_score"] = _rf(rng, 0.3, 1.0, n)
    d["inbound_txn_count"] = _ri(rng, 0, 5, n); d["outbound_txn_count"] = _ri(rng, 2, 12, n)
    d["distinct_counterparties"] = _ri(rng, 2, 9, n)
    d["txn_velocity"] = _ri(rng, 1, 4, n)
    relay = _bern(rng, 0.10, n) * (d["outbound_txn_count"] > 0)  # money relayed for a relative / group booking
    d["max_fanout_hop_count"] = relay * _ri(rng, 1, 2, n)
    d["max_passthrough_ratio"] = _rf(rng, 0.85, 1.05, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n, 20_000, 300_000)
    d["inbound_txn_count"] = np.maximum(d["inbound_txn_count"], relay)
    return _finish(d, rng, n)


def bystander(rng, n):
    d = _base(n)
    d["n_phones"] = np.ones(n); d["n_devices"] = np.ones(n); d["n_accounts"] = _bern(rng, 0.3, n)
    d["n_ips_shared"] = _bern(rng, 0.05, n)
    d["n_call_debit_links"] = _ri(rng, 0, 2, n)
    d["call_debit_speed_score"] = _rf(rng, 0.2, 1.0, n)
    d["inbound_txn_count"] = _ri(rng, 0, 2, n) * d["n_accounts"]; d["outbound_txn_count"] = _ri(rng, 0, 3, n) * d["n_accounts"]
    d["distinct_counterparties"] = _ri(rng, 0, 3, n)
    d["txn_velocity"] = _ri(rng, 1, 2, n)
    relay = _bern(rng, 0.10, n) * (d["outbound_txn_count"] > 0)  # money relayed for a relative / group booking
    d["max_fanout_hop_count"] = relay * _ri(rng, 1, 2, n)
    d["max_passthrough_ratio"] = _rf(rng, 0.85, 1.05, n)
    d["total_fanout_inbound_inr"] = _amount(rng, n, 20_000, 300_000)
    d["inbound_txn_count"] = np.maximum(d["inbound_txn_count"], relay)
    return _finish(d, rng, n)


ARCHETYPES = {
    "mule": mule, "layering": layering, "handler": handler, "sim_farm": sim_farm, "associate": associate,
    "victim": victim, "legit_business": legit_business, "legit_charity": legit_charity, "legit_family": legit_family,
    "legit_household": legit_household, "traveller": traveller, "bystander": bystander,
}
assert set(MIX) == set(ARCHETYPES) and abs(sum(MIX.values()) - 1) < 1e-9


def sample(n: int = 8000, seed: int = 7) -> pd.DataFrame:
    """n entities drawn from the archetype mixture. Columns: FEATURES + archetype + label (1 = fraud role)."""
    rng = np.random.default_rng(seed)
    counts = {a: int(round(n * w)) for a, w in MIX.items()}
    frames = []
    for arche, k in counts.items():
        if k == 0:
            continue
        feats = ARCHETYPES[arche](rng, k)
        df = pd.DataFrame({f: feats[f] for f in FEATURES})
        df["archetype"] = arche
        df["label"] = int(arche in FRAUD_ROLES)
        frames.append(df)
    out = pd.concat(frames, ignore_index=True)
    return out.sample(frac=1.0, random_state=seed).reset_index(drop=True)
