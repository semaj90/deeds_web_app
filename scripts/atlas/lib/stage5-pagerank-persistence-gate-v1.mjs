import { createHash } from 'node:crypto';
import { register } from 'tsx/esm/api';
import { STAGE5_PAGERANK_CONFIGURATION_V1 } from './stage5-pagerank-core-v1.mjs';

register();
const { verifyGraphSnapshotRevisionV1 } = await import('../../../packages/parent-atlas/src/core/graph-snapshot-revision-v1.ts');
const { validateGraphifyScopePolicyV1 } = await import('../../../packages/parent-atlas/src/core/graphify-scope-policy-v1.ts');

const SHA256 = /^sha256:[a-f0-9]{64}$/i;
const HASH = /^[a-f0-9]{64}$/i;

function matchesExpectedConfiguration(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return false;
  const expectedEntries = Object.entries(STAGE5_PAGERANK_CONFIGURATION_V1).sort(([left], [right]) => left.localeCompare(right));
  const actualEntries = Object.entries(configuration).sort(([left], [right]) => left.localeCompare(right));
  return expectedEntries.length === actualEntries.length
    && expectedEntries.every(([key, value], index) => actualEntries[index]?.[0] === key && actualEntries[index]?.[1] === value);
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function verifyFrozenGraphAdmissionV1(frozenSnapshot) {
  const snapshot = frozenSnapshot?.graphSnapshot;
  const proof = frozenSnapshot?.proof;
  const membershipScopes = snapshot?.sourceManifest?.membershipScopes;
  const scopePolicy = proof?.scopePolicy;
  if (!Array.isArray(membershipScopes) || !scopePolicy || !Array.isArray(scopePolicy.decisions)) return false;

  const scopePolicyInput = { expectedScopes: membershipScopes, decisions: scopePolicy.decisions };
  const scopeResult = validateGraphifyScopePolicyV1(scopePolicyInput);
  const scopePolicyDigest = createHash('sha256').update(stableJson(scopePolicyInput), 'utf8').digest('hex');
  if (scopeResult.status !== 'PASS' || proof.scopePolicySha256 !== scopePolicyDigest) return false;

  const nodes = frozenSnapshot.nodes;
  const expectedSourceRevisions = proof.nodeSourceRevisions;
  if (!Array.isArray(nodes) || nodes.length === 0 || !expectedSourceRevisions || typeof expectedSourceRevisions !== 'object' || Array.isArray(expectedSourceRevisions)) return false;
  const expectedEntries = Object.entries(expectedSourceRevisions).sort(([left], [right]) => left.localeCompare(right));
  const expectedDigest = createHash('sha256').update(stableJson(Object.fromEntries(expectedEntries)), 'utf8').digest('hex');
  if (proof.nodeSourceRevisionManifestSha256 !== expectedDigest || expectedEntries.length !== nodes.length) return false;

  const expected = new Map(expectedEntries);
  const seen = new Set();
  for (const node of nodes) {
    if (node?.snapshotId !== snapshot.snapshotId || typeof node.nodeKey !== 'string' || !node.nodeKey
      || typeof node.sourceRef !== 'string' || !node.sourceRef
      || typeof node.sourceRevision !== 'string' || !SHA256.test(node.sourceRevision)
      || typeof node.contentHash !== 'string' || !HASH.test(node.contentHash)) return false;
    if (seen.has(node.nodeKey) || expected.get(node.nodeKey) !== node.sourceRevision) return false;
    if (node.sourceRevision.toLowerCase() !== `sha256:${node.contentHash.toLowerCase()}`) return false;
    seen.add(node.nodeKey);
  }

  return seen.size === expected.size;
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
  const revision = frozenSnapshot.revision;
  const proof = frozenSnapshot.proof;
  if (!snapshot.snapshotId || !HASH.test(snapshot.topologyHash ?? '')
    || !SHA256.test(snapshot.sourceManifest?.workspaceRevision ?? '')
    || !snapshot.sourceManifest?.sourceInventorySnapshotId
    || !revision || revision.schemaVersion !== 'graph-snapshot-revision-v1'
    || revision.snapshotId !== snapshot.snapshotId
    || !HASH.test(revision.workspaceRevision?.replace(/^sha256:/, '') ?? '')
    || !HASH.test(revision.sourceInventoryRevision?.replace(/^sha256:/, '') ?? '')
    || !HASH.test(revision.sourceInventoryHash ?? '')
    || !HASH.test(revision.graphRevision ?? '')
    || !HASH.test(revision.topologyHash ?? '')
    || !HASH.test(revision.policyHash ?? '')
    || !HASH.test(revision.revisionChecksum ?? '')
    || revision.sourceInventoryRevision !== `sha256:${revision.sourceInventoryHash}`
    || !revision.identityContractVersion
    || !revision.parserContractVersion
    || !revision.producerRevision
    || revision.workspaceRevision !== snapshot.sourceManifest.workspaceRevision
    || revision.topologyHash !== snapshot.topologyHash
    || revision.policyHash !== snapshot.policyHash
    || revision.sourceInventoryHash !== proof?.sourceInventoryHash
    || revision.graphRevision !== proof?.graphRevision
    || revision.revisionChecksum !== proof?.revisionChecksum) {
    return { status: 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED', writesAllowed: false };
  }
  try {
    verifyGraphSnapshotRevisionV1(revision);
  } catch {
    return { status: 'BLOCKED_SNAPSHOT_REVISION_UNQUALIFIED', writesAllowed: false };
  }
  if (!verifyFrozenGraphAdmissionV1(frozenSnapshot)) {
    return { status: 'BLOCKED_GRAPH_LINEAGE_UNQUALIFIED', writesAllowed: false };
  }
  return { status: 'BLOCKED_PERSISTED_LINEAGE_READBACK_UNIMPLEMENTED', writesAllowed: false };
}
