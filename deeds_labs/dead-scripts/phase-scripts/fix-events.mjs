import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");

const map = [
  ["on:click", "onclick"],
  ["on:submit", "onsubmit"],
  ["on:change", "onchange"],
  ["on:input", "oninput"],
  ["on:keydown", "onkeydown"],
  ["on:keyup", "onkeyup"],
  ["on:focus", "onfocus"],
  ["on:blur", "onblur"],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (p.endsWith(".svelte")) out.push(p);
  }
  return out;
}

function replaceEventDirectives(s) {
  let out = s;
  for (const [from, to] of map) {
    out = out.replaceAll(new RegExp(`\\b${from}=`, "g"), `${to}=`);
  }
  return out;
}

const files = walk(ROOT);
let changed = 0;

for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = replaceEventDirectives(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    changed++;
    console.log("updated:", file);
  }
}

console.log(`done. files changed: ${changed}/${files.length}`);
