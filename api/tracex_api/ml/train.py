"""Training pipeline for the entity risk model.

    python -m tracex_api.ml.train [--n 8000] [--seed 7] [--out DIR] [--quick]

Pipeline: draw a synthetic archetype corpus -> stratified 70/15/15 train/validation/test split ->
5-fold cross-validated grid search (log-loss) of a monotone-constrained XGBoost classifier on the training
split only -> isotonic calibration fitted on the validation split -> a single evaluation on the untouched test
split -> comparison with baselines (majority class, logistic regression, the hand-written rule scorer) ->
external validation on the 20 seeded case entities, which never touch fitting or threshold choice ->
artifacts (booster JSON, calibration JSON, model card) with SHA-256 hashes the runtime re-checks.

Everything the card reports is measured by this script. The synthetic test split measures fit to the sampler and
is optimistic by construction; the 20-entity external check is the honest out-of-distribution number, and it is
small (n=18 after excluding victims) — read it as a sanity check, not a benchmark.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

from tracex_api.ml import sampler
from tracex_api.ml.evaluate import FLAG, metrics as _metrics
from tracex_api.ml.model import ARTIFACTS, CALIB_FILE, CARD_FILE, MODEL_FILE, SCORE_CEIL, SCORE_FLOOR, sha256_file
from tracex_api.ml.schema import FEATURES, FRAUD_ROLES, MONOTONE

SEED_DIR = Path(__file__).resolve().parents[1] / "seed_data"
HIGH = 0.66  # the upper review band boundary (FLAG, the lower, comes from ml.evaluate)


def _calibration(y, p, bins: int = 10) -> tuple[list[dict], float]:
    y, p = np.asarray(y), np.asarray(p)
    idx = np.minimum((p * bins).astype(int), bins - 1)
    table, ece = [], 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            gap = abs(float(p[m].mean()) - float(y[m].mean()))
            ece += gap * m.mean()
            table.append({"bin": f"{b / bins:.1f}-{(b + 1) / bins:.1f}", "n": int(m.sum()),
                          "mean_predicted": round(float(p[m].mean()), 3), "observed_rate": round(float(y[m].mean()), 3)})
    return table, round(float(ece), 4)


def _live_features() -> dict[str, dict] | None:
    """The feature vectors the DEPLOYED application computes for the seeded case, taken from an isolated throwaway
    database in a subprocess (so training never touches the app's own data). None if that fails."""
    code = "\n".join([
        "from fastapi.testclient import TestClient",
        "from tracex_api.main import app",
        "TestClient(app).get('/health')  # first request seeds the throwaway database",
        "import json",
        "from tracex_api.engine.dataset import current",
        "from tracex_api.engine import scoring",
        "print('@@' + json.dumps(scoring.features(current())))",
    ])
    with tempfile.TemporaryDirectory() as d:
        env = {**os.environ, "TRACEX_DB": str(Path(d) / "live.db"), "PYTHONIOENCODING": "utf-8",
               "PYTHONPATH": str(Path(__file__).resolve().parents[2])}
        try:
            r = subprocess.run([sys.executable, "-W", "ignore", "-c", code], capture_output=True, text=True, env=env, timeout=240)
        except (OSError, subprocess.SubprocessError):
            return None
    for line in r.stdout.splitlines():
        if line.startswith("@@"):
            return json.loads(line[2:])
    return None


def _external_validation(predict, live: dict[str, dict] | None) -> dict:
    """Score the 20 seeded case entities with the trained model and grade against the roles the corpus generator
    planted (victims excluded from the fraud/legit matrix, as in the benchmark).

    Two feature sources are scored side by side because they are NOT the same: the vectors captured from the original
    system, and the vectors this codebase computes from the records. Four features (counterparty_stability, txn_velocity,
    coupled_calls_out, callee_money_movers) were only ever approximated, so they differ — and the model is sensitive to
    that. The live-feature result is the one that reflects what the deployed scorer does."""
    seed = json.loads((SEED_DIR / "model_scores.json").read_text(encoding="utf-8"))
    roles = {s["entity_id"]: s["role"] for s in json.loads((SEED_DIR / "subjects.json").read_text(encoding="utf-8"))}
    captured = [{f: s["features"][f] for f in FEATURES} for s in seed]
    sc_cap = predict(captured)
    sc_live = predict([{f: live[s["entity_id"]][f] for f in FEATURES} for s in seed]) if live else None
    entities = []
    for i, s in enumerate(seed):
        role = roles.get(s["entity_id"], "unknown")
        entities.append({"entity_id": s["entity_id"], "role": role, "fraud_role": role in FRAUD_ROLES, "victim": role == "victim",
                         "trained_score_live_features": None if sc_live is None else round(float(sc_live[i]), 4),
                         "trained_score_captured_features": round(float(sc_cap[i]), 4), "recorded_original_score": s["risk_score"]})
    graded = [e for e in entities if not e["victim"]]
    y = [int(e["fraud_role"]) for e in graded]
    col = lambda k: [e[k] for e in graded]
    out = {
        "n_entities": len(entities), "n_graded": len(graded), "victims_excluded": len(entities) - len(graded),
        "trained_on_captured_vectors": _metrics(y, col("trained_score_captured_features")),
        "recorded_original": _metrics(y, col("recorded_original_score")),
        "note": "roles are the generator's planted labels; n is tiny — a sanity check, not a benchmark.",
        "entities": entities,
    }
    if sc_live is not None:
        diff = [e["entity_id"] for s, e in zip(seed, entities) if any(s["features"][f] != live[e["entity_id"]][f] for f in FEATURES)]
        out["trained_on_live_features"] = _metrics(y, col("trained_score_live_features"))
        out["feature_skew"] = {"entities_with_different_features": len(diff), "of": len(entities),
                               "mean_abs_score_change": round(float(np.mean(np.abs(np.asarray(sc_live) - np.asarray(sc_cap)))), 4),
                               "max_abs_score_change": round(float(np.max(np.abs(np.asarray(sc_live) - np.asarray(sc_cap)))), 4)}
    return out


def train(n: int = 8000, seed: int = 7, out: Path = ARTIFACTS, quick: bool = False, live_external: bool = True) -> dict:
    t0 = time.time()
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    # ---- data ------------------------------------------------------------------------------------------------
    df = sampler.sample(n, seed)
    tr, rest = train_test_split(df, test_size=0.30, stratify=df["archetype"], random_state=seed)
    va, te = train_test_split(rest, test_size=0.50, stratify=rest["archetype"], random_state=seed)
    X = lambda d: d[FEATURES]
    y = lambda d: d["label"].to_numpy()

    # ---- cross-validated hyper-parameter search (training split only) ------------------------------------------
    grid = {"max_depth": [2, 3] if quick else [2, 3, 4], "n_estimators": [80, 160] if quick else [80, 160, 320],
            "min_child_weight": [1, 5], "reg_lambda": [1.0, 5.0]}
    base = xgb.XGBClassifier(objective="binary:logistic", eval_metric="logloss", tree_method="hist", learning_rate=0.06,
                             subsample=0.9, colsample_bytree=0.9, monotone_constraints=MONOTONE, random_state=seed, n_jobs=1)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    search = GridSearchCV(base, grid, scoring="neg_log_loss", cv=cv, refit=True, n_jobs=1)
    search.fit(X(tr), y(tr))
    best = search.best_estimator_
    booster = best.get_booster()

    # ---- calibration (validation split) ------------------------------------------------------------------------
    raw = lambda d: best.predict_proba(X(d))[:, 1]
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(raw(va), y(va))
    x_thr, y_thr = [float(v) for v in iso.X_thresholds_], [float(v) for v in iso.y_thresholds_]
    cal = lambda r: np.clip(np.interp(r, x_thr, y_thr), SCORE_FLOOR, SCORE_CEIL)

    # ---- single evaluation on the untouched test split ---------------------------------------------------------
    p_te = cal(raw(te))
    test = _metrics(y(te), p_te)
    test["raw_uncalibrated"] = _metrics(y(te), raw(te))
    reliability, ece = _calibration(y(te), p_te)
    test["expected_calibration_error"] = ece

    # ---- baselines on the same test split ----------------------------------------------------------------------
    from tracex_api.engine import scoring  # local import: scoring imports the ml runtime lazily, not at import time

    prior = float(y(tr).mean())
    log_inr = FunctionTransformer(lambda a: np.log1p(np.abs(a)))
    lr = make_pipeline(log_inr, StandardScaler(), LogisticRegression(max_iter=2000, class_weight=None, random_state=seed)).fit(X(tr), y(tr))
    rules = np.array([scoring._rule_score({f: float(r[f]) for f in FEATURES})[0] for _, r in X(te).iterrows()])
    baselines = {
        "majority_class": {"roc_auc": 0.5, "note": f"always predicts the training prior ({prior:.3f}); flags nothing at {FLAG}"},
        "logistic_regression": _metrics(y(te), lr.predict_proba(X(te))[:, 1]),
        "hand_written_rule_scorer": _metrics(y(te), rules),
    }

    # ---- where does it go wrong? per-archetype behaviour on the test split ---------------------------------------
    per = []
    for arche, g in te.assign(p=p_te).groupby("archetype"):
        per.append({"archetype": arche, "n": int(len(g)), "label": int(g["label"].iloc[0]), "mean_score": round(float(g["p"].mean()), 3),
                    "flag_rate": round(float((g["p"] >= FLAG).mean()), 3)})
    per.sort(key=lambda r: (-r["label"], r["archetype"]))

    # ---- global attribution: mean |TreeSHAP| on the test split --------------------------------------------------
    contribs = booster.predict(xgb.DMatrix(X(te), feature_names=FEATURES), pred_contribs=True)[:, :-1]
    importance = sorted(({"feature": f, "mean_abs_shap": round(float(np.abs(contribs[:, i]).mean()), 4)}
                         for i, f in enumerate(FEATURES)), key=lambda r: -r["mean_abs_shap"])

    # ---- write the artifacts, then the card that pins their hashes ---------------------------------------------
    booster.save_model(str(out / MODEL_FILE))
    (out / CALIB_FILE).write_text(json.dumps({"method": "isotonic", "fitted_on": "validation split", "x_thresholds": x_thr,
                                              "y_thresholds": y_thr}, indent=1), encoding="utf-8")

    def external(rows):
        return cal(best.predict_proba(pd.DataFrame(rows, columns=FEATURES))[:, 1])

    live = _live_features() if live_external else None

    results = pd.DataFrame(search.cv_results_).sort_values("rank_test_score").head(5)
    card = {
        "name": "TRACE-X entity risk model", "algorithm": "XGBoost gradient-boosted trees (binary:logistic), monotone-constrained, isotonic-calibrated",
        "trained_at": datetime.now(timezone.utc).isoformat(), "training_seconds": round(time.time() - t0, 1),
        "intended_use": "Rank an investigator's review queue by likelihood of involvement in a coordinated scam/mule operation. A score is a lead, never a verdict, and is always shown with the counter-evidence check.",
        "not_intended_for": "Automated adverse action against a person; use outside the feature definitions in engine/scoring.py; populations unlike the archetype sampler.",
        "features": FEATURES, "monotone_constraints": dict(zip(FEATURES, MONOTONE)),
        "data": {"source": "synthetic archetype sampler (ml/sampler.py)", "n_total": int(len(df)), "n_train": int(len(tr)), "n_validation": int(len(va)),
                 "n_test": int(len(te)), "seed": seed, "sampler_version": sampler.SAMPLER_VERSION, "fraud_rate": round(float(df["label"].mean()), 4), "mix": sampler.MIX},
        "hyperparameters": {k: (v if not isinstance(v, np.generic) else v.item()) for k, v in search.best_params_.items()},
        "cross_validation": {"folds": 5, "metric": "neg_log_loss", "best_mean": round(float(search.best_score_), 4),
                             "top_configs": [{"params": r["params"], "mean_neg_log_loss": round(float(r["mean_test_score"]), 4),
                                              "std": round(float(r["std_test_score"]), 4)} for _, r in results.iterrows()]},
        "test": test, "baselines": baselines, "per_archetype_test": per, "reliability_test": reliability, "feature_importance": importance,
        "external_validation": _external_validation(external, live),
        "limitations": [
            "Trained on synthetic data from a hand-authored archetype sampler. Test-split metrics measure fit to that sampler and are optimistic by construction.",
            "Train/serve skew: the four approximated features are computed differently by this codebase than in the captured vectors, and the model is sensitive to them — see external_validation.feature_skew for the measured effect. The live-feature external result is the one that reflects deployed behaviour.",
            "The 20-entity external check is tiny (n=18 graded) and drawn from one planted scenario; it demonstrates the model transfers sanely, not that it generalises. It is also not independent: the sampler's author had seen those feature vectors (units/magnitudes) before writing the archetypes.",
            "The sampler was revised once (v1 -> v2) after error analysis showed the model shortcutting on transaction volume; volume features (inbound_txn_count) are still the largest contributor, so a high-volume mule is scored lower than a low-volume one — an evasion route the counter-evidence check and human review exist to cover.",
            "Known weak spots on the synthetic test split: roaming travellers and shared-handset households are flagged more often than any other legitimate class (see per_archetype_test).",
            "Feature definitions for counterparty_stability, txn_velocity, coupled_calls_out and callee_money_movers are approximations of an earlier system's; scores there are less comparable.",
            "No fairness or subgroup analysis is possible: the data contains no protected attributes and none should be added without a governance review.",
        ],
        "environment": {"python_xgboost": xgb.__version__, "scikit_learn": sklearn.__version__, "numpy": np.__version__},
        "artifacts": {MODEL_FILE: sha256_file(out / MODEL_FILE), CALIB_FILE: sha256_file(out / CALIB_FILE)},
    }
    (out / CARD_FILE).write_text(json.dumps(card, indent=1), encoding="utf-8")
    return card


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--n", type=int, default=8000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", type=Path, default=ARTIFACTS)
    ap.add_argument("--quick", action="store_true", help="smaller grid (used by the tests)")
    a = ap.parse_args()
    card = train(a.n, a.seed, a.out, a.quick)
    t, ev = card["test"], card["external_validation"]
    print(f"trained in {card['training_seconds']}s  best={card['hyperparameters']}")
    print(f"test    AUC {t['roc_auc']}  PR-AUC {t['pr_auc']}  P@{FLAG} {t[f'precision@{FLAG}']}  R@{FLAG} {t[f'recall@{FLAG}']}  ECE {t['expected_calibration_error']}")
    for name, b in card["baselines"].items():
        if "pr_auc" in b:
            print(f"  baseline {name:26s} AUC {b['roc_auc']}  PR-AUC {b['pr_auc']}  R@{FLAG} {b[f'recall@{FLAG}']}")
    live_m = ev.get("trained_on_live_features")
    cap_m = ev["trained_on_captured_vectors"]
    print(f"external (n={ev['n_graded']}) recorded-original AUC {ev['recorded_original']['roc_auc']} R@{FLAG} {ev['recorded_original'][f'recall@{FLAG}']}")
    print(f"  trained on captured vectors: AUC {cap_m['roc_auc']} R@{FLAG} {cap_m[f'recall@{FLAG}']} P@{FLAG} {cap_m[f'precision@{FLAG}']}")
    if live_m:
        print(f"  trained on LIVE features:    AUC {live_m['roc_auc']} R@{FLAG} {live_m[f'recall@{FLAG}']} P@{FLAG} {live_m[f'precision@{FLAG}']}   skew={ev['feature_skew']}")
    print(f"artifacts -> {a.out}")


if __name__ == "__main__":
    main()
