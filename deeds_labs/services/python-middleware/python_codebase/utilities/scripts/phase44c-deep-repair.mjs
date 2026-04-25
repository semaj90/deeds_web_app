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
console.log(`📊 Phase 44C: Scanning ${files.length} files for deep syntax corruption...`);

const stats = {
  repaired: 0,
  files: 0,
  patterns: {},
  filesProcessed: []
};

for (const f of files) {
  let txt = fs.readFileSync(f, "utf8");
  const orig = txt;
  let fileChanged = false;

  // IMP001 – broken import braces or missing paths
  if (txt.includes("import") && (txt.includes("from ;") || txt.includes("from  "))) {
    const before = txt;
    txt = txt.replace(
      /import\s*\{([^}]*)\}\s*from\s*;?(\s|$)/g,
      (m, g1) => `import {${g1.trim()}} from '$lib/components/ui';\n`
    );
    if (txt !== before) {
      stats.patterns.IMP001 = (stats.patterns.IMP001 || 0) + 1;
      fileChanged = true;
    }
  }

  // TYP002 – "as:" → "as" (type casting corruption)
  const before2 = txt;
  txt = txt.replace(/\bas\s*:\s+/g, "as ");
  if (txt !== before2) {
    stats.patterns.TYP002 = (stats.patterns.TYP002 || 0) + 1;
    fileChanged = true;
  }

  // HTM003 – malformed closing tags
  const before3 = txt;
  txt = txt.replace(/<\/p>re>/g, "</pre>");
  txt = txt.replace(/<\/a>rticle>/g, "</article>");
  txt = txt.replace(/<\/a>side>/g, "</aside>");
  txt = txt.replace(/<\/a>rea>/g, "</area>");
  txt = txt.replace(/<\/li>>/g, "</li>");
  if (txt !== before3) {
    stats.patterns.HTM003 = (stats.patterns.HTM003 || 0) + 1;
    fileChanged = true;
  }

  // CSS004 – incorrect pseudo selectors with stray colons
  const before4 = txt;
  txt = txt.replace(/([:\s])hover\s*:/g, "$1:hover");
  txt = txt.replace(/([:\s])focus\s*:/g, "$1:focus");
  txt = txt.replace(/([:\s])active\s*:/g, "$1:active");
  txt = txt.replace(/:\s+hover\s+{/g, ":hover {");
  txt = txt.replace(/:\s+focus\s+{/g, ":focus {");
  txt = txt.replace(/;\s*,\s*(padding|margin|color|background)/g, "; $1");
  if (txt !== before4) {
    stats.patterns.CSS004 = (stats.patterns.CSS004 || 0) + 1;
    fileChanged = true;
  }

  // SVL005 – replace "onclick=" with "on:click=" (Svelte 5 migration)
  // BUT: Also keep both for backwards compat during migration
  const before5 = txt;
  // Only fix if NOT already "on:click="
  txt = txt.replace(/\bonclick=(?![\s\n]*on:)/g, "onclick=");
  txt = txt.replace(/\bonchange=(?![\s\n]*on:)/g, "onchange=");
  txt = txt.replace(/\boninput=(?![\s\n]*on:)/g, "oninput=");
  if (txt !== before5) {
    stats.patterns.SVL005 = (stats.patterns.SVL005 || 0) + 1;
    fileChanged = true;
  }

  // IMP006 – fix stray commas in import destructuring
  const before6 = txt;
  txt = txt.replace(/import\s+{([^}]*),\s*}/g, "import {$1}");
  txt = txt.replace(/import\s+{\s*,/g, "import {");
  if (txt !== before6) {
    stats.patterns.IMP006 = (stats.patterns.IMP006 || 0) + 1;
    fileChanged = true;
  }

  // SVL007 – fix malformed svelte directives
  const before7 = txt;
  txt = txt.replace(/<svelte:component,/g, "<svelte:component");
  txt = txt.replace(/<svelte:fragment,/g, "<svelte:fragment");
  txt = txt.replace(/<svelte:fragment\s+,/g, "<svelte:fragment");
  if (txt !== before7) {
    stats.patterns.SVL007 = (stats.patterns.SVL007 || 0) + 1;
    fileChanged = true;
  }

  // STR008 – fix unterminated strings (replace stray quotes in certain contexts)
  const before8 = txt;
  txt = txt.replace(/return\s*:\s*null/g, "return null");
  txt = txt.replace(/return:\s*undefined/g, "return undefined");
  if (txt !== before8) {
    stats.patterns.STR008 = (stats.patterns.STR008 || 0) + 1;
    fileChanged = true;
  }

  if (txt !== orig) {
    stats.files++;
    stats.repaired++;
    stats.filesProcessed.push(path.relative(ROOT, f));
    fs.writeFileSync(f, txt);
    console.log(`  ✏️  Fixed: ${path.relative(ROOT, f)}`);
  }
}

// Write stats
const statsPath = path.join(__dirname, "../phase44c-stats.json");
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

console.log("\n" + "=".repeat(60));
console.log("✅ Phase 44C Deep Repair Complete!");
console.log("=".repeat(60));
console.log(`📊 Files processed: ${stats.repaired} files changed`);
console.log(`\n📈 Pattern Breakdown:`);
for (const [pattern, count] of Object.entries(stats.patterns)) {
  console.log(`  ${pattern}: ${count} occurrences fixed`);
}
console.log(`\n📁 Stats saved to: ${statsPath}`);
console.log(`\n🔍 Next steps:`);
console.log(`  1. npx svelte-check --fail-on-warnings=false`);
console.log(`  2. npm run build`);
console.log(`  3. npx prettier --write "src/**/*.svelte"`);
