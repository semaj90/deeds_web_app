#!/usr/bin/env node
/**
 * scripts/atlas/append-soak-history.mjs
 *
 * Reads a workstation soak report JSON and appends one summary row to the
 * append-only JSONL benchmark history at docs/reports/workstation-soak-history.jsonl.
 *
 * Computes per-run trend metrics:
 *   latencyP50Ms  — median cycle latency
 *   latencyP95Ms  — 95th-percentile cycle latency
 *   vramBaselineMb  — first vramBefore reading
 *   vramPeakDeltaMb — largest VRAM swing across any cycle
 *   sourceRefCoveragePct — % of cycles with sourceRefsPresent=true
 *   acePassRate / synthesisPassRate — % pass (0-100)
 *
 * Usage:
 *   node scripts/atlas/append-soak-history.mjs
 *   node scripts/atlas/append-soak-history.mjs --report=docs/reports/workstation-soak-report.json
 *   node scripts/atlas/append-soak-history.mjs --dry-run
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const reportArg = args.find(a => a.startsWith('--report='));
const reportPath = reportArg
  ? resolve(REPO_ROOT, reportArg.split('=')[1])
  : resolve(REPO_ROOT, 'docs/reports/workstation-soak-report.json');
const historyPath = resolve(REPO_ROOT, 'docs/reports/workstation-soak-history.jsonl');

function percentile(sorted, p) {
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function summarise(report) {
  const cycles = report.cycles ?? [];
  if (!cycles.length) throw new Error('No cycles in report');

  const latencies = [...cycles.map(c => c.latencyMs)].sort((a, b) => a - b);
  const p50 = percentile(latencies, 0.50);
  const p95 = percentile(latencies, 0.95);

  const vramBaseline = cycles[0]?.vramBeforeMb ?? 0;
  const vramPeakDelta = Math.max(...cycles.map(c => Math.abs((c.vramAfterMb ?? 0) - (c.vramBeforeMb ?? 0))));

  const sourceRefCoveragePct = cycles.length
    ? Math.round((cycles.filter(c => c.sourceRefsPresent).length / cycles.length) * 100)
    : 0;
  const acePassRate = cycles.length
    ? Math.round((cycles.filter(c => c.aceSmokePassed).length / cycles.length) * 100)
    : 0;
  const synthesisPassRate = cycles.length
    ? Math.round((cycles.filter(c => c.synthesisSmokePassed).length / cycles.length) * 100)
    : 0;

  const ts = report.timestamp ?? new Date().toISOString();
  const runId = 'soak_' + ts.replace(/[-:T.Z]/g, '').slice(0, 15);

  return {
    ts,
    runId,
    cycles: report.cyclesConfigured ?? cycles.length,
    isDryRun: report.isDryRun ?? false,
    overallStatus: report.overallStatus ?? 'UNKNOWN',
    latencyP50Ms: p50,
    latencyP95Ms: p95,
    vramBaselineMb: vramBaseline,
    vramPeakDeltaMb: vramPeakDelta,
    sourceRefCoveragePct,
    forbiddenFields: report.metrics?.forbiddenFieldsDetected ?? 0,
    acePassRate,
    synthesisPassRate,
  };
}

if (!existsSync(reportPath)) {
  console.error(`[append-soak-history] Report not found: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const row = summarise(report);
const line = JSON.stringify(row);

console.log('[append-soak-history] Summary row:');
console.log(line);

if (dryRun) {
  console.log('[append-soak-history] Dry-run — not written.');
} else {
  appendFileSync(historyPath, line + '\n', 'utf8');
  console.log(`[append-soak-history] Appended to ${historyPath}`);
}
