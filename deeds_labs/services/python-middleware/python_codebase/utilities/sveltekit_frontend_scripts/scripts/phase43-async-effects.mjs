#!/usr/bin/env node
/**
 * Phase 43 — Async Effect Fixer
 * Converts async onMount/$effect to safe inner-async pattern
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "src");
const APPLY = process.argv.includes("--apply");

function* walk(dir) {
  for (const e of fs.readdirSync(dir)) {
    const full = path.join(dir, e);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!/backup|archive|bak|node_modules/i.test(full)) {
        yield* walk(full);
      }
    } else if (full.endsWith(".svelte")) {
      yield full;
    }
  }
}

function fixAsyncEffects(src) {
  let modified = false;
  let count = 0;

  // Pattern 1: onMount(async () => { ... })
  const onMountRegex = /onMount\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g;
  if (onMountRegex.test(src)) {
    src = src.replace(
      /onMount\s*\(\s*async\s*\(\s*\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*\)/g,
      (match, body) => {
        count++;
        return `onMount(() => {
  const run = async () => {
    try {${body}}
    catch(e) { console.error('onMount async error:', e); }
  };
  run();
})`;
      }
    );
    modified = true;
  }

  // Pattern 2: $effect(async () => { ... })
  const effectRegex = /\$effect\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g;
  if (effectRegex.test(src)) {
    src = src.replace(
      /\$effect\s*\(\s*async\s*\(\s*\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*\)/g,
      (match, body) => {
        count++;
        return `$effect(() => {
  let cleanup;
  const run = async () => {
    try {${body}}
    catch(e) { console.error('$effect async error:', e); }
  };
  run();
  return () => { if(typeof cleanup === 'function') cleanup(); };
})`;
      }
    );
    modified = true;
  }

  return { modified, count, src };
}

let totalFiles = 0;
let modifiedFiles = 0;
let totalReplacements = 0;

console.log(`🔍 Scanning for async effects in ${ROOT}...`);

for (const file of walk(ROOT)) {
  totalFiles++;
  const src = fs.readFileSync(file, "utf8");
  const result = fixAsyncEffects(src);

  if (result.modified) {
    modifiedFiles++;
    totalReplacements += result.count;

    if (APPLY) {
      fs.copyFileSync(file, file + '.async-backup');
      fs.writeFileSync(file, result.src, "utf8");
      console.log(`✅ ${path.relative(ROOT, file)} — ${result.count} async patterns fixed`);
    } else {
      console.log(`📝 ${path.relative(ROOT, file)} — ${result.count} async patterns (dry run)`);
    }
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Total files scanned: ${totalFiles}`);
console.log(`   Files with changes: ${modifiedFiles}`);
console.log(`   Async patterns fixed: ${totalReplacements}`);
console.log(`   Mode: ${APPLY ? '✅ APPLIED' : '🔍 DRY RUN'}`);

if (!APPLY) {
  console.log(`\n💡 Run with --apply to make changes`);
}
