// Compile Tailwind with the reconstructed config, minify the way Next.js does, and diff against
// the deployed stylesheet. Emits the rules that exist only in the deployed CSS (= hand-written CSS
// for globals.css) and the rules only Tailwind generated (= config mismatches).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const FRONTEND = fileURLToPath(new URL("../../frontend/", import.meta.url));
const require = createRequire(path.join(FRONTEND, "package.json"));
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const cssnano = require("next/dist/compiled/cssnano-simple");
const autoprefixer = require("autoprefixer");

const deployedCss = fs.readFileSync("../deployed-snapshot/site/_next/static/css/2b93382b2dedf283.css", "utf8");
const input = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n";

const config = require(path.join(FRONTEND, "tailwind.config.js"));
config.content = [path.join(FRONTEND, "src/**/*.{js,jsx}").replace(/\\/g, "/")];

const compiled = await postcss([tailwind(config), autoprefixer, cssnano]).process(input, { from: path.join(FRONTEND, "src/app/globals.css") });

function ruleKeys(css) {
  const root = postcss.parse(css);
  const list = [];
  root.walkRules(rule => {
    if (rule.parent.type === "atrule" && rule.parent.name === "keyframes") return;
    let ctx = "";
    for (let p = rule.parent; p && p.type === "atrule"; p = p.parent) ctx = `@${p.name} ${p.params} ` + ctx;
    for (const decl of rule.nodes.filter(n => n.type === "decl")) list.push(`${ctx}${rule.selector} { ${decl.prop}:${decl.value}${decl.important ? "!important" : ""} }`);
  });
  root.walkAtRules("keyframes", a => list.push(`@keyframes ${a.params} ${a.toString().replace(/\s+/g, "")}`));
  return list;
}

const deployed = ruleKeys(deployedCss).filter(k => !/__(className|variable)_|@font-face/.test(k));
const generated = new Set(ruleKeys(compiled.css));
const deployedSet = new Set(deployed);

const onlyDeployed = deployed.filter(k => !generated.has(k));
const onlyGenerated = [...generated].filter(k => !deployedSet.has(k));
console.log(`deployed decls: ${deployed.length}  generated: ${generated.size}  only-deployed: ${onlyDeployed.length}  only-generated: ${onlyGenerated.length}`);
fs.writeFileSync("css-only-deployed.txt", onlyDeployed.join("\n"));
fs.writeFileSync("css-only-generated.txt", onlyGenerated.join("\n"));
fs.writeFileSync("css-generated.min.css", compiled.css);
