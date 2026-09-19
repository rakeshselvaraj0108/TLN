"""Entity risk model: schema, synthetic archetype sampler, training pipeline and the runtime that serves it.

    python -m tracex_api.ml.train        # regenerate data, tune, fit, calibrate, evaluate, write artifacts/

The runtime (`ml.model`) is what `engine.scoring` calls. Nothing in this package is decorative: the model
card in `artifacts/` is written by the training run and its hash is checked when the model is loaded.
"""
