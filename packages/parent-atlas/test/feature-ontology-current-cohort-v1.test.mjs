import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CurrentCohortClassification,
  classifyFeatureOntologyCurrentBinding,
  requireCurrentWorkspaceRevision,
  summarizeFeatureOntologyCurrentCohort,
} from '../../../scripts/atlas/lib/feature-ontology-current-cohort-v1.mjs';

const CURRENT = `sha256:${'b19b04deadbeef'.padEnd(64, '0')}`;
const tuple = { id: '42', packet_key: 'packet:42', source_ref: 'src/lib/example.ts', predicate: 'USES_CONCEPT', ontology_version: 'ontology-v1', extractor_version: 'extractor-v1' };
const graphify = { file_id: 'file-42', workspace_id: 'workspace-42', source_ref: tuple.source_ref, workspace_revision: CURRENT, code_source_revision: 'sha256:source42', source_revision: 'git:abc123', content_hash: 'sha256:content42', byte_length: 1234 };

test('requires a valid current sha256 workspace revision', () => {
  assert.equal(requireCurrentWorkspaceRevision(CURRENT), CURRENT);
  assert.throws(() => requireCurrentWorkspaceRevision('git:0084288f26'), /INVALID_WORKSPACE_REVISION/);
  assert.throws(() => requireCurrentWorkspaceRevision(null), /WORKSPACE_REVISION_REQUIRED/);
});

test('accepts one exact current Graphify binding', () => {
  const result = classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches: [graphify], currentWorkspaceRevision: CURRENT });
  assert.equal(result.classification, CurrentCohortClassification.CURRENT_EXACT_UNIQUE);
  assert.equal(result.eligible, true);
  assert.equal(result.binding.tupleSourceRef, tuple.source_ref);
});

test('rejects missing and historical bindings', () => {
  assert.equal(classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches: [], currentWorkspaceRevision: CURRENT }).classification, CurrentCohortClassification.NO_EXACT_GRAPHIFY_SOURCE);
  const result = classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches: [{ ...graphify, workspace_revision: `sha256:${'a'.repeat(64)}` }], currentWorkspaceRevision: CURRENT });
  assert.equal(result.classification, CurrentCohortClassification.EXACT_WRONG_WORKSPACE);
  assert.equal(result.eligible, false);
});

test('rejects invalid and duplicate current rows', () => {
  assert.equal(classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches: [{ ...graphify, workspace_revision: 'git:0084288f26' }], currentWorkspaceRevision: CURRENT }).classification, CurrentCohortClassification.INVALID_WORKSPACE_REVISION);
  const result = classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches: [graphify, { ...graphify, file_id: 'file-43' }], currentWorkspaceRevision: CURRENT });
  assert.equal(result.classification, CurrentCohortClassification.EXACT_MULTIPLE_CURRENT_GRAPHIFY_ROWS);
});

test('rejects incomplete current observations', () => {
  assert.equal(classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches: [{ ...graphify, code_source_revision: null }], currentWorkspaceRevision: CURRENT }).classification, CurrentCohortClassification.MISSING_CODE_SOURCE_REVISION);
  assert.equal(classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches: [{ ...graphify, content_hash: null }], currentWorkspaceRevision: CURRENT }).classification, CurrentCohortClassification.MISSING_CONTENT_HASH);
});

test('summarizes the relationship cohort gate', () => {
  const accepted = classifyFeatureOntologyCurrentBinding({ tuple, graphifyMatches: [graphify], currentWorkspaceRevision: CURRENT });
  const summary = summarizeFeatureOntologyCurrentCohort([accepted]);
  assert.equal(summary.eligibleUsesConceptTuples, 1);
  assert.equal(summary.eligibleExactSourceRefs, 1);
  assert.equal(summary.status, 'CURRENT_RELATIONSHIP_COHORT_FOUND');
});
