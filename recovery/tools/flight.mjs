// Parser for the React Server Components "flight" payload Next.js 14 serves with `RSC: 1`.
import fs from "node:fs";

/** Split a flight payload into rows keyed by hex id. Handles I (client refs), T (text) and JSON rows. */
export function parseFlight(text) {
  const rows = new Map();
  let i = 0;
  while (i < text.length) {
    const colon = text.indexOf(":", i);
    if (colon < 0) break;
    const id = text.slice(i, colon);
    let j = colon + 1;
    const tag = text[j];
    if (tag === "T") {
      const comma = text.indexOf(",", j);
      const len = parseInt(text.slice(j + 1, comma), 16);
      // length is in UTF-8 bytes
      const rest = Buffer.from(text.slice(comma + 1), "utf8");
      const value = rest.subarray(0, len).toString("utf8");
      rows.set(id, { tag: "T", value });
      i = comma + 1 + value.length;
      continue;
    }
    const nl = text.indexOf("\n", j);
    const end = nl < 0 ? text.length : nl;
    let body = text.slice(j, end);
    let rowTag = "";
    if (/^[A-Z]/.test(tag) && tag !== "T") { rowTag = tag; body = body.slice(1); }
    try { rows.set(id, { tag: rowTag, value: body ? JSON.parse(body) : null }); }
    catch { rows.set(id, { tag: rowTag, raw: body }); }
    i = end + 1;
  }
  return rows;
}

if ((process.argv[1] ?? "").endsWith("flight.mjs") && process.argv[2]) {
  const rows = parseFlight(fs.readFileSync(process.argv[2], "utf8"));
  const depth = Number(process.argv[3] ?? 7);
  const trim = (v, d) => {
    if (d <= 0) return Array.isArray(v) ? `[…${v.length}]` : v && typeof v === "object" ? "{…}" : v;
    if (Array.isArray(v)) return v.map(x => trim(x, d - 1));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x, d - 1)]));
    return typeof v === "string" && v.length > 70 ? v.slice(0, 70) + "…" : v;
  };
  for (const [id, r] of rows) {
    if (r.tag === "I") { console.log(id, "I", JSON.stringify(r.value)); continue; }
    console.log(id, r.tag || "J", JSON.stringify(trim(r.value ?? r.raw, depth), null, 1).slice(0, Number(process.argv[4] ?? 4000)));
  }
}
