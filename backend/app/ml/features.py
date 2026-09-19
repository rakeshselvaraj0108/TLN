import numpy as np
from typing import Any
from datetime import datetime, timedelta

FEATURE_NAMES = [
    "call_txn_latency_mean",
    "call_txn_latency_std",
    "passthrough_ratio_mean",
    "passthrough_ratio_max",
    "fan_out_width",
    "fan_out_completion_window_min",
    "imei_sim_count",
    "velocity_txn_per_hour",
    "counterparty_stability",
    "total_txn_amount",
    "txn_amount_std",
    "unique_counterparties",
    "call_duration_mean",
    "call_duration_std",
    "data_session_count",
    "social_post_count",
    "night_activity_ratio",
    "cross_border_ratio",
]

ARCHETYPES = [
    "fraud_core",
    "mule",
    "handler",
    "red_herring",
    "bystander",
]

RISK_BANDS = {
    "high": 0.66,
    "elevated": 0.33,
    "low": 0.0,
}


def extract_features(entity_data: dict) -> np.ndarray:
    features = np.zeros(len(FEATURE_NAMES), dtype=np.float32)

    calls = entity_data.get("calls", [])
    txns = entity_data.get("txns", [])
    data_sessions = entity_data.get("data_sessions", [])
    posts = entity_data.get("posts", [])
    devices = entity_data.get("devices", [])
    sims = entity_data.get("sims", [])
    accounts = entity_data.get("accounts", [])

    if calls and txns:
        latencies = []
        for call in calls:
            call_time = _parse_time(call.get("start_time"))
            if not call_time:
                continue
            for txn in txns:
                txn_time = _parse_time(txn.get("txn_time"))
                if not txn_time:
                    continue
                if txn_time >= call_time:
                    latency = (txn_time - call_time).total_seconds()
                    if 0 <= latency <= 3600:
                        latencies.append(latency)
        if latencies:
            features[0] = np.mean(latencies)
            features[1] = np.std(latencies) if len(latencies) > 1 else 0.0

    passthrough_ratios = []
    if accounts and txns:
        for account in accounts:
            outgoing = [t for t in txns if t.get("src_account") == account]
            incoming = [t for t in txns if t.get("dst_account") == account]
            if outgoing and incoming:
                total_out = sum(t.get("amount", 0) for t in outgoing)
                total_in = sum(t.get("amount", 0) for t in incoming)
                if total_in > 0:
                    ratio = total_out / total_in
                    passthrough_ratios.append(min(ratio, 10.0))
    if passthrough_ratios:
        features[2] = np.mean(passthrough_ratios)
        features[3] = np.max(passthrough_ratios)

    fan_out_counterparties = set()
    fan_out_times = []
    if accounts and txns:
        for account in accounts:
            outgoing = [t for t in txns if t.get("src_account") == account]
            for txn in outgoing:
                dst = txn.get("dst_account")
                if dst and dst not in accounts:
                    fan_out_counterparties.add(dst)
                    txn_time = _parse_time(txn.get("txn_time"))
                    if txn_time:
                        fan_out_times.append(txn_time)
    features[4] = len(fan_out_counterparties)
    if fan_out_times:
        window = (max(fan_out_times) - min(fan_out_times)).total_seconds() / 60
        features[5] = window

    features[6] = len(sims) if devices else 0

    if txns:
        txn_times = [_parse_time(t.get("txn_time")) for t in txns if _parse_time(t.get("txn_time"))]
        if len(txn_times) > 1:
            hours = (max(txn_times) - min(txn_times)).total_seconds() / 3600
            features[7] = len(txns) / max(hours, 1.0)

    if txns:
        counterparties = defaultdict(int)
        for txn in txns:
            dst = txn.get("dst_account")
            if dst:
                counterparties[dst] += 1
        if counterparties:
            features[8] = max(counterparties.values()) / len(txns)
        features[9] = sum(t.get("amount", 0) for t in txns)
        amounts = [t.get("amount", 0) for t in txns]
        features[10] = np.std(amounts) if len(amounts) > 1 else 0.0
        features[11] = len(counterparties)

    if calls:
        durations = [c.get("duration_sec", 0) for c in calls]
        features[12] = np.mean(durations) if durations else 0.0
        features[13] = np.std(durations) if len(durations) > 1 else 0.0

    features[14] = len(data_sessions)

    features[15] = len(posts)

    night_txns = 0
    total_txns = len(txns)
    for txn in txns:
        txn_time = _parse_time(txn.get("txn_time"))
        if txn_time and (txn_time.hour < 6 or txn_time.hour > 22):
            night_txns += 1
    features[16] = night_txns / max(total_txns, 1)

    return features


def _parse_time(time_str: str | None) -> datetime | None:
    if not time_str:
        return None
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%d/%m/%Y %H:%M:%S",
        "%d-%b-%Y %H:%M:%S",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(time_str, fmt)
        except ValueError:
            continue
    return None


def get_risk_band(score: float) -> str:
    if score >= RISK_BANDS["high"]:
        return "high"
    elif score >= RISK_BANDS["elevated"]:
        return "elevated"
    return "low"


def generate_synthetic_training_data(seed: int = 42, rows_per_archetype: int = 400) -> tuple[np.ndarray, np.ndarray]:
    np.random.seed(seed)
    X = []
    y = []

    for archetype_idx, archetype in enumerate(ARCHETYPES):
        for _ in range(rows_per_archetype):
            if archetype == "fraud_core":
                features = _gen_fraud_core()
            elif archetype == "mule":
                features = _gen_mule()
            elif archetype == "handler":
                features = _gen_handler()
            elif archetype == "red_herring":
                features = _gen_red_herring()
            else:
                features = _gen_bystander()

            noise_mask = np.random.random(len(features)) < 0.06
            features[noise_mask] = np.random.normal(0, 1, noise_mask.sum())

            X.append(features)
            y.append(archetype_idx)

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)


def _gen_fraud_core() -> np.ndarray:
    return np.array([
        np.random.normal(300, 60),
        np.random.normal(50, 20),
        np.random.normal(0.95, 0.03),
        np.random.normal(0.98, 0.02),
        np.random.poisson(6) + 3,
        np.random.normal(12, 3),
        np.random.poisson(5) + 3,
        np.random.normal(15, 5),
        np.random.normal(0.85, 0.1),
        np.random.lognormal(13, 0.5),
        np.random.lognormal(12, 0.5),
        np.random.poisson(8) + 3,
        np.random.normal(180, 60),
        np.random.normal(60, 20),
        np.random.poisson(3),
        np.random.poisson(2),
        np.random.normal(0.4, 0.15),
        np.random.normal(0.1, 0.05),
    ], dtype=np.float32)


def _gen_mule() -> np.ndarray:
    return np.array([
        np.random.normal(1200, 300),
        np.random.normal(200, 100),
        np.random.normal(0.92, 0.05),
        np.random.normal(0.97, 0.03),
        np.random.poisson(2) + 1,
        np.random.normal(30, 10),
        np.random.poisson(1),
        np.random.normal(8, 3),
        np.random.normal(0.7, 0.15),
        np.random.lognormal(11, 0.7),
        np.random.lognormal(10, 0.7),
        np.random.poisson(3) + 1,
        np.random.normal(120, 40),
        np.random.normal(40, 15),
        np.random.poisson(1),
        np.random.poisson(1),
        np.random.normal(0.2, 0.1),
        np.random.normal(0.05, 0.03),
    ], dtype=np.float32)


def _gen_handler() -> np.ndarray:
    return np.array([
        np.random.normal(600, 150),
        np.random.normal(100, 40),
        np.random.normal(0.6, 0.15),
        np.random.normal(0.8, 0.1),
        np.random.poisson(8) + 4,
        np.random.normal(8, 2),
        np.random.poisson(7) + 3,
        np.random.normal(20, 8),
        np.random.normal(0.4, 0.2),
        np.random.lognormal(12, 0.6),
        np.random.lognormal(11, 0.6),
        np.random.poisson(12) + 5,
        np.random.normal(200, 80),
        np.random.normal(80, 30),
        np.random.poisson(5),
        np.random.poisson(3),
        np.random.normal(0.35, 0.12),
        np.random.normal(0.15, 0.08),
    ], dtype=np.float32)


def _gen_red_herring() -> np.ndarray:
    return np.array([
        np.random.normal(2000, 500),
        np.random.normal(500, 200),
        np.random.normal(0.94, 0.04),
        np.random.normal(0.96, 0.03),
        np.random.poisson(4) + 2,
        np.random.normal(480, 120),
        np.random.poisson(3) + 1,
        np.random.normal(5, 2),
        np.random.normal(0.8, 0.1),
        np.random.lognormal(12, 0.5),
        np.random.lognormal(11, 0.5),
        np.random.poisson(5) + 2,
        np.random.normal(150, 50),
        np.random.normal(50, 20),
        np.random.poisson(2),
        np.random.poisson(1),
        np.random.normal(0.15, 0.08),
        np.random.normal(0.02, 0.01),
    ], dtype=np.float32)


def _gen_bystander() -> np.ndarray:
    return np.array([
        np.random.normal(5000, 2000),
        np.random.normal(1000, 500),
        np.random.normal(0.1, 0.1),
        np.random.normal(0.3, 0.15),
        np.random.poisson(1),
        np.random.normal(1000, 300),
        np.random.poisson(1),
        np.random.normal(2, 1),
        np.random.normal(0.1, 0.05),
        np.random.lognormal(10, 0.8),
        np.random.lognormal(9, 0.8),
        np.random.poisson(2) + 1,
        np.random.normal(100, 40),
        np.random.normal(30, 15),
        np.random.poisson(0),
        np.random.poisson(0),
        np.random.normal(0.1, 0.05),
        np.random.normal(0.01, 0.01),
    ], dtype=np.float32)


from collections import defaultdict