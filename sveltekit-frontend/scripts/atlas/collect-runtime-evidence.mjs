#!/usr/bin/env node
/**
 * Collect runtime evidence for proof-depth lanes.
 *
 * Thin orchestrator:
 *   1. run-replay-breadth-50.mjs
 *   2. materialize-provenance-tree.mjs
 *   3. logger-parent-atlas-health.mjs
 *
 * This stays read-only and does not sample Qdrant points directly.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const RUNTIME_REPLAY = path.join(REPO_ROOT, 'scripts', 'atlas', 'run-replay-breadth-50.mjs');
const PROVENANCE_TREE = path.join(REPO_ROOT, 'scripts', 'atlas', 'materialize-provenance-tree.mjs');
const HEALTH_LOGGER = path.join(REPO_ROOT, 'scripts', 'atlas', 'logger-parent-atlas-health.mjs');

function parseCount(argv) {
  const match = argv.find((arg) => arg.startsWith('--count=') || arg.startsWith('--limit='));
  const raw = match ? Number(match.split('=')[1]) : Number(process.env.npm_config_count ?? process.env.npm_config_limit ?? 50);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 50;
}

function runNode(scriptPath, args = []) {
  const run = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  });
  return {
    status: run.status ?? 1,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
  };
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const count = parseCount(process.argv.slice(2));
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const replayRun = runNode(RUNTIME_REPLAY, [`--count=${count}`, '--packet-limit=5']);
  const provenanceRun = runNode(PROVENANCE_TREE, []);
  const healthRun = runNode(HEALTH_LOGGER, []);

  const replaySummary = await readJson(path.join(REPORTS_DIR, 'replay-trace-summary.json'));
  const provenanceReport = await readJson(path.join(REPORTS_DIR, 'provenance-tree.json'));
  const healthReport = await readJson(path.join(REPORTS_DIR, 'parent-atlas-health.json'));

  const combined = {
    generatedAt: new Date().toISOString(),
    count,
    status: [replayRun.status, provenanceRun.status, healthRun.status].every((status) => status === 0) ? 'PASS' : 'PARTIAL',
    steps: {
      replay: {
        status: replayRun.status === 0 ? 'PASS' : 'FAIL',
        script: path.relative(REPO_ROOT, RUNTIME_REPLAY).replace(/\\/g, '/'),
        stderr: replayRun.stderr.trim() || null,
      },
      provenance: {
        status: provenanceRun.status === 0 ? 'PASS' : 'FAIL',
        script: path.relative(REPO_ROOT, PROVENANCE_TREE).replace(/\\/g, '/'),
        stderr: provenanceRun.stderr.trim() || null,
      },
      health: {
        status: healthRun.status === 0 ? 'PASS' : 'FAIL',
        script: path.relative(REPO_ROOT, HEALTH_LOGGER).replace(/\\/g, '/'),
        stderr: healthRun.stderr.trim() || null,
      },
    },
    replaySummary: replaySummary ? {
      status: replaySummary.status ?? null,
      queryCount: replaySummary.queryCount ?? null,
      cacheHitRows: replaySummary.cacheProof?.warmRepeatCacheHitCount ?? null,
    } : null,
    provenanceSummary: provenanceReport ? {
      status: provenanceReport.status ?? null,
      queryCount: provenanceReport.summary?.queryCount ?? null,
      cacheHitRows: provenanceReport.summary?.cacheHitRows ?? null,
    } : null,
    healthSummary: healthReport ? {
      postgres: healthReport.services?.postgres?.status ?? null,
      redis: healthReport.services?.redis?.status ?? null,
      qdrant: healthReport.services?.qdrant?.status ?? null,
      neo4j: healthReport.services?.neo4j?.status ?? null,
    } : null,
    nextSafeAction: provenanceReport?.nextSafeAction
      ?? replaySummary?.nextSafeAction
      ?? 'Collect replay breadth, provenance, and health evidence again after the live cache warms.',
  };

  await fs.writeFile(path.join(REPORTS_DIR, 'collect-runtime-evidence.json'), `${JSON.stringify(combined, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(REPORTS_DIR, 'collect-runtime-evidence.md'),
    [
      '# Runtime Evidence Collection',
      '',
      `Generated: ${combined.generatedAt}`,
      `Status: ${combined.status}`,
      `Replay: ${combined.steps.replay.status}`,
      `Provenance: ${combined.steps.provenance.status}`,
      `Health: ${combined.steps.health.status}`,
      '',
      `Next safe action: ${combined.nextSafeAction}`,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify(combined, null, 2));
  if (combined.status !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[collect-runtime-evidence] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
