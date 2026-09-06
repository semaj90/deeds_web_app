#!/usr/bin/env node

/**
 * WORKSTATION-ORNITH-LIVE-FIXTURE-01 proof.
 *
 * Proves the live fixture generation path works AND that it never touched
 * the production dry-run/plan-only evidence trail. The before/after hashes
 * are taken by THIS script around its own invocation of the runner, so the
 * atomicity of the "unchanged" claim does not depend on run order across
 * separate commands.
 *
 * A runtime-unavailable result (llama-server unreachable, model not loaded)
 * is reported as NOT_PROVEN with a non-zero exit -- it is never treated as a
 * passing/skippable outcome. Fail-closed behavior for the *builder* is a
 * separate, already-proven concern (the dry-run proof); this gate exists
 * specifically to prove live function, not rejection.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(root, 'scripts', 'atlas', 'run-parent-atlas-workstation-ornith-synthesis-fixture-v1.mjs');
const fixtureReceiptPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-fixture-v1.json');
const dryRunReceiptPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-dry-v1.json');
const dryRunProofPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-proof-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-ornith-synthesis-fixture-proof-v1.json');

const sha256File = (filePath) => (fs.existsSync(filePath) ? `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}` : null);

// Preimage recorded by THIS proof harness, before it invokes the runner.
const beforeDryRunHash = sha256File(dryRunReceiptPath);
const beforeDryRunProofHash = sha256File(dryRunProofPath);

const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
const fixtureReceipt = fs.existsSync(fixtureReceiptPath) ? JSON.parse(fs.readFileSync(fixtureReceiptPath, 'utf8')) : null;

const afterDryRunHash = sha256File(dryRunReceiptPath);
const afterDryRunProofHash = sha256File(dryRunProofPath);

const dryRunReceiptUntouched = beforeDryRunHash === afterDryRunHash;
const dryRunProofUntouched = beforeDryRunProofHash === afterDryRunProofHash;

const runtimeUnavailable = fixtureReceipt?.status === 'RUNTIME_UNAVAILABLE';

const generationProven = fixtureReceipt?.status === 'LIVE_FIXTURE_PROVEN'
  && fixtureReceipt?.modelCalls === 1
  && fixtureReceipt?.generated === true
  && typeof fixtureReceipt?.outputChecksum === 'string'
  && typeof fixtureReceipt?.requestChecksum === 'string'
  && typeof fixtureReceipt?.responseChecksum === 'string'
  && fixtureReceipt?.streamed === true
  && /^ornith-1\.5/i.test(fixtureReceipt?.loadedModel ?? '')
  && fixtureReceipt?.canonicalAuthority === false
  && fixtureReceipt?.productionPlanPath === false
  && fixtureReceipt?.writes?.taskLedgers === 0
  && fixtureReceipt?.writes?.databases === 0
  && fixtureReceipt?.writes?.qdrant === 0
  && fixtureReceipt?.writes?.neo4j === 0
  && fixtureReceipt?.writes?.cache === 0
  && fixtureReceipt?.writes?.modelCalls === 1;

let status;
if (runtimeUnavailable) {
  status = 'LIVE_RUNTIME_UNAVAILABLE';
} else if (generationProven && dryRunReceiptUntouched && dryRunProofUntouched) {
  status = 'PROVEN';
} else {
  status = 'NOT_PROVEN';
}

const proof = {
  schema: 'atlas.parent-atlas-workstation-ornith-synthesis-fixture-proof.v1',
  gate: 'WORKSTATION-ORNITH-LIVE-FIXTURE-01',
  status,
  proofPassed: status === 'PROVEN',
  runnerExitCode: result.status,
  generationProven,
  loadedModel: fixtureReceipt?.loadedModel ?? null,
  outputChecksum: fixtureReceipt?.outputChecksum ?? null,
  requestChecksum: fixtureReceipt?.requestChecksum ?? null,
  responseChecksum: fixtureReceipt?.responseChecksum ?? null,
  finishReason: fixtureReceipt?.finishReason ?? null,
  isolation: {
    dryRunReceiptUntouched,
    dryRunProofUntouched,
    dryRunReceiptChecksumBefore: beforeDryRunHash,
    dryRunReceiptChecksumAfter: afterDryRunHash,
    dryRunProofChecksumBefore: beforeDryRunProofHash,
    dryRunProofChecksumAfter: afterDryRunProofHash,
  },
  productionAdoption: 'BLOCKED_CURRENT_LINEAGE',
  evidence: [
    'scripts/atlas/lib/workstation-ornith-adapter.mjs',
    'scripts/atlas/run-parent-atlas-workstation-ornith-synthesis-fixture-v1.mjs',
    'docs/reports/parent-atlas-workstation-ornith-synthesis-fixture-v1.json',
  ],
};
fs.writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...proof, out: outPath }, null, 2));
if (proof.status !== 'PROVEN') process.exit(1);
