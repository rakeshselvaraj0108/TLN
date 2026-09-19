"""Routes tagged "ml": the trained model's card and a live shadow evaluation of it."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from tracex_api.auth import User, current_user
from tracex_api.engine import scoring
from tracex_api.engine.dataset import current
from tracex_api.ml import model as ml_model
from tracex_api.ml.evaluate import FLAG, metrics
from tracex_api.ml.schema import FRAUD_ROLES

router = APIRouter(tags=["ml"])


@router.get("/ml/model", summary="Trained model card")
def model_card(user: User = Depends(current_user)):
    """What was trained, on what, how it was evaluated, and where it is known to be weak — as measured by the training run."""
    status = ml_model.status()
    if not status["available"]:
        return {"status": status, "scorer_mode": scoring.scorer_mode(), "card": None}
    return {"status": status, "scorer_mode": scoring.scorer_mode(), "card": json.loads((ml_model.ARTIFACTS / ml_model.CARD_FILE).read_text(encoding="utf-8"))}


@router.get("/ml/shadow", summary="Trained model vs the active scorer, on the live case")
def shadow(user: User = Depends(current_user)):
    """Scores every live entity with the trained model regardless of the scorer mode, and grades it — and the scorer
    currently in force — against the roles the corpus generator planted (victims excluded, as in the benchmark)."""
    ds = current()
    trained = scoring.scores_shadow(ds)
    if trained is None:
        raise HTTPException(status_code=503, detail=f"the trained model is unavailable: {ml_model.status().get('reason')}")
    active = scoring.scores(ds)
    rows = []
    for pid in sorted(active):
        role = ds.persons[pid].role
        rows.append({"entity_id": pid, "role": role, "fraud_role": role in FRAUD_ROLES, "victim": role == "victim",
                     "active_score": active[pid]["risk_score"], "active_model": active[pid]["model"], "trained_score": trained[pid]["risk_score"],
                     "trained_band": trained[pid]["band"], "bands_agree": trained[pid]["band"] == active[pid]["band"],
                     "trained_top_factors": [{"feature": f["feature"], "shap": f["shap"], "direction": f["direction"]} for f in trained[pid]["top_factors"][:3]]})
    graded = [r for r in rows if not r["victim"]]
    y = [int(r["fraud_role"]) for r in graded]
    return {
        "scorer_mode": scoring.scorer_mode(), "flag_threshold": FLAG, "n_entities": len(rows), "n_graded": len(graded),
        "trained": metrics(y, [r["trained_score"] for r in graded]), "active": metrics(y, [r["active_score"] for r in graded]),
        "agreement": {"bands_agree": sum(r["bands_agree"] for r in rows), "of": len(rows)},
        "note": "Labels are the generator's planted roles and n is tiny. Live features are computed by this codebase; four of them are "
                "approximations of an earlier system's, so scores can differ from the captured ones (see the model card's feature_skew).",
        "entities": rows,
    }
