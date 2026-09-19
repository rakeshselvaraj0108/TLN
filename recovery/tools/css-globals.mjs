// Rebuild src/app/globals.css: Tailwind directives + the hand-written rules from the deployed CSS,
// placed in the layer their position in the compiled output implies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import prettier from "prettier";

const FRONTEND = fileURLToPath(new URL("../../frontend/", import.meta.url));
const require = createRequire(path.join(FRONTEND, "package.json"));
const postcss = require("postcss");

const deployed = postcss.parse(fs.readFileSync("../deployed-snapshot/site/_next/static/css/2b93382b2dedf283.css", "utf8"));
const onlyDeployed = fs.readFileSync("css-only-deployed.txt", "utf8").split("\n").filter(Boolean);
const customKeys = new Set(onlyDeployed);

const keyOf = (rule, decl) => {
  let ctx = "";
  for (let p = rule.parent; p && p.type === "atrule"; p = p.parent) ctx = `@${p.name} ${p.params} ` + ctx;
  return `${ctx}${rule.selector} { ${decl.prop}:${decl.value}${decl.important ? "!important" : ""} }`;
};
const isCustomRule = rule => rule.selector !== ".\\!rule" && rule.nodes.some(d => d.type === "decl" && customKeys.has(keyOf(rule, d)));

const sections = { base: [], components: [], after: [] };
let section = "base";
deployed.each(node => {
  if (node.type === "atrule" && node.name === "font-face") return;
  if (node.type === "rule" && /__(className|variable)_/.test(node.selector)) return;
  if (node.type === "rule" && node.selector === ".container") section = "components";
  if (section === "components" && node.type === "rule" && node.selector === ".visible") section = "after";
  if (node.type === "rule") {
    if (isCustomRule(node)) sections[section].push(node.clone());
  } else if (node.type === "atrule" && node.name === "keyframes") {
    if (customKeys.has(`@keyframes ${node.params} ${node.toString().replace(/\s+/g, "")}`)) sections[section].push(node.clone());
  } else if (node.type === "atrule" && node.name === "media") {
    const clone = node.clone();
    clone.each(child => { if (child.type !== "rule" || !isCustomRule(child)) child.remove(); });
    if (clone.nodes.length) sections[section].push(clone);
  }
});

const block = nodes => nodes.map(n => n.toString()).join("\n");
let css = `@tailwind base;

@layer base {
${block(sections.base)}
}

@tailwind components;

@layer components {
${block(sections.components)}
}

@tailwind utilities;

${block(sections.after)}
`;
css = await prettier.format(css, { parser: "css" });
fs.writeFileSync(path.join(FRONTEND, "src/app/globals.css"), css);
console.log("globals.css:", css.split("\n").length, "lines; base", sections.base.length, "components", sections.components.length, "after", sections.after.length);
