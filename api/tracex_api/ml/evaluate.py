"""Classification metrics shared by the training script (model card) and the live /ml/shadow evaluation."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, f1_score, log_loss, precision_score, recall_score, roc_auc_score

FLAG = 0.33  # the "elevated" band boundary the whole application flags at


def metrics(y, p, flag: float = FLAG) -> dict:
    y, p = np.asarray(y), np.asarray(p)
    if len(set(y.tolist())) < 2:
        return {"note": "needs both classes to compute ranking metrics"}
    flagged = p >= flag
    return {
        "roc_auc": round(float(roc_auc_score(y, p)), 4), "pr_auc": round(float(average_precision_score(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4), "log_loss": round(float(log_loss(y, np.clip(p, 1e-6, 1 - 1e-6))), 4),
        f"precision@{flag}": round(float(precision_score(y, flagged, zero_division=0)), 4),
        f"recall@{flag}": round(float(recall_score(y, flagged, zero_division=0)), 4),
        f"f1@{flag}": round(float(f1_score(y, flagged, zero_division=0)), 4),
    }
