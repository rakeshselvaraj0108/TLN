"""Serving side of the trained risk model.

Deliberately boring and safe:
  * the booster is XGBoost's own JSON format and the calibrator is a JSON step table — no pickle/joblib, so
    loading an artifact can never execute code;
  * the SHA-256 of every artifact is recorded in the model card at training time and re-checked at load time;
    a file that no longer matches is refused (the scorer then falls back to the transparent rule scorer);
  * explanations are exact TreeSHAP values from XGBoost itself (`pred_contribs`), in log-odds space.
"""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import xgboost as xgb

from tracex_api.ml.schema import FEATURES

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
MODEL_FILE, CALIB_FILE, CARD_FILE = "risk_model.json", "calibration.json", "model_card.json"
# Isotonic calibration produces flat 0/1 plateaus on a finite sample; a score of exactly 0 or 1 claims a certainty
# no model of this kind has, so scores are held inside a small margin.
SCORE_FLOOR, SCORE_CEIL = 0.005, 0.995
TOP_FACTORS = 6


class ModelUnavailable(RuntimeError):
    """The artifacts are missing or fail their integrity check."""


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class RiskModel:
    def __init__(self, booster: xgb.Booster, x_thresholds: np.ndarray, y_thresholds: np.ndarray, card: dict):
        self.booster, self.x_thr, self.y_thr, self.card = booster, x_thresholds, y_thresholds, card

    # -- loading ----------------------------------------------------------------------------------
    @classmethod
    def load(cls, directory: Path = ARTIFACTS) -> "RiskModel":
        try:
            card = json.loads((directory / CARD_FILE).read_text(encoding="utf-8"))
            recorded = card["artifacts"]
        except (OSError, KeyError, json.JSONDecodeError) as exc:
            raise ModelUnavailable(f"no readable model card in {directory}: {exc}") from exc
        for name in (MODEL_FILE, CALIB_FILE):
            path = directory / name
            if not path.exists():
                raise ModelUnavailable(f"missing artifact {name}")
            if sha256_file(path) != recorded.get(name):
                raise ModelUnavailable(f"{name} does not match the hash recorded at training time — refusing to load it")
        if card.get("features") != FEATURES:
            raise ModelUnavailable("the model was trained on a different feature set than the code now defines")
        booster = xgb.Booster()
        booster.load_model(str(directory / MODEL_FILE))
        cal = json.loads((directory / CALIB_FILE).read_text(encoding="utf-8"))
        return cls(booster, np.asarray(cal["x_thresholds"], dtype=float), np.asarray(cal["y_thresholds"], dtype=float), card)

    # -- inference --------------------------------------------------------------------------------
    @staticmethod
    def _matrix(rows: list[dict]) -> xgb.DMatrix:
        arr = np.asarray([[float(r[f]) for f in FEATURES] for r in rows], dtype=float)
        return xgb.DMatrix(arr, feature_names=FEATURES)

    def calibrate(self, raw: np.ndarray) -> np.ndarray:
        return np.clip(np.interp(raw, self.x_thr, self.y_thr), SCORE_FLOOR, SCORE_CEIL)

    def predict(self, rows: list[dict]) -> np.ndarray:
        """Calibrated fraud-involvement probability for each feature row."""
        if not rows:
            return np.zeros(0)
        return self.calibrate(self.booster.predict(self._matrix(rows)))

    def explain(self, rows: list[dict], top: int = TOP_FACTORS) -> list[tuple[float, list[dict]]]:
        """(score, top factors) per row. Factors are exact TreeSHAP contributions to the raw log-odds; because the
        calibration map is monotone, a factor that raises the raw margin raises the reported score."""
        if not rows:
            return []
        dm = self._matrix(rows)
        scores = self.calibrate(self.booster.predict(dm))
        contribs = self.booster.predict(dm, pred_contribs=True)  # (n, F + 1); the last column is the bias
        out = []
        for row, score, c in zip(rows, scores, contribs):
            order = np.argsort(-np.abs(c[:-1]))[:top]
            factors = [{"feature": FEATURES[i], "value": row[FEATURES[i]], "shap": round(float(c[i]), 4),
                        "direction": "raises" if c[i] >= 0 else "lowers"} for i in order]
            out.append((round(float(score), 4), factors))
        return out


@lru_cache(maxsize=1)
def _cached() -> tuple[RiskModel | None, str | None]:
    try:
        return RiskModel.load(ARTIFACTS), None  # ARTIFACTS is read at call time so tests can point it elsewhere
    except ModelUnavailable as exc:
        return None, str(exc)


def get_model() -> RiskModel | None:
    return _cached()[0]


def status() -> dict:
    model, reason = _cached()
    if model is None:
        return {"available": False, "reason": reason}
    c = model.card
    return {"available": True, "trained_at": c.get("trained_at"), "algorithm": c["algorithm"], "n_train": c["data"]["n_train"],
            "artifact_sha256": c["artifacts"][MODEL_FILE][:16]}


def reload() -> None:
    _cached.cache_clear()
