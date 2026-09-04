#!/usr/bin/env node
/**
 * latent-phase16-fanout-step.mjs
 *
 * LATENT-PHASE16-ORCHESTRATOR-BINDING-01: the fail-closed handoff between the graphify:daily
 * phase8 fanout (scripts/startup/run-atlas-phase8-fanout.mjs, step 6/11: `atlas:phase16:latent:
 * dry`/`:apply`) and the revision-qualified latent producer.
 *
 * The fanout invokes every step uniformly as bare `npm run <script>` (no per-step args --
 * confirmed by reading run-atlas-phase8-fanout.mjs's runStep()). This script is what those two
 * npm scripts now point at: it resolves ONE coherent SemanticCorpusBundleV1 (by running
 * SEM768-CORPUS-BUNDLE-01 fresh, read-only) and the NestedSemanticAutoencoder's model checksum
 * (from the checked-in training receipt), then hands both to
 * latent256-revision-qualified-wrapper.mts. The fanout therefore resolves ONE admitted artifact
 * reference, not four-to-eight independent CLI values that could each originate from a different
 * "world" -- exactly the ownership correction this gate exists to make.
 *
 * Fail-closed, never synthetic: if bundle resolution fails or does not reach
 * ADMITTED_REPRESENTATION_INPUT_ONLY, this script exits non-zero BEFORE spawning the wrapper at
 * all. It never derives revisions from timestamps, working-tree state, candidate snapshots,
 * Qdrant payloads, or ordinal maps -- SEM768-CORPUS-BUNDLE-01 already enforces that.
 *
 * Usage:
 *   node scripts/atlas/latent-phase16-fanout-step.mjs --dry-run
 *   node scripts/atlas/latent-phase16-fanout-step.mjs --apply --limit 200
 *
 * `--apply` with no `--limit` is intentionally left to fail closed inside the wrapper itself
 * (APPLY_REQUIRES_LIMIT) -- this script does not invent a default limit. Until
 * LATENT-PHASE16-CANARY-01 proves determinism and an operator decides a real apply scale, the
 * fanout's `atlas:phase16:latent:apply` step legitimately halts here on that guard, safely.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const BUNDLE_RESOLVER = path.resolve(__dirname, 'sem768-corpus-bundle-01.mts');
const BUNDLE_PATH = path.resolve(ROOT, 'docs/reports/sem768-corpus-bundle-01.json');
const WRAPPER = path.resolve(__dirname, 'latent256-revision-qualified-wrapper.mts');
const RECEIPT_PATH = path.resolve(ROOT, 'docs/reports/latent-autoencoder-training-receipt-v3-full01.json');

const passthroughArgs = process.argv.slice(2);

function fail(code, message) {
  console.error(`\n❌ LATENT_PHASE16_ORCHESTRATOR_BINDING_FAIL_CLOSED [${code}]: ${message}\n`);
  process.exit(1);
}

function run(cmd, args) {
  // shell: true is required on Windows -- npx/npm are .cmd shims, not raw executables, and
  // spawnSync silently fails to launch them without shell resolution (matches the existing
  // pattern in scripts/startup/run-atlas-phase8-fanout.mjs's own runStep()).
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: true });
  if (result.error) {
    console.error(`❌ Failed to spawn ${cmd}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

// ── Step 1: resolve a fresh, admitted SemanticCorpusBundleV1 (read-only) ──
const resolveExit = run('npx', ['tsx', BUNDLE_RESOLVER]);
if (resolveExit !== 0) {
  fail('SEMANTIC_CORPUS_BUNDLE_MISSING', 'SEM768-CORPUS-BUNDLE-01 did not run successfully -- refusing to spawn Phase 16.');
}
if (!existsSync(BUNDLE_PATH)) {
  fail('SEMANTIC_CORPUS_BUNDLE_MISSING', `Bundle resolver exited 0 but ${BUNDLE_PATH} does not exist.`);
}
const bundleReport = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));
if (bundleReport.status !== 'ADMITTED_REPRESENTATION_INPUT_ONLY') {
  fail('SEMANTIC_CORPUS_BUNDLE_INVALID',
    `Bundle status is ${bundleReport.status}, not ADMITTED_REPRESENTATION_INPUT_ONLY -- refusing to spawn Phase 16.`);
}

// ── Step 2: resolve the NestedSemanticAutoencoder model checksum (checked-in receipt, not a fanout arg) ──
if (!existsSync(RECEIPT_PATH)) {
  fail('MODEL_CHECKSUM_MISMATCH', `Training receipt not found: ${RECEIPT_PATH}`);
}
const receipt = JSON.parse(readFileSync(RECEIPT_PATH, 'utf8'));
const modelChecksum = String(receipt.model_checksum ?? '').toLowerCase();
if (!/^[a-f0-9]{64}$/i.test(modelChecksum)) {
  fail('MODEL_CHECKSUM_MISMATCH', `Training receipt's model_checksum is not a valid 64-hex string: ${modelChecksum}`);
}

console.log(JSON.stringify({
  event: 'latent_phase16_orchestrator_binding_resolved',
  bundlePath: BUNDLE_PATH,
  bundleStatus: bundleReport.status,
  bundleEligibleCount: bundleReport.bundle?.eligibleCount,
  sourceAuthorityStatus: bundleReport.bundle?.sourceAuthorityStatus,
  modelChecksum,
}));

// ── Step 3: invoke the wrapper with the resolved artifact reference ──
const wrapperArgs = [
  'tsx', WRAPPER,
  '--corpus-bundle', BUNDLE_PATH,
  '--model-checksum', modelChecksum,
  ...passthroughArgs,
];
const wrapperExit = run('npx', wrapperArgs);
process.exit(wrapperExit);
