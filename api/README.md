# TRACE-X API (recovered and rebuilt)

FastAPI backend for the deployed service at https://tracex-api-f7vn.onrender.com
(`TRACE-X API 0.1.0`). The route surface — every path, method, parameter, request body and response
model — was recovered exactly from its published OpenAPI document by
[`../recovery/tools/gen_api.py`](../recovery/tools/gen_api.py). The handler logic behind those routes
— entity resolution, risk scoring, the correlation and graph engines, the agent pipeline, reasoning
ledger, evidentiary views, integrity chains, and storage — has since been rebuilt from scratch in
[`tracex_api/engine/`](tracex_api/engine/), seeded from a captured snapshot of the live service's
responses, and checked endpoint-by-endpoint against that snapshot (see **Parity** below). No handler
raises `501` any more; every route in `tracex_api/routers/` is backed by real logic.

## What runs here

- **Storage:** SQLite (`tracex_api/db.py`) — `records`, `batches`, `audit`, `cases`, `case_entities`,
  `case_notes`, `notes`, `actions`, `targets`, a JSON `docs` collection table (used for reasoning
  sessions, investigations, ask history, campaigns…), and `counters`. Every ingested row is
  content-hashed (`hashing.py`) and chained per source/day, so tampering and gaps are detectable —
  see `/integrity/*`.
- **Analytics engine** (`tracex_api/engine/`): a cached `Dataset` (`dataset.py`) rebuilt from the
  store whenever it changes, feeding deterministic entity resolution (`resolution.py`), cross-source
  correlation (`correlate.py`), an 18-feature risk scorer (`scoring.py`) with three interchangeable back-ends — a
  trained XGBoost model (`ml/`), the recorded scores of the original deployment, and a transparent
  rule scorer (see **AI / ML** below), graph views (`graphs.py`), timelines/profiles/geography (`views.py`),
  anomaly detection, exculpatory review and counterfactual boundaries (`evidentiary.py`), document
  analysis (`documents.py`), ALPR pattern-of-life (`pattern.py`), campaign/fraud-ring detection
  (`hunt.py`), a response agent that proposes (never executes) actions (`agent.py`), a compliance
  program evaluated live against this deployment (`compliance.py`), a grounding verifier that
  re-resolves and re-hashes every citation (`verify.py`), deterministic Q&A (`ask.py`), a persistent
  reasoning ledger (`reasoning.py`), a label-blind benchmark harness graded against the corpus's
  planted ground truth (`benchmark.py`), and case reconstruction / map layers / cross-border exposure
  (`spatial.py`).
- **Auth:** trusted-header demo mode (`Authorization: Bearer <username>` or `X-Tracex-User`), plus
  signed tokens from `/auth/login`. Supervisor-only actions (closing a case, freezes, SAR drafts, integrity
  drills, attestations, exports) are enforced server-side, not just hidden in the UI.

## Run

```bash
python -m venv ../.venv          # once
../.venv/Scripts/pip install -r requirements.txt
../.venv/Scripts/python -m uvicorn tracex_api.main:app --reload --port 8000
# http://localhost:8000/docs
```

The database seeds itself on first run from `tracex_api/seed_data/` (built by
[`../recovery/tools/build_seed.py`](../recovery/tools/build_seed.py) from the captured snapshot).
Delete `data/tracex.db` to reseed from scratch.

Point the frontend at it with `NEXT_PUBLIC_API_URL=http://localhost:8000` (see
[`../frontend/README.md`](../frontend/README.md)).

## AI / ML

Two real components, both in this repository, both reproducible.

### Trained risk model — `tracex_api/ml/`

| Piece | What it is |
|---|---|
| Model | XGBoost gradient-boosted trees (`binary:logistic`), monotone-constrained on the features where "more is never safer" (`ml/train.py`) |
| Tuning | 5-fold cross-validated grid search on log-loss over the training split only |
| Calibration | Isotonic regression fitted on a separate validation split, stored as a JSON step table (no pickle is ever loaded) |
| Explanations | Exact TreeSHAP (`pred_contribs`): per-entity top drivers and global mean-abs importance |
| Integrity | `risk_model.json` is SHA-256 pinned in `model_card.json` and verified at load; a mismatch falls back to the rule scorer and is reported by `/ml/model` |
| Data | **Synthetic.** `ml/sampler.py` draws entities from 12 hand-authored archetypes (mule, layering, handler, SIM farm, associate, victim, legit business/charity/family/household, traveller, bystander). There is no real labelled fraud data in this repository. |

```bash
cd api
../.venv/Scripts/python -m tracex_api.ml.train           # ~35 s, writes ml/artifacts/
../.venv/Scripts/python -m tracex_api.ml.train --quick   # smaller grid
```

Training is seeded and bit-for-bit reproducible (`tests/test_ml.py` retrains twice and compares).

**Measured results** (from `ml/artifacts/model_card.json`; regenerate to verify):

| | ROC-AUC | Precision@0.33 | Recall@0.33 | Brier |
|---|---|---|---|---|
| XGBoost, held-out synthetic test (n=1200) | 0.998 | 0.944 | 0.981 | 0.018 |
| Logistic-regression baseline | 0.960 | 0.807 | 0.869 | 0.068 |
| Hand-written rule-scorer baseline | 0.776 | 0.422 | 0.939 | 0.299 |
| XGBoost, the 18 graded seeded entities, live features | 0.958 | 1.000 | 0.500 | n/a |
| Recorded original model, same 18 entities | 0.986 | 1.000 | 0.500 | n/a |

How to read them:

- The first row is measured on data from the same sampler that produced the training set. It shows the model fits
  that sampler. It is **not** evidence of real-world fraud-detection accuracy and is optimistic by construction.
- The seeded-case rows are the only out-of-sampler check: 18 entities (2 victims excluded) from one planted
  scenario. That is a sanity check, not a benchmark, and not independent: the sampler's author had seen those
  feature vectors before writing the archetypes.
- **Train/serve skew.** Four of the 18 features are approximations here of the original system's definitions, which
  could not be recovered. 17 of 20 seeded entities have at least one feature differing from the captured vector; the
  mean score change is 0.11 (`external_validation.feature_skew` in the card).
- An early model ranked raw transaction volume first, a shortcut a launderer could evade by splitting payments. The
  sampler was revised (v2) to break that correlation; the residual importance of `inbound_txn_count` is still visible
  in the card. Metrics were not tuned further to look better.

**Scorer modes** (`TRACEX_SCORER`):

| Mode | Behaviour |
|---|---|
| `auto` (default) | Recorded original scores where the feature vector matches the capture exactly (keeps parity with the deployed service); otherwise the trained model; if it is unavailable, the rule scorer |
| `trained` | Every score comes from the trained model: the pure-ML view |
| `replay` | Recorded original scores where available |
| `rules` | Transparent rule scorer only |

`GET /ml/model` returns the model card and load status. `GET /ml/shadow` scores every entity with the trained model
next to the scorer in force. Every score in the API carries the name of the model that produced it.

### Agentic layer — `tracex_api/agentic/`

`POST /agentic/investigate` runs a tool-use loop (`agentic/loop.py`): a language model receives an objective and a
registry of **read-only** investigation tools (`agentic/tools.py`), chooses which to call, reads the results, and
writes an answer citing record ids.

- **Providers** (`agentic/providers.py`): Claude via the Messages API, a local Ollama server, or a deterministic
  planner (`stub`) that runs the same loop with no model. `LLM_PROVIDER` is `auto`, `ollama`, `anthropic` or `stub`.
  `auto` never selects a cloud provider: it picks Ollama if reachable, else the stub. Claude is used only with
  `LLM_PROVIDER=anthropic` plus `ANTHROPIC_API_KEY` (evidence then leaves the machine, and the UI says so).
  `OLLAMA_HOST`, `OLLAMA_MODEL` and `TRACEX_LLM_MODEL` override defaults.
- **Safety:** tools are read-only with strict argument-schema validation (unknown tools and malformed arguments are
  refused and counted); instruction-like strings in evidence are redacted before the model sees them.
- **Grounding:** every factual sentence is re-checked by `engine/verify.py`: each cited record is resolved and
  re-hashed, and every figure or identifier in the claim must appear in the cited records. A failed citation sends
  the answer back once for repair; claims that still fail are reported as unsupported, not hidden. Narrative reports
  also pass a gate that rejects figures absent from the tool results.
- **Failure handling:** if the provider errors, the run falls back to the stub and is labelled `degraded`.
- **Trace:** every step is written to the reasoning ledger (`/reasoning/*`) and returned in the response.

**What is and is not verified.** The loop, tool validation, injection sanitising, citation repair and provider
fallback are covered by `tests/test_agentic.py`, using a scripted provider and `httpx.MockTransport` mocks of the
Claude and Ollama wire protocols. **No live LLM was called during development** (no API key, no Ollama server), so the
Claude and Ollama paths are protocol-tested, not tested against the real services. With no model configured, the
behaviour is the deterministic planner, and the UI labels it as such.

## Tests

```bash
cd api
../.venv/Scripts/pip install -r requirements-dev.txt
../.venv/Scripts/python -m pytest -q     # 51 tests, ~2 min (retrains the model twice)
../.venv/Scripts/python tests/parity.py --all --summary
```

## Parity

[`tests/parity.py`](tests/parity.py) replays every captured request in
`recovery/api-snapshot/*.json` against a fresh in-memory instance of this API and diffs the response,
field by field, ignoring fields that are inherently volatile (timestamps, elapsed times, run ids).

```bash
cd api && python tests/parity.py --all --summary
```

As of this rebuild: **455 / 573** captured responses match exactly. The rest are documented,
accepted differences — never silently swallowed:

- **ALPR:** the original row hashes and chain head can't be recovered (the raw ALPR CSV columns
  that produced them are lost with the source repo), so ALPR content hashes, its integrity chain, and
  any ordering that ties on an ALPR timestamp differ from the capture.
- **Deliberate differences:** `/agents/pipeline/info` and `/reasoning/providers` describe this repository's real,
  provider-selected agent stack rather than the original's; `/ml/*` and `/agentic/*` are new.
- **This deployment's own state:** `/health`, `/auth/posture`, and `/compliance/*` legitimately
  reflect *this* deployment (SQLite instead of Postgres/Neo4j, no cloud LLM, this run's own test/audit
  history) rather than the captured one's.
- **`/benchmark/run` detection counts:** the captured snapshot's entity ids (`E01`…`E20`) are an
  anonymized ordering from the corpus generator that doesn't correspond to any recoverable mapping
  onto this deployment's `P0001`…`P0020` ids, so the confusion matrix's specific true/false-positive
  counts differ even though the underlying per-role scores and pass/fail logic are the same.
  `/spatial/case/1/layers`'s `call_edges` doubling was traced to the original counting each call once
  per direction; this rebuild counts each call once.
  `/spatial/case/1/reconstruct` matches the verified step-count and phase breakdown exactly (128
  steps: 61 calls, 48 coerced transfers, 9 layering hops, 7 funds-received, 3 cash-outs) but a
  handful of individual steps differ where three or more calls/debits are plausible partners for the
  same pairing.
- **A few tie-break orderings** (contact/timeline entries with identical timestamps, for a handful of
  entities) sort differently than the original's unrecoverable internal tie-break.
- **`/documents?entity_id=...`** returns real filtered results here; the captured deployment 500'd on
  this query — an improvement, kept and documented rather than reproduced.

## Layout

```
tracex_api/
  main.py            FastAPI app, CORS, router registration
  db.py               SQLite schema, seeding, doc-collection helpers
  auth.py, audit.py   trusted-header auth, audit log
  evidence.py         record ingestion, hashing, batch/chain verification
  hashing.py          row hash + chain link functions
  engine/             all analytics — see above
  ml/                 trained risk model: sampler, train, evaluate, model, artifacts/
  agentic/            tool-use agent: providers, tools, loop, narrate
  routers/            one module per OpenAPI tag; thin — validation and wiring only
  seed_data/          CSVs, JSON catalogs and state, built from the capture
tests/
  parity.py           snapshot replay + diff
  test_ml.py          ML pipeline tests
  test_agentic.py     agent loop tests
```

## Provenance

The original source of the deployed service was lost. This code was rebuilt from the service's published OpenAPI
document and captured read-only GET responses (`../recovery/`), with AI assistance (Claude). It is a reconstruction,
not the original code, and the seed data is synthetic. It is not a validated fraud-detection system and has not been
tested on real cases.
