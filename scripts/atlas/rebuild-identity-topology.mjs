#!/usr/bin/env node
/**
 * rebuild-identity-topology.mjs
 *
 * Phase D orchestrator: runs all identity alignment sub-steps in order.
 * Each step is guarded — SKIP if infra unavailable, FAIL if critical step errors.
 *
 * Sub-steps:
 *   1. karpathy:gpu             — Refresh Karpathy GPU blend scores (Redis)
 *   2. karpathy:backfill:qdrant — Write karpathy_attention + sourceRefHash to Qdrant
 *   3. neo4j:align:source-refs  — SET canonicalSourceRef + sourceRefHash on Neo4j nodes
 *   4. identity:warm            — Warm Valkey feature↔sourceRef cache
 *   5. identity:gate            — Run identity completion gate (pass/fail)
 *   6. (optional) qdrant-noise  — Dry-run noise audit for visibility
 *   7. (optional) replay tests  — identity-replay.test.mjs
 *   8. write summary report
 *
 * Usage:
 *   node scripts/atlas/rebuild-identity-topology.mjs              # dry-run (skips steps 2-4)
 *   node scripts/atlas/rebuild-identity-topology.mjs --apply      # run all write steps
 *   node scripts/atlas/rebuild-identity-topology.mjs --skip-karpathy  # skip GPU step (slow)
 *   node scripts/atlas/rebuild-identity-topology.mjs --skip-noise     # skip noise audit
 *   node scripts/atlas/rebuild-identity-topology.mjs --skip-replay    # skip replay tests
 *
 * Output:
 *   memory/exports/identity-topology-rebuild.json
 *   memory/exports/identity-topology-rebuild.md
 *
 * Exit code: 0 = all critical steps passed, 1 = one or more critical steps failed
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const FRONTEND = resolve(REPO, 'sveltekit-frontend');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_KARPATHY = args.includes('--skip-karpathy');
const SKIP_NOISE = args.includes('--skip-noise');
const SKIP_REPLAY = args.includes('--skip-replay');

console.log(`[topology-rebuild] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
if (!APPLY) {
  console.log('[topology-rebuild] Note: --apply not set; write steps will be skipped (dry-run where possible)');
}

const ts = new Date().toISOString();
const stepResults = [];

// ── Step runner ───────────────────────────────────────────────────────────────

function runStep({ name, critical, cmd, cwd, env, skip, skipReason }) {
  const start = Date.now();
  if (skip) {
    console.log(`\n[step:${name}] SKIP — ${skipReason}`);
    stepResults.push({ name, status: 'SKIP', reason: skipReason, durationMs: 0, critical });
    return 'SKIP';
  }

  console.log(`\n[step:${name}] Running: ${cmd.join(' ')}`);
  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd: cwd ?? REPO,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    encoding: 'utf8',
    timeout: 300_000, // 5 min max per step
    shell: false,
  });

  const durationMs = Date.now() - start;
  const exitCode = result.status ?? (result.error ? 1 : 0);

  let status;
  if (result.error) {
    status = 'ERROR';
    console.error(`[step:${name}] ERROR: ${result.error.message}`);
  } else if (exitCode !== 0) {
    status = critical ? 'FAIL' : 'WARN';
    console.error(`[step:${name}] ${status} (exit ${exitCode})`);
  } else {
    status = 'PASS';
    console.log(`[step:${name}] PASS (${Math.round(durationMs / 1000)}s)`);
  }

  stepResults.push({ name, status, exitCode, durationMs, critical });
  return status;
}

// ── Step 1: Karpathy GPU refresh ──────────────────────────────────────────────

runStep({
  name: 'karpathy-gpu',
  critical: false,
  skip: SKIP_KARPATHY,
  skipReason: '--skip-karpathy flag set',
  cmd: ['node', 'scripts/atlas/karpathy-gpu-enrich.mjs'],
  cwd: REPO,
});

// ── Step 2: Backfill Karpathy → Qdrant ───────────────────────────────────────

runStep({
  name: 'karpathy-backfill-qdrant',
  critical: false,
  skip: !APPLY,
  skipReason: 'DRY-RUN — add --apply to write to Qdrant',
  cmd: ['node', 'scripts/atlas/backfill-karpathy-attention-qdrant.mjs', '--apply'],
  cwd: REPO,
});

// ── Step 3: Neo4j canonical source ref alignment ──────────────────────────────

runStep({
  name: 'neo4j-align',
  critical: false,
  skip: !APPLY,
  skipReason: 'DRY-RUN — add --apply to write to Neo4j',
  cmd: ['node', 'scripts/atlas/align-neo4j-canonical-source-refs.mjs', '--apply'],
  cwd: REPO,
});

// ── Step 4: Warm Valkey feature identity cache ────────────────────────────────

runStep({
  name: 'identity-warm',
  critical: false,
  skip: !APPLY,
  skipReason: 'DRY-RUN — add --apply to write to Valkey',
  cmd: ['node', 'scripts/atlas/warm-feature-identity-cache.mjs', '--apply'],
  cwd: REPO,
});

// ── Step 5: Identity completion gate ─────────────────────────────────────────

runStep({
  name: 'identity-gate',
  critical: true,
  skip: false,
  skipReason: null,
  cmd: ['node', 'scripts/atlas/audit-identity-completion-gate.mjs'],
  cwd: REPO,
});

// ── Step 6: Qdrant noise audit (informational) ────────────────────────────────

runStep({
  name: 'qdrant-noise-audit',
  critical: false,
  skip: SKIP_NOISE,
  skipReason: '--skip-noise flag set',
  cmd: ['node', 'scripts/atlas/audit-qdrant-noise.mjs'],
  cwd: REPO,
});

// ── Step 7: Identity replay tests ─────────────────────────────────────────────

runStep({
  name: 'identity-replay',
  critical: false,
  skip: SKIP_REPLAY,
  skipReason: '--skip-replay flag set',
  cmd: ['node', '--test', 'sveltekit-frontend/scripts/tests/identity-replay.test.mjs'],
  cwd: REPO,
});

// ── Summary ───────────────────────────────────────────────────────────────────

const critical_failures = stepResults.filter(s => s.critical && s.status === 'FAIL');
const warnings = stepResults.filter(s => !s.critical && ['FAIL', 'WARN', 'ERROR'].includes(s.status));
const overall = critical_failures.length > 0 ? 'FAIL' : 'PASS';

const OUT_DIR = resolve(REPO, 'memory/exports');
mkdirSync(OUT_DIR, { recursive: true });

const report = {
  ts,
  mode: APPLY ? 'APPLY' : 'DRY_RUN',
  overall,
  steps: stepResults,
  critical_failures: critical_failures.map(s => s.name),
  warnings: warnings.map(s => `${s.name}:${s.status}`),
};

writeFileSync(resolve(OUT_DIR, 'identity-topology-rebuild.json'), JSON.stringify(report, null, 2) + '\n');

const mdLines = [
  `# Identity Topology Rebuild`,
  ``,
  `Generated: ${ts}`,
  `Mode: **${report.mode}**`,
  `**Overall: ${overall}**`,
  ``,
  `## Step Results`,
  ``,
  `| Step | Status | Critical | Duration |`,
  `|------|--------|----------|----------|`,
  ...stepResults.map(s => {
    const icon = s.status === 'PASS' ? '✅' : s.status === 'SKIP' ? '⏭' : s.status === 'FAIL' ? '❌' : '⚠️';
    return `| ${s.name} | ${icon} ${s.status} | ${s.critical ? 'Yes' : 'No'} | ${Math.round(s.durationMs / 1000)}s |`;
  }),
  ``,
  critical_failures.length > 0 ? `## Critical Failures\n\n${critical_failures.map(s => `- ${s.name}`).join('\n')}\n` : '',
];

writeFileSync(resolve(OUT_DIR, 'identity-topology-rebuild.md'), mdLines.join('\n') + '\n');

console.log('\n═══════════════════════════════════════════════════════════════');
for (const s of stepResults) {
  const icon = s.status === 'PASS' ? '✅' : s.status === 'SKIP' ? '⏭' : s.status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${s.name.padEnd(32)} ${s.status}`);
}
console.log('───────────────────────────────────────────────────────────────');
console.log(`  Overall: ${overall}`);
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Reports: memory/exports/identity-topology-rebuild.{json,md}`);
console.log('═══════════════════════════════════════════════════════════════');

process.exit(overall === 'FAIL' ? 1 : 0);
