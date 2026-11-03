import { adaptGanLineageReadinessV1 } from './gan-lineage-readiness-adapter-v1.mjs';

const WRITE_LANES = ['postgres', 'redis', 'nats', 'qdrant', 'valkey', 'rabbitmq', 'graphify'];
const SELF_TESTS = [
  'acceptedMaliciousInputDetected',
  'wrongRejectionCodeDetected',
  'rejectedBenignControlDetected',
  'thrownErrorDetected',
  'healthyProbeStillPasses',
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasZeroWrites(value) {
  return isRecord(value) && WRITE_LANES.every((lane) => value[lane] === 0);
}

export function validateGanReadonlyProofInputs({ adversarial, inventory, lineageReadiness }) {
  if (adversarial === undefined || adversarial === null) throw new Error('Missing required --adversarial-receipt input');
  if (inventory === undefined || inventory === null) throw new Error('Missing required --inventory-receipt input');
  if (lineageReadiness === undefined || lineageReadiness === null) throw new Error('Missing required --lineage-readiness input');

  if (!isRecord(adversarial)
      || adversarial.schema !== 'atlas.gan-adversarial-proof.v1'
      || adversarial.status !== 'ADVERSARIAL_FIXTURES_PROVEN'
      || adversarial.proofLevel !== 'FIXTURE_PROVEN'
      || adversarial.canonicalAuthority !== false
      || adversarial.writesPerformed !== false
      || !hasZeroWrites(adversarial.writes)) {
    throw new Error('Invalid adversarial receipt contract');
  }

  const probeCount = adversarial.totals?.probes;
  const passedCount = adversarial.totals?.passed;
  if (!Number.isInteger(probeCount) || probeCount < 1 || passedCount !== probeCount
      || !Array.isArray(adversarial.results) || adversarial.results.length !== probeCount
      || adversarial.results.some((probe) => !isRecord(probe) || probe.passed !== true)
      || !isRecord(adversarial.selfTests)
      || SELF_TESTS.some((name) => adversarial.selfTests[name] !== true)) {
    throw new Error('Adversarial receipt does not prove all probes and self-tests passed');
  }

  if (!isRecord(inventory)
      || inventory.schema !== 'atlas.source-ref-inventory.v1'
      || inventory.status !== 'SOURCE_REF_INVENTORY_LIVE_READ_ONLY'
      || inventory.proofLevel !== 'LIVE_READ_ONLY'
      || inventory.canonicalAuthority !== false
      || inventory.writesPerformed !== false
      || !hasZeroWrites(inventory.writes)
      || inventory.transaction?.readOnly !== true
      || inventory.transaction?.rolledBack !== true
      || !Number.isInteger(inventory.totals?.rejected_by_legacy_rule)
      || inventory.totals.rejected_by_legacy_rule < 0) {
    throw new Error('Invalid source-ref inventory receipt contract');
  }

  if (!isRecord(lineageReadiness) || !adaptGanLineageReadinessV1(lineageReadiness)) {
    throw new Error('Invalid or unqualified lineage-readiness receipt');
  }

  return true;
}

export function hashReceiptSample(value, sha256) {
  if (value === null || value === undefined) return null;
  return sha256(String(value));
}
