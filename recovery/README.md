# Source recovery from the TRACE X deployment

The original source for `tracex-web.onrender.com` and `tracex-api-f7vn.onrender.com` was lost.
This directory holds what was captured from the running deployment and the scripts that rebuilt
`frontend/` and `api/` from it, so the result can be audited and regenerated.

## Contents

| Path | What |
| --- | --- |
| `api-snapshot/` | Read-only captured responses from the deployed API, used as fixtures by `api/tests/parity.py` |
| `deployed-snapshot/` | **Not included in this repository.** Regenerate it with `tools/crawl.mjs` (site bundle, HTML/RSC payloads, OpenAPI document) |
| `tools/` | Recovery pipeline (below) |

### Redactions

The captured fixtures and the seed data were edited to remove one agency name: a social-post mention became
`@CityPolice`, and the extracted text of one sample document lost the name (its character count was updated to match).
Because a row's SHA-256 covers its content, the affected row hash and the social batch's chain values were recomputed
and replaced consistently everywhere they are stored (seed CSV, `integrity_*`, `ingest_chain_*`, BSA certificates and the
timeline fixture). The parity result is unchanged by this. Everything else in the fixtures is as captured.

## Pipeline

1. **Mirror** (`crawl.mjs`): crawl routes from links in HTML/JS, download all `/_next` assets, public
   files and each route's RSC payload.
2. **Unpack** (`unpack-all.mjs`): split webpack chunks into modules and turn compiled
   `jsx()` calls back into JSX (webcrack).
3. **Classify and name** (`inventory.mjs`, `names.json`): separate app modules from React, Next.js,
   lucide-react, d3, clsx, tailwind-merge and class-variance-authority; take real component names from
   RSC client references; name the rest from what the code does. Minified d3 exports were identified
   from d3's own implementations.
4. **Emit modules** (`gen-modules.mjs`): rewrite webpack requires as ES imports (`@/…` aliases, named
   library imports, inlined lucide icons back to imports), restore exports, repair a webcrack
   parameter-rename bug, decide `"use client"` per module, format with Prettier.
5. **Emit server components** (`gen-pages.mjs`): rebuild layouts and server pages (root layout with
   `next/font`, landing layout, landing/privacy/terms, root redirect) from the RSC trees, including
   metadata and CSS imports.
6. **CSS** (`css-diff.mjs`, `css-globals.mjs`): reconstruct `tailwind.config.js` and split the hand-written
   CSS into `globals.css` layers; verify by compiling with Tailwind 3.4.17 + autoprefixer + Next's
   cssnano and diffing declaration by declaration.
7. **`/overview`**: dynamic server page; data sources and rules were matched against live API responses
   (`timeline-fit.mjs` shows how the timeline panel's event selection was pinned down).
8. **API** (`gen_api.py`): FastAPI package from `openapi.json`.
9. **Verify** (`compare-routes.mjs`): serve the recovered build on :3100 and compare every route's
   rendered HTML with the deployment.

## Results at recovery time

- `next build`: success, same static/dynamic route table as production.
- 40/40 routes: identical rendered text and element/class structure vs. the deployment.
- Stylesheet: 1,088 / 1,088 declarations identical.
- API skeleton: 120 / 120 operations and 34 / 34 schemas identical in the generated OpenAPI.

## Limits

Types, comments and local variable names are not present in a production deployment and could not
be recovered. Server-only handler logic likewise isn't present in a deployed build — but unlike
markup and styling, behaviour can be *re-derived* from what the API actually does, given enough
captured ground truth to check it against. That's phase two.

## Phase two: rebuilding the backend logic

`api-snapshot/` holds several hundred captured GET responses from the live API — every list/detail
view, report, certificate and export the frontend calls, across all 20 seeded entities, fetched
read-only (this project never called the live service's write endpoints, to avoid altering its
stored evidence). `tools/build_seed.py` turns that capture into `api/tracex_api/seed_data/`: the
underlying CSV records, batch/chain metadata, and static catalogs (compliance controls, ask
examples, reasoning providers, pipeline info…) needed to seed a fresh instance that starts from the
same place the captured one was in.

The handler logic itself — entity resolution rules, the risk-scoring feature set, correlation
windows, campaign/link-detection thresholds, the exculpatory/counterfactual math, compliance control
evaluators, the verifier's claim-grounding rules, and the eight-stage agent pipeline — was rebuilt in
`api/tracex_api/engine/` by reasoning backward from the captured responses: given this input, what
computation produces exactly this output, across dozens of entities and edge cases at once. Where a
single captured example was ambiguous, multiple examples were cross-checked until the derivation was
forced rather than guessed.

`api/tests/parity.py` replays the entire capture against the rebuilt API and diffs every field. See
[`api/README.md`](../api/README.md#parity) for the current match rate and the specific, documented
cases where the original can't be exactly reproduced (data that was never recoverable at all, such as
the ALPR source columns, plus this deployment's own environment-dependent state).
