import json
import joblib
import numpy as np
import xgboost as xgb
from pathlib import Path
from typing import Any
import shap

from app.core.config import get_settings
from app.ml.features import (
    FEATURE_NAMES, ARCHETYPES, RISK_BANDS,
    extract_features, generate_synthetic_training_data, get_risk_band
)

settings = get_settings()


class RiskScorer:
    def __init__(self):
        self.model: xgb.Booster | None = None
        self.scaler = None
        self.explainer: shap.TreeExplainer | None = None
        self.feature_names = FEATURE_NAMES
        self.archetypes = ARCHETYPES

    def load(self) -> None:
        model_path = Path(settings.MODEL_PATH)
        scaler_path = Path(settings.SCALER_PATH)
        features_path = Path(settings.FEATURE_NAMES_PATH)

        if model_path.exists():
            self.model = xgb.Booster()
            self.model.load_model(str(model_path))
        else:
            self._train_and_save()

        if scaler_path.exists():
            self.scaler = joblib.load(scaler_path)

        if self.model:
            self.explainer = shap.TreeExplainer(self.model)

    def _train_and_save(self) -> None:
        X, y = generate_synthetic_training_data()

        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import train_test_split

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        X_train, X_val, y_train, y_val = train_test_split(
            X_scaled, y, test_size=0.2, random_state=42, stratify=y
        )

        dtrain = xgb.DMatrix(X_train, label=y_train)
        dval = xgb.DMatrix(X_val, label=y_val)

        params = {
            "objective": "multi:softprob",
            "num_class": len(self.archetypes),
            "max_depth": 6,
            "eta": 0.1,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "eval_metric": "mlogloss",
            "seed": 42,
            "tree_method": "hist",
        }

        evals = [(dtrain, "train"), (dval, "val")]
        self.model = xgb.train(
            params,
            dtrain,
            num_boost_round=200,
            evals=evals,
            early_stopping_rounds=20,
            verbose_eval=False,
        )

        model_path = Path(settings.MODEL_PATH)
        model_path.parent.mkdir(parents=True, exist_ok=True)
        self.model.save_model(str(model_path))
        joblib.dump(self.scaler, settings.SCALER_PATH)

        with open(settings.FEATURE_NAMES_PATH, "w") as f:
            json.dump(self.feature_names, f)

        self.explainer = shap.TreeExplainer(self.model)

    def predict_proba(self, features: np.ndarray) -> np.ndarray:
        if self.model is None:
            self.load()

        if self.scaler:
            features = self.scaler.transform(features.reshape(1, -1))
        else:
            features = features.reshape(1, -1)

        dmatrix = xgb.DMatrix(features)
        probs = self.model.predict(dmatrix)
        return probs[0]

    def predict(self, entity_data: dict) -> dict:
        features = extract_features(entity_data)
        probs = self.predict_proba(features)

        fraud_core_idx = self.archetypes.index("fraud_core")
        mule_idx = self.archetypes.index("mule")
        handler_idx = self.archetypes.index("handler")

        risk_score = float(probs[fraud_core_idx] + probs[mule_idx] + probs[handler_idx])
        risk_score = min(max(risk_score, 0.0), 1.0)

        risk_band = get_risk_band(risk_score)

        shap_values = self._get_shap_values(features)

        return {
            "risk_score": risk_score,
            "risk_band": risk_band,
            "archetype_probs": dict(zip(self.archetypes, probs.tolist())),
            "shap_factors": shap_values,
            "features": dict(zip(self.feature_names, features.tolist())),
        }

    def _get_shap_values(self, features: np.ndarray) -> list[dict]:
        if self.explainer is None:
            return []

        if self.scaler:
            features_scaled = self.scaler.transform(features.reshape(1, -1))
        else:
            features_scaled = features.reshape(1, -1)

        shap_vals = self.explainer.shap_values(features_scaled)

        if isinstance(shap_vals, list):
            fraud_core_idx = self.archetypes.index("fraud_core")
            shap_vals = shap_vals[fraud_core_idx]

        top_indices = np.argsort(np.abs(shap_vals[0]))[::-1][:6]

        factors = []
        for idx in top_indices:
            factors.append({
                "feature": self.feature_names[idx],
                "value": float(features[idx]),
                "shap_value": float(shap_vals[0][idx]),
                "direction": "increases" if shap_vals[0][idx] > 0 else "decreases",
            })

        return factors


class RuleBasedScorer:
    def score(self, entity_data: dict) -> dict:
        features = extract_features(entity_data)

        score = 0.0
        reasons = []

        if features[0] < 600 and features[0] > 0:
            score += 0.25
            reasons.append(f"Low call-txn latency: {features[0]:.0f}s")

        if features[3] > 0.9:
            score += 0.25
            reasons.append(f"High passthrough ratio: {features[3]:.2f}")

        if features[4] >= 4:
            score += 0.2
            reasons.append(f"Wide fan-out: {features[4]} counterparties")

        if features[6] >= 3:
            score += 0.15
            reasons.append(f"Multiple SIMs per device: {features[6]}")

        if features[7] > 10:
            score += 0.1
            reasons.append(f"High velocity: {features[7]:.1f} txns/hour")

        if features[8] > 0.7:
            score += 0.05
            reasons.append(f"Stable counterparty: {features[8]:.2f}")

        score = min(score, 1.0)
        risk_band = get_risk_band(score)

        return {
            "risk_score": score,
            "risk_band": risk_band,
            "archetype_probs": {a: 0.0 for a in ARCHETYPES},
            "shap_factors": [{"feature": r, "value": 0, "shap_value": 0, "direction": "rule"} for r in reasons],
            "features": dict(zip(FEATURE_NAMES, features.tolist())),
            "fallback": True,
        }


_scorer_instance: RiskScorer | None = None
_fallback_scorer = RuleBasedScorer()


def get_scorer() -> RiskScorer:
    global _scorer_instance
    if _scorer_instance is None:
        _scorer_instance = RiskScorer()
        _scorer_instance.load()
    return _scorer_instance


def get_fallback_scorer() -> RuleBasedScorer:
    return _fallback_scorer