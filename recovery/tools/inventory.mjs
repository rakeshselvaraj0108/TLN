// Build the app-module inventory: which modules are app code, their exports, names recovered
// from RSC client references, and which pages use them.
import fs from "node:fs";
import path from "node:path";
import { parseFlight } from "./flight.mjs";

const { chunks, modules } = JSON.parse(fs.readFileSync("registry.json", "utf8"));
const RSC_DIR = "../deployed-snapshot/rsc";

// ---- library modules ----------------------------------------------------------------------
const FRAMEWORK_CHUNK = /^(3320-|4750-|09accf64-|main-app-|polyfills-|webpack-)/;
export const LIB = {
  "5814": { source: "react" },
  "1018": { source: "react/jsx-runtime" },
  "4750": { source: "next/link", default: "Link" },
  "9773": { source: "next/link", default: "Link" },
  "271": { source: "next/navigation" },
  "4820": { source: "next/navigation" },
  "7700": { source: "clsx", members: { W: "clsx" } },
  "4704": { source: "tailwind-merge", members: { m6: "twMerge" } },
  "3336": { source: "d3", namespace: "d3" },
  "8638": { source: "process" },
  "6258": { source: "process" },
  "8856": { source: "lucide-react", internal: true },
  "5093": { source: "class-variance-authority", members: { j: "cva" } },
  "2258": { font: "Inter" },
  "2861": { font: "JetBrains_Mono" },
  "4146": { font: "Newsreader" },
};

export function lucideName(code) {
  const m = code.match(/require\((?:\/\*webcrack:missing\*\/)?"?(?:\.\/)?8856(?:\.js)?"?\)\.Z\)\("(\w+)"/);
  return m?.[1] ?? null;
}

// A standalone lucide icon module: tiny, exports only Z, and is a single createLucideIcon call.
export function isIconModule(code) {
  return code.length < 3000 && !!lucideName(code) && /^require\.d\(exports, \{\s*Z: function/.test(code.trim());
}

export function isLib(id) {
  const m = modules[id];
  if (LIB[id]) return true;
  if (!m) return true; // lives only in a framework chunk we did not register
  if (FRAMEWORK_CHUNK.test(m.chunk)) return true;
  if (isIconModule(m.code)) return true;
  if (/micromark|mdast-util|hast-util|unist-util|property-information|html-url-attributes|vfile|remark-parse|remark-rehype|space-separated-tokens|comma-separated-tokens|style-to-object|inline-style-parser|decode-named-character-reference|character-entities/.test(m.code.slice(0, 20000))) return true;
  return false;
}

// ---- names from RSC client references ------------------------------------------------------
export const rscRefs = {};      // moduleId -> Set(export names)
export const routeRefs = {};    // route -> [{id, name}]
function walkRsc(dir, prefix = "") {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walkRsc(p, prefix + "/" + f); continue; }
    const route = prefix + "/" + f.replace(/\.rsc$/, "");
    const rows = parseFlight(fs.readFileSync(p, "utf8"));
    routeRefs[route] = [];
    for (const [, r] of rows) if (r.tag === "I") {
      const [id, , name] = r.value;
      (rscRefs[id] ??= new Set()).add(name);
      routeRefs[route].push({ id: String(id), name });
    }
  }
}
walkRsc(RSC_DIR);

// ---- app modules --------------------------------------------------------------------------
export const REQ_RE = /require\((?:\/\*webcrack:missing\*\/)?"?(?:\.\/)?(\d+)(?:\.js)?"?\)/g;
export function exportsOf(code) {
  const block = code.match(/require\.d\(exports, \{([\s\S]*?)\n\}\);/);
  if (!block) return [];
  return [...block[1].matchAll(/^\s*("?[\w$]+"?): function \(\) \{\s*return ([\w$.]+);\s*\}/gm)].map(m => ({ key: m[1].replace(/"/g, ""), local: m[2] }));
}

const containing = {};
for (const [c, info] of Object.entries(chunks)) for (const id of info.modules ?? []) (containing[id] ??= []).push(c);

export const app = {};
for (const [id, m] of Object.entries(modules)) {
  if (isLib(id)) continue;
  if (/^Promise\.resolve\(\)\.then\(require\.(bind|t\.bind)/.test(m.code.trim()) || m.size === 0) continue; // page entry manifests
  app[id] = {
    id,
    size: m.size,
    chunks: containing[id],
    exports: exportsOf(m.code),
    rscNames: [...(rscRefs[id] ?? [])],
    deps: [...new Set([...m.code.matchAll(REQ_RE)].map(x => x[1]))].filter(d => !isLib(d)),
    libs: [...new Set([...m.code.matchAll(REQ_RE)].map(x => x[1]))].filter(d => isLib(d)),
    jsx: /<[A-Za-z_$][\w.$]*[\s/>]/.test(m.code),
  };
}

if ((process.argv[1] ?? "").endsWith("inventory.mjs")) {
  const list = Object.values(app);
  console.log("app modules:", list.length, " bytes:", list.reduce((s, m) => s + m.size, 0));
  const unnamed = list.filter(m => !m.rscNames.length || m.rscNames.includes("default"));
  console.log("named via RSC:", list.length - unnamed.length);
  for (const m of list.sort((a, b) => (a.chunks[0] > b.chunks[0] ? 1 : -1))) {
    const code = modules[m.id].code;
    const strings = [...new Set((code.match(/"[A-Z][A-Za-z][A-Za-z0-9 .,'&/-]{6,50}"/g) || []))].slice(0, 5).join(" ");
    console.log(
      `${m.id.padEnd(5)} ${String(m.size).padStart(6)} ${m.chunks.map(c => c.replace(/-[0-9a-f]{16}\.js$/, "")).join("+").slice(0, 34).padEnd(35)}` +
      ` rsc=[${m.rscNames.join(",")}] exp=[${m.exports.map(e => e.key).join(",").slice(0, 60)}] ${m.jsx ? "JSX" : "   "} deps=${m.deps.join(",")} | ${strings.slice(0, 120)}`
    );
  }
  const unknownLibs = new Set(list.flatMap(m => m.libs).filter(id => !LIB[id] && !lucideName(modules[id]?.code ?? "")));
  console.log("\nlib ids used by app without mapping:", [...unknownLibs].map(id => `${id}(${modules[id]?.chunk ?? "absent"}): ${(modules[id]?.code ?? "").replace(/\s+/g, " ").slice(0, 100)}`).join("\n  "));
}
