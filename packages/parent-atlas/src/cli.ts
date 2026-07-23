#!/usr/bin/env node
/**
 * atlas CLI — Parent Atlas audit gates, pipelines, and cache operations
 *
 * Commands:
 *   atlas gate identity          Run identity coverage gate
 *   atlas gate replay [--all] [--sample N]  Run replay validation gate
 *   atlas gate lineage           Run 7-layer lineage chain gate
 *   atlas gate chr97             Run CHR97 packet sub-chain gate (13 checks)
 *   atlas gate final             Run full 5-milestone final completion gate
 *   atlas gate production        Run production readiness gate (66 gates)
 *   atlas ingest                 Run atlas parent indexing pipeline
 *   atlas enrich karpathy [--dirty] [--limit N]  Run Karpathy GPU enrichment
 *   atlas cache hydrate [ace|topo|karpathy|all]  Hydrate Redis/Valkey ACE cache
 *   atlas mapreduce [ndjson|duckdb|all]          Run MapReduce pipelines
 *
 * Flags:
 *   --json          Output JSON only (no human-readable log)
 *   --dry-run       Print what would run without running it
 *   --help, -h      Show this help
 */

import { runIdentityGate } from './gates/identity.js';
import { runReplayGate } from './gates/replay.js';
import { runLineageGate, runChr97Gate } from './gates/lineage.js';
import { runFinalGate, runProductionReadinessGate } from './gates/final.js';
import { runIngest } from './pipelines/ingest.js';
import { runKarpathyEnrich } from './pipelines/enrich-karpathy.js';
import { runHydrateCache } from './pipelines/hydrate-cache.js';
import { runMapReduce } from './pipelines/mapreduce.js';
import type { GateReport } from './gates/types.js';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const dryRun = args.includes('--dry-run');
const passedArgs = args.filter(a => a !== '--json' && a !== '--dry-run');

function printHelp(): void {
  console.log(`
atlas — Parent Atlas CLI

Usage:
  atlas gate identity
  atlas gate replay [--all] [--sample <n>]
  atlas gate lineage
  atlas gate chr97
  atlas gate final
  atlas gate production
  atlas ingest [--script <name>]
  atlas enrich karpathy [--dirty] [--limit <n>]
  atlas cache hydrate [ace|topo|karpathy|all]
  atlas mapreduce [ndjson|duckdb|all]

Flags:
  --json       Structured JSON output only
  --dry-run    Show what would run without executing
  --help, -h   Show this message
  `.trim());
}

function printGateResult(report: GateReport): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  const isPass = report.overall === 'PASS';
  const icon = isPass ? '✅' : '❌';
  const passN = report.checks.filter(c => c.status === 'pass').length;
  const failN = report.checks.filter(c => c.status === 'fail').length;
  const skipN = report.checks.filter(c => c.status === 'skip').length;
  const skipSuffix = skipN > 0 ? ` / ${skipN} skip` : '';
  console.log(`\n${icon} ${report.overall}  (${passN} pass / ${failN} fail${skipSuffix})\n`);
  for (const c of report.checks) {
    const ci = c.status === 'pass' ? '  ✅' : c.status === 'warn' ? '  ⚠️ ' : c.status === 'skip' ? '  ⏭️ ' : '  ❌';
    console.log(`${ci} ${c.id.padEnd(40)} ${c.message}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  if (passedArgs.length === 0 || passedArgs[0] === '--help' || passedArgs[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const [cmd, sub, ...rest] = passedArgs;

  // ── gate ───────────────────────────────────────────────────────────────────
  if (cmd === 'gate') {
    if (!sub) {
      console.error('Usage: atlas gate <identity|replay|lineage|chr97|final|production>');
      process.exit(1);
    }

    let report: GateReport;

    switch (sub) {
      case 'identity': {
        console.log('[atlas gate identity] Running…');
        report = await runIdentityGate({ json: jsonMode });
        break;
      }

      case 'replay': {
        const allFlag = rest.includes('--all');
        const sampleIdx = rest.indexOf('--sample');
        const sample = sampleIdx >= 0 ? parseInt(rest[sampleIdx + 1] ?? '100', 10) : undefined;
        console.log(`[atlas gate replay] Running… (${allFlag ? 'all' : `sample=${sample ?? 100}`})`);
        report = await runReplayGate({ json: jsonMode, all: allFlag, sample });
        break;
      }

      case 'lineage': {
        console.log('[atlas gate lineage] Running…');
        report = await runLineageGate({ json: jsonMode });
        break;
      }

      case 'chr97': {
        console.log('[atlas gate chr97] Running…');
        report = await runChr97Gate({ json: jsonMode });
        break;
      }

      case 'final': {
        console.log('[atlas gate final] Running…');
        report = await runFinalGate({ json: jsonMode });
        break;
      }

      case 'production': {
        console.log('[atlas gate production] Running…');
        report = await runProductionReadinessGate({ json: jsonMode });
        break;
      }

      default: {
        console.error(`Unknown gate: ${sub}. Options: identity, replay, lineage, chr97, final, production`);
        process.exit(1);
      }
    }

    printGateResult(report);
    process.exit(report.overall === 'PASS' ? 0 : 1);
  }

  // ── ingest ─────────────────────────────────────────────────────────────────
  if (cmd === 'ingest') {
    const scriptIdx = rest.indexOf('--script');
    const script = scriptIdx >= 0 ? rest[scriptIdx + 1] : undefined;
    console.log('[atlas ingest] Running…');
    const result = runIngest({ script, dryRun, args: rest.filter((_, i) => {
      if (rest[i - 1] === '--script') return false;
      if (rest[i] === '--script') return false;
      return true;
    })});
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  // ── enrich ─────────────────────────────────────────────────────────────────
  if (cmd === 'enrich') {
    if (sub !== 'karpathy') {
      console.error(`Unknown enrich target: ${sub}. Options: karpathy`);
      process.exit(1);
    }
    const dirty = rest.includes('--dirty');
    const limitIdx = rest.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(rest[limitIdx + 1] ?? '50', 10) : undefined;
    console.log(`[atlas enrich karpathy] Running… (${dirty ? 'dirty/incremental' : `limit=${limit ?? 50}`})`);
    const result = runKarpathyEnrich({ dirty, limit, dryRun });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  // ── cache ──────────────────────────────────────────────────────────────────
  if (cmd === 'cache') {
    if (sub !== 'hydrate') {
      console.error(`Unknown cache command: ${sub}. Options: hydrate`);
      process.exit(1);
    }
    const validTargets = ['ace', 'topo', 'karpathy', 'all'] as const;
    type HydrateTarget = typeof validTargets[number];
    const rawTarget = rest[0];
    const target: HydrateTarget = (validTargets.includes(rawTarget as HydrateTarget) ? rawTarget : 'all') as HydrateTarget;
    console.log(`[atlas cache hydrate] Running… (target=${target})`);
    const result = runHydrateCache({ target, dryRun });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  // ── mapreduce ──────────────────────────────────────────────────────────────
  if (cmd === 'mapreduce') {
    const validJobs = ['ndjson', 'duckdb', 'all'] as const;
    type MRJob = typeof validJobs[number];
    const rawJob = sub ?? 'all';
    const job: MRJob = (validJobs.includes(rawJob as MRJob) ? rawJob : 'all') as MRJob;
    console.log(`[atlas mapreduce] Running… (job=${job})`);
    const result = runMapReduce({ job, dryRun, args: rest });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch(err => {
  console.error('[atlas] Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
