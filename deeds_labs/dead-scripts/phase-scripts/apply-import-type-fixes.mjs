#!/usr/bin/env node
/**
 * Automated Import Type Fixer
 * Converts 'import type { ... }' to 'import { ... }' for runtime values
 *
 * Usage:
 *   node scripts/apply-import-type-fixes.mjs [--top N] [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const DRY_RUN = args.includes('--dry-run');
const TOP_N = parseInt(args.find(a => a.startsWith('--top'))?.split(' ')?.[1] || '100');

// Known runtime values that should NOT use 'import type'
const RUNTIME_IMPORTS = new Set([
  'goto',
  'pushState',
  'replaceState',
  'prefetch',
  'preloadData',
  'preloadCode',
  'stores',
  'getStores',
  'redirect',
  'error',
  'onMount',
  'onDestroy',
  'tick',
  'setContext',
  'getContext',
  'hasContext',
  'createEventDispatcher',
  'beforeNavigate',
  'afterNavigate',
  'invalidate',
  'invalidateAll',
  'writable',
  'readable',
  'derived',
  'get',
  'browser',
  'dev',
  'building'
]);

// Load batch analysis report to get top files
const reportPath = path.join(__dirname, '../reports/batch-analysis-2025-12-15.json');
if (!fs.existsSync(reportPath)) {
  console.error('❌ Batch analysis report not found. Run batch-merger-fixer.mjs first.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const filesToFix = report.topFiles
  .filter(f => f.fixes && f.fixes.some(fix => fix.reason && fix.reason.includes('Type-only imports')))
  .slice(0, TOP_N)
  .map(f => f.file);

console.log(`\n🔧 Import Type Fixer - Batch Processing\n`);
console.log(`📋 Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (changes applied)'}`);
console.log(`📂 Files to process: ${filesToFix.length} of ${TOP_N}\n`);

let totalChanges = 0;
const results = [];

for (const filePath of filesToFix) {
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let modified = false;
  let changes = 0;

  // Pattern 1: import type { X } from '...'
  // Look for specific runtime imports
  const pattern1 = /import\s+type\s+\{([^}]+)\}\s+from\s+(['"][^'"]+['"])/gm;

  let newContent = content;
  let match;

  while ((match = pattern1.exec(content)) !== null) {
    const importList = match[1];
    const imports = importList.split(',').map(s => s.trim());

    // Check if ANY of the imports are runtime values
    const hasRuntimeImports = imports.some(imp => {
      const name = imp.split(' as ')[0].trim();
      return RUNTIME_IMPORTS.has(name);
    });

    if (hasRuntimeImports) {
      const replacement = match[0].replace('import type', 'import');
      newContent = newContent.replace(match[0], replacement);
      changes++;
      modified = true;
    }
  }

  if (modified) {
    if (!DRY_RUN) {
      // Create backup
      const backupPath = filePath + '.bak';
      fs.writeFileSync(backupPath, content);
      fs.writeFileSync(filePath, newContent);
    }

    totalChanges += changes;
    results.push({
      file: filePath,
      changes: changes,
      status: DRY_RUN ? '📋 WOULD FIX' : '✅ FIXED'
    });

    console.log(`${DRY_RUN ? '📋' : '✅'} ${filePath}`);
    console.log(`   └─ Changes: ${changes}`);
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`\n📊 Summary:`);
console.log(`  Total files processed: ${results.length}`);
console.log(`  Total changes applied: ${totalChanges}`);
console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

if (DRY_RUN) {
  console.log(`\n💡 To apply fixes, run without --dry-run:`);
  console.log(`   node scripts/apply-import-type-fixes.mjs --top ${TOP_N}`);
}

// Save results
const resultsPath = path.join(__dirname, `../reports/import-fix-results-${Date.now()}.json`);
fs.writeFileSync(resultsPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  mode: DRY_RUN ? 'dry-run' : 'live',
  filesProcessed: results.length,
  totalChanges,
  topN: TOP_N,
  results
}, null, 2));

console.log(`\n💾 Results saved to: ${resultsPath}`);
console.log(`\n✨ Next: Run 'npm run check' to verify fixes\n`);
