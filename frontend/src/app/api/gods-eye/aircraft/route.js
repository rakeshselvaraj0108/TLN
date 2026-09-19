// Same-origin proxy for OpenSky Network's anonymous state vector API.
//
// OpenSky sends a fixed Access-Control-Allow-Origin (its own domain), so the God's Eye globe — a
// browser page — cannot call it directly; the browser blocks the response regardless of what the
// request itself returns. Fetching it here, server-to-server, has no such restriction, and this
// route hands the result to the browser from the app's own origin. A short cache keeps repeated
// polling from several open tabs from exceeding OpenSky's anonymous rate limit.
export const dynamic = "force-dynamic";

const UPSTREAM = "https://opensky-network.org/api/states/all";
const CACHE_MS = 9000;

let cached = null;
let cachedAt = 0;

export async function GET() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    return Response.json(cached, { headers: { "cache-control": "no-store" } });
  }
  try {
    const upstream = await fetch(UPSTREAM, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) {
      return Response.json({ error: `OpenSky responded ${upstream.status}`, states: [] }, { status: 502 });
    }
    const data = await upstream.json();
    cached = data;
    cachedAt = now;
    return Response.json(data, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return Response.json({ error: String(err), states: cached ? cached.states : [] }, { status: 502 });
  }
}
