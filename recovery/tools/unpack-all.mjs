// Decompile every chunk and dump one JSON registry of all webpack modules.
import { webcrack } from "webcrack";
import fs from "node:fs";
import path from "node:path";

const ROOT = "../deployed-snapshot/site/_next/static/chunks";
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p); } })(ROOT);

const modules = {};
const chunks = {};
for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const code = fs.readFileSync(file, "utf8");
  try {
    const r = await webcrack(code, { jsx: true, unpack: true, deobfuscate: false, unminify: true, mangle: false });
    const ids = [];
    if (r.bundle) for (const [id, m] of r.bundle.modules) {
      ids.push(id);
      const requires = [...new Set([...m.code.matchAll(/require\((?:\/\*webcrack:missing\*\/)?"?\.?\/?(\d+)(?:\.js)?"?\)/g), ...m.code.matchAll(/require\.bind\(require, (\d+)\)/g)].map(x => x[1]))];
      modules[id] = { id, chunk: rel, size: m.code.length, requires, code: m.code };
    }
    chunks[rel] = { bytes: code.length, modules: ids, bundle: !!r.bundle };
    console.log(`${rel.padEnd(48)} ${r.bundle ? ids.length + " modules" : "NO BUNDLE"}`);
  } catch (e) {
    chunks[rel] = { bytes: code.length, error: String(e).slice(0, 200) };
    console.log(`${rel.padEnd(48)} ERROR ${String(e).slice(0, 120)}`);
  }
}
fs.writeFileSync("registry.json", JSON.stringify({ chunks, modules }));
console.log("total modules:", Object.keys(modules).length);
