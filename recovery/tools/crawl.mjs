// Mirror a deployed Next.js app: crawl internal routes, save HTML + every /_next asset.
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://tracex-web.onrender.com";
const OUT = path.resolve(process.argv[2] ?? "mirror");

// Seed with known routes plus page names from the rakeshselvaraj0108/Trace-X repo, so
// pages only reachable after login-like navigation still get probed.
const SEEDS = ["/", "/landing", "/overview", "/landing/privacy", "/landing/terms", "/cases", "/graph",
  "/login", "/dashboard", "/admin/health", "/admin/settings", "/admin/users", "/audit", "/banking",
  "/banking/flow", "/cases/new", "/cdr", "/correlations", "/entities", "/evidence", "/evidence/upload",
  "/explain", "/findings", "/ingestion", "/investigations", "/ipdr", "/notifications", "/osint",
  "/reports", "/risk", "/timeline", "/tower", "/workspace", "/settings", "/analytics", "/alerts",
  "/signin", "/sign-in", "/auth/login", "/landing/contact", "/contact", "/about", "/pricing", "/demo"];

const routes = new Map();   // route -> status
const assets = new Map();   // asset path -> status
const queue = [...SEEDS];

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(90_000) });
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, location: res.headers.get("location"), buf };
    } catch (e) {
      if (attempt === 3) return { status: 0, error: String(e), buf: Buffer.alloc(0) };
    }
  }
}

function extractRoutes(text) {
  const found = new Set();
  const re = /(?:href|push|replace|redirect|pathname)\s*[:=(]\s*["'`](\/[a-zA-Z0-9][a-zA-Z0-9/_\-\[\]]*)["'`]/g;
  for (const m of text.matchAll(re)) found.add(m[1]);
  const re2 = /["'`](\/(?:landing|overview|cases|graph|entities|evidence|reports|settings|dashboard|login)[a-zA-Z0-9/_\-]*)["'`]/g;
  for (const m of text.matchAll(re2)) found.add(m[1]);
  return [...found].filter(r => !r.startsWith("/_next") && !r.startsWith("/api/") && !/\.[a-z0-9]{2,4}$/i.test(r));
}

function extractAssets(text) {
  const found = new Set();
  for (const m of text.matchAll(/\/_next\/static\/[A-Za-z0-9_\-./%@()[\]]+?\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|ico|mp4|webm|glb|gltf|json)/g)) found.add(m[0]);
  // webpack chunk paths referenced relatively inside the runtime/other chunks
  for (const m of text.matchAll(/["'](static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./]+?\.(?:js|css|woff2?|png|jpe?g|svg|webp))["']/g)) found.add("/_next/" + m[1]);
  for (const m of text.matchAll(/["'](\/(?:images|img|assets|icons|media|fonts)\/[A-Za-z0-9_\-./]+?\.[a-z0-9]{2,5})["']/gi)) found.add(m[1]);
  for (const m of text.matchAll(/url\((?:["']?)(\/[^)"']+)(?:["']?)\)/g)) found.add(m[1]);
  return found;
}

async function save(rel, buf) {
  const file = path.join(OUT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
}

async function crawlAsset(p) {
  if (assets.has(p)) return;
  assets.set(p, "pending");
  const r = await get(BASE + p);
  assets.set(p, r.status);
  if (r.status !== 200) return;
  await save(path.join("site", decodeURIComponent(p)), r.buf);
  if (/\.(js|css)$/.test(p)) {
    const text = r.buf.toString("utf8");
    for (const a of extractAssets(text)) await crawlAsset(a);
    for (const rt of extractRoutes(text)) if (!routes.has(rt) && !queue.includes(rt)) queue.push(rt);
  }
}

while (queue.length) {
  const route = queue.shift();
  if (routes.has(route)) continue;
  const r = await get(BASE + route);
  routes.set(route, r.status + (r.location ? ` -> ${r.location}` : ""));
  if (r.location) { const loc = new URL(r.location, BASE); if (loc.origin === BASE && !routes.has(loc.pathname)) queue.push(loc.pathname); }
  if (r.status !== 200) continue;
  const html = r.buf.toString("utf8");
  await save(path.join("html", (route === "/" ? "index" : route.slice(1)) + ".html"), r.buf);
  for (const rt of extractRoutes(html)) if (!routes.has(rt)) queue.push(rt);
  for (const a of extractAssets(html)) await crawlAsset(a);
  // RSC payload for the route (contains the server-rendered component tree)
  const rsc = await fetch(BASE + route, { headers: { RSC: "1" }, signal: AbortSignal.timeout(90_000) }).catch(() => null);
  if (rsc?.ok) await save(path.join("rsc", (route === "/" ? "index" : route.slice(1)) + ".rsc"), Buffer.from(await rsc.arrayBuffer()));
}

const ok = [...routes].filter(([, s]) => String(s).startsWith("200")).map(([r]) => r).sort();
await fs.writeFile(path.join(OUT, "routes.json"), JSON.stringify(Object.fromEntries(routes), null, 2));
await fs.writeFile(path.join(OUT, "assets.json"), JSON.stringify(Object.fromEntries(assets), null, 2));
console.log("LIVE ROUTES (" + ok.length + "):\n  " + ok.join("\n  "));
console.log("other routes:", [...routes].filter(([, s]) => !String(s).startsWith("200")).map(([r, s]) => `${r}=${s}`).join("  "));
const counts = {}; for (const [p, s] of assets) { const k = s === 200 ? path.extname(p) : "HTTP" + s; counts[k] = (counts[k] || 0) + 1; }
console.log("assets:", JSON.stringify(counts));
