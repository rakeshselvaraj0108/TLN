from __future__ import annotations
from pathlib import Path
import joblib
import numpy as np
from typing import Dict, List

class ModelWrapper:
    def __init__(self, model_object):
        self.model = model_object

    def transform_features(self, features: Dict) -> np.ndarray:
        """Convert a flat dict to the ordered numpy array the model expects."""
        # The order of feature names must match the training order.
        # Store the expected feature names on the wrapper instance.
        if not hasattr(self, "feature_names_"):
            # Attempt to infer from the loaded model if possible
            raise NotImplementedError("feature_names_ not set – load a model with proper metadata")
        ordered = [features.get(name, 0.0) for name in self.feature_names_]
        return np.array(ordered, dtype=float).reshape(1, -1)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict_proba(X)

def load_model(path: str | Path = None) -> ModelWrapper | None:
    if path is None:
        path = Path(__file__).parent / "risk_xgb.pkl"
    if not Path(path).exists():
        return None
    raw = joblib.load(path)
    # Assume raw is a fitted sklearn sklearn.xgboost.XGBClassifier
    return ModelWrapper(raw)
