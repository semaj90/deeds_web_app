import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLabelFeatureV1, buildLabelProposalsV1 } from '../dist/core/label-feature-v1.js';

const domains = ['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml'];
const base = {
  sourceRef: 'src/search.ts', sourceRevision: 'sha256:source-r1', workspaceRevision: 'sha256:workspace-r1',
  sourceRole: 'code', language: 'typescript', keywordCounts: { retrieval: 3, auth: 1 },
  symbolCount: 4, importCount: 2, exportCount: 1, predictedDomain: 'retrieval', domainConfidence: 0.91,
  taxonomyRevision: 'parent-atlas-domain-taxonomy-v1', producerRevision: 'ast-keywords:v3', allowedDomains: domains,
  evidence: [{ kind: 'AST_KEYWORDS', label: 'retrieval', confidence: 0.91,
    sourceRevision: 'sha256:source-r1', workspaceRevision: 'sha256:workspace-r1',
    taxonomyRevision: 'parent-atlas-domain-taxonomy-v1', producerRevision: 'ast-keywords:v3',
    evidenceRefs: ['ast-keyword-row:17'] }],
};

test('builds deterministic source/revision-bound features and proposal-only labels', () => {
  const first = buildLabelFeatureV1(base);
  const reordered = buildLabelFeatureV1({ ...base, keywordCounts: { auth: 1, retrieval: 3 }, evidence: [{
    ...base.evidence[0], evidenceRefs: ['ast-keyword-row:17', 'ast-keyword-row:17'],
  }] });
  assert.equal(first.checksum, reordered.checksum);
  assert.equal(first.canonicalAuthority, false);
  const proposals = buildLabelProposalsV1({ feature: first, allowedDomains: domains });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].label, 'retrieval');
  assert.equal(proposals[0].status, 'REVIEW_REQUIRED');
  assert.equal(proposals[0].canonicalAuthority, false);
  assert.equal(proposals[0].featureChecksum, first.checksum);
});

test('rejects labels outside the supplied canonical taxonomy and stale evidence revisions', () => {
  assert.throws(() => buildLabelFeatureV1({ ...base, predictedDomain: 'general' }), /NONCANONICAL_DOMAIN/);
  assert.throws(() => buildLabelFeatureV1({ ...base, evidence: [{ ...base.evidence[0], sourceRevision: 'sha256:old' }] }), /EVIDENCE_LINEAGE_OR_TAXONOMY_MISMATCH/);
});

test('requires exact AST evidence for a predicted AST domain', () => {
  assert.throws(() => buildLabelFeatureV1({ ...base, evidence: [{ ...base.evidence[0], label: 'auth' }] }), /AST_PREDICTION_WITHOUT_MATCHING_EVIDENCE/);
});

test('rejects a mutated feature checksum before emitting proposals', () => {
  const feature = buildLabelFeatureV1(base);
  assert.throws(() => buildLabelProposalsV1({ feature: { ...feature, sourceRole: 'documentation' }, allowedDomains: domains }), /CHECKSUM_MISMATCH/);
});
