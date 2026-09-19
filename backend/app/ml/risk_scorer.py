from __future__ import annotations
from pathlib import Path
import joblib
import numpy as np
from app.ml.models.risk_xgb import ModelWrapper

_MODEL_PATH = Path(__file__).parent / "models" / "risk_xgb.pkl"

def load_risk_model():
    if not _MODEL_PATH.exists():
        return None
    return joblib.load(_MODEL_PATH)

def predict_risk(features: dict) -> float | None:
    """Return a risk probability in [0,1] given a flat feature dict."""
    model = load_risk_model()
    if model is None:
        return None
    # Expect model to be a ModelWrapper that has .predict_proba(X)
    X = model.transform_features(features)  # returns np.array of shape (1, n_features)
    proba = model.predict_proba(X)[:, 1]   # probability of "high risk"
    return float(proba[0])
