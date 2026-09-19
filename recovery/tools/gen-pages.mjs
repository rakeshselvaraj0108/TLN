// Rebuild server-rendered layouts and pages (Next.js app router) from each route's RSC payload.
import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";
import { parseFlight } from "./flight.mjs";
import { app } from "./inventory.mjs";
import { moduleInfo } from "./gen-modules.mjs";
import { createRequire } from "node:module";

const frontendRequire = createRequire(path.join(process.argv[2], "package.json"));
const LUCIDE = frontendRequire("lucide-react");
const LUCIDE_DEFAULTS = { xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const kebabToPascal = k => k.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join("");

const OUT = path.resolve(process.argv[2]);
const RSC_DIR = "../deployed-snapshot/rsc";
const LAYOUT_ROUTER = "6802";
const TEMPLATE = "9459";
const NOT_FOUND_DEFAULT = "404: This page could not be found.";

const CSS_FILES = {
  "/_next/static/css/2b93382b2dedf283.css": { file: "src/app/globals.css", importFrom: "./globals.css" },
  "/_next/static/css/dac8d0decaaee45b.css": { file: "src/app/landing/landing.css", importFrom: "./landing.css" },
};
const FONT_VARIABLES = {
  __variable_3eb911: "inter.variable",
  __variable_b33fa6: "newsreader.variable",
  __variable_ecea63: "jetbrainsMono.variable",
};

// ---------------------------------------------------------------------------------------------
function listRoutes(dir, prefix = "") {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...listRoutes(p, `${prefix}/${f}`));
    else out.push({ route: `${prefix}/${f.replace(/\.rsc$/, "")}`, file: p });
  }
  return out;
}

const esc = s => JSON.stringify(s);
const isElement = n => Array.isArray(n) && n[0] === "$" && n.length === 4;

class Emitter {
  constructor(rows) {
    this.rows = rows;
    this.imports = new Map(); // source -> { default, named:Set }
    this.cssImports = new Set();
  }
  addImport(source, name, isDefault = false) {
    const e = this.imports.get(source) ?? { default: null, named: new Set() };
    if (isDefault) e.default = name; else e.named.add(name);
    this.imports.set(source, e);
    return name;
  }
  row(id) { return this.rows.get(id); }

  componentFor(ref) {
    const id = ref.replace(/^\$L/, "");
    const r = this.row(id);
    if (!r || r.tag !== "I") return null;
    const [moduleId, , exportName] = r.value;
    const mid = String(moduleId);
    if (mid === LAYOUT_ROUTER) return { kind: "children" };
    if (mid === TEMPLATE) return { kind: "skip" };
    if (mid === "4750") return { kind: "component", name: this.addImport("next/link", "Link", true) };
    if (!app[mid]) throw new Error(`client reference to non-app module ${mid} (${exportName})`);
    const info = moduleInfo(mid);
    const importPath = "@/" + info.file.replace(/^src\//, "").replace(/\.(jsx?|tsx?)$/, "");
    if (exportName === "default" || exportName === "") return { kind: "component", name: this.addImport(importPath, info.defaultName, true), moduleId: mid, info };
    return { kind: "component", name: this.addImport(importPath, exportName), moduleId: mid, info };
  }

  deref(value) {
    if (typeof value !== "string" || !value.startsWith("$")) return value;
    if (value === "$undefined") return undefined;
    if (value.startsWith("$$")) return value.slice(1);
    if (/^\$L[0-9a-f]+$/.test(value) || /^\$@?[0-9a-f]+$/.test(value)) {
      const r = this.row(value.replace(/^\$[L@]?/, ""));
      if (!r) return undefined;
      if (r.tag === "I") return { __clientRef: value };
      return r.tag === "T" ? r.value : this.deref(r.value);
    }
    return value;
  }

  // Render a node as JSX children text.
  children(node) {
    node = this.deref(node);
    if (node == null || node === false || node === true) return "";
    if (typeof node === "string") return /[{}<>]/.test(node) || /^\s|\s$/.test(node) ? `{${esc(node)}}` : node;
    if (typeof node === "number") return `{${node}}`;
    if (isElement(node)) return this.element(node);
    if (Array.isArray(node)) return node.map(n => this.children(n)).join("");
    if (node.__clientRef) return "";
    throw new Error("unknown node " + JSON.stringify(node).slice(0, 120));
  }

  // Render a prop value as a JS expression.
  expr(value) {
    value = this.deref(value);
    if (value === undefined) return undefined;
    if (isElement(value)) return this.element(value);
    if (Array.isArray(value)) {
      if (value.some(isElement)) return `<>${value.map(v => this.children(v)).join("")}</>`;
      return `[${value.map(v => this.expr(v) ?? "undefined").join(", ")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.entries(value).map(([k, v]) => { const e = this.expr(v); return e === undefined ? null : `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : esc(k)}: ${e}`; }).filter(Boolean).join(", ")}}`;
    }
    return esc(value);
  }

  element(node) {
    const [, type, key, props] = node;
    let tag;
    if (typeof type === "string" && type.startsWith("$L")) {
      const c = this.componentFor(type);
      if (!c) throw new Error(`unresolved component ${type}`);
      if (c.kind === "children") return "{children}";
      if (c.kind === "skip") return "";
      tag = c.name;
    } else if (type === "$Sreact.suspense") {
      tag = this.addImport("react", "Suspense");
    } else if (type === "$Sreact.fragment") {
      tag = this.addImport("react", "Fragment");
    } else {
      tag = type;
    }
    // server-rendered lucide icons -> <Icon /> components
    if (tag === "svg" && typeof props?.className === "string") {
      const m = props.className.match(/^lucide lucide-([a-z0-9-]+)(?:\s+(.*))?$/);
      const iconName = m && kebabToPascal(m[1]);
      if (iconName && LUCIDE[iconName]) {
        const icon = this.addImport("lucide-react", iconName);
        const attrs = [];
        for (const [name, raw] of Object.entries(props)) {
          if (name === "children" || (name in LUCIDE_DEFAULTS && LUCIDE_DEFAULTS[name] === raw)) continue;
          if (name === "className") { if (m[2]) attrs.push(`className=${esc(m[2])}`); continue; }
          const v = this.deref(raw);
          if (v === undefined) continue;
          if (typeof v === "string") attrs.push(`${name}=${esc(v)}`);
          else if (v === true) attrs.push(name);
          else attrs.push(`${name}={${this.expr(v)}}`);
        }
        if (key != null) attrs.unshift(`key=${esc(key)}`);
        return `<${icon}${attrs.length ? " " + attrs.join(" ") : ""} />`;
      }
    }
    // stylesheet links emitted by Next for CSS imports
    if (tag === "link" && props?.precedence === "next" && CSS_FILES[props.href]) {
      this.cssImports.add(CSS_FILES[props.href].importFrom);
      return "";
    }
    const attrs = [];
    if (key != null) attrs.push(`key=${esc(key)}`);
    for (const [name, raw] of Object.entries(props ?? {})) {
      if (name === "children") continue;
      if (name === "className" && tag === "html" && typeof raw === "string") {
        const parts = raw.split(/\s+/).map(c => FONT_VARIABLES[c] ?? esc(c));
        attrs.push(`className={[${parts.join(", ")}].join(" ")}`);
        continue;
      }
      const v = this.deref(raw);
      if (v === undefined) continue;
      if (typeof v === "string") attrs.push(`${name}=${esc(v)}`);
      else if (v === true) attrs.push(name);
      else attrs.push(`${name}={${this.expr(v)}}`);
    }
    const kids = this.children(props?.children);
    const open = `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}`;
    return kids ? `${open}>${kids}</${tag}>` : `${open} />`;
  }

  importsText() {
    const order = s => s === "react" ? 0 : s.startsWith("next/") ? 1 : s.startsWith("@/") ? 3 : 2;
    const lines = [...this.imports.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).map(([src, e]) => {
      const parts = [];
      if (e.default) parts.push(e.default);
      if (e.named.size) parts.push(`{ ${[...e.named].sort().join(", ")} }`);
      return `import ${parts.join(", ")} from ${esc(src)};`;
    });
    for (const css of this.cssImports) lines.push(`import ${esc(css)};`);
    return lines.join("\n");
  }
}

// Split a segment's rendered node into [stylesheet links, tree].
function segmentTree(rscNode) {
  if (rscNode == null) return null;
  // [[links, tree], loading] wrapper
  if (Array.isArray(rscNode) && !isElement(rscNode) && rscNode.length === 2 && rscNode[1] === null && Array.isArray(rscNode[0]) && !isElement(rscNode[0])) rscNode = rscNode[0];
  // [[links...], tree] or [null, tree]
  if (Array.isArray(rscNode) && !isElement(rscNode) && rscNode.length === 2 && (rscNode[0] === null || (Array.isArray(rscNode[0]) && rscNode[0].every(l => isElement(l) && l[1] === "link")))) {
    return { links: rscNode[0] ?? [], tree: rscNode[1] };
  }
  return { links: [], tree: rscNode };
}

function metadataFrom(rows) {
  for (const [, r] of rows) {
    if (!Array.isArray(r.value) || !r.value.length || !r.value.every(isElement)) continue;
    const types = r.value.map(e => e[1]);
    if (!types.includes("title")) continue;
    const meta = {};
    for (const [, type, , props] of r.value) {
      if (type === "title") meta.title = props.children;
      else if (type === "meta" && props.name === "description") meta.description = props.content;
      else if (type === "meta" && props.name === "theme-color") meta.themeColor = props.content;
      else if (type === "meta" && props.name && !["viewport", "next-size-adjust"].includes(props.name)) (meta.other ??= {})[props.name] = props.content;
      else if (type === "meta" && props.property) (meta.openGraph ??= {})[props.property.replace(/^og:/, "")] = props.content;
      else if (type === "link" && props.rel) (meta.icons ??= []).push({ rel: props.rel, url: props.href, ...(props.type ? { type: props.type } : {}), ...(props.sizes ? { sizes: props.sizes } : {}) });
    }
    return meta;
  }
  return {};
}

// ---------------------------------------------------------------------------------------------
const routes = listRoutes(RSC_DIR);
const layouts = new Map(); // dir -> { code, fromRoute }
const pages = new Map();   // dir -> code
const clientPages = [];
const metas = [];

for (const { route, file } of routes) {
  const rows = parseFlight(fs.readFileSync(file, "utf8"));
  const root = rows.get("0").value[1][0][1];
  const meta = metadataFrom(rows);
  metas.push({ route, meta });

  let seed = root;
  const segments = [];
  while (seed) {
    const [segment, parallel, rscNode] = seed;
    const seg = typeof segment === "string" ? segment : Array.isArray(segment) ? `[${segment[0]}]` : String(segment);
    if (seg === "__PAGE__") {
      const dir = segments.join("/");
      const em = new Emitter(rows);
      // rscNode = [metadataOutletRef, pageTree]
      let tree = rscNode;
      // [[metadataOutlet, tree, loading], loadingStyles] or [metadataOutlet, tree]
      if (Array.isArray(tree) && Array.isArray(tree[0]) && typeof tree[0][0] === "string" && tree[0][0].startsWith("$L")) tree = tree[0][1];
      else if (Array.isArray(tree) && typeof tree[0] === "string" && tree[0].startsWith("$L")) tree = tree[1];
      const onlyClientPage = (() => {
        const t = em.deref(tree);
        const el = isElement(t) ? t : Array.isArray(t) && t.length === 1 && isElement(t[0]) ? t[0] : null;
        if (!el || typeof el[1] !== "string" || !el[1].startsWith("$L")) return null;
        let r = rows.get(el[1].slice(2));
        // Next 14.2 renders "use client" pages through ClientPageRoot({ Component, props })
        if (r?.tag === "I" && r.value[2] === "ClientPageRoot" && typeof el[3]?.Component === "string") r = rows.get(el[3].Component.replace(/^\$L?/, ""));
        const mid = r?.tag === "I" ? String(r.value[0]) : null;
        return mid && app[mid] && moduleInfo(mid).isPage ? mid : null;
      })();
      if (onlyClientPage) { clientPages.push({ dir, route, moduleId: onlyClientPage }); break; }
      const jsx = em.children(tree);
      pages.set(dir, { em, jsx, route, meta });
      break;
    }
    if (seg !== "" || segments.length === 0) {
      const dir = [...segments, seg].filter(Boolean).join("/");
      const parts = segmentTree(rscNode);
      const isPassthrough = !parts || (() => {
        const t = parts.tree;
        const el = isElement(t) ? t : null;
        if (!el || typeof el[1] !== "string") return false;
        const r = rows.get(el[1].slice(2));
        return r?.tag === "I" && String(r.value[0]) === LAYOUT_ROUTER && !parts.links.length;
      })();
      if (!isPassthrough && !layouts.has(dir)) {
        const em = new Emitter(rows);
        for (const l of parts.links) em.element(l);
        const jsx = em.children(parts.tree);
        layouts.set(dir, { em, jsx, route });
      }
    }
    if (seg !== "") segments.push(seg);
    seed = parallel?.children;
  }
}

// ---------------------------------------------------------------------------------------------
// Metadata: root default = most common title; pages whose title differs get their own export.
const titleCount = {};
for (const { meta } of metas) if (meta.title) titleCount[meta.title] = (titleCount[meta.title] ?? 0) + 1;
const rootMeta = metas.find(m => m.meta.title === Object.entries(titleCount).sort((a, b) => b[1] - a[1])[0]?.[0])?.meta ?? {};
const metaExport = m => `export const metadata = ${JSON.stringify(m, null, 2)};\n`;

async function write(rel, code) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let formatted = code;
  try { formatted = await prettier.format(code, { parser: "babel", printWidth: 100, trailingComma: "all" }); }
  catch (e) { console.warn("prettier failed for", rel, String(e).slice(0, 300)); }
  fs.writeFileSync(file, formatted);
  console.log("wrote", rel);
}

for (const [dir, { em, jsx }] of layouts) {
  const isRoot = dir === "";
  let fonts = "";
  if (isRoot) {
    em.addImport("next/font/google", "Inter");
    em.addImport("next/font/google", "JetBrains_Mono");
    em.addImport("next/font/google", "Newsreader");
    fonts = `
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains-mono", display: "swap" });
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  style: ["normal", "italic"],
  variable: "--font-serif-display",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: false,
});
`;
  }
  const name = isRoot ? "RootLayout" : dir.split("/").map(s => s.replace(/\W/g, "")).map(s => s[0].toUpperCase() + s.slice(1)).join("") + "Layout";
  const layoutMeta = isRoot ? metaExport(rootMeta) : "";
  const code = `${em.importsText()}\n${fonts}\n${layoutMeta}\nexport default function ${name}({ children }) {\n  return (${jsx});\n}\n`;
  await write(path.join("src/app", dir, "layout.jsx"), code);
}

for (const [dir, { em, jsx, meta }] of pages) {
  const name = (dir ? dir.split("/").map(s => s.replace(/\W/g, "")).map(s => s[0].toUpperCase() + s.slice(1)).join("") : "Home") + "Page";
  const own = {};
  if (meta.title && meta.title !== rootMeta.title) own.title = meta.title;
  if (meta.description && meta.description !== rootMeta.description) own.description = meta.description;
  const code = `${em.importsText()}\n\n${Object.keys(own).length ? metaExport(own) : ""}\nexport default function ${name}() {\n  return (<>${jsx}</>);\n}\n`;
  await write(path.join("src/app", dir, "page.jsx"), code);
}

console.log("\nclient pages (module files already are page.jsx):", clientPages.map(c => `${c.route}->${c.moduleId}${moduleInfo(c.moduleId).route !== c.dir ? " MISMATCH " + moduleInfo(c.moduleId).route : ""}`).join(", "));
console.log("routes with own title:", metas.filter(m => m.meta.title !== rootMeta.title).map(m => `${m.route}: ${m.meta.title}`).join(" | "));
fs.writeFileSync("route-meta.json", JSON.stringify({ rootMeta, metas, clientPages }, null, 1));
