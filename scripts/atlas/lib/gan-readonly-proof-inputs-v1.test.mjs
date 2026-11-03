import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGanReadonlyProofInputs, hashReceiptSample } from './gan-readonly-proof-inputs-v1.mjs';

const zeroWrites = { postgres: 0, redis: 0, nats: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 };

function validInputs() {
  return {
    adversarial: {
      schema: 'atlas.gan-adversarial-proof.v1', status: 'ADVERSARIAL_FIXTURES_PROVEN', proofLevel: 'FIXTURE_PROVEN',
      canonicalAuthority: false, writesPerformed: false, writes: { ...zeroWrites },
      totals: { probes: 1, passed: 1 }, results: [{ passed: true }],
      selfTests: {
        acceptedMaliciousInputDetected: true, wrongRejectionCodeDetected: true,
        rejectedBenignControlDetected: true, thrownErrorDetected: true, healthyProbeStillPasses: true,
      },
    },
    inventory: {
      schema: 'atlas.source-ref-inventory.v1', status: 'SOURCE_REF_INVENTORY_LIVE_READ_ONLY', proofLevel: 'LIVE_READ_ONLY',
      canonicalAuthority: false, writesPerformed: false, writes: { ...zeroWrites },
      transaction: { readOnly: true, rolledBack: true }, totals: { rejected_by_legacy_rule: 0 },
    },
    lineageReadiness: {
      schema: 'atlas.mapreduce-chunk-readiness-receipt.v2', canonicalAuthority: false,
      writes: { postgres: 0 }, measured: { inputConserved: true, chunkStates: { CHUNK_REVISION_QUALIFIED: 1 }, packetStates: {} },
    },
  };
}

test('accepts complete, explicitly supplied proof receipt contracts', () => {
  assert.equal(validateGanReadonlyProofInputs(validInputs()), true);
});

test('rejects missing inputs before the caller can connect to PostgreSQL', () => {
  assert.throws(() => validateGanReadonlyProofInputs({}), /Missing required --adversarial-receipt/);
});

test('rejects adversarial receipts that claim success with a failed probe', () => {
  const inputs = validInputs();
  inputs.adversarial.results[0].passed = false;
  assert.throws(() => validateGanReadonlyProofInputs(inputs), /all probes and self-tests passed/);
});

test('rejects inventory receipts that are not read-only and rolled back', () => {
  const inputs = validInputs();
  inputs.inventory.transaction.rolledBack = false;
  assert.throws(() => validateGanReadonlyProofInputs(inputs), /inventory receipt contract/);
});

test('rejects lineage receipts that do not meet the readiness adapter contract', () => {
  const inputs = validInputs();
  inputs.lineageReadiness = { schema: 'unknown' };
  assert.throws(() => validateGanReadonlyProofInputs(inputs), /lineage-readiness receipt/);
});

test('hashes report samples and preserves null as null', () => {
  assert.equal(hashReceiptSample('private/source/path.ts', (value) => `hash:${value}`), 'hash:private/source/path.ts');
  assert.equal(hashReceiptSample(null, () => 'unexpected'), null);
});
