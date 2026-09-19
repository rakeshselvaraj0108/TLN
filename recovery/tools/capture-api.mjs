// Capture ground-truth responses from the live TRACE-X API (GET requests only — never writes).
// Output: recovery/api-snapshot/<method>_<path>.json with { url, status, contentType, body }.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://tracex-api-f7vn.onrender.com";
const OUT = fileURLToPath(new URL("../api-snapshot/", import.meta.url));
const HEADERS = { Authorization: "Bearer investigator" };
fs.mkdirSync(OUT, { recursive: true });

const saved = new Map();
function fileFor(url) {
  return path.join(OUT, url.replace(/^\//, "").replace(/[^\w.=-]+/g, "_").slice(0, 180) + ".json");
}

async function get(url, { json = true } = {}) {
  if (saved.has(url)) return saved.get(url);
  let res, text;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(API + url, { headers: HEADERS, signal: AbortSignal.timeout(180_000) });
      text = await res.text();
      break;
    } catch (e) {
      if (attempt === 3) { console.log("ERR ", url, String(e)); return null; }
    }
  }
  const contentType = res.headers.get("content-type") ?? "";
  let body = text;
  if (json && contentType.includes("json")) { try { body = JSON.parse(text); } catch {} }
  fs.writeFileSync(fileFor(url), JSON.stringify({ url, status: res.status, contentType, body }, null, 1));
  console.log(String(res.status).padEnd(4), url, contentType.includes("json") ? "" : `(${contentType}, ${text.length} bytes)`);
  saved.set(url, body);
  return body;
}

const SOURCES = ["cdr", "ipdr", "bank", "social", "alpr"];

// --- global views
for (const url of [
  "/", "/health", "/auth/posture", "/auth/me", "/auth/users", "/cases", "/ingest/status", "/documents",
  "/graph", "/graph/subgraph", "/graph/subgraph?limit=400", "/graph/subgraph?clusters=false", "/graph/imei-persistence",
  "/graph/imei-persistence?min_sims=3", "/graph/network", "/intel/correlations/call-to-debit",
  "/intel/correlations/fanout", "/intel/detections/imei-persistence", "/intel/queue", "/intel/queue?band=high",
  "/intel/queue?band=elevated", "/intel/queue?band=low", "/audit", "/audit?limit=50", "/agents/pipeline/info",
  "/overview", "/records", "/anomalies", "/anomalies?source=cdr", "/anomalies?source=ipdr", "/anomalies?source=bank",
  "/anomalies?source=social", "/targets", "/targets/suggested", "/targets/suggested?limit=12", "/geo/towers",
  "/geo/contradictions", "/notes", "/actions", "/sar", "/model/monitor", "/integrity/verify", "/compliance/program",
  "/compliance/controls", "/compliance/attestations", "/response-agent/investigations", "/response-agent/campaigns",
  "/response-agent/stats", "/ask/history", "/ask/examples", "/pattern/contradictions", "/pattern/summary",
  "/pattern/cameras", "/hunt/sweep", "/hunt/sweep?min_confidence=0", "/verify/selfeval", "/verify/panel",
  "/reasoning/providers", "/reasoning/sessions", "/benchmark/report", "/retention/policy",
]) await get(url);

// --- per source
for (const s of SOURCES) {
  await get(`/records/${s}`);
  await get(`/records/${s}?page=1&page_size=10`);
  await get(`/records/${s}?page=2&page_size=10`);
  await get(`/records/${s}?page=1&page_size=10&search=a`);
  await get(`/records/${s}/export`, { json: false });
  await get(`/integrity/verify?source_type=${s}`);
}
const ingest = saved.get("/ingest/status");
for (const s of SOURCES) {
  const rows = saved.get(`/records/${s}?page=1&page_size=10`)?.rows ?? [];
  const batch = rows[0]?._batch_id;
  if (batch) await get(`/ingest/chain/${s}/${batch}/verify`);
}

// --- per entity
const queue = saved.get("/intel/queue")?.items ?? [];
const entityIds = [...new Set(queue.map(i => i.entity_id))].sort();
for (const id of entityIds) {
  for (const url of [
    `/intel/entity/${id}`, `/timeline/entity/${id}`, `/evidence/counterfactual/${id}`, `/evidence/exculpatory/${id}`,
    `/evidence/bsa-certificate?entity_id=${id}`, `/evidence/package?entity_id=${id}`, `/geo/movement/${id}`,
    `/profiles/${id}`, `/response-agent/memory/${id}`, `/response-agent/investigations?entity_id=${id}`,
    `/pattern/timeline/${id}`, `/hunt/report/${id}`, `/actions?entity_id=${id}`, `/documents?entity_id=${id}`,
  ]) await get(url);
  await get(`/evidence/package?entity_id=${id}&fmt=text`, { json: false });
  await get(`/hunt/report/${id}?fmt=text`, { json: false });
}

// --- per case
for (const c of saved.get("/cases") ?? []) {
  for (const url of [
    `/cases/${c.id}`, `/timeline/case/${c.id}`, `/spatial/case/${c.id}/reconstruct`, `/spatial/case/${c.id}/layers`,
    `/spatial/case/${c.id}/cross-border`, `/evidence/bsa-certificate?case_id=${c.id}`, `/evidence/package?case_id=${c.id}`,
    `/documents?case_id=${c.id}`,
  ]) await get(url);
}

// --- discovered ids
for (const d of saved.get("/documents")?.documents ?? []) { await get(`/documents/${d.id}`); await get(`/documents/${d.id}/entities`); }
for (const c of (saved.get("/compliance/controls")?.controls ?? []).slice(0, 200)) await get(`/compliance/controls/${c.id ?? c.control_id}`);
for (const inv of (saved.get("/response-agent/investigations")?.investigations ?? saved.get("/response-agent/investigations")?.items ?? []).slice(0, 50)) await get(`/response-agent/investigations/${inv.id ?? inv.investigation_id}`);
for (const s of (saved.get("/reasoning/sessions")?.sessions ?? []).slice(0, 30)) {
  const key = encodeURIComponent(s.session_key ?? s.key);
  for (const url of [`/reasoning/sessions/${key}`, `/reasoning/sessions/${key}/claims`, `/reasoning/sessions/${key}/hypotheses`, `/reasoning/sessions/${key}/trace`]) await get(url);
}
const cameras = saved.get("/pattern/cameras");
const alpr = saved.get("/records/alpr?page=1&page_size=10")?.rows ?? [];
for (const plate of [...new Set(alpr.map(r => r.plate ?? r.vehicle_plate ?? r.plate_number).filter(Boolean))].slice(0, 5)) await get(`/pattern/vehicle/${encodeURIComponent(plate)}`);
const firstAlpr = alpr[0];
if (firstAlpr) {
  const at = firstAlpr.seen_at ?? firstAlpr.timestamp ?? firstAlpr.read_time ?? firstAlpr.ts;
  const cam = firstAlpr.camera_id;
  if (at && cam) await get(`/pattern/corroborate?at=${encodeURIComponent(at)}&camera_id=${encodeURIComponent(cam)}`);
}
const towers = saved.get("/geo/towers");
const tower = (towers?.towers ?? towers?.items ?? [])[0];
if (tower) await get(`/geo/proximity?lat=${tower.lat}&lon=${tower.lon}&at=2026-08-14T10:00:00`);
if (entityIds.length > 1) await get(`/graph/paths?source=${entityIds[0]}&target=${entityIds[1]}`);
await get("/compliance/report.txt", { json: false });
await get("/benchmark/run");

console.log(`\ncaptured ${saved.size} responses into ${OUT}`);
