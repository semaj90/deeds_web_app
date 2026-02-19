#!/usr/bin/env node
/**
 * Phase 43 — Async-Effect Codemod
 * Transforms async onMount/effect callbacks into safe inner-async form.
 *   --apply  : write changes
 *   --check  : exit 1 if any async effects remain
 *   --dry-run: show what would be changed
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "src");
const MANIFEST = path.resolve(__dirname, "async-effects-manifest.json");

const APPLY = process.argv.includes("--apply");
const CHECK = process.argv.includes("--check");
const DRY_RUN = process.argv.includes("--dry-run");

if (!fs.existsSync(MANIFEST)) {
  console.error("❌ Manifest not found. Run: node scripts/find-async-effects.mjs");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

if (CHECK) {
  if (manifest.totalViolations > 0) {
    console.error(`❌ Found ${manifest.totalViolations} async effect violations`);
    manifest.entries.slice(0, 10).forEach((e) => {
      console.error(`   ${e.file}:${e.startLine} - ${e.kind}`);
    });
    process.exit(1);
  } else {
    console.log("✅ No async effect violations found");
    process.exit(0);
  }
}

console.log("🔧 Phase 43 Async-Effect Codemod\n");
console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : DRY_RUN ? "DRY-RUN (preview only)" : "PREVIEW"}\n`);

let fixed = 0;
const fileChanges = {};

// Group entries by file
manifest.entries.forEach((entry) => {
  if (!fileChanges[entry.file]) {
    fileChanges[entry.file] = [];
  }
  fileChanges[entry.file].push(entry);
});

for (const [file, changes] of Object.entries(fileChanges)) {
  const fullPath = path.join(ROOT, file);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  File not found: ${file}`);
    continue;
  }
  
  let src = fs.readFileSync(fullPath, "utf8");
  
  // Sort changes by index (descending) to apply from end to start
  changes.sort((a, b) => b.index - a.index);
  
  for (const change of changes) {
    // Find the async function definition
    const asyncMatch = src.substring(change.index).match(
      /\b(onMount|effect|\$effect)\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{/
    );
    
    if (!asyncMatch) continue;
    
    const start = change.index;
    const functionStart = start + asyncMatch[0].length;
    
    // Find matching closing brace (simplified - may need improvement for nested cases)
    let depth = 1;
    let end = functionStart;
    
    while (depth > 0 && end < src.length) {
      if (src[end] === "{") depth++;
      if (src[end] === "}") depth--;
      end++;
    }
    
    // Extract the original async function body
    const originalBody = src.substring(functionStart, end - 1);
    
    // Extract parameters if any
    const paramMatch = asyncMatch[0].match(/async\s*\(([^)]*)\)/);
    const params = paramMatch ? paramMatch[1].trim() : "";
    
    // Create the IIFE wrapper
    const replacement = `(${params ? params : ""}) => {
    (async () => {
${originalBody}    })();
    
    return () => {
      // Cleanup function - add your cleanup code here if needed
    };
  }`;
    
    // Replace the entire async function with IIFE version
    const matchEnd = start + asyncMatch[0].length + originalBody.length + 1;
    src = src.substring(0, start + asyncMatch[1].length + 1) + replacement + src.substring(matchEnd);
    
    fixed++;
    console.log(`   ✓ Fixed ${change.kind} in ${file}:${change.startLine}`);
  }
  
  if (APPLY) {
    // Create backup
    const backupPath = fullPath + ".phase43-backup";
    fs.copyFileSync(fullPath, backupPath);
    
    // Add comment header
    const header = `<!-- Phase 43 async-effect codemod applied ${new Date().toISOString()} -->\n`;
    fs.writeFileSync(fullPath, header + src, "utf8");
    
    console.log(`   💾 Saved changes to ${file} (backup: ${path.basename(backupPath)})`);
  } else if (DRY_RUN) {
    console.log(`   📝 Would fix ${changes.length} pattern(s) in ${file}`);
  }
}

console.log(`\n${"=".repeat(70)}`);

if (APPLY) {
  console.log(`✅ Phase 43 codemod complete — ${fixed} patterns fixed`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Review changes in modified files`);
  console.log(`   2. Run: npx prettier --write "src/**/*.svelte"`);
  console.log(`   3. Test affected components`);
  console.log(`   4. Run: node scripts/find-async-effects.mjs (should find 0)`);
} else if (DRY_RUN) {
  console.log(`📋 Dry-run complete — would fix ${fixed} patterns`);
  console.log(`\n   Run with --apply to make changes`);
} else {
  console.log(`📋 Preview complete — ${fixed} patterns to fix`);
  console.log(`\n   Run with --apply to make changes`);
  console.log(`   Run with --dry-run for detailed preview`);
}

console.log("=".repeat(70));

