// Compare server-rendered HTML of every route: recovered local build vs the live deployment.
// Compares the rendered DOM text + tag/class structure (ignoring hashed asset URLs and scripts).
import fs from "node:fs";

const LIVE = "https://tracex-web.onrender.com";
const LOCAL = "http://127.0.0.1:3100";
const routes = Object.entries(JSON.parse(fs.readFileSync("../deployed-snapshot/routes.json", "utf8")))
  .filter(([, s]) => String(s).startsWith("200"))
  .map(([r]) => r);

function normalize(html) {
  let body = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<link[^>]*>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<template[\s\S]*?<\/template>/g, "")
    .replace(/<meta name="next-size-adjust"[^>]*>/g, "")
    .replace(/__(className|variable)_[0-9a-f]+/g, "__font")
    .replace(/\s+/g, " ");
  const text = body.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
  const tags = [...body.matchAll(/<([a-zA-Z0-9]+)((?:\s+[^>]*?)?)\/?>/g)].map(m => {
    const cls = m[2].match(/class="([^"]*)"/)?.[1] ?? "";
    return `${m[1]}.${cls.split(" ").sort().join(".")}`;
  });
  return { text, tags };
}

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

const results = [];
for (const route of routes) {
  try {
    const [live, local] = await Promise.all([
      fetch(LIVE + route, { signal: AbortSignal.timeout(120_000) }).then(r => r.text()),
      fetch(LOCAL + route, { signal: AbortSignal.timeout(120_000) }).then(r => r.text()),
    ]);
    const L = normalize(live), R = normalize(local);
    const textSame = L.text === R.text;
    const tagsSame = L.tags.join("|") === R.tags.join("|");
    let detail = "";
    if (!textSame) { const i = firstDiff(L.text, R.text); detail += ` text@${i}: live «${L.text.slice(Math.max(0, i - 40), i + 60)}» local «${R.text.slice(Math.max(0, i - 40), i + 60)}»`; }
    if (!tagsSame) { const i = firstDiff(L.tags, R.tags); detail += ` tags@${i}/${L.tags.length}: live ${L.tags[i]} local ${R.tags[i]}`; }
    results.push({ route, ok: textSame && tagsSame, textSame, tagsSame, detail });
  } catch (e) {
    results.push({ route, ok: false, detail: "ERROR " + e });
  }
}
for (const r of results) console.log(`${r.ok ? "SAME " : "DIFF "} ${r.route.padEnd(22)}${r.ok ? "" : ` text=${r.textSame} structure=${r.tagsSame}`}${r.detail ? "\n       " + r.detail.slice(0, 700) : ""}`);
console.log(`\n${results.filter(r => r.ok).length}/${results.length} routes render identical HTML (text + tag/class structure)`);
