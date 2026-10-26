import { STAGE5_PAGERANK_CONFIGURATION_V1 } from './stage5-pagerank-core-v1.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/i;
const HASH = /^[a-f0-9]{64}$/i;

function matchesExpectedConfiguration(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return false;
  const expectedEntries = Object.entries(STAGE5_PAGERANK_CONFIGURATION_V1).sort(([left], [right]) => left.localeCompare(right));
  const actualEntries = Object.entries(configuration).sort(([left], [right]) => left.localeCompare(right));
  return expectedEntries.length === actualEntries.length
    && expectedEntries.every(([key, value], index) => actualEntries[index]?.[0] === key && actualEntries[index]?.[1] === value);
}

export function comparePageRankReferenceV1({ localScores, reference, snapshotId, topologyHash, tolerance = 1e-8 }) {
  const reasons = [];
  if (!Number.isFinite(tolerance) || tolerance < 0) reasons.push('NETWORKX_REFERENCE_TOLERANCE_INVALID');
  if (!reference || reference.status !== 'NETWORKX_REFERENCE_PROVEN' || reference.engine !== 'networkx') reasons.push('NETWORKX_REFERENCE_RECEIPT_INVALID');
  if (reference?.snapshot_id !== snapshotId) reasons.push('NETWORKX_REFERENCE_SNAPSHOT_MISMATCH');
  if (reference?.topology_hash !== topologyHash) reasons.push('NETWORKX_REFERENCE_TOPOLOGY_MISMATCH');
  if (!matchesExpectedConfiguration(reference?.configuration)) reasons.push('NETWORKX_REFERENCE_CONFIGURATION_MISMATCH');
  if (!Array.isArray(reference?.scores)) reasons.push('NETWORKX_REFERENCE_SCORES_MISSING');
  if (!(localScores instanceof Map) || localScores.size === 0) reasons.push('LOCAL_PAGERANK_SCORES_MISSING');

  const referenceScores = new Map();
  if (Array.isArray(reference?.scores)) {
    for (const row of reference.scores) {
      if (!row || typeof row.nodeKey !== 'string' || !Number.isFinite(row.pagerankRaw) || referenceScores.has(row.nodeKey)) {
        reasons.push('NETWORKX_REFERENCE_SCORE_ROW_INVALID');
        continue;
      }
      referenceScores.set(row.nodeKey, row.pagerankRaw);
    }
  }

  let maxAbsoluteDelta = 0;
  if (localScores instanceof Map && referenceScores.size === localScores.size) {
    for (const [nodeKey, score] of localScores) {
      const referenceScore = referenceScores.get(nodeKey);
      if (!Number.isFinite(score) || referenceScore === undefined) {
        reasons.push('NETWORKX_REFERENCE_NODE_SET_MISMATCH');
        continue;
      }
      maxAbsoluteDelta = Math.max(maxAbsoluteDelta, Math.abs(score - referenceScore));
    }
  } else if (referenceScores.size !== localScores?.size) {
    reasons.push('NETWORKX_REFERENCE_NODE_COUNT_MISMATCH');
  }
  if (Number.isFinite(tolerance) && maxAbsoluteDelta > tolerance) reasons.push('NETWORKX_REFERENCE_SCORE_DELTA_EXCEEDED');

  return {
    status: reasons.length === 0 ? 'PARITY_PROVEN' : 'PARITY_NOT_PROVEN',
    reasons: [...new Set(reasons)],
    comparedNodeCount: Math.min(localScores?.size ?? 0, referenceScores.size),
    maxAbsoluteDelta,
    tolerance,
  };
}

export function decidePageRankPersistenceV1({ applyRequested, validationPassed, parity, source, frozenSnapshot }) {
  if (!applyRequested) return { status: 'DRY_RUN_APPLY_NOT_REQUESTED', writesAllowed: false };
  if (!validationPassed) return { status: 'BLOCKED_VALIDATION_FAILED', writesAllowed: false };
  if (parity?.status !== 'PARITY_PROVEN') return { status: 'BLOCKED_NETWORKX_PARITY_UNPROVEN', writesAllowed: false };
  if (source !== 'frozen_snapshot_json' || !frozenSnapshot?.graphSnapshot) {
    return { status: 'BLOCKED_FROZEN_SNAPSHOT_REQUIRED', writesAllowed: false };
  }
  const snapshot = frozenSnapshot.graphSnapshot;
  if (!snapshot.snapshotId || !HASH.test(snapshot.topologyHash ?? '')
    || !SHA256.test(snapshot.sourceManifest?.workspaceRevision ?? '')
    || !snapshot.sourceManifest?.sourceInventorySnapshotId) {
    return { status: 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED', writesAllowed: false };
  }
  return { status: 'READY_TO_APPLY', writesAllowed: true };
}
