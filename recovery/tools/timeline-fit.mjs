// Find the filter/positioning rule the overview page used for its "Case timeline" panel.
import fs from "node:fs";

const page = fs.readFileSync("../deployed-snapshot/overview-server-render.snapshot.jsx", "utf8");
const tl = JSON.parse(fs.readFileSync("api-samples/_timeline_case_1.json", "utf8"));
const graph = JSON.parse(fs.readFileSync("api-samples/_graph_subgraph_limit_400.json", "utf8"));
const overview = JSON.parse(fs.readFileSync("api-samples/_overview.json", "utf8"));

// lanes as rendered
const lanes = {};
let current = null;
for (const line of page.split("\n")) {
  const lane = line.match(/<div key="(\w+)" className="flex items-center gap-2">/);
  if (lane) { current = lane[1]; lanes[current] = []; continue; }
  const ev = current && line.match(/title="([^"]+) · ([A-Z0-9-]+)"/);
  const left = current && line.match(/left: "([\d.]+)%"/);
  if (ev) lanes[current].push({ ts: ev[1], rec: ev[2] });
  if (left) lanes[current][lanes[current].length - 1].left = Number(left[1]);
}
const shown = Object.values(lanes).flat();
console.log("rendered lanes:", Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, v.length])), "total", shown.length);
const shownIds = new Set(shown.map(e => e.rec));

const events = tl.events;
const byId = new Map(events.map(e => [e.rec_id, e]));
console.log("all shown ids exist in API:", shown.every(e => byId.has(e.rec)));
const shownEvents = shown.map(e => byId.get(e.rec));
console.log("kinds of shown:", shownEvents.reduce((a, e) => (a[e.kind] = (a[e.kind] || 0) + 1, a), {}));
console.log("entities of shown:", [...new Set(shownEvents.flatMap(e => e.entities))].join(","));

// position fit: left = (t - t0) / (t1 - t0) * 100 -> solve t0, t1 from two points
const p = shown.filter(e => e.left != null);
const a = p[0], b = p[p.length - 1];
const ta = Date.parse(a.ts), tb = Date.parse(b.ts);
const span = (tb - ta) / ((b.left - a.left) / 100);
const t0 = ta - (a.left / 100) * span;
console.log("fitted t0:", new Date(t0).toISOString(), " t1:", new Date(t0 + span).toISOString());

// candidate filters
const persons = graph.nodes.filter(n => n.labels[0] === "Person").map(n => n.props);
const cand = {
  lead: new Set([overview.lead.person]),
  top5: new Set(overview.top_entities.map(t => t.entity_id)),
  high: new Set(persons.filter(x => x.band === "high").map(x => x.entity_id)),
  aboveLow: new Set(persons.filter(x => x.band !== "low").map(x => x.entity_id)),
  cluster1: new Set(graph.clusters[0].entity_ids),
  caseEntities: new Set((tl.entities ?? []).map(x => x.entity_id ?? x)),
};
const lanesOf = e => e.kind;
for (const [name, set] of Object.entries(cand)) {
  for (const kinds of [["call", "txn", "post"], ["call", "txn", "post", "session"]]) {
    const sel = events.filter(e => kinds.includes(e.kind) && e.entities.some(x => set.has(x)));
    const same = sel.length === shownIds.size && sel.every(e => shownIds.has(e.rec_id));
    console.log(`${name.padEnd(13)} kinds=${kinds.join("+").padEnd(22)} -> ${String(sel.length).padStart(4)} events ${same ? "MATCH" : ""}`);
  }
}
console.log("case entities field:", JSON.stringify(tl.entities).slice(0, 200));

// ---- sampling hypotheses (timestamps are naive; server runs in UTC)
const utc = s => Date.parse(s + "Z");
const target = [...shownIds].sort().join(",");
const sorted = [...events].sort((x, y) => utc(x.ts) - utc(y.ts));
for (const [label, list] of [["api order", events], ["ts sorted", sorted]]) {
  for (let step = 10; step <= 16; step++) for (let off = 0; off < step; off++) {
    const sel = list.filter((_, i) => i % step === off);
    if (sel.map(e => e.rec_id).sort().join(",") === target) console.log(`MATCH ${label} step=${step} offset=${off}`);
  }
  const n = 99;
  for (const mode of ["floor", "round"]) {
    const sel = Array.from({ length: n }, (_, i) => list[Math[mode](i * (list.length - 1) / (n - 1))]);
    if (sel.map(e => e.rec_id).sort().join(",") === target) console.log(`MATCH ${label} evenly ${mode} n=99`);
    const sel100 = Array.from({ length: 100 }, (_, i) => list[Math[mode](i * list.length / 100)]);
    const ids100 = new Set(sel100.map(e => e.rec_id));
    if (ids100.size === 99 && [...ids100].sort().join(",") === target) console.log(`MATCH ${label} 100 picks ${mode} (1 dup)`);
  }
}
const shownTs = shown.map(e => utc(e.ts));
const s0 = Math.min(...shownTs), s1 = Math.max(...shownTs);
const pred = shown.map(e => (utc(e.ts) - s0) / (s1 - s0) * 100);
console.log("positions from min/max of shown events: max abs error", Math.max(...shown.map((e, i) => Math.abs(e.left - pred[i]))).toFixed(6));
const a0 = Math.min(...events.map(e => utc(e.ts))), a1 = Math.max(...events.map(e => utc(e.ts)));
console.log("positions from min/max of ALL events: max abs error", Math.max(...shown.map(e => Math.abs(e.left - (utc(e.ts) - a0) / (a1 - a0) * 100))).toFixed(6));
console.log("first/last shown ts:", new Date(s0).toISOString(), new Date(s1).toISOString(), "| api first/last:", events[0].ts, events.at(-1).ts);
console.log("shown order == api order?", shown.map(e => e.rec).join() === events.filter(e => shownIds.has(e.rec_id)).map(e => e.rec_id).join());

const idx = events.map((e, i) => shownIds.has(e.rec_id) ? i : -1).filter(i => i >= 0);
console.log("api indices of shown:", idx.join(","));
for (const kind of ["call", "session", "txn", "post"]) {
  const ofKind = events.filter(e => e.kind === kind);
  const ki = ofKind.map((e, i) => shownIds.has(e.rec_id) ? i : -1).filter(i => i >= 0);
  console.log(kind, "total", ofKind.length, "shown idx:", ki.join(","));
}
const gaps = idx.slice(1).map((v, i) => v - idx[i]);
console.log("gaps:", gaps.join(","));

const keys = { row_sha256: e => e.row_sha256, rec_id: e => e.rec_id, ts: e => e.ts };
for (const [k, f] of Object.entries(keys)) for (const dir of [1, -1]) {
  const s = [...events].sort((x, y) => (f(x) < f(y) ? -1 : f(x) > f(y) ? 1 : 0) * dir);
  for (const n of [99, 100]) {
    const ids = new Set(s.slice(0, n).map(e => e.rec_id));
    const overlap = [...ids].filter(i => shownIds.has(i)).length;
    if (overlap > 20) console.log(`sort ${k} dir=${dir} first ${n}: overlap ${overlap}`);
  }
}
const perEntity = {};
for (const e of shownEvents) for (const x of e.entities) perEntity[x] = (perEntity[x] || 0) + 1;
console.log("shown per entity:", perEntity);
const allPerEntity = {};
for (const e of events) for (const x of e.entities) allPerEntity[x] = (allPerEntity[x] || 0) + 1;
console.log("all per entity:", allPerEntity);
console.log("shown sha prefix sample:", shownEvents.slice(0, 12).map(e => e.row_sha256.slice(0, 2)).join(" "));
const hexFirst = shownEvents.map(e => parseInt(e.row_sha256.slice(0, 2), 16));
console.log("sha first byte range of shown:", Math.min(...hexFirst), Math.max(...hexFirst));
