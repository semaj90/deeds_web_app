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
const files = [];

// If a prior svelte-check log exists, count error lines
const svelteLog = path.join(logsDir, 'svelte-check.log');
if (fs.existsSync(svelteLog)) {
  const lines = fs.readFileSync(svelteLog, 'utf8').split('\n');
  const errorLines = lines.filter(l => /Error\b|error TS/i.test(l));
  totalIssues += errorLines.length;
  highPriority += errorLines.filter(l => /TS2\d{3}|Cannot find|is not assignable/i.test(l)).length;

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
