#!/usr/bin/env node
/**
 * Phase 81: Top Files Runner
 * Reads reports/tsc-summary.json and runs phase81-aggressive-fixer.mjs on top N files
 *
 * Usage:
 *   node scripts/phase81-topfiles-runner.mjs                    # default: top 50, dry-run first
 *   node scripts/phase81-topfiles-runner.mjs --max=10           # top 10 only
 *   node scripts/phase81-topfiles-runner.mjs --apply-only       # skip dry-run, apply directly
 *   node scripts/phase81-topfiles-runner.mjs --dry-run-only     # only dry-run, no apply
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const maxArg = args.find(a => a.startsWith('--max='));
const max = maxArg ? parseInt(maxArg.replace('--max=', ''), 10) : 50;
const applyOnly = args.includes('--apply-only');
const dryRunOnly = args.includes('--dry-run-only');

const summaryPath = path.join(rootDir, 'reports', 'tsc-summary.json');
const logPath = path.join(rootDir, 'reports', 'phase81-topfiles-run.log');

console.log(`\n🚀 Phase 81: Top Files Runner`);
console.log('='.repeat(60));

// Read summary
if (!fs.existsSync(summaryPath)) {
  console.error(`❌ Summary not found: ${summaryPath}`);
  console.error(`   Run: node scripts/phase81-tsc-summarize.mjs`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const topFiles = summary.topFiles.slice(0, max);

console.log(`📊 Loaded ${summary.topFiles.length} files from summary`);
console.log(`📁 Processing top ${topFiles.length} files (--max=${max})`);
console.log(`📝 Logging to: ${logPath}`);
console.log();

// Initialize log
const logLines = [];
const log = (msg) => {
  console.log(msg);
  logLines.push(`[${new Date().toISOString()}] ${msg}`);
};

log(`Phase 81 Top Files Run Started`);
log(`Total errors baseline: ${summary.tsErrorCount}`);
log(`Files to process: ${topFiles.length}`);
log(`Mode: ${dryRunOnly ? 'dry-run only' : applyOnly ? 'apply only' : 'dry-run then apply'}`);
log('');

const results = {
  filesProcessed: 0,
  dryRunFixes: 0,
  appliedFixes: 0,
  errors: []
};

for (const file of topFiles) {
  const filePath = file.key;
  const errorCount = file.count;
  const fullPath = path.resolve(rootDir, filePath);

  log(`\n${'─'.repeat(60)}`);
  log(`📄 ${filePath} (${errorCount} errors)`);

  if (!fs.existsSync(fullPath)) {
    log(`   ⚠️ File not found, skipping`);
    results.errors.push({ file: filePath, error: 'File not found' });
    continue;
  }

  // Dry run first (unless --apply-only)
  if (!applyOnly) {
    const dryResult = spawnSync('node', [
      path.join(__dirname, 'phase81-aggressive-fixer.mjs'),
      '--dry-run',
      `--file=${filePath}`
    ], { cwd: rootDir, encoding: 'utf8' });

    const dryOutput = (dryResult.stdout || '') + (dryResult.stderr || '');
    const dryFixMatch = dryOutput.match(/Total fixes:\s*(\d+)/);
    const dryFixes = dryFixMatch ? parseInt(dryFixMatch[1], 10) : 0;

    log(`   🔍 Dry-run: ${dryFixes} potential fixes`);
    results.dryRunFixes += dryFixes;

    if (dryFixes === 0) {
      log(`   ⏭️ No fixes found, skipping apply`);
      results.filesProcessed++;
      continue;
    }
  }

  // Apply fixes (unless --dry-run-only)
  if (!dryRunOnly) {
    const applyResult = spawnSync('node', [
      path.join(__dirname, 'phase81-aggressive-fixer.mjs'),
      `--file=${filePath}`
    ], { cwd: rootDir, encoding: 'utf8' });

    const applyOutput = (applyResult.stdout || '') + (applyResult.stderr || '');
    const applyFixMatch = applyOutput.match(/Total fixes:\s*(\d+)/);
    const appliedFixes = applyFixMatch ? parseInt(applyFixMatch[1], 10) : 0;

    log(`   ✅ Applied: ${appliedFixes} fixes`);
    results.appliedFixes += appliedFixes;
  }

  results.filesProcessed++;
}

log(`\n${'='.repeat(60)}`);
log(`📊 SUMMARY`);
log(`${'='.repeat(60)}`);
log(`Files processed: ${results.filesProcessed}`);
log(`Dry-run fixes found: ${results.dryRunFixes}`);
log(`Fixes applied: ${results.appliedFixes}`);
if (results.errors.length > 0) {
  log(`Errors: ${results.errors.length}`);
  for (const e of results.errors) {
    log(`  - ${e.file}: ${e.error}`);
  }
}
log(`\n✅ Complete!`);

// Write log file
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, logLines.join('\n') + '\n', 'utf8');
console.log(`\n📝 Log written to: ${logPath}`);

// Write JSON summary
const resultPath = path.join(rootDir, 'reports', 'phase81-topfiles-result.json');
fs.writeFileSync(resultPath, JSON.stringify({
  runAt: new Date().toISOString(),
  baselineErrors: summary.tsErrorCount,
  filesProcessed: results.filesProcessed,
  dryRunFixes: results.dryRunFixes,
  appliedFixes: results.appliedFixes,
  errors: results.errors,
  files: topFiles.map(f => f.key)
}, null, 2), 'utf8');
console.log(`📊 Result JSON: ${resultPath}`);
