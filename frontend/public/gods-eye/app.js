// God's Eye View — a standalone globe, vendored as static assets and embedded in an iframe.
// Every layer here is either live open data (no key required) or explicitly empty when a real
// feed would need a key this deployment does not hold. Nothing is invented.
"use strict";

// OpenSky does not send a browser-permissive CORS header on its anonymous endpoint, so this goes through
// this deployment's own same-origin proxy (/api/gods-eye/aircraft) rather than opensky-network.org directly.
const OPENSKY_URL = "/api/gods-eye/aircraft";
// CelesTrak's own bot-abuse protection returns 403 on GROUP=active (its heaviest, most-scraped endpoint,
// thousands of objects) regardless of headers — confirmed directly, not a guess. GROUP=visual is CelesTrak's
// own curated "notable, naked-eye visible" set (ISS, Hubble, the Starlink train, ~160 objects): unblocked,
// and a better-looking default than an arbitrary slice of a 10,000-object list would be anyway.
const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle";
const AIRCRAFT_POLL_MS = 15000;
const SAT_REFRESH_MS = 6 * 60 * 60 * 1000; // TLEs are only meaningfully re-fetched every few hours
const SAT_TICK_MS = 1000;
const MAX_SATELLITES = 250; // keep the scene responsive

let viewer;
const aircraft = new Map(); // icao24 -> entity
const satellites = []; // {name, rec, entity}
const layerEnabled = { aircraft: true, satellites: true, vessels: true, cameras: true };
let aircraftTimer = null;
let satTickTimer = null;

function $(id) {
  return document.getElementById(id);
}

function setStatus(text, isError) {
  const el = $("status");
  if (text == null) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = isError ? `<span class="err">${text}</span>` : `<span>${text}</span>`;
}

function setLayerNote(layer, count, note, warn) {
  const c = $(`count-${layer}`);
  if (c) c.textContent = count == null ? "–" : String(count);
  const n = $(`note-${layer}`);
  if (n && note != null) {
    n.textContent = note;
    n.classList.toggle("warn", !!warn);
  }
}

// ---- a tiny canvas-drawn arrow, used for aircraft billboards so nothing external needs to load ----
function arrowIcon(hex) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.translate(size / 2, size / 2);
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(9, 10);
  ctx.lineTo(0, 5);
  ctx.lineTo(-9, 10);
  ctx.closePath();
  ctx.fillStyle = hex;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  return canvas.toDataURL();
}

function initViewer() {
  // baseLayer: false stops the Viewer from ever constructing its default Ion-hosted imagery layer.
  // Left unset, it builds one immediately (synchronously, inside the constructor) against Cesium's
  // bundled demo Ion token — which is long expired, so it fires a 401 straight to the console before
  // any of our own code runs, even though the layer is swapped out a line later. terrainProvider is
  // still assigned as a plain property after construction (that option's shape has moved across
  // Cesium releases; this form works on every version there has been).
  viewer = new Cesium.Viewer("cesiumContainer", {
    baseLayerPicker: false,
    baseLayer: false,
    geocoder: false,
    homeButton: true,
    sceneModePicker: true,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: true,
    selectionIndicator: true,
    shouldAnimate: true,
  });

  viewer.imageryLayers.removeAll(); // safety net — a no-op if baseLayer:false was honored, as it should be
  viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      credit: "Esri, Maxar, Earthstar Geographics",
      maximumLevel: 18,
    }),
  );
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();

  // Everything below is decorative — a failure here should never leave the loading screen stuck.
  try {
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a0e14");
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;
    viewer.clock.shouldAnimate = true;
    viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, 11000000) });
  } catch (err) {
    console.warn("[gods-eye] cosmetic scene setup failed, continuing:", err);
  }

  setStatus(null);
}

// ---------------------------------------------------------------------------------------------- aircraft
function aircraftDescription(s) {
  const [icao24, callsign, originCountry, , , , , baroAlt, onGround, velocity, trueTrack, vertRate] = s;
  const kmh = velocity != null ? Math.round(velocity * 3.6) : null;
  return `
    <table style="font-size:12px;line-height:1.7">
      <tr><td>Callsign</td><td><b>${(callsign || "—").trim() || "—"}</b></td></tr>
      <tr><td>ICAO24</td><td class="mono">${icao24}</td></tr>
      <tr><td>Origin country</td><td>${originCountry || "—"}</td></tr>
      <tr><td>Altitude</td><td>${baroAlt != null ? Math.round(baroAlt) + " m" : "—"}${onGround ? " (on ground)" : ""}</td></tr>
      <tr><td>Ground speed</td><td>${kmh != null ? kmh + " km/h" : "—"}</td></tr>
      <tr><td>Heading</td><td>${trueTrack != null ? Math.round(trueTrack) + "°" : "—"}</td></tr>
      <tr><td>Vertical rate</td><td>${vertRate != null ? vertRate.toFixed(1) + " m/s" : "—"}</td></tr>
    </table>
    <p style="opacity:.6;margin-top:6px;font-size:10.5px">Live ADS-B position report — OpenSky Network.</p>`;
}

async function pollAircraft() {
  if (!layerEnabled.aircraft) return;
  try {
    const res = await fetch(OPENSKY_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const states = data.states || [];
    const seen = new Set();
    for (const s of states) {
      const [icao24, , , , , lon, lat, baroAlt, , , trueTrack] = s;
      if (lon == null || lat == null) continue;
      seen.add(icao24);
      const alt = Math.max(baroAlt || 0, 50);
      const position = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
      let ent = aircraft.get(icao24);
      if (!ent) {
        ent = viewer.entities.add({
          id: `aircraft-${icao24}`,
          position,
          billboard: {
            image: arrowIcon("#38bdf8"),
            scale: 0.8,
            rotation: 0,
            alignedAxis: Cesium.Cartesian3.ZERO, // screen-space rotation, set per-update below
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            font: "11px sans-serif",
            pixelOffset: new Cesium.Cartesian2(0, -16),
            fillColor: Cesium.Color.fromCssColorString("#bcd4e8"),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString("#0b0f14cc"),
            scale: 0.85,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3500000),
          },
          properties: { kind: "aircraft" },
        });
        aircraft.set(icao24, ent);
      }
      ent.position = position;
      ent.label.text = (s[1] || icao24).trim();
      ent.billboard.rotation = Cesium.Math.toRadians(-(trueTrack || 0));
      ent.description = aircraftDescription(s);
      ent.show = layerEnabled.aircraft;
    }
    for (const [id, ent] of aircraft) {
      if (!seen.has(id)) {
        viewer.entities.remove(ent);
        aircraft.delete(id);
      }
    }
    setLayerNote("aircraft", seen.size, `OpenSky Network, live · updated ${new Date().toLocaleTimeString()}`, false);
  } catch (err) {
    setLayerNote("aircraft", aircraft.size, `Unavailable right now (${err.message}) — no data shown in its place.`, true);
  }
}

// --------------------------------------------------------------------------------------------- satellites
function satDescription(name, altKm, velKmS) {
  return `
    <table style="font-size:12px;line-height:1.7">
      <tr><td>Object</td><td><b>${name}</b></td></tr>
      <tr><td>Altitude</td><td>${altKm.toFixed(0)} km</td></tr>
      <tr><td>Speed</td><td>${velKmS.toFixed(2)} km/s</td></tr>
    </table>
    <p style="opacity:.6;margin-top:6px;font-size:10.5px">Propagated client-side (SGP4) from a CelesTrak two-line element set — not a live tracked feed.</p>`;
}

function parseTLE(text) {
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  const seen = new Set();
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim();
    const l1 = lines[i + 1], l2 = lines[i + 2];
    if (!l1 || !l2 || l1[0] !== "1" || l2[0] !== "2") continue;
    try {
      const rec = satellite.twoline2satrec(l1, l2);
      // The NORAD catalog number (unique per object) — not name, which collides constantly. Several
      // rocket bodies in any given group are plainly labelled the same thing, e.g. more than one
      // "SL-8 R/B": that's a second launch's spent stage, not a duplicate of the first.
      const noradId = String(rec.satnum);
      if (seen.has(noradId)) continue;
      seen.add(noradId);
      out.push({ name, noradId, rec });
    } catch (e) {
      // a malformed element set is skipped, not fatal to the rest
    }
  }
  return out;
}

async function loadSatellites() {
  try {
    const res = await fetch(CELESTRAK_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = parseTLE(text).slice(0, MAX_SATELLITES);
    if (!parsed.length) throw new Error("no elements returned");
    satellites.length = 0;
    for (const s of parsed) satellites.push(s);
    setLayerNote("satellites", satellites.length, `CelesTrak elements, propagated locally · ${satellites.length} tracked`, false);
    tickSatellites();
  } catch (err) {
    setLayerNote("satellites", satellites.length, `Unavailable right now (${err.message}) — no data shown in its place.`, true);
  }
}

function tickSatellites() {
  if (!layerEnabled.satellites || !satellites.length) return;
  const now = new Date();
  const gmst = satellite.gstime(now);
  for (const s of satellites) {
    let pv;
    try {
      pv = satellite.propagate(s.rec, now);
    } catch (e) {
      continue;
    }
    if (!pv || !pv.position) continue;
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const lon = satellite.degreesLong(geo.longitude);
    const lat = satellite.degreesLat(geo.latitude);
    const altKm = geo.height;
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, altKm * 1000);
    const velKmS = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
    if (!s.entity) {
      s.entity = viewer.entities.add({
        id: `sat-${s.noradId}`,
        position,
        point: {
          pixelSize: 4,
          color: Cesium.Color.fromCssColorString("#f59e0b"),
          outlineColor: Cesium.Color.fromCssColorString("#000000"),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: s.name,
          font: "10px sans-serif",
          pixelOffset: new Cesium.Cartesian2(0, -11),
          fillColor: Cesium.Color.fromCssColorString("#fde9b8"),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("#0b0f14cc"),
          scale: 0.8,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 18000000),
        },
        properties: { kind: "satellite" },
      });
    }
    s.entity.position = position;
    s.entity.description = satDescription(s.name, altKm, velKmS);
    s.entity.show = layerEnabled.satellites;
  }
}

// -------------------------------------------------------------------------------- vessels / public cameras
// No AIS or camera-feed key is configured for this deployment. Rather than fabricate positions, these
// layers register, toggle, and report zero — matching the parent page's own stated design.
function initEmptyLayer(layer, note) {
  setLayerNote(layer, 0, note, true);
}

// ---------------------------------------------------------------------------------------------------- UI
function wireLayerToggle(id, layer) {
  const el = $(id);
  el.checked = layerEnabled[layer];
  el.addEventListener("change", () => {
    layerEnabled[layer] = el.checked;
    if (layer === "aircraft") for (const ent of aircraft.values()) ent.show = el.checked;
    if (layer === "satellites") for (const s of satellites) if (s.entity) s.entity.show = el.checked;
  });
}

function wireSearch() {
  const input = $("search-input");
  const go = () => {
    const raw = input.value.trim();
    if (!raw) return;
    const m = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
      viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 400000) });
      return;
    }
    // No geocoder key is configured here either — a bare place name can't be resolved offline.
    input.placeholder = "no geocoder key — try \"lat, lon\"";
    input.value = "";
  };
  $("search-go").addEventListener("click", go);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
}

function tickClock() {
  $("clock").textContent = new Date().toUTCString().replace("GMT", "UTC");
}

function main() {
  initViewer();
  wireLayerToggle("toggle-aircraft", "aircraft");
  wireLayerToggle("toggle-satellites", "satellites");
  wireLayerToggle("toggle-vessels", "vessels");
  wireLayerToggle("toggle-cameras", "cameras");
  wireSearch();

  initEmptyLayer("vessels", "Needs an AIS feed key this deployment does not hold — stays empty.");
  initEmptyLayer("cameras", "Needs a feed key this deployment does not hold — stays empty.");

  pollAircraft();
  aircraftTimer = setInterval(pollAircraft, AIRCRAFT_POLL_MS);

  loadSatellites();
  setInterval(loadSatellites, SAT_REFRESH_MS);
  satTickTimer = setInterval(tickSatellites, SAT_TICK_MS);

  tickClock();
  setInterval(tickClock, 1000);

  window.addEventListener("resize", () => viewer && viewer.resize());
  window.addEventListener("beforeunload", () => {
    clearInterval(aircraftTimer);
    clearInterval(satTickTimer);
  });
}

// A watchdog: if nothing has cleared the loading screen within 15s, something failed silently
// (a thrown error before setStatus(null), a hung network request, a CDN that never resolved) —
// show that plainly instead of leaving a spinner that never explains itself.
const watchdog = setTimeout(() => {
  const el = $("status");
  if (el && !el.classList.contains("hidden")) {
    setStatus("Still loading after 15s — the globe engine or a tile/data source may be unreachable from here. Reload to try again.", true);
  }
}, 15000);
let startedUp = false;
function clearWatchdog() {
  startedUp = true;
  clearTimeout(watchdog);
}

// Only during startup: a runtime error once the globe is already up is almost certainly a transient
// network hiccup in one of the polling loops, which those loops already report locally — this global
// net is only for a failure before the globe ever appears at all.
window.addEventListener("error", (e) => {
  console.error("[gods-eye]", e.error || e.message);
  if (!startedUp) setStatus(`Something failed while starting: ${e.message || e.error}. Reload to try again.`, true);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[gods-eye]", e.reason);
  if (!startedUp) setStatus(`Something failed while starting: ${e.reason && e.reason.message ? e.reason.message : e.reason}. Reload to try again.`, true);
});

try {
  if (typeof Cesium === "undefined") {
    throw new Error("the CesiumJS globe engine did not load from its CDN");
  }
  main();
  clearWatchdog();
} catch (err) {
  console.error("[gods-eye] init failed:", err);
  setStatus(`Failed to start: ${err.message}. Reload to try again.`, true);
}
