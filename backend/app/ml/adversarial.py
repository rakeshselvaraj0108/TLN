import numpy as np
from typing import Any
from copy import deepcopy

from app.ml.model import get_scorer, get_fallback_scorer
from app.ml.features import FEATURE_NAMES, extract_features


class CounterfactualEngine:
    def __init__(self, scorer=None):
        self.scorer = scorer or get_scorer()
        self.fallback = get_fallback_scorer()
        self.feature_names = FEATURE_NAMES
        self.max_iterations = 50
        self.tolerance = 1e-4
        self.target_threshold = 0.66

    def find_boundary(self, entity_data: dict, target_score: float = None) -> dict:
        target = target_score or self.target_threshold
        features = extract_features(entity_data)
        original_score_result = self.scorer.predict(entity_data)
        original_score = original_score_result["risk_score"]

        if original_score < target:
            return {
                "original_score": original_score,
                "target_score": target,
                "already_below": True,
                "boundary": None,
                "feature_changes": [],
            }

        boundaries = {}

        for i, feature_name in enumerate(self.feature_names):
            boundary = self._binary_search_feature(
                entity_data, features, i, feature_name, target
            )
            if boundary is not None:
                boundaries[feature_name] = boundary

        feature_changes = []
        for fname, bval in boundaries.items():
            orig_idx = self.feature_names.index(fname)
            orig_val = features[orig_idx]
            change_pct = ((bval - orig_val) / orig_val * 100) if orig_val != 0 else float('inf')
            feature_changes.append({
                "feature": fname,
                "original_value": float(orig_val),
                "boundary_value": float(bval),
                "change_required": float(bval - orig_val),
                "change_pct": float(change_pct),
            })

        return {
            "original_score": original_score,
            "target_score": target,
            "already_below": False,
            "boundary": boundaries,
            "feature_changes": feature_changes,
        }

    def _binary_search_feature(
        self, entity_data: dict, features: np.ndarray, feature_idx: int,
        feature_name: str, target: float
    ) -> float | None:
        orig_val = features[feature_idx]

        low, high = 0.0, orig_val * 2 if orig_val > 0 else 1.0
        if feature_name in ["call_txn_latency_mean", "call_txn_latency_std",
                           "fan_out_completion_window_min", "velocity_txn_per_hour"]:
            low, high = 0.0, orig_val * 3
        elif feature_name in ["passthrough_ratio_mean", "passthrough_ratio_max",
                             "counterparty_stability", "night_activity_ratio",
                             "cross_border_ratio"]:
            low, high = 0.0, 1.0
        elif feature_name in ["imei_sim_count", "fan_out_width", "unique_counterparties",
                             "data_session_count", "social_post_count"]:
            low, high = 0.0, float(max(orig_val * 2, 10))
        elif feature_name in ["total_txn_amount", "txn_amount_std"]:
            low, high = 0.0, orig_val * 5 if orig_val > 0 else 100000.0
        elif feature_name in ["call_duration_mean", "call_duration_std"]:
            low, high = 0.0, orig_val * 2 if orig_val > 0 else 600.0

        best_boundary = None

        for _ in range(self.max_iterations):
            mid = (low + high) / 2
            test_features = features.copy()
            test_features[feature_idx] = mid

            test_entity = deepcopy(entity_data)
            test_entity = self._apply_feature_change(test_entity, feature_name, mid)

            try:
                result = self.scorer.predict(test_entity)
                score = result["risk_score"]
            except Exception:
                result = self.fallback.score(test_entity)
                score = result["risk_score"]

            if score < target:
                best_boundary = mid
                high = mid
            else:
                low = mid

            if high - low < self.tolerance * max(abs(orig_val), 1.0):
                break

        return best_boundary

    def _apply_feature_change(self, entity_data: dict, feature_name: str, new_value: float) -> dict:
        entity = deepcopy(entity_data)

        if feature_name == "call_txn_latency_mean":
            if entity.get("calls") and entity.get("txns"):
                target_latency = new_value
                for call in entity["calls"]:
                    call_time = call.get("start_time")
                    if call_time:
                        for txn in entity["txns"]:
                            txn["txn_time"] = self._adjust_time(call_time, target_latency)
        elif feature_name == "passthrough_ratio_mean":
            if entity.get("txns"):
                for txn in entity["txns"]:
                    txn["amount"] = txn.get("amount", 0) * new_value
        elif feature_name == "fan_out_width":
            pass
        elif feature_name == "imei_sim_count":
            pass

        return entity

    def _adjust_time(self, base_time: str, offset_seconds: float) -> str:
        from datetime import datetime, timedelta
        dt = datetime.fromisoformat(base_time.replace('Z', '+00:00'))
        new_dt = dt + timedelta(seconds=offset_seconds)
        return new_dt.isoformat()


class ExculpatoryEngine:
    def __init__(self, scorer=None):
        self.scorer = scorer or get_scorer()
        self.fallback = get_fallback_scorer()
        self.max_reduction = 0.60

    def run_checks(self, entity_data: dict, risk_result: dict) -> dict:
        checks = []

        checks.append(self._check_legitimate_business_pattern(entity_data, risk_result))
        checks.append(self._check_family_remittance_pattern(entity_data, risk_result))
        checks.append(self._check_shared_device_household(entity_data, risk_result))
        checks.append(self._check_charity_donation_pattern(entity_data, risk_result))

        valid_checks = [c for c in checks if c["triggered"]]
        total_reduction = sum(c["reduction"] for c in valid_checks)
        total_reduction = min(total_reduction, self.max_reduction)

        adjusted_score = max(risk_result["risk_score"] - total_reduction, 0.0)
        adjusted_band = self._get_band(adjusted_score)

        return {
            "original_score": risk_result["risk_score"],
            "original_band": risk_result["risk_band"],
            "checks": checks,
            "total_reduction": total_reduction,
            "adjusted_score": adjusted_score,
            "adjusted_band": adjusted_band,
            "doubtful": adjusted_score < 0.66 and risk_result["risk_score"] >= 0.66,
        }

    def _check_legitimate_business_pattern(self, entity_data: dict, risk_result: dict) -> dict:
        features = risk_result.get("features", {})
        velocity = features.get("velocity_txn_per_hour", 0)
        counterparty_stability = features.get("counterparty_stability", 0)
        unique_counterparties = features.get("unique_counterparties", 0)

        triggered = (
            velocity > 5 and
            counterparty_stability > 0.6 and
            unique_counterparties > 5
        )

        if triggered:
            fit = min(1.0, (velocity / 20) * 0.5 + (counterparty_stability * 0.5))
            evidence = 0.8
            max_weight = 0.25
            reduction = max_weight * fit * evidence
        else:
            reduction = 0.0

        return {
            "check": "legitimate_business",
            "triggered": triggered,
            "reduction": reduction,
            "evidence": {
                "velocity": velocity,
                "counterparty_stability": counterparty_stability,
                "unique_counterparties": unique_counterparties,
            },
            "explanation": "High-velocity, stable-counterparty pattern consistent with legitimate business operations"
        }

    def _check_family_remittance_pattern(self, entity_data: dict, risk_result: dict) -> dict:
        features = risk_result.get("features", {})
        passthrough = features.get("passthrough_ratio_max", 0)
        fan_out = features.get("fan_out_width", 0)
        txn_amount_std = features.get("txn_amount_std", 0)
        total_amount = features.get("total_txn_amount", 0)

        triggered = (
            passthrough > 0.85 and
            fan_out <= 3 and
            txn_amount_std / max(total_amount, 1) < 0.3
        )

        if triggered:
            fit = min(1.0, (passthrough - 0.85) / 0.15)
            evidence = 0.7
            max_weight = 0.20
            reduction = max_weight * fit * evidence
        else:
            reduction = 0.0

        return {
            "check": "family_remittance",
            "triggered": triggered,
            "reduction": reduction,
            "evidence": {
                "passthrough_ratio": passthrough,
                "fan_out_width": fan_out,
                "amount_cv": txn_amount_std / max(total_amount, 1),
            },
            "explanation": "High passthrough with narrow fan-out and consistent amounts suggests family remittance"
        }

    def _check_shared_device_household(self, entity_data: dict, risk_result: dict) -> dict:
        features = risk_result.get("features", {})
        imei_sim_count = features.get("imei_sim_count", 0)
        devices = entity_data.get("devices", [])
        sims = entity_data.get("sims", [])

        triggered = (
            imei_sim_count >= 2 and
            len(devices) == 1 and
            len(sims) <= 4
        )

        if triggered:
            fit = min(1.0, imei_sim_count / 4.0)
            evidence = 0.6
            max_weight = 0.15
            reduction = max_weight * fit * evidence
        else:
            reduction = 0.0

        return {
            "check": "shared_device_household",
            "triggered": triggered,
            "reduction": reduction,
            "evidence": {
                "imei_sim_count": imei_sim_count,
                "device_count": len(devices),
                "sim_count": len(sims),
            },
            "explanation": "Multiple SIMs on single device consistent with household sharing"
        }

    def _check_charity_donation_pattern(self, entity_data: dict, risk_result: dict) -> dict:
        features = risk_result.get("features", {})
        passthrough = features.get("passthrough_ratio_mean", 0)
        fan_out = features.get("fan_out_width", 0)
        social_posts = features.get("social_post_count", 0)
        posts = entity_data.get("posts", [])

        charity_keywords = ["donate", "charity", "ngo", "fundraiser", "relief", "help"]
        has_charity_post = any(
            any(kw in p.get("text", "").lower() for kw in charity_keywords)
            for p in posts
        )

        triggered = (
            passthrough > 0.9 and
            fan_out >= 3 and
            social_posts > 0 and
            has_charity_post
        )

        if triggered:
            fit = min(1.0, (passthrough - 0.9) / 0.1)
            evidence = 0.9 if has_charity_post else 0.5
            max_weight = 0.20
            reduction = max_weight * fit * evidence
        else:
            reduction = 0.0

        return {
            "check": "charity_donation",
            "triggered": triggered,
            "reduction": reduction,
            "evidence": {
                "passthrough_ratio": passthrough,
                "fan_out_width": fan_out,
                "social_posts": social_posts,
                "charity_keywords_found": has_charity_post,
            },
            "explanation": "High passthrough with social media fundraising signals suggests charity operations"
        }

    def _get_band(self, score: float) -> str:
        if score >= 0.66:
            return "high"
        elif score >= 0.33:
            return "elevated"
        return "low"