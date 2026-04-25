#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "../sveltekit-frontend/src");

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir)) {
    const full = path.join(dir, e);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (full.endsWith(".svelte") || full.endsWith(".ts")) files.push(full);
  }
}

walk(ROOT);
console.log(`📊 Phase 44C+ Switch Case Fix: Scanning ${files.length} files...`);

const stats = {
  repaired: 0,
  files: 0,
  caseCommaFixed: 0,
  filesProcessed: []
};

for (const f of files) {
  let txt = fs.readFileSync(f, "utf8");
  const orig = txt;

  // CRITICAL: Fix case, "something" → case "something"
  // Pattern: case, followed by space and a quote or identifier
  const before = txt;
  txt = txt.replace(/case\s*,\s*(['"a-zA-Z0-9_])/g, "case $1");

  if (txt !== before) {
    const matches = (before.match(/case\s*,\s*(['"a-zA-Z0-9_])/g) || []).length;
    stats.caseCommaFixed += matches;
    stats.files++;
    stats.filesProcessed.push(path.relative(ROOT, f));
    console.log(`  ✏️  Fixed: ${path.relative(ROOT, f)} (${matches} case fixes)`);
  }

  if (txt !== orig) {
    stats.repaired++;
    fs.writeFileSync(f, txt);
  }
}

console.log("\n" + "=".repeat(60));
console.log("✅ Phase 44C+ Switch Case Fix Complete!");
console.log("=".repeat(60));
console.log(`📊 Files processed: ${stats.files} files changed`);
console.log(`📊 Case comma fixes: ${stats.caseCommaFixed} instances`);
console.log(`\n📁 Next steps:`);
console.log(`  1. npm run build`);
console.log(`  2. If build passes: npx prettier --write "src/**/*.svelte"`);
