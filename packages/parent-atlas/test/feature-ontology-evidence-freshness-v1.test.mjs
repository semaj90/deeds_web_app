import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFeatureOntologyEvidenceFreshness, EvidenceFreshnessClassification, summarizeFeatureOntologyEvidenceFreshness } from '../../../scripts/atlas/lib/feature-ontology-evidence-freshness-v1.mjs';

const current = `sha256:${'a'.repeat(64)}`;
const tuple = { id: '1', packet_key: 'p1', source_ref: 'src/a.ts', ontology_version: 'o1', extractor_version: 'e1' };
const alias = { canonicalSourceRef: 'sveltekit-frontend/src/a.ts', resolverRevision: 'feature-ontology-explicit-alias:v1', promotable: true, classification: 'VERIFIED_EXPLICIT_ALIAS' };
const graphify = { workspace_revision: current, source_revision: 'sha256:source', content_hash: 'sha256:packet' };

test('requires packet lineage in addition to alias and Graphify location', () => {
  const result = classifyFeatureOntologyEvidenceFreshness({ tuple, alias, graphify, currentWorkspaceRevision: current, packet: {} });
  assert.equal(result.classification, EvidenceFreshnessClassification.PACKET_CONTENT_LINEAGE_MISSING);
});
test('proves only matching packet and source revisions', () => {
  const result = classifyFeatureOntologyEvidenceFreshness({ tuple, alias, graphify, currentWorkspaceRevision: current, packet: { content_hash: 'sha256:packet', source_revision: 'sha256:source' } });
  assert.equal(result.classification, EvidenceFreshnessClassification.CURRENT_TUPLE_EVIDENCE_PROVEN);
  assert.equal(result.contentMatch, true);
  assert.equal(result.sourceRevisionMatch, true);
});
test('rejects stale workspace observations', () => {
  const result = classifyFeatureOntologyEvidenceFreshness({ tuple, alias, graphify: { ...graphify, workspace_revision: 'sha256:stale' }, currentWorkspaceRevision: current, packet: { content_hash: 'sha256:packet', source_revision: 'sha256:source' } });
  assert.equal(result.classification, EvidenceFreshnessClassification.CURRENT_GRAPHIFY_SOURCE_MISSING);
});
test('rejects dual namespace collisions', () => {
  const result = classifyFeatureOntologyEvidenceFreshness({ tuple: { ...tuple, source_ref: 'src/lib/server/valkey.ts' }, alias: { ...alias, classification: EvidenceFreshnessClassification.DUAL_NAMESPACE_COLLISION }, currentWorkspaceRevision: current });
  assert.equal(result.classification, EvidenceFreshnessClassification.DUAL_NAMESPACE_COLLISION);
});
test('summarizes only fresh tuples as eligible', () => {
  const rows = [
    { tupleId: '2', classification: EvidenceFreshnessClassification.CURRENT_TUPLE_EVIDENCE_PROVEN },
    { tupleId: '1', classification: EvidenceFreshnessClassification.PACKET_CONTENT_LINEAGE_MISSING },
  ];
  const summary = summarizeFeatureOntologyEvidenceFreshness(rows);
  assert.equal(summary.eligibleFreshUsesConceptTuples, 1);
  assert.equal(summary.counts.PACKET_CONTENT_LINEAGE_MISSING, 1);
});
