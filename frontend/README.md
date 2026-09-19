# TRACE X web (recovered)

Next.js 14.2.21 app recovered from the production deployment at https://tracex-web.onrender.com
after the original repository was lost. How it was rebuilt, and how to re-run the checks, is in
[`../recovery/README.md`](../recovery/README.md).

## Run

```bash
npm install
npm run dev        # http://localhost:3000  (/ redirects to /landing)
npm run build && npm start
```

The app calls the TRACE-X API directly from the browser (and from the server for `/overview`).
It defaults to `https://tracex-api-f7vn.onrender.com`; set `NEXT_PUBLIC_API_URL` to point elsewhere
(see `.env.example`).

## Layout

| Path | Contents |
| --- | --- |
| `src/app/landing/**` | Marketing site (landing, privacy, terms) with its own `landing.css` |
| `src/app/overview/page.jsx` | Command centre, server-rendered from the API on every request |
| `src/app/*/page.jsx` | 30 investigator workstation pages (client components, incl. `cases/[caseId]`, `queue/[entityId]`) |
| `src/app/layout.jsx` | Fonts (`next/font`), theme bootstrap script, `ChromeGate` app shell |
| `src/components/` | Shared UI, charts, evidence/document/response panels, landing sections |
| `src/lib/api.js` | Typed-by-convention client for every API endpoint the UI uses |
| `tailwind.config.js`, `src/app/globals.css` | Design tokens and theme |

## How faithful is it

Verified against the live deployment:

- **All 40 live routes render identical HTML** (text + element/class structure) when the recovered
  build is served next to the deployment, including the data-driven `/overview`.
- **CSS is exact**: compiling `globals.css` with `tailwind.config.js` reproduces all 1,088 declarations
  of the deployed stylesheet, nothing missing and nothing extra.
- `next build` succeeds with the same route table (static vs dynamic) as production.

What could not come back, because the production build removed it:

- **TypeScript types and comments.** Files are `.jsx`/`.js`.
- **Local variable names inside functions** (minified to `e`, `t`, `n`…). Exported names, component
  names, file layout and API function names were restored — from React Server Component metadata
  where the build kept them, otherwise named from what the code does.
- **Code that never reached the browser**, e.g. unused helpers. Tailwind classes that only such code
  used are kept via `safelist` in `tailwind.config.js` so the CSS still matches.
- Components that were separate files but got concatenated by webpack stay inside the page file that
  uses them (e.g. local `_Component` functions in `src/app/*/page.jsx`).

`/overview` was a server component whose code is not shipped to browsers. It was rebuilt from its
rendered output against the live API responses (`/overview`, `/agents/pipeline/info`, `/cases`,
`/graph/subgraph`, `/timeline/entity/{id}`) and matches the deployment for current data. Branches
the current data never exercises — the non-`local` engine badge, an empty data stream, alert type
labels for roles other than mule/associate/handler/sim_farm, cluster kinds other than `scam_ring` —
are marked in the code by their fallbacks and are best guesses.

## Security note

`next@14.2.21` is the version that was deployed and is pinned here for fidelity. It has a published
security advisory; upgrade to the latest patched 14.2.x before redeploying.
