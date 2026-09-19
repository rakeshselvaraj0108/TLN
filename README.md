# TRACE X

Evidence-grounded investigation workbench for fraud and cybercrime cases. It links phone, device, account and
transaction records into entity graphs, ranks entities for review with a trained model, lets an agent investigate with
read-only tools, and re-verifies every claim against hash-chained source records before it is shown.

A score is a lead for a human reviewer, never a verdict. The system also surfaces counter-evidence and innocent
explanations next to every finding.

**Full documentation** — architecture, technology stack, the hash chain, the ML model, the agents, every page, and God's Eye
View in depth: [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md).

## Repository

| Path | What |
|---|---|
| [`api/`](api/) | FastAPI + SQLite backend: entity resolution, correlation, graphs, risk scoring, evidence integrity, reasoning ledger, verification, agents. See [`api/README.md`](api/README.md). |
| [`api/tracex_api/ml/`](api/tracex_api/ml/) | Trained XGBoost risk model: sampler, training, calibration, TreeSHAP, model card. |
| [`api/tracex_api/agentic/`](api/tracex_api/agentic/) | Tool-use investigation agent: provider abstraction (Claude, Ollama, deterministic), read-only tools, citation verification. |
| [`frontend/`](frontend/) | Next.js 14 app: landing page, investigation workbench, God's Eye View (Cesium globe), model monitor, agent pages. |
| [`recovery/`](recovery/) | How the project was reconstructed from the live deployment, plus the captured snapshots used as test fixtures. |

## Run locally

```bash
python -m venv .venv
.venv/Scripts/pip install -r api/requirements.txt
cd api && ../.venv/Scripts/python -m uvicorn tracex_api.main:app --port 8000      # http://localhost:8000/docs

cd frontend
npm install && npm run build
NEXT_PUBLIC_API_URL=http://localhost:8000 npm start                                # http://localhost:3000
```

The database seeds itself on first start. Delete `api/data/tracex.db` to reseed.

## What is real, and what is not

**Real and reproducible**

- A trained XGBoost model (monotone-constrained, 5-fold-tuned, isotonic-calibrated, exact TreeSHAP explanations),
  regenerated with `python -m tracex_api.ml.train`. Its weights are SHA-256 pinned and verified at load.
- An agent loop in which a model chooses read-only tools, cites records, and has each claim re-verified against the
  source records (re-resolved and re-hashed). Provider selection is explicit: no cloud call is made unless
  `LLM_PROVIDER=anthropic` and an API key are set.
- Tamper-evident evidence: every ingested row is content-hashed and chained; `/integrity/*` detects edits and gaps.
- 51 automated tests, plus a parity harness that replays 573 captured responses (455 match; the differences are
  documented in [`api/README.md`](api/README.md)).

**Limits, stated plainly**

- The model is trained on **synthetic** data from a hand-authored archetype sampler. Its held-out metrics
  (ROC-AUC 0.998) measure fit to that sampler, not real-world accuracy. On the 18 graded seeded entities it reaches
  ROC-AUC 0.958 with recall 0.50. It has never seen real fraud data.
- The seed case is synthetic. This is a demonstration system, not a validated detection product.
- The Claude and Ollama provider paths were tested against protocol mocks only; no live LLM call was made during
  development. Without a configured model the agent runs a deterministic planner and the UI labels the run as such.
- The original source code was lost; this is a reconstruction from the deployed service's public interface and
  captured responses, built with AI assistance (Claude). See [`recovery/README.md`](recovery/README.md).

## Tests

```bash
cd api
../.venv/Scripts/pip install -r requirements-dev.txt
../.venv/Scripts/python -m pytest -q
../.venv/Scripts/python tests/parity.py --all --summary
```
