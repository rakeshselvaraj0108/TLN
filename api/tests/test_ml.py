"""Tests for the trained risk model: what the model card claims, checked."""
import json
import shutil
from pathlib import Path

import numpy as np
import pytest
import xgboost as xgb

from tracex_api.ml import model as ml_model
from tracex_api.ml import sampler
from tracex_api.ml.model import CALIB_FILE, CARD_FILE, MODEL_FILE, ModelUnavailable, RiskModel
from tracex_api.ml.schema import FEATURES, MONOTONE_UP
from tracex_api.ml.train import train


@pytest.fixture(scope="module")
def quick_run(tmp_path_factory):
    """One small, fast, real training run (reduced grid, no subprocess) shared by the tests that need a fresh model."""
    out = tmp_path_factory.mktemp("quick-model")
    card = train(n=2500, seed=11, out=out, quick=True, live_external=False)
    return card, out


@pytest.fixture()
def shipped():
    return RiskModel.load(ml_model.ARTIFACTS)


def test_feature_schema_is_shared_with_the_scorer():
    from tracex_api.engine import scoring

    assert scoring.FEATURES == FEATURES


def test_shipped_artifacts_load_and_are_hash_pinned(shipped):
    card = json.loads((ml_model.ARTIFACTS / CARD_FILE).read_text(encoding="utf-8"))
    assert set(card["artifacts"]) == {MODEL_FILE, CALIB_FILE}
    assert card["features"] == FEATURES
    assert shipped.card["algorithm"].startswith("XGBoost")


def test_no_pickle_anywhere_in_the_artifacts():
    names = {p.name for p in ml_model.ARTIFACTS.iterdir()}
    assert not any(n.endswith((".pkl", ".pickle", ".joblib", ".npy", ".npz")) for n in names), names
    for name in (MODEL_FILE, CALIB_FILE, CARD_FILE):
        json.loads((ml_model.ARTIFACTS / name).read_text(encoding="utf-8"))  # plain JSON, or this raises


@pytest.mark.parametrize("victim", [MODEL_FILE, CALIB_FILE])
def test_a_tampered_artifact_is_refused(tmp_path, victim):
    for p in ml_model.ARTIFACTS.iterdir():
        shutil.copy(p, tmp_path / p.name)
    target = tmp_path / victim
    target.write_bytes(target.read_bytes() + b" ")  # one byte of drift
    with pytest.raises(ModelUnavailable, match="hash recorded at training time"):
        RiskModel.load(tmp_path)


def test_missing_card_or_artifact_is_refused(tmp_path):
    with pytest.raises(ModelUnavailable):
        RiskModel.load(tmp_path)
    for p in ml_model.ARTIFACTS.iterdir():
        shutil.copy(p, tmp_path / p.name)
    (tmp_path / MODEL_FILE).unlink()
    with pytest.raises(ModelUnavailable, match="missing artifact"):
        RiskModel.load(tmp_path)


def test_scores_are_calibrated_probabilities_inside_the_floor_and_ceiling(shipped):
    df = sampler.sample(600, seed=3)
    scores = shipped.predict(df[FEATURES].to_dict("records"))
    assert scores.min() >= ml_model.SCORE_FLOOR and scores.max() <= ml_model.SCORE_CEIL
    grid = np.linspace(0, 1, 201)
    assert np.all(np.diff(shipped.calibrate(grid)) >= -1e-12), "calibration must be monotone or SHAP directions would lie"


def test_shap_contributions_are_exact_and_sum_to_the_raw_margin(shipped):
    df = sampler.sample(200, seed=5)
    dm = xgb.DMatrix(df[FEATURES], feature_names=FEATURES)
    contribs = shipped.booster.predict(dm, pred_contribs=True)
    margin = shipped.booster.predict(dm, output_margin=True)
    assert np.allclose(contribs.sum(axis=1), margin, atol=1e-4)


def test_explanations_are_the_six_largest_contributions_in_order(shipped):
    rows = sampler.sample(30, seed=9)[FEATURES].to_dict("records")
    for score, factors in shipped.explain(rows):
        assert 0.0 < score < 1.0 and len(factors) == 6
        mags = [abs(f["shap"]) for f in factors]
        assert mags == sorted(mags, reverse=True)
        assert all(f["direction"] == ("raises" if f["shap"] >= 0 else "lowers") for f in factors)


@pytest.mark.parametrize("feature", sorted(MONOTONE_UP))
def test_monotone_constraints_actually_hold(shipped, feature):
    """The domain says more of these signals is never less suspicious; the fitted trees must obey it on real rows."""
    base = sampler.sample(40, seed=13)[FEATURES]
    hi = float(base[feature].max()) or 1.0
    ladder = np.linspace(0, hi, 9)
    for _, row in base.iterrows():
        raw = []
        for v in ladder:
            r = row.to_dict()
            r[feature] = float(v)
            raw.append(float(shipped.booster.predict(shipped._matrix([r]))[0]))
        assert all(b >= a - 1e-9 for a, b in zip(raw, raw[1:])), (feature, raw)


def test_sampler_is_deterministic_and_deliberately_overlapping():
    a, b = sampler.sample(1500, seed=21), sampler.sample(1500, seed=21)
    assert a.equals(b)
    assert 0.25 < a["label"].mean() < 0.40
    mules, biz = a[a.archetype == "mule"], a[a.archetype == "legit_business"]
    # overlap is the point: some mules leave no fan-out trace, some businesses show one, some mules are high-volume
    assert (mules["max_fanout_hop_count"] == 0).any() and (biz["max_fanout_hop_count"] > 0).any()
    assert (mules["inbound_txn_count"] >= 12).any()


def test_training_is_reproducible_bit_for_bit(quick_run, tmp_path):
    card, out = quick_run
    again = train(n=2500, seed=11, out=tmp_path, quick=True, live_external=False)
    assert again["artifacts"] == card["artifacts"], "same seed, same data, same model file"


def test_the_trained_model_beats_the_hand_written_scorer_and_a_linear_baseline(quick_run):
    card, _ = quick_run
    t, b = card["test"], card["baselines"]
    assert t["roc_auc"] > b["hand_written_rule_scorer"]["roc_auc"] + 0.10
    assert t["roc_auc"] >= b["logistic_regression"]["roc_auc"]
    assert t["expected_calibration_error"] < 0.05
    assert card["data"]["n_test"] > 0 and card["cross_validation"]["folds"] == 5


def test_the_card_states_its_own_limits(quick_run):
    card, _ = quick_run
    text = " ".join(card["limitations"]).lower()
    assert "synthetic" in text and "optimistic" in text and "n=18" in text
    assert card["not_intended_for"] and card["intended_use"]


# ---- the scorer's modes and its fallback -------------------------------------------------------------------------
def _labels(ds):
    from collections import Counter

    from tracex_api.engine import scoring

    return dict(Counter(v["model"] for v in scoring.scores(ds).values()))


def test_auto_mode_keeps_recorded_scores_for_the_unchanged_seeded_case(ds, monkeypatch):
    monkeypatch.setenv("TRACEX_SCORER", "auto")
    ds._cache.clear()
    assert _labels(ds) == {"xgboost": 20}


def test_trained_mode_scores_everyone_with_the_local_model(ds, monkeypatch):
    monkeypatch.setenv("TRACEX_SCORER", "trained")
    ds._cache.clear()
    assert _labels(ds) == {"xgboost-local": 20}


def test_rules_mode_is_the_ablation(ds, monkeypatch):
    monkeypatch.setenv("TRACEX_SCORER", "rules")
    ds._cache.clear()
    assert _labels(ds) == {"rules": 20}


def test_shadow_scores_exist_in_every_mode_and_agree_with_trained_mode(ds, monkeypatch):
    from tracex_api.engine import scoring

    monkeypatch.setenv("TRACEX_SCORER", "auto")
    ds._cache.clear()
    shadow = scoring.scores_shadow(ds)
    monkeypatch.setenv("TRACEX_SCORER", "trained")
    trained = scoring.scores(ds)
    assert shadow is not None and all(abs(shadow[p]["risk_score"] - trained[p]["risk_score"]) < 1e-9 for p in shadow)


def test_a_tampered_model_falls_back_to_rules_and_says_so(ds, tmp_path, monkeypatch):
    for p in ml_model.ARTIFACTS.iterdir():
        shutil.copy(p, tmp_path / p.name)
    (tmp_path / MODEL_FILE).write_bytes(b"{}")
    monkeypatch.setattr(ml_model, "ARTIFACTS", Path(tmp_path))
    monkeypatch.setenv("TRACEX_SCORER", "trained")
    ml_model.reload()
    ds._cache.clear()
    try:
        assert _labels(ds) == {"rules": 20}
        assert ml_model.status()["available"] is False and "hash" in ml_model.status()["reason"]
    finally:
        monkeypatch.undo()
        ml_model.reload()
        ds._cache.clear()


def test_counterfactual_probes_the_model_that_produced_the_score(ds, monkeypatch):
    """A boundary reported as a flip must genuinely flip when that feature value is put back through the scorer."""
    from tracex_api.engine import evidentiary, scoring

    monkeypatch.setenv("TRACEX_SCORER", "trained")
    ds._cache.clear()
    checked = 0
    for pid, s in scoring.scores(ds).items():
        if s["risk_score"] < 0.33:
            continue
        cf = evidentiary.counterfactual(ds, pid)
        for item in cf["counterfactuals"]:
            if item["flip_reachable"]:
                trial = {**s["features"], item["feature"]: item["flip_value"]}
                assert scoring.score_features(trial, s["model"]) < 0.33, (pid, item)
                checked += 1
    ds._cache.clear()
    assert checked >= 1, "expected at least one reachable counterfactual boundary among the flagged entities"
