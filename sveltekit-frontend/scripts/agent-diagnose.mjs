#!/usr/bin/env node
/**
 * agent-diagnose.mjs
 *
 * Unified failure diagnosis CLI.  Pulls together:
 *   - Last failed vitest/svelte-check run (from Postgres trace_runs)
 *   - Affected files and symbols (from trace_events + static rg scan)
 *   - Related tests (rg --include "*.spec.ts" for affected files)
 *   - Hot Redis error keys (trace:hot_errors)
 *   - Ranked context bundle for Gemma / Claude
 *
 * Output:
 *   - Console: ranked context bundle
 *   - logs/agent-diagnose/latest.json: machine-readable output
 *
 * Usage:
 *   node scripts/agent-diagnose.mjs
 *   node scripts/agent-diagnose.mjs --last-failure      # focus on latest failed run
 *   node scripts/agent-diagnose.mjs --file src/lib/server/ace/context-assembler.ts
 *   node scripts/agent-diagnose.mjs --symbol assembleACEContext
 *   node scripts/agent-diagnose.mjs --json              # JSON output only
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ARGS = process.argv.slice(2);
const FOCUS_FILE   = argValue('--file');
const FOCUS_SYMBOL = argValue('--symbol');
const JSON_ONLY    = ARGS.includes('--json');
const LAST_FAILURE = ARGS.includes('--last-failure') || (!FOCUS_FILE && !FOCUS_SYMBOL);

function argValue(flag) {
  const i = ARGS.indexOf(flag);
  return i !== -1 && ARGS[i + 1] ? ARGS[i + 1] : null;
}

const color = {
  green:  s => JSON_ONLY ? s : `\x1b[32m${s}\x1b[0m`,
  red:    s => JSON_ONLY ? s : `\x1b[31m${s}\x1b[0m`,
  yellow: s => JSON_ONLY ? s : `\x1b[33m${s}\x1b[0m`,
  cyan:   s => JSON_ONLY ? s : `\x1b[36m${s}\x1b[0m`,
  dim:    s => JSON_ONLY ? s : `\x1b[2m${s}\x1b[0m`,
  bold:   s => JSON_ONLY ? s : `\x1b[1m${s}\x1b[0m`,
};

const log = (...a) => { if (!JSON_ONLY) console.log(...a); };

// ── Step 1: Scan vitest/svelte-check error logs ───────────────────────────────

function scanLastTestLogs() {
  const results = { errors: [], failingFiles: [], failingTests: [] };

  // Check logs/task-output/ for latest runs
  const taskLogDir = join(ROOT, 'logs', 'task-output');
  if (existsSync(taskLogDir)) {
    const files = readdirSync(taskLogDir).filter(f => f.endsWith('.log'));
    for (const f of files.slice(-3)) { // last 3 log files
      try {
        const content = readFileSync(join(taskLogDir, f), 'utf8');
        // vitest error pattern: "FAIL tests/foo.spec.ts"
        const failMatches = [...content.matchAll(/^FAIL\s+([\w/.-]+\.spec\.ts)/gm)];
        for (const m of failMatches) results.failingTests.push(m[1]);
        // svelte-check pattern: "src/lib/server/foo.ts:42:1 - Error"
        const errMatches = [...content.matchAll(/(src\/[^\s:]+\.(?:ts|svelte)):(\d+):(\d+)/g)];
        for (const m of errMatches) results.failingFiles.push(m[1]);
      } catch { /* skip unreadable */ }
    }
  }

  // Check logs/trace-full-loop/latest.json
  const traceLatest = join(ROOT, 'logs', 'trace-full-loop', 'latest.json');
  if (existsSync(traceLatest)) {
    try {
      const data = JSON.parse(readFileSync(traceLatest, 'utf8'));
      if (data.issues > 0) {
        for (const r of (data.results ?? [])) {
          if (r.issues?.length > 0) {
            results.errors.push({
              source: 'trace-full-loop',
              id: r.id,
              issues: r.issues,
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  return results;
}

// ── Step 2: Static graph — who imports the failing file? ──────────────────────

function findImporters(filePath) {
  if (!filePath) return [];
  const stem = filePath.replace(/^src\//, '').replace(/\.ts$/, '');
  try {
    const out = spawnSync('rg', [
      '--no-heading', '-l',
      `from.*${stem.split('/').pop()}`,
      'src/', '--include=*.ts', '--include=*.svelte',
    ], { cwd: ROOT, encoding: 'utf8' });
    return (out.stdout ?? '').split('\n').filter(Boolean).slice(0, 10);
  } catch { return []; }
}

function findRelatedTests(filePath) {
  if (!filePath) return [];
  const stem = filePath.split('/').pop()?.replace(/\.ts$/, '') ?? '';
  try {
    const out = spawnSync('rg', [
      '--no-heading', '-l',
      stem,
      'tests/', '--include=*.spec.ts', '--include=*.test.ts',
    ], { cwd: ROOT, encoding: 'utf8' });
    return (out.stdout ?? '').split('\n').filter(Boolean).slice(0, 6);
  } catch { return []; }
}

// ── Step 3: Redis hot errors ──────────────────────────────────────────────────

async function getRedisHotErrors() {
  // Try via SvelteKit dev server stats endpoint
  try {
    const resp = await fetch('http://localhost:5173/api/cache/exact-match/stats', {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      const data = await resp.json();
      return { redisUp: true, stats: data.stats };
    }
  } catch { /* Redis or dev server not up */ }
  return { redisUp: false, stats: null };
}

// ── Step 4: Postgres recent errors ───────────────────────────────────────────

async function getPostgresFailures() {
  // Query via the dev server API if available
  try {
    const resp = await fetch('http://localhost:5173/api/code-intel/status', {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      const data = await resp.json();
      return {
        available: true,
        recentTraceRuns: data.recentTraceRuns ?? [],
        status: data.status,
      };
    }
  } catch { /* dev server unavailable */ }
  return { available: false, recentTraceRuns: [] };
}

// ── Step 5: Generate ranked context bundle ────────────────────────────────────

function rankFiles(failingFiles, importers, relatedTests) {
  const fileScore = {};
  const bump = (f, w) => { fileScore[f] = (fileScore[f] ?? 0) + w; };

  for (const f of failingFiles) bump(f, 3.0);   // directly failing = highest weight
  for (const f of importers)    bump(f, 1.5);   // importers = likely affected
  for (const f of relatedTests) bump(f, 1.0);   // related tests = verify here

  return Object.entries(fileScore)
    .sort(([, a], [, b]) => b - a)
    .map(([f, score]) => ({ file: f, score: Math.round(score * 10) / 10 }));
}

function buildTestCommands(failingTests, relatedTests) {
  const all = [...new Set([...failingTests, ...relatedTests])];
  if (all.length === 0) return ['npm test'];
  if (all.length === 1) return [`npx vitest run ${all[0]}`];
  return [
    `npx vitest run ${all.slice(0, 3).join(' ')}`,
    'npm test',
  ];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`\n${color.bold(color.cyan('agent:diagnose'))} — Unified failure diagnosis\n`);

  const focusFile   = FOCUS_FILE;
  const focusSymbol = FOCUS_SYMBOL;

  // Step 1: Scan test logs
  log(color.dim('→ Scanning test logs…'));
  const logScan = scanLastTestLogs();

  // Step 2: Static graph for focus file or discovered failing files
  const primaryFiles = focusFile
    ? [focusFile]
    : [...new Set(logScan.failingFiles)].slice(0, 5);

  log(color.dim(`→ Static graph scan for ${primaryFiles.length} file(s)…`));
  const importers = primaryFiles.flatMap(findImporters);
  const relatedTests = [
    ...logScan.failingTests,
    ...primaryFiles.flatMap(findRelatedTests),
  ];

  // Step 3: Redis hot errors (non-blocking)
  log(color.dim('→ Checking Redis…'));
  const redisState = await getRedisHotErrors();

  // Step 4: Postgres failures (non-blocking)
  log(color.dim('→ Checking Postgres trace_runs…'));
  const pgState = await getPostgresFailures();

  // Step 5: Build output
  const rankedFiles = rankFiles(primaryFiles, importers, relatedTests);
  const testCommands = buildTestCommands(logScan.failingTests, relatedTests);

  const output = {
    diagnosedAt: new Date().toISOString(),
    focus: { file: focusFile, symbol: focusSymbol },
    failureSummary: {
      testsFound:    logScan.errors.length > 0 || logScan.failingTests.length > 0,
      failingTests:  [...new Set(logScan.failingTests)].slice(0, 6),
      errorSources:  logScan.errors.slice(0, 4),
      dbTraceRuns:   pgState.recentTraceRuns.slice(0, 3),
    },
    rankedFiles,
    relatedTests: [...new Set(relatedTests)].slice(0, 6),
    importers:    [...new Set(importers)].slice(0, 8),
    redisState,
    recommendations: {
      testCommands,
      patchScope:      primaryFiles.slice(0, 3),
      verifyAfterFix:  [...new Set(relatedTests)].slice(0, 3),
      notes: [
        primaryFiles.length === 0
          ? 'No failing files detected from logs. Run npm test first.'
          : `Focus patch on: ${primaryFiles[0]}`,
        rankedFiles.length > 0
          ? `Top ranked file: ${rankedFiles[0].file} (score ${rankedFiles[0].score})`
          : 'Run graphify:map to build static importance scores.',
        !redisState.redisUp
          ? 'Redis unavailable — hot error cache not readable.'
          : `Redis up. Cache stats: ${JSON.stringify(redisState.stats ?? {})}`,
      ],
    },
  };

  // ── Print ─────────────────────────────────────────────────────────────────

  if (JSON_ONLY) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    log(`\n${color.bold('Failure Summary')}`);
    log(`  Failing tests:  ${output.failureSummary.failingTests.join(', ') || '(none detected)'}`);
    log(`  Error sources:  ${output.failureSummary.errorSources.length}`);

    if (rankedFiles.length > 0) {
      log(`\n${color.bold('Ranked Files')} ${color.dim('(static + runtime importance)')}`);
      for (const { file, score } of rankedFiles.slice(0, 8)) {
        log(`  ${color.yellow(score.toFixed(1).padStart(4))}  ${file}`);
      }
    }

    if (relatedTests.length > 0) {
      log(`\n${color.bold('Related Tests')}`);
      for (const t of [...new Set(relatedTests)].slice(0, 6)) {
        log(`  ${color.dim('•')} ${t}`);
      }
    }

    log(`\n${color.bold('Recommended Commands')}`);
    for (const cmd of testCommands) {
      log(`  ${color.green('$')} ${cmd}`);
    }

    if (output.recommendations.notes.length > 0) {
      log(`\n${color.bold('Notes')}`);
      for (const n of output.recommendations.notes) {
        log(`  ${color.dim('→')} ${n}`);
      }
    }

    log('');
  }

  // ── Persist ───────────────────────────────────────────────────────────────

  const outDir = join(ROOT, 'logs', 'agent-diagnose');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(output, null, 2));
  log(color.dim(`Saved to logs/agent-diagnose/latest.json`));
  log('');
}

main().catch(err => {
  console.error('agent-diagnose error:', err.message);
  process.exit(1);
});
