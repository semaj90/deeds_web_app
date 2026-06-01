#!/usr/bin/env node
/**
 * run-promotion-queue.mjs
 *
 * Bounded, auditable execution queue for parent atlas promotion work.
 *
 * Safety contract:
 *   - Default mode is --dry-run (prints commands, does not execute)
 *   - bounded-apply items require --allow-apply flag
 *   - --limit is required for bounded-apply (refuses unbounded apply)
 *   - Stops on first failure unless --no-stop-on-failure
 *   - Prints exact command before running
 *   - Writes combined report to .tmp/promotion-queue-run.{json,md}
 *
 * Usage:
 *   node scripts/promotion/run-promotion-queue.mjs --dry-run
 *   node scripts/promotion/run-promotion-queue.mjs --dry-run --only knowledge-card-validation
 *   node scripts/promotion/run-promotion-queue.mjs --dry-run --from consolidation-claim-check
 *   node scripts/promotion/run-promotion-queue.mjs --allow-apply --only offline-synthesis-dry-run --limit 25
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const TMP_DIR = resolve(ROOT, 'sveltekit-frontend', '.tmp');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) { return args.includes(name); }
function arg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const DRY_RUN      = flag('--dry-run') || !flag('--allow-apply');
const ALLOW_APPLY  = flag('--allow-apply');
const ONLY_ID      = arg('--only');
const FROM_ID      = arg('--from');
const LIMIT        = arg('--limit') ? parseInt(arg('--limit'), 10) : null;
const OFFSET       = arg('--offset') ? parseInt(arg('--offset'), 10) : null;
const NO_STOP      = flag('--no-stop-on-failure');

// Safety: refuse bounded-apply without --allow-apply
if (!DRY_RUN && !ALLOW_APPLY) {
  console.error('[ERROR] --allow-apply is required for any non-dry-run execution.');
  console.error('        Add --dry-run to preview commands without executing.');
  process.exit(1);
}

// ── Load manifest ─────────────────────────────────────────────────────────────

const manifestPath = resolve(__dirname, 'promotion-queue.manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`[ERROR] Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const policy = manifest.safety_policy;

// ── Select items ──────────────────────────────────────────────────────────────

let items = manifest.queue;

if (ONLY_ID) {
  items = items.filter(i => i.id === ONLY_ID);
  if (items.length === 0) {
    console.error(`[ERROR] No queue item with id: ${ONLY_ID}`);
    console.error(`Available ids: ${manifest.queue.map(i => i.id).join(', ')}`);
    process.exit(1);
  }
}

if (FROM_ID && !ONLY_ID) {
  const fromIdx = items.findIndex(i => i.id === FROM_ID);
  if (fromIdx === -1) {
    console.error(`[ERROR] No queue item with id: ${FROM_ID}`);
    process.exit(1);
  }
  items = items.slice(fromIdx);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkPreflight(item) {
  const missing = [];
  for (const reportPath of (item.required_preflight_reports ?? [])) {
    const candidates = [
      resolve(ROOT, reportPath),
      resolve(ROOT, 'sveltekit-frontend', reportPath),
    ];
    if (!candidates.some(p => existsSync(p))) {
      missing.push(reportPath);
    }
  }
  return missing;
}

function buildCommand(item) {
  let cmd = item.command;
  // Inject --limit / --offset for bounded-apply items
  if (item.mode === 'bounded-apply' && LIMIT !== null) {
    if (!cmd.includes('--limit')) cmd += ` --limit ${LIMIT}`;
    if (OFFSET !== null && !cmd.includes('--offset')) cmd += ` --offset ${OFFSET}`;
  }
  return cmd;
}

function runCommand(item, cmd) {
  const cwd = resolve(ROOT, item.cwd === '.' ? '' : item.cwd);
  // Split command into program + args
  const parts = cmd.split(/\s+/);
  const prog = parts[0];
  const progArgs = parts.slice(1);

  const result = spawnSync(prog, progArgs, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  });

  return {
    exit_code: result.status ?? 1,
    signal: result.signal ?? null,
    error: result.error ? result.error.message : null,
  };
}

// ── Main run ──────────────────────────────────────────────────────────────────

const runResults = [];
let anyFailure = false;

console.log('\n=== Promotion Queue Runner ===');
console.log(`Mode:         ${DRY_RUN ? 'DRY-RUN (preview only)' : 'EXECUTE'}`);
console.log(`Items:        ${items.length} selected`);
if (ONLY_ID)  console.log(`Filter:       --only ${ONLY_ID}`);
if (FROM_ID)  console.log(`From:         --from ${FROM_ID}`);
if (LIMIT)    console.log(`Limit:        ${LIMIT}`);
if (OFFSET)   console.log(`Offset:       ${OFFSET}`);
console.log('');

for (const item of items) {
  console.log(`\n─── [${item.id}] ───────────────────────────────────────`);
  console.log(`Phase:    ${item.phase}`);
  console.log(`Mode:     ${item.mode}`);
  console.log(`Desc:     ${item.description.slice(0, 100)}${item.description.length > 100 ? '…' : ''}`);

  // Safety check: bounded-apply without --allow-apply
  if (item.mode === 'bounded-apply' && !ALLOW_APPLY) {
    const msg = `SKIPPED — mode is bounded-apply and --allow-apply was not passed`;
    console.log(`⚠️  ${msg}`);
    runResults.push({ id: item.id, status: 'SKIPPED', reason: msg, exit_code: null });
    continue;
  }

  // Safety check: bounded-apply without --limit
  if (item.mode === 'bounded-apply' && LIMIT === null) {
    const msg = `REFUSED — bounded-apply requires --limit to prevent unbounded writes`;
    console.error(`❌  ${msg}`);
    runResults.push({ id: item.id, status: 'REFUSED', reason: msg, exit_code: null });
    anyFailure = true;
    if ((item.stop_on_failure || policy.stop_on_first_failure) && !NO_STOP) break;
    continue;
  }

  // Preflight check
  const missingPreflights = checkPreflight(item);
  if (missingPreflights.length > 0) {
    const msg = `PREFLIGHT MISSING: ${missingPreflights.join(', ')}`;
    console.warn(`⚠️  ${msg}`);
    runResults.push({ id: item.id, status: 'PREFLIGHT_MISSING', reason: msg, missing_reports: missingPreflights, exit_code: null });
    if ((item.stop_on_failure || policy.stop_on_first_failure) && !NO_STOP) {
      console.warn('    Stopping (preflight required). Pass --no-stop-on-failure to continue anyway.');
      break;
    }
    continue;
  }

  const cmd = buildCommand(item);
  console.log(`Command:  ${cmd}`);
  console.log(`CWD:      ${item.cwd}`);

  if (item.safety_notes?.length) {
    for (const note of item.safety_notes) {
      console.log(`  ⚠  ${note}`);
    }
  }

  if (DRY_RUN) {
    console.log(`  → DRY-RUN: command not executed`);
    runResults.push({ id: item.id, status: 'DRY-RUN', command: cmd, exit_code: null });
    continue;
  }

  // Execute
  console.log('\n  Executing...');
  const execResult = runCommand(item, cmd);

  const status = execResult.exit_code === 0 ? 'OK' : 'FAIL';
  const icon = status === 'OK' ? '✅' : '❌';
  console.log(`\n  ${icon} ${status} (exit ${execResult.exit_code})`);
  if (execResult.error) console.error(`  Error: ${execResult.error}`);

  runResults.push({ id: item.id, status, command: cmd, ...execResult });

  if (status === 'FAIL') {
    anyFailure = true;
    if ((item.stop_on_failure || policy.stop_on_first_failure) && !NO_STOP) {
      console.error('\n  Stopping queue (stop_on_failure). Pass --no-stop-on-failure to continue.');
      break;
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n\n=== Run Summary ===\n');
for (const r of runResults) {
  const icon = r.status === 'OK' ? '✅' : r.status === 'DRY-RUN' ? '🔍' : r.status === 'SKIPPED' ? '⏭' : '❌';
  console.log(`  ${icon} [${r.id}]  ${r.status}${r.exit_code !== null ? ` (exit ${r.exit_code})` : ''}`);
}

if (DRY_RUN) {
  console.log('\n🔍  Dry-run complete. No commands were executed.');
  console.log('    Add --allow-apply to execute bounded-apply items.');
} else if (anyFailure) {
  console.log('\n❌  Queue completed with failures.');
} else {
  console.log('\n✅  Queue completed successfully.');
}

console.log('\nNext safe command:');
console.log('  node scripts/promotion/run-promotion-queue.mjs --dry-run --only knowledge-card-validation');

// ── Write reports ─────────────────────────────────────────────────────────────

mkdirSync(TMP_DIR, { recursive: true });

const jsonReport = {
  generated_at: new Date().toISOString(),
  mode: DRY_RUN ? 'dry-run' : 'execute',
  only_id: ONLY_ID,
  from_id: FROM_ID,
  limit: LIMIT,
  offset: OFFSET,
  allow_apply: ALLOW_APPLY,
  any_failure: anyFailure,
  results: runResults,
};

writeFileSync(
  resolve(TMP_DIR, 'promotion-queue-run.json'),
  JSON.stringify(jsonReport, null, 2) + '\n',
  'utf8',
);

const mdLines = [
  '# Promotion Queue Run Report',
  '',
  `**Generated:** ${jsonReport.generated_at}`,
  `**Mode:** ${DRY_RUN ? '🔍 Dry-run' : '🚀 Execute'}`,
  `**Overall:** ${anyFailure ? '❌ FAILURE' : DRY_RUN ? '🔍 Dry-run (no execution)' : '✅ OK'}`,
  '',
  '## Results',
  '',
  '| ID | Status | Exit |',
  '|----|--------|------|',
];

for (const r of runResults) {
  const icon = r.status === 'OK' ? '✅' : r.status === 'DRY-RUN' ? '🔍' : r.status === 'SKIPPED' ? '⏭' : '❌';
  mdLines.push(`| ${r.id} | ${icon} ${r.status} | ${r.exit_code ?? '—'} |`);
}

mdLines.push(
  '',
  '## Next Commands',
  '',
  '```bash',
  '# Run full dry-run',
  'node scripts/promotion/run-promotion-queue.mjs --dry-run',
  '',
  '# Run individual audit item',
  'node scripts/promotion/run-promotion-queue.mjs --dry-run --only knowledge-card-validation',
  '',
  '# Run bounded apply (after audits pass)',
  '# node scripts/promotion/run-promotion-queue.mjs --allow-apply --only offline-synthesis-dry-run --limit 25',
  '```',
  '',
);

writeFileSync(
  resolve(TMP_DIR, 'promotion-queue-run.md'),
  mdLines.join('\n') + '\n',
  'utf8',
);

console.log('\nReports:');
console.log('  .tmp/promotion-queue-run.json');
console.log('  .tmp/promotion-queue-run.md\n');

process.exitCode = anyFailure ? 1 : 0;
