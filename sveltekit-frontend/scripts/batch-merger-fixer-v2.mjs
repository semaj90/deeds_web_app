#!/usr/bin/env node
/**
 * batch-merger-fixer-v2.mjs
 *
 * Dry-run error analyzer for the error-brain CI gate.
 * Called by .github/workflows/error-brain-check.yml with --analyze.
 * Writes reports/batch-analysis-{timestamp}.json so the downstream
 * workflow step can find and summarise it via jq '.summary'.
 *
 * Does NOT modify any source files; all writes are confined to reports/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ANALYZE = process.argv.includes('--analyze');
const DRY_RUN = process.argv.includes('--dry-run') || ANALYZE;

// ── helpers ──────────────────────────────────────────────────────────────────

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function ts(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── main ──────────────────────────────────────────────────────────────────────

const reportsDir = path.join(ROOT, 'reports');
ensureDir(reportsDir);

// Collect any existing svelte-check / tsc log snapshots from logs/
const logsDir = path.join(ROOT, 'logs');
ensureDir(logsDir);
let totalIssues = 0;
let highPriority = 0;
let filesAnalyzed = 0;
let files = [];

// Determine which log file to read: explicit --log-path, or common candidates in logs/
let svelteLog = null;
const explicitIndex = process.argv.indexOf('--log-path');
if (explicitIndex !== -1 && process.argv.length > explicitIndex + 1) {
  svelteLog = path.resolve(process.argv[explicitIndex + 1]);
} else {
  // preference: logs/svelte-check.log -> logs/svelte-check-errors.txt -> reports/svelte-check.log
  const candidates = [
    path.join(logsDir, 'svelte-check.log'),
    path.join(logsDir, 'svelte-check-errors.txt'),
    path.join(reportsDir, 'svelte-check.log'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      svelteLog = p;
      break;
    }
  }
  if (!svelteLog) {
    // scan logsDir for any file that mentions svelte and check or error
    try {
      const found = fs
        .readdirSync(logsDir)
        .filter((f) => /svelte/i.test(f) && /(check|error)/i.test(f));
      if (found.length) svelteLog = path.join(logsDir, found[0]);
    } catch (e) {
      if (VERBOSE) console.log(`[batch-merger-fixer-v2] Failed scanning logs/: ${e.message}`);
    }
  }
}

if (VERBOSE) console.log(`[batch-merger-fixer-v2] Selected log path: ${svelteLog || '(none)'} `);

if (svelteLog && fs.existsSync(svelteLog)) {
  const lines = fs.readFileSync(svelteLog, 'utf8').split('\n');
  if (VERBOSE) console.log(`[batch-merger-fixer-v2] Read ${lines.length} lines from ${svelteLog}`);
  const errorLines = lines.filter((l) => /Error\b|error TS/i.test(l));
  totalIssues += errorLines.length;
  highPriority += errorLines.filter((l) =>
    /TS2\d{3}|Cannot find|is not assignable/i.test(l)
  ).length;

  // Summarise top offending files
  const fileHits = {};
  for (const line of errorLines) {
    const m = line.match(/src\/[^\s(]+/);
    if (m) fileHits[m[0]] = (fileHits[m[0]] || 0) + 1;
  }
  for (const [filePath, count] of Object.entries(fileHits)) {
    files.push({ path: filePath, patterns: Array(count).fill('ts-error') });
    filesAnalyzed++;
  }

  if (VERBOSE) {
    console.log(
      `[batch-merger-fixer-v2] Detected ${errorLines.length} error lines across ${Object.keys(fileHits).length} files:`
    );
    for (const [f, c] of Object.entries(fileHits)) console.log(`  ${f}: ${c}`);
    if (errorLines.length && errorLines.length < 50) {
      console.log('[batch-merger-fixer-v2] Sample error lines:');
      for (const l of errorLines.slice(0, 20)) console.log('  ' + l);
    }
  }
} else {
  if (VERBOSE) {
    console.log(
      `[batch-merger-fixer-v2] No svelte-check log found. Tried: ${svelteLog || '(none)'} `
    );
    try {
      const all = fs.readdirSync(logsDir);
      const found = all.filter((f) => /svelte/i.test(f) && /(check|error)/i.test(f));
      console.log(
        `[batch-merger-fixer-v2] Other files in logs/: ${found.length ? found.join(', ') : '(none)'} `
      );
      if (!found.length && all.length)
        console.log(`[batch-merger-fixer-v2] All log files: ${all.join(', ')}`);
    } catch (e) {
      console.log(`[batch-merger-fixer-v2] Error listing logs/: ${e.message}`);
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: DRY_RUN ? 'analyze' : 'apply',
  summary: {
    filesAnalyzed,
    totalIssues,
    highPriority,
    mediumPriority: Math.max(0, totalIssues - highPriority),
  },
  files,
};

const outFile = path.join(reportsDir, `batch-analysis-${ts()}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(`[batch-merger-fixer-v2] Analysis complete.`);
console.log(`  filesAnalyzed : ${report.summary.filesAnalyzed}`);
console.log(`  totalIssues   : ${report.summary.totalIssues}`);
console.log(`  highPriority  : ${report.summary.highPriority}`);
console.log(`  report        : ${outFile}`);

process.exit(0);
