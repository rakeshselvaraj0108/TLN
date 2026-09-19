import { authHeaders, getActiveUser } from "@/lib/identity";
let DEFAULT_API_HOST = "tracex-api-f7vn.onrender.com";
let API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (DEFAULT_API_HOST ? `https://${DEFAULT_API_HOST}` : "http://localhost:8000");
function requestHeaders() {
  return authHeaders();
}
process.env.API_URL_INTERNAL;
export class ApiError extends Error {
  get isForbidden() {
    return this.status === 403;
  }
  get isServiceDown() {
    return this.status === 503;
  }
  constructor(n, t) {
    super(t);
    this.status = n;
  }
}
function describeFailure(n, t, e) {
  let r = "";
  try {
    let n = JSON.parse(e);
    r = typeof (n == null ? undefined : n.detail) == "string" ? n.detail : "";
  } catch (n) {
    r = e.slice(0, 300);
  }
  if (n === 401) {
    return "Not signed in, or this user is not provisioned. Pick a different role in the top bar.";
  } else if (n === 403) {
    return r || "This action requires the supervisor role.";
  } else if (n === 503) {
    return r || "A backing service is unavailable. Start it and retry.";
  } else if (n === 404) {
    return r || `Nothing found at ${t}.`;
  } else if (n >= 500) {
    return r || `The server failed handling ${t} (${n}).`;
  } else {
    return r || `${t} -> ${n}`;
  }
}
async function getJson(n, t) {
  let r = await fetch(`${API_BASE}${n}`, {
    ...t,
    headers: {
      "content-type": "application/json",
      ...requestHeaders(),
      ...((t == null ? undefined : t.headers) ?? {}),
    },
    cache: "no-store",
  });
  if (!r.ok) {
    let t = await r.text().catch(() => "");
    throw new ApiError(r.status, describeFailure(r.status, n, t));
  }
  return r.json();
}
async function postJson(n, t) {
  let e = await fetch(`${API_BASE}${n}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...requestHeaders(),
    },
    body: JSON.stringify(t),
    cache: "no-store",
  });
  if (!e.ok) {
    let t = await e.text().catch(() => "");
    throw new ApiError(e.status, describeFailure(e.status, n, t));
  }
  return e.json();
}
export function getHealth() {
  return getJson("/health");
}
// Used only by the server-rendered /overview page, so it was absent from the browser bundle.
export function getOverview() {
  return getJson("/overview");
}
export function getIngestStatus() {
  return getJson("/ingest/status");
}
export async function uploadIngest(n, t) {
  let e = new FormData();
  e.append("source_type", n);
  e.append("file", t);
  let r = await fetch(`${API_BASE}/ingest/upload`, {
    method: "POST",
    headers: requestHeaders(),
    body: e,
  });
  if (!r.ok) {
    let n = await r.text().catch(() => "");
    throw new ApiError(r.status, describeFailure(r.status, "/ingest/upload", n));
  }
  return r.json();
}
export function getSubgraph(n = 400) {
  return getJson(`/graph/subgraph?limit=${n}`);
}
export function getImeiPersistence(n = 2) {
  return getJson(`/graph/imei-persistence?min_sims=${n}`);
}
export function getQueue(n) {
  return getJson(`/intel/queue${n ? `?band=${n}` : ""}`);
}
export function getEntityIntel(n) {
  return getJson(`/intel/entity/${n}`);
}
export function runIntelAnalysis() {
  return send("/intel/analyze", "POST");
}
export function getCallToDebitCorrelations() {
  return getJson("/intel/correlations/call-to-debit");
}
export function getFanoutCorrelations() {
  return getJson("/intel/correlations/fanout");
}
export function getEntityTimeline(n) {
  return getJson(`/timeline/entity/${n}`);
}
export function getCaseTimeline(n) {
  return getJson(`/timeline/case/${n}`);
}
export function getCases() {
  return getJson("/cases");
}
export function getCase(n) {
  return getJson(`/cases/${n}`);
}
async function send(n, t, e) {
  let r = await fetch(`${API_BASE}${n}`, {
    method: t,
    headers: {
      "content-type": "application/json",
      ...requestHeaders(),
    },
    body: e === undefined ? undefined : JSON.stringify(e),
  });
  if (!r.ok) {
    let t = await r.text().catch(() => "");
    throw new ApiError(r.status, describeFailure(r.status, n, t));
  }
  if (r.status === 204) {
    return;
  }
  let o = await r.text();
  if (o) {
    return JSON.parse(o);
  } else {
    return undefined;
  }
}
export function createCase(n) {
  return send("/cases", "POST", {
    title: n,
  });
}
export function updateCaseStatus(n, t) {
  return send(`/cases/${n}/status`, "PATCH", {
    status: t,
  });
}
export function addCaseEntity(n, t, e = "person", r) {
  return send(`/cases/${n}/entities`, "POST", {
    entity_id: t,
    entity_kind: e,
    label: r,
  });
}
export function removeCaseEntity(n, t) {
  return send(`/cases/${n}/entities/${t}`, "DELETE");
}
export function addCaseNote(n, t) {
  return send(`/cases/${n}/notes`, "POST", {
    body: t,
  });
}
export function getAudit(n = 200) {
  return getJson(`/audit?limit=${n}`);
}
export function getCounterfactual(n) {
  return getJson(`/evidence/counterfactual/${n}`);
}
export function getExculpatory(n) {
  return getJson(`/evidence/exculpatory/${n}`);
}
export function getBsaCertificate(n) {
  let t = new URLSearchParams();
  if (n.caseId != null) {
    t.set("case_id", String(n.caseId));
  }
  if (n.entityId) {
    t.set("entity_id", n.entityId);
  }
  return getJson(`/evidence/bsa-certificate?${t}`);
}
export function evidencePackageUrl(n) {
  let t = new URLSearchParams({
    fmt: n.fmt,
    as_user: getActiveUser(),
  });
  if (n.caseId != null) {
    t.set("case_id", String(n.caseId));
  }
  if (n.entityId) {
    t.set("entity_id", n.entityId);
  }
  return `${API_BASE}/evidence/package?${t}`;
}
export function getMe() {
  return getJson("/auth/me");
}
export function getUsers() {
  return getJson("/auth/users");
}
export function getAgentPipelineInfo() {
  return getJson("/agents/pipeline/info");
}
export function runAgentPipeline() {
  let n = !(arguments.length > 0) || arguments[0] === undefined || arguments[0];
  return send("/agents/pipeline/run", "POST", {
    skip_ingest: n,
  });
}
export function getMlModel() {
  return getJson("/ml/model");
}
export function getMlShadow() {
  return getJson("/ml/shadow");
}
export function getAgenticStatus() {
  return getJson("/agentic/status");
}
export function runAgenticInvestigation(body) {
  return send("/agentic/investigate", "POST", body);
}
function recordsQuery(n) {
  let t = new URLSearchParams();
  if (n.page) {
    t.set("page", String(n.page));
  }
  if (n.pageSize) {
    t.set("page_size", String(n.pageSize));
  }
  if (n.search) {
    t.set("search", n.search);
  }
  if (n.dateFrom) {
    t.set("date_from", n.dateFrom);
  }
  if (n.dateTo) {
    t.set("date_to", n.dateTo);
  }
  return t;
}
export function getRecords(n, t = {}) {
  return getJson(`/records/${n}?${recordsQuery(t)}`);
}
export function getRecordsSummary() {
  return getJson("/records");
}
export function recordsExportUrl(n, t = {}) {
  let e = recordsQuery(t);
  e.delete("page");
  e.delete("page_size");
  e.set("as_user", getActiveUser());
  return `${API_BASE}/records/${n}/export?${e}`;
}
export function getAnomalies(n = "all") {
  return getJson(`/anomalies?source=${n}`);
}
export function getTargets() {
  return getJson("/targets");
}
export function getSuggestedTargets(n = 12) {
  return getJson(`/targets/suggested?limit=${n}`);
}
export function createTarget(n) {
  return send("/targets", "POST", n);
}
export function deleteTarget(n) {
  return send(`/targets/${n}`, "DELETE");
}
export function getGeoTowers() {
  return getJson("/geo/towers");
}
export function getGeoMovement(n, t, e) {
  let r = new URLSearchParams();
  if (t) {
    r.set("start", t);
  }
  if (e) {
    r.set("end", e);
  }
  let o = r.toString();
  return getJson(`/geo/movement/${n}${o ? `?${o}` : ""}`);
}
export function getGeoProximity(n) {
  let t = new URLSearchParams({
    lat: String(n.lat),
    lon: String(n.lon),
    at: n.at,
  });
  if (n.windowMinutes != null) {
    t.set("window_minutes", String(n.windowMinutes));
  }
  if (n.radiusKm != null) {
    t.set("radius_km", String(n.radiusKm));
  }
  return getJson(`/geo/proximity?${t}`);
}
export function search(n, t = 25) {
  return getJson(`/search?q=${encodeURIComponent(n)}&limit=${t}`);
}
export function getProfile(n) {
  return getJson(`/profiles/${n}`);
}
export function createNote(n) {
  return send("/notes", "POST", n);
}
export function deleteNote(n) {
  return send(`/notes/${n}`, "DELETE");
}
export function getActions(n = {}) {
  let t = new URLSearchParams();
  if (n.entityId) {
    t.set("entity_id", n.entityId);
  }
  if (n.action) {
    t.set("action", n.action);
  }
  let e = t.toString();
  return getJson(`/actions${e ? `?${e}` : ""}`);
}
export function createAction(n, t) {
  return send(`/actions/${n}`, "POST", t);
}
export function deleteAction(n) {
  return send(`/actions/${n}`, "DELETE");
}
export function getSar() {
  return getJson("/sar");
}
export function getModelMonitor() {
  return getJson("/model/monitor");
}
export function verifyIntegrity(n) {
  return getJson(`/integrity/verify${n ? `?source_type=${n}` : ""}`);
}
export function runIntegrityDrill(n) {
  return send("/integrity/drill", "POST", {
    ...n,
    confirm: "I UNDERSTAND THIS ALTERS STORED EVIDENCE",
  });
}
export function restoreIntegrity(n) {
  return send("/integrity/restore", "POST", n);
}
export function getGeoContradictions() {
  return getJson("/geo/contradictions");
}
export function getSpatialReconstruction(n) {
  return getJson(`/spatial/case/${n}/reconstruct`);
}
export function getSpatialLayers(n, t) {
  let e = t ? `?at=${encodeURIComponent(t)}` : "";
  return getJson(`/spatial/case/${n}/layers${e}`);
}
export function getCrossBorder(n) {
  return getJson(`/spatial/case/${n}/cross-border`);
}
export function askSpatial(n) {
  return postJson("/spatial/ask", {
    question: n.question,
    case_id: n.caseId ?? null,
  });
}
export async function analyzeDocument(n, t) {
  var e;
  let o = new FormData();
  o.append("file", n);
  o.append(
    "ingest",
    String((e = t == null ? undefined : t.ingest) !== null && e !== undefined && e),
  );
  o.append("source_type", (t == null ? undefined : t.sourceType) ?? "bank");
  let c = await fetch(`${API_BASE}/ingest/analyze-document`, {
    method: "POST",
    headers: requestHeaders(),
    body: o,
  });
  if (!c.ok) {
    let n = await c.text().catch(() => "");
    throw new ApiError(c.status, describeFailure(c.status, "/ingest/analyze-document", n));
  }
  return c.json();
}
export function startResponseInvestigation(n, t = "manual") {
  return send(
    `/response-agent/investigate/${encodeURIComponent(n)}?trigger=${encodeURIComponent(t)}`,
    "POST",
    {},
  );
}
export function simulateResponse(n, t) {
  return send("/response-agent/simulate", "POST", {
    investigation_id: n,
    action: t,
  });
}
export function decideResponse(n, t, e, r) {
  return send("/response-agent/decide", "POST", {
    investigation_id: n,
    action: t,
    verdict: e,
    rationale: r,
  });
}
export function getResponseInvestigations(n) {
  let t = n ? `?entity_id=${encodeURIComponent(n)}` : "";
  return getJson(`/response-agent/investigations${t}`);
}
export function getResponseCampaigns() {
  return getJson("/response-agent/campaigns");
}
export function getResponseStats() {
  return getJson("/response-agent/stats");
}
export function ask(n) {
  var t;
  let r = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "text";
  let o = arguments.length > 2 ? arguments[2] : undefined;
  return send("/ask", "POST", {
    question: n,
    source: r,
    verify: (t = o == null ? undefined : o.verify) !== null && t !== undefined && t,
    session_key: (o == null ? undefined : o.sessionKey) ?? "default",
  });
}
export function getAskExamples() {
  return getJson("/ask/examples");
}
export function getAskHistory(n = "default") {
  return getJson(`/ask/history?session_key=${encodeURIComponent(n)}`);
}
export function clearAskHistory(n = "default") {
  return send(`/ask/history?session_key=${encodeURIComponent(n)}`, "DELETE");
}
export function getPatternTimeline(n) {
  return getJson(`/pattern/timeline/${encodeURIComponent(n)}`);
}
export function getPatternContradictions() {
  return getJson("/pattern/contradictions");
}
export function getPatternSummary() {
  return getJson("/pattern/summary");
}
export function runHuntSweep(n = 0) {
  return getJson(`/hunt/sweep?min_confidence=${n}`);
}
export function getHuntReport(n) {
  return getJson(`/hunt/report/${encodeURIComponent(n)}`);
}
export function huntReportTextUrl(n) {
  return `${API_BASE}/hunt/report/${encodeURIComponent(n)}?fmt=text&as_user=${encodeURIComponent(getActiveUser())}`;
}
export function getComplianceProgram() {
  return getJson("/compliance/program");
}
export function getComplianceControls(n) {
  let t = new URLSearchParams();
  if (n == null ? undefined : n.domain) {
    t.set("domain", n.domain);
  }
  if (n == null ? undefined : n.status) {
    t.set("status", n.status);
  }
  if (n == null ? undefined : n.owner) {
    t.set("owner", n.owner);
  }
  let e = t.toString();
  return getJson(`/compliance/controls${e ? `?${e}` : ""}`);
}
export function getAttestations() {
  return getJson("/compliance/attestations");
}
export async function attestControl(n, t) {
  let e = new URLSearchParams({
    note: t,
  });
  let r = `/compliance/attest/${encodeURIComponent(n)}?${e}`;
  let o = await fetch(`${API_BASE}${r}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...requestHeaders(),
    },
  });
  if (!o.ok) {
    let n = await o.text().catch(() => "");
    throw new ApiError(o.status, describeFailure(o.status, r, n));
  }
  return o.json();
}
export function complianceReportUrl() {
  return `${API_BASE}/compliance/report.txt?as_user=${encodeURIComponent(getActiveUser())}`;
}
export let RECORDS_PAGE_SIZE = 10;
export function getDocuments(n) {
  let t = new URLSearchParams();
  if (n == null ? undefined : n.entityId) {
    t.set("entity_id", n.entityId);
  }
  if ((n == null ? undefined : n.caseId) != null) {
    t.set("case_id", String(n.caseId));
  }
  if (n == null ? undefined : n.limit) {
    t.set("limit", String(n.limit));
  }
  let e = t.toString() ? `?${t}` : "";
  return getJson(`/documents${e}`);
}
export function getDocument(n) {
  return getJson(`/documents/${n}`);
}
export function deleteDocument(n) {
  return send(`/documents/${n}`, "DELETE");
}
export function getGraphNetwork() {
  return getJson("/graph/network");
}
export function getGraphPaths(n, t, e = 4) {
  let r = new URLSearchParams({
    source: n,
    target: t,
    max_hops: String(e),
  });
  return getJson(`/graph/paths?${r}`);
}
export function getPatternCameras() {
  return getJson("/pattern/cameras");
}
export function getVerificationPanel() {
  return getJson("/verify/panel");
}
export function verifyAnswer(n) {
  return postJson("/verify/answer", {
    claims: n,
  });
}
export function getSelfEval() {
  return getJson("/verify/selfeval");
}
export function getReasoningSessions() {
  return getJson("/reasoning/sessions");
}
export function getReasoningSession(n) {
  return getJson(`/reasoning/sessions/${encodeURIComponent(n)}`);
}
export function getReasoningClaims(n) {
  return getJson(`/reasoning/sessions/${encodeURIComponent(n)}/claims`);
}
export function getReasoningTrace(n) {
  return getJson(`/reasoning/sessions/${encodeURIComponent(n)}/trace`);
}
export function runBenchmark() {
  return getJson("/benchmark/run");
}
