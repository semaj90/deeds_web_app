import assert from 'node:assert/strict';
import { parseQualifiedKarpathyScore, hasQualifiedTraceEnvelope } from './qualified-karpathy-evidence-v1.mjs';

const revision = `sha256:${'a'.repeat(64)}`;
const checksum = 'b'.repeat(64);
const qualified = {
  blend: 0.8,
  workspaceRevision: revision,
  sourceCohortChecksum: checksum,
  graphRevision: 'graph:v1',
  featureRevision: 'feature:v1',
  artifactChecksum: 'c'.repeat(64),
};

assert.deepEqual(parseQualifiedKarpathyScore(JSON.stringify(qualified)), {
  score: 0.8,
  workspaceRevision: revision,
  sourceCohortChecksum: checksum,
  graphRevision: 'graph:v1',
  featureRevision: 'feature:v1',
  artifactChecksum: 'c'.repeat(64),
});
assert.equal(parseQualifiedKarpathyScore('0.8'), null);
assert.equal(parseQualifiedKarpathyScore(JSON.stringify({ ...qualified, workspaceRevision: '2026-09-14' })), null);
assert.equal(parseQualifiedKarpathyScore(JSON.stringify({ ...qualified, artifactChecksum: 'bad' })), null);
assert.equal(hasQualifiedTraceEnvelope({
  workspaceRevision: revision,
  sourceRevision: revision,
  representationRevision: 'semantic_768:v1',
  graphRevision: 'graph:v1',
  featureRevision: 'feature:v1',
  artifactChecksum: checksum,
}), true);
assert.equal(hasQualifiedTraceEnvelope({ confidence: 0.99, karpathyRev: '2026-09-14' }), false);
console.log('qualified-karpathy-evidence-v1.test.mjs: all assertions passed');
