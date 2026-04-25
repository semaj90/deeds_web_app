#!/usr/bin/env node
/**
 * Phase 43 — Async-Effect Manifest Builder
 * Scans tracked .svelte files for `onMount(async` or `effect(async`
 * and outputs scripts/async-effects-manifest.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "src");
const MANIFEST = path.resolve(__dirname, "async-effects-manifest.json");

function* walk(dir) {
  try {
    for (const e of fs.readdirSync(dir)) {
      const full = path.join(dir, e);
      if (fs.statSync(full).isDirectory()) {
        if (/backup|archive|bak|corrupted|replaced|node_modules/i.test(full)) continue;
        yield* walk(full);
      } else if (full.endsWith(".svelte")) {
        yield full;
      }
    }
  } catch (err) {
    console.warn(`Warning: Cannot read ${dir}:`, err.message);
  }
}

const entries = [];
let filesScanned = 0;

console.log("🔍 Scanning for async effect patterns...\n");

for (const file of walk(ROOT)) {
  filesScanned++;
  const src = fs.readFileSync(file, "utf8");
  
  // Look for async onMount or async effect patterns
  const patterns = [
    { regex: /\bonMount\s*\(\s*async\s*\(/g, kind: "onMount" },
    { regex: /\beffect\s*\(\s*async\s*\(/g, kind: "effect" },
    { regex: /\$effect\s*\(\s*async\s*\(/g, kind: "$effect" },
  ];
  
  for (const { regex, kind } of patterns) {
    let match;
    while ((match = regex.exec(src)) !== null) {
      const startLine = src.substring(0, match.index).split(/\r?\n/).length;
      const relativePath = path.relative(ROOT, file);
      
      entries.push({
        file: relativePath,
        kind,
        startLine,
        index: match.index,
        snippet: src.substring(match.index, match.index + 80).replace(/\n/g, " "),
      });
      
      console.log(`⚠️  ${relativePath}:${startLine} - async ${kind}()`);
    }
  }
  
  if (filesScanned % 200 === 0) {
    process.stdout.write(`\r   Scanned ${filesScanned} files...`);
  }
}

console.log(`\n\n📊 Scan Complete:`);
console.log(`   Files scanned: ${filesScanned}`);
console.log(`   Async patterns found: ${entries.length}`);

const manifest = {
  generatedAt: new Date().toISOString(),
  filesScanned,
  totalViolations: entries.length,
  byKind: entries.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {}),
  entries,
};

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

console.log(`\n✅ Manifest written → ${path.relative(process.cwd(), MANIFEST)}`);
console.log(`\n📋 Breakdown by type:`);
Object.entries(manifest.byKind).forEach(([kind, count]) => {
  console.log(`   ${kind}: ${count}`);
});

if (entries.length > 0) {
  console.log(`\n⚠️  Found ${entries.length} async effect violations that need fixing`);
  console.log(`   Run: node scripts/fix-async-effects.mjs --apply`);
  process.exit(1);
} else {
  console.log(`\n✅ No async effect violations found!`);
  process.exit(0);
}
