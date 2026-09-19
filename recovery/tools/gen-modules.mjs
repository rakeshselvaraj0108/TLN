// Turn decompiled webpack modules back into Next.js source files (ESM + JSX).
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import * as t from "@babel/types";
import prettier from "prettier";
import { app, LIB, isIconModule, lucideName } from "./inventory.mjs";

const traverse = _traverse.default;
const generate = _generate.default;

const OUT = path.resolve(process.argv[2] ?? "../out/frontend");
const { modules } = JSON.parse(fs.readFileSync("registry.json", "utf8"));
const NAMES = JSON.parse(fs.readFileSync("names.json", "utf8"));
const CHUNK_ROOT = "../deployed-snapshot/site/_next/static/chunks";

const D3 = {
  Ys: "select", sPX: "zoom", CRH: "zoomIdentity", A4v: "forceSimulation", Fsl: "forceLink",
  q5i: "forceManyBody", wqt: "forceCenter", Hh: "forceCollide", ohM: "drag", WFE: "polygonHull",
  VV$: "min", PUr: "scaleSqrt", Xf: "scaleTime", BYU: "scaleLinear", jvg: "line", SOn: "area",
  FdL: "curveMonotoneX", ve8: "pie", Nb1: "arc",
};

// ---------------------------------------------------------------------------------------------
// Original webpack factory parameter names (module, exports, require) per module id. webcrack
// renames them to module/exports/require and occasionally also renames an inner shadowing
// variable with the same short name; we use these to undo that.
const factoryParams = {};
function collectFactoryParams() {
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p); } })(CHUNK_ROOT);
  const wanted = new Set(Object.keys(app));
  for (const file of files) {
    if (/(^|[\\/])(3320|4750|09accf64|polyfills|webpack|main-app)-/.test(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    const ast = parse(src, { sourceType: "script", errorRecovery: true });
    traverse(ast, {
      ObjectProperty(p) {
        const key = p.node.key.type === "NumericLiteral" ? String(p.node.key.value) : p.node.key.value ?? p.node.key.name;
        if (!wanted.has(String(key))) return;
        const fn = p.node.value;
        if (fn.type === "FunctionExpression" || fn.type === "ArrowFunctionExpression") {
          factoryParams[key] = fn.params.map(x => x.name);
        }
      },
    });
  }
}

// ---------------------------------------------------------------------------------------------
function routeOfModule(id) {
  const pages = (app[id].chunks ?? []).map(c => c.match(/^app\/(.+)\/page-[0-9a-f]{16}\.js$/)).filter(Boolean);
  return pages.length === 1 ? pages[0][1] : null;
}
const pascal = s => s.replace(/\[(\w+)\]/g, "By-$1").split(/[/\-_]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("");

export function moduleInfo(id) {
  const m = app[id];
  const override = NAMES[id];
  const rsc = m.rscNames.filter(n => n && n !== "default");
  const isPage = m.rscNames.includes("default") && !override;
  const route = isPage ? routeOfModule(id) : null;
  if (isPage && !route) throw new Error(`page module ${id} has no unique route`);
  const file = override?.file ?? (isPage ? `src/app/${route}/page.jsx` : null);
  if (!file) throw new Error(`no file for module ${id} (exports ${m.exports.map(e => e.key)})`);
  const defaultName = override?.exports?.default ?? (isPage ? pascal(route) + "Page" : pascal(path.basename(file, path.extname(file))));
  return {
    id, file, route, isPage, defaultName,
    exportName(key) {
      if (key === "default") return "default";
      if (override?.exports?.[key]) return override.exports[key];
      if (rsc.includes(key) || /^[A-Z][A-Za-z0-9]+$/.test(key) && key.length > 3) return key;
      throw new Error(`module ${id} (${file}): no name for export "${key}"`);
    },
  };
}
const importPath = file => "@/" + file.replace(/^src\//, "").replace(/\.(jsx?|tsx?)$/, "");

// ---------------------------------------------------------------------------------------------
function requireTarget(node) {
  if (!t.isCallExpression(node) || !t.isIdentifier(node.callee, { name: "require" }) || node.arguments.length !== 1) return null;
  const a = node.arguments[0];
  if (t.isNumericLiteral(a)) return String(a.value);
  if (t.isStringLiteral(a)) return a.value.match(/^\.\/(\d+)\.js$/)?.[1] ?? null;
  return null;
}

export async function transformModule(id) {
  const info = moduleInfo(id);
  const code = modules[id].code;
  const ast = parse(code, {
    sourceType: "module", plugins: ["jsx"], errorRecovery: true,
    allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowUndeclaredExports: true,
  });

  // (0, x.y) -> x.y
  traverse(ast, {
    SequenceExpression(p) {
      const ex = p.node.expressions;
      if (ex.length === 2 && t.isNumericLiteral(ex[0], { value: 0 }) && (t.isMemberExpression(ex[1]) || t.isIdentifier(ex[1]))) p.replaceWith(ex[1]);
    },
  });

  const taken = new Set();
  traverse(ast, { Scope(p) { for (const n of Object.keys(p.scope.bindings)) taken.add(n); }, Program(p) { for (const n of Object.keys(p.scope.bindings)) taken.add(n); } });
  traverse(ast, {
    Identifier(p) { if (p.isReferencedIdentifier() || p.isBindingIdentifier()) taken.add(p.node.name); },
    JSXIdentifier(p) { if ((p.parentPath.isJSXOpeningElement() || p.parentPath.isJSXMemberExpression({ object: p.node })) && /^[A-Z_$]/.test(p.node.name)) taken.add(p.node.name); },
  });

  const imports = new Map(); // source -> { default, namespace, named: Map }
  const entry = src => { if (!imports.has(src)) imports.set(src, { default: null, namespace: null, named: new Map() }); return imports.get(src); };
  const uniq = name => { let n = name, i = 2; while (taken.has(n)) n = `${name}${i++}`; taken.add(n); return n; };
  const named = (src, imported, preferLocal = imported) => { const e = entry(src); if (!e.named.has(imported)) e.named.set(imported, uniq(preferLocal)); return e.named.get(imported); };
  const def = (src, preferLocal) => { const e = entry(src); if (!e.default) e.default = uniq(preferLocal); return e.default; };
  const ns = (src, preferLocal) => { const e = entry(src); if (!e.namespace) e.namespace = uniq(preferLocal); return e.namespace; };
  const lucide = name => { const e = entry("lucide-react"); if (e.named.has(name)) return e.named.get(name); if (e.named.has(name + "Icon")) return e.named.get(name + "Icon"); if (!taken.has(name)) return named("lucide-react", name); return named("lucide-react", name + "Icon"); };

  // Resolve `<require target>.<member>` to an identifier name (or node).
  function resolve(target, member) {
    const tcode = modules[target]?.code ?? "";
    if (target === "5814") return member == null ? ns("react", "React") : member === "default" ? def("react", "React") : named("react", member);
    if (target === "1018") return member === "Fragment" ? named("react", "Fragment") : named("react/jsx-runtime", member);
    if (target === "4750" || target === "9773") return def("next/link", "Link");
    if (target === "271" || target === "4820") return member == null ? ns("next/navigation", "navigation") : named("next/navigation", member);
    if (target === "3336") { if (!D3[member]) throw new Error(`unknown d3 member ${member} in ${id}`); return named("d3", D3[member]); }
    if (target === "8638" || target === "6258") return member == null ? t.identifier("process") : t.memberExpression(t.identifier("process"), t.identifier(member));
    if (LIB[target]?.members) { const n = LIB[target].members[member]; if (!n) throw new Error(`unknown member ${target}.${member}`); return named(LIB[target].source, n); }
    if (isIconModule(tcode)) return lucide(lucideName(tcode));
    if (app[target]) {
      const ti = moduleInfo(target);
      if (member == null) return ns(importPath(ti.file), path.basename(ti.file).replace(/\W.*$/, ""));
      const exp = ti.exportName(member);
      return exp === "default" ? def(importPath(ti.file), ti.defaultName) : named(importPath(ti.file), exp);
    }
    throw new Error(`module ${id}: cannot resolve require(${target})${member ? "." + member : ""} (${modules[target]?.chunk ?? "absent"})`);
  }
  const toNode = r => typeof r === "string" ? t.identifier(r) : r;
  const resolveAt = (target, member, p) => {
    let r;
    try { r = resolve(target, member); } catch (e) { e.message += ` @ ${generate(p.parentPath.parentPath?.node ?? p.node).code.slice(0, 160)}`; throw e; }
    if (r == null) throw new Error(`module ${id}: resolve(${target}, ${member}) returned nothing @ ${generate(p.parentPath.node).code.slice(0, 120)}`);
    return r;
  };

  const params = factoryParams[id] ?? [];
  const exportsList = [];
  let hadClientApi = false;

  traverse(ast, {
    Program(programPath) {
      // 1. module-level require/import bindings
      const bindings = new Map(); // local -> target
      for (const stmt of programPath.get("body")) {
        if (stmt.isImportDeclaration()) {
          const target = stmt.node.source.value.match(/^\.\/(\d+)\.js$/)?.[1];
          const spec = stmt.node.specifiers[0];
          if (target && spec && t.isImportNamespaceSpecifier(spec)) bindings.set(spec.node?.local?.name ?? spec.local.name, { target, path: stmt });
          else if (target && !spec) stmt.remove();
        } else if (stmt.isVariableDeclaration()) {
          for (const d of stmt.get("declarations")) {
            const target = requireTarget(d.node.init);
            if (target && t.isIdentifier(d.node.id)) bindings.set(d.node.id.name, { target, path: d });
          }
        } else if (stmt.isExpressionStatement()) {
          const e = stmt.node.expression;
          if (t.isCallExpression(e) && t.isMemberExpression(e.callee) && t.isIdentifier(e.callee.object, { name: "require" })) {
            const helper = e.callee.property.name;
            if (helper === "d") {
              for (const prop of e.arguments[1].properties) {
                const key = prop.key.name ?? prop.key.value;
                const body = prop.value.body.body;
                exportsList.push({ key, local: body[0].argument });
              }
              stmt.remove();
            } else if (helper === "r") stmt.remove();
          } else if (requireTarget(e)) stmt.remove(); // side-effect require (css etc.)
        }
      }

      // 2. references to those bindings
      const programScope = programPath.scope;
      programPath.traverse({
        "Identifier|JSXIdentifier"(p) {
          const name = p.node.name;
          const b = bindings.get(name);
          if (!b) return;
          if (p.isIdentifier() && !p.isReferencedIdentifier()) return;
          if (p.scope.getBinding(name) !== programScope.getBinding(name)) return;
          if (p.parentPath.isVariableDeclarator({ id: p.node }) || p.parentPath.isImportNamespaceSpecifier()) return;
          if (p.isJSXIdentifier()) {
            const parent = p.parentPath;
            const isElementName = (parent.isJSXOpeningElement() || parent.isJSXClosingElement()) && parent.node.name === p.node;
            const isMemberObject = parent.isJSXMemberExpression({ object: p.node });
            // attribute names and lowercase intrinsic tags are not variable references
            if (!isMemberObject && !(isElementName && /^[A-Z_$]/.test(name))) return;
            if (parent.isJSXMemberExpression({ object: p.node })) {
              const r = resolveAt(b.target, parent.node.property.name, p);
              parent.replaceWith(t.jsxIdentifier(typeof r === "string" ? r : generate(r).code));
            } else {
              const r = resolveAt(b.target, null, p);
              p.replaceWith(t.jsxIdentifier(typeof r === "string" ? r : generate(r).code));
            }
            return;
          }
          const parent = p.parentPath;
          if (b.target === "8856" && parent.isMemberExpression({ object: p.node })) {
            const call = parent.parentPath;
            if (call.isCallExpression({ callee: parent.node }) && t.isStringLiteral(call.node.arguments[0])) {
              call.replaceWith(t.identifier(lucide(call.node.arguments[0].value)));
              return;
            }
          }
          if (parent.isMemberExpression({ object: p.node })) {
            const member = parent.node.computed ? (t.isStringLiteral(parent.node.property) ? parent.node.property.value : null) : parent.node.property.name;
            if (member == null) throw new Error(`computed member on require binding in ${id}`);
            parent.replaceWith(toNode(resolveAt(b.target, member, p)));
          } else {
            p.replaceWith(toNode(resolveAt(b.target, null, p)));
          }
        },
      });
      for (const { path: bp } of bindings.values()) if (!bp.removed) bp.remove();

      // 3. inline require(N).member / createLucideIcon calls
      programPath.traverse({
        CallExpression(p) {
          const target = requireTarget(p.node);
          if (!target) return;
          const parent = p.parentPath;
          if (target === "8856" && parent.isMemberExpression({ object: p.node })) {
            const call = parent.parentPath;
            if (call.isCallExpression({ callee: parent.node }) && t.isStringLiteral(call.node.arguments[0])) {
              call.replaceWith(t.identifier(lucide(call.node.arguments[0].value)));
              return;
            }
          }
          if (parent.isMemberExpression({ object: p.node })) {
            const member = parent.node.computed ? parent.node.property.value : parent.node.property.name;
            parent.replaceWith(toNode(resolve(target, member)));
          } else {
            p.replaceWith(toNode(resolve(target, null)));
          }
        },
      });

      // 4. webcrack over-renamed identifiers -> original factory params
      programPath.traverse({
        Identifier(p) {
          const idx = ["module", "exports", "require"].indexOf(p.node.name);
          if (idx < 0 || p.scope.hasBinding(p.node.name)) return;
          if (p.parentPath.isMemberExpression({ property: p.node }) && !p.parent.computed) return;
          if (p.parentPath.isObjectProperty({ key: p.node }) && !p.parent.computed) return;
          if (!params[idx]) throw new Error(`module ${id}: stray ${p.node.name} and no factory params`);
          p.node.name = params[idx];
        },
      });

      // 4b. readable names for internal (non-exported) helpers
      for (const [from, to] of Object.entries(NAMES[id]?.locals ?? {})) {
        if (programScope.hasBinding(from) && !programScope.hasBinding(to) && !taken.has(to)) { programScope.rename(from, to); taken.add(to); }
      }

      // 5. exports
      const exportSpecifiers = [];
      for (const { key, local } of exportsList) {
        const name = info.exportName(key);
        if (!t.isIdentifier(local)) throw new Error(`module ${id}: non-identifier export ${key}`);
        let localName = local.name;
        const binding = programScope.getBinding(localName);
        if (!binding) throw new Error(`module ${id}: export ${key} -> unbound ${localName}`);
        const finalName = name === "default" ? info.defaultName : name;
        if (localName !== finalName && !programScope.hasBinding(finalName) && !taken.has(finalName)) {
          programScope.rename(localName, finalName);
          localName = finalName;
        } else if (localName !== finalName && programScope.hasBinding(finalName) === false && taken.has(finalName)) {
          // name used as an import/other identifier; keep alias export
        }
        const decl = binding.path;
        const top = decl.isVariableDeclarator() ? decl.parentPath : decl;
        const canInline = top.parentPath.isProgram() && (top.isFunctionDeclaration() || top.isClassDeclaration() || (top.isVariableDeclaration() && top.node.declarations.length === 1));
        if (name === "default") {
          if (canInline && !top.isVariableDeclaration()) top.replaceWith(t.exportDefaultDeclaration(top.node));
          else programPath.pushContainer("body", t.exportDefaultDeclaration(t.identifier(localName)));
        } else if (canInline && localName === name) {
          top.replaceWith(t.exportNamedDeclaration(top.node, []));
        } else {
          exportSpecifiers.push(t.exportSpecifier(t.identifier(localName), t.identifier(name)));
        }
      }
      if (exportSpecifiers.length) programPath.pushContainer("body", t.exportNamedDeclaration(null, exportSpecifiers));

      // 6. import declarations
      const order = src => src === "react" ? 0 : src.startsWith("react/") ? 1 : src.startsWith("next/") ? 2 : src.startsWith("@/") ? 4 : 3;
      const decls = [...imports.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).flatMap(([src, e]) => {
        const out = [];
        if (e.namespace) out.push(t.importDeclaration([t.importNamespaceSpecifier(t.identifier(e.namespace))], t.stringLiteral(src)));
        const specs = [];
        if (e.default) specs.push(t.importDefaultSpecifier(t.identifier(e.default)));
        for (const [imported, local] of [...e.named.entries()].sort()) specs.push(t.importSpecifier(t.identifier(local), t.identifier(imported)));
        if (specs.length) out.push(t.importDeclaration(specs, t.stringLiteral(src)));
        return out;
      });
      programPath.unshiftContainer("body", decls);

      // "use client" only where the module needs the client: hooks/context, router hooks,
      // event handlers, browser globals, or it is a client boundary referenced from the server.
      const reactImports = [...(imports.get("react")?.named.keys() ?? [])];
      const usesHooks = reactImports.some(n => /^use[A-Z]|^createContext$/.test(n));
      const usesRouter = imports.has("next/navigation");
      const handlers = /\bon[A-Z][A-Za-z]*=\{/.test(code) || /\bon[A-Z][A-Za-z]*: /.test(code);
      const browser = /\b(window|document|localStorage|navigator|IntersectionObserver|ResizeObserver|MutationObserver|requestAnimationFrame)\b/.test(code);
      const boundary = app[id].rscNames.length > 0;
      hadClientApi = usesHooks || usesRouter || handlers || browser;
      if (info.isPage || boundary || (app[id].jsx && hadClientApi) || usesHooks) programPath.node.directives.unshift(t.directive(t.directiveLiteral("use client")));
    },
  });

  // drop unused react/jsx-runtime imports webcrack left behind after JSX conversion
  let out = generate(ast, { jsescOption: { minimal: true }, comments: false }).code;
  out = out.replace(/^import \{[^}]*\} from "react\/jsx-runtime";\n/m, m => {
    const locals = [...m.matchAll(/(?:\w+ as )?(\w+)(?=[,\s}])/g)].map(x => x[1]).filter(x => x !== "import");
    const body = out.replace(m, "");
    return locals.some(l => new RegExp(`\\b${l}\\b`).test(body)) ? m : "";
  });
  try {
    out = await prettier.format(out, { parser: "babel", printWidth: 100, singleQuote: false, trailingComma: "all" });
  } catch (e) {
    console.warn(`prettier failed for ${id}: ${String(e).slice(0, 200)}`);
  }
  return { info, code: out };
}

// ---------------------------------------------------------------------------------------------
if ((process.argv[1] ?? "").endsWith("gen-modules.mjs")) {
  collectFactoryParams();
  const only = process.argv.slice(3);
  const results = [];
  const errors = [];
  for (const id of Object.keys(app)) {
    if (only.length && !only.includes(id)) continue;
    try {
      const { info, code } = await transformModule(id);
      const file = path.join(OUT, info.file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && results.some(r => r.file === info.file)) throw new Error(`file collision ${info.file}`);
      fs.writeFileSync(file, code);
      results.push({ id, file: info.file, bytes: code.length });
    } catch (e) {
      errors.push(`${id}: ${e.stack?.split("\n").slice(0, 3).join(" | ") ?? e}`);
    }
  }
  fs.writeFileSync(path.join("module-files.json"), JSON.stringify(results, null, 1));
  console.log(`wrote ${results.length} files, ${errors.length} errors`);
  for (const e of errors) console.log("  ERR", e);
}
