#!/usr/bin/env tsx
/**
 * ff1-audit.ts  —  FF1 Deep Audit CLI
 *
 * Usage:
 *   npx tsx src/lib/server/ff1/cli/ff1-audit.ts
 *   npx tsx src/lib/server/ff1/cli/ff1-audit.ts --include-warnings
 *   npx tsx src/lib/server/ff1/cli/ff1-audit.ts --tools tsgo
 *   npx tsx src/lib/server/ff1/cli/ff1-audit.ts --top 20
 *   npx tsx src/lib/server/ff1/cli/ff1-audit.ts --json > logs/ff1-diagnostics.json
 *
 * OOM-safe:
 *   - spawn (streaming) instead of exec (buffered)
 *   - MAX_DIAGNOSTICS=2000 cap in collector
 *   - sequential tool runs (not parallel)
 *   - Redis cache for repeated runs on same commit
 *
 * Output:
 *   - logs/ff1-diagnostics.json   (full structured diagnostics)
 *   - stdout: ranked summary table
 */

import { execSync }      from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import path              from 'path';
import { collectDiagnostics }  from '../audit/diagnostic-collector.js';
import type { DiagnosticEntry } from '../graph/graph-schema.js';
import { getCachedDiagnostics, setCachedDiagnostics, recordAuditRun } from '../storage/redis-cache.js';

const ROOT      = path.resolve(process.cwd());
const LOGS_DIR  = path.join(ROOT, 'logs');

// ── Args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const asJson  = argv.includes('--json');
const includeW = argv.includes('--include-warnings');
const forceRun = argv.includes('--force') || argv.includes('-f');
const topN    = parseInt(argv[argv.indexOf('--top') + 1] ?? '15', 10) || 15;
const toolsIdx = argv.indexOf('--tools');
type Tool = 'tsgo' | 'svelte-check' | 'vitest';
const tools: Tool[] = toolsIdx >= 0
  ? (argv[toolsIdx + 1]?.split(',') as Tool[])
  : ['tsgo', 'svelte-check'];

// ── Commit sha (for cache key) ────────────────────────────────────────────

function getCommitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
  } catch {
    return 'no-git';
  }
}

// ── Risk table ────────────────────────────────────────────────────────────

function buildRiskTable(diags: DiagnosticEntry[]): Map<string, { count: number; score: number }> {
  const m = new Map<string, { count: number; score: number }>();
  for (const d of diags) {
    const prev = m.get(d.filePath) ?? { count: 0, score: 0 };
    m.set(d.filePath, {
      count: prev.count + 1,
      score: prev.score + d.riskScore,
    });
  }
  return m;
}

// ── Print ─────────────────────────────────────────────────────────────────

function printSummary(
  diags: DiagnosticEntry[],
  table: Map<string, { count: number; score: number }>,
  meta: { durationMs: number; truncated: boolean; bySource: Record<string, number> },
): void {
  const errors   = diags.filter(d => d.severity === 'error').length;
  const warnings = diags.filter(d => d.severity === 'warning').length;

  console.log('\n════════════════════════════════════════════════════');
  console.log('  FF1 Deep Audit');
  console.log('════════════════════════════════════════════════════');
  console.log(`  Errors:   ${errors}`);
  console.log(`  Warnings: ${warnings}`);
  console.log(`  Tools:    ${Object.entries(meta.bySource).map(([k,v]) => `${k}(${v})`).join(', ') || 'none'}`);
  console.log(`  Duration: ${(meta.durationMs / 1000).toFixed(1)}s`);
  if (meta.truncated) console.log('  ⚠  Truncated at 2000 entries — fix high-risk files first');
  console.log('');

  const sorted = [...table.entries()].sort((a, b) => b[1].score - a[1].score);
  console.log(`  TOP ${topN} RISK FILES`);
  console.log('  ' + '─'.repeat(72));

  for (const [file, { count, score }] of sorted.slice(0, topN)) {
    const short = file.replace('src/', '').slice(0, 62);
    const bar   = '█'.repeat(Math.min(10, Math.ceil(score / 4)));
    console.log(`  ${bar.padEnd(10)} ${String(score).padStart(4)} pts  ${String(count).padStart(3)} err  ${short}`);
  }

  console.log('\n  FIRST ERRORS BY FILE');
  console.log('  ' + '─'.repeat(72));
  const shown = new Set<string>();
  for (const d of diags.filter(e => e.severity === 'error').slice(0, 30)) {
    if (shown.has(d.filePath)) continue;
    shown.add(d.filePath);
    const loc = d.line ? `:${d.line}` : '';
    const code = d.code ? ` [${d.code}]` : '';
    console.log(`  ${d.filePath}${loc}${code}`);
    console.log(`    ${d.message.slice(0, 100)}`);
  }
  console.log('');
  console.log(`  logs/ff1-diagnostics.json written`);
  console.log('════════════════════════════════════════════════════\n');
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sha = getCommitSha();
  const runId = `${sha}-${Date.now()}`;

  if (!asJson) {
    console.log(`[ff1:audit] commit=${sha} tools=${tools.join(',')} includeWarnings=${includeW}`);
  }

  // Try cache (skip if --force)
  const cached = (!forceRun && sha !== 'no-git') ? await getCachedDiagnostics(sha) : null;
  let result: Awaited<ReturnType<typeof collectDiagnostics>>;

  if (cached && !includeW && !forceRun) {
    result = {
      diagnostics: cached,
      truncated:   false,
      durationMs:  0,
      bySource:    cached.reduce((acc, d) => ({ ...acc, [d.source]: (acc[d.source] ?? 0) + 1 }), {} as Record<string,number>),
    };
    if (!asJson) console.log(`[ff1:audit] using cached diagnostics (${cached.length})`);
  } else {
    result = await collectDiagnostics({ includeWarnings: includeW, tools, timeoutMs: 120_000 });
    if (sha !== 'no-git') await setCachedDiagnostics(sha, result.diagnostics);
  }

  const { diagnostics, ...meta } = result;
  const table = buildRiskTable(diagnostics);

  // Write JSON output
  mkdirSync(LOGS_DIR, { recursive: true });
  const outPath = path.join(LOGS_DIR, 'ff1-diagnostics.json');
  const topRisk = [...table.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 50)
    .map(([path, { count, score }]) => ({ path, count, score }));

  writeFileSync(outPath, JSON.stringify({
    runId,
    commitSha:   sha,
    generatedAt: new Date().toISOString(),
    summary: {
      total:    diagnostics.length,
      errors:   diagnostics.filter(d => d.severity === 'error').length,
      warnings: diagnostics.filter(d => d.severity === 'warning').length,
      ...meta,
    },
    topRiskFiles: topRisk,
    diagnostics,
  }, null, 2));

  // Also cache the run record in Redis
  await recordAuditRun({
    id:          runId,
    totalErrors: diagnostics.filter(d => d.severity === 'error').length,
    durationMs:  meta.durationMs,
    summary:     meta.bySource,
  });

  if (asJson) {
    process.stdout.write(JSON.stringify({ runId, total: diagnostics.length, topRiskFiles: topRisk }, null, 2));
  } else {
    printSummary(diagnostics, table, meta);
  }

  // Exit 1 if errors found (so CI can detect)
  const errorCount = diagnostics.filter(d => d.severity === 'error').length;
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[ff1:audit] fatal:', err);
  process.exit(2);
});
