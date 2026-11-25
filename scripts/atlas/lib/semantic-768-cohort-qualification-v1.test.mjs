import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSemantic768Candidate } from './semantic-768-cohort-qualification-v1.mjs';

const digest = 'sha256:' + 'a'.repeat(64);
const candidate = {
  sourceRevision: digest,
  workspaceRevision: digest,
  degradedIdentity: false,
  representationBindings: [{ representationId: 'semantic_768', modelRevision: 'semantic_768:embeddinggemma:v1:encoder-7' }],
};
const row = {
  source_revision: digest,
  workspace_revision: digest,
  representation_revision: 'representation-7',
  embedding_digest: digest,
  content_embedding_768: '[0.1,0.2]',
  embedding_dimension: 768,
  embedding_model: 'embeddinggemma',
  embedding_version: 'v1',
  encoder_id: 'encoder-7',
};

test('qualifies only row-bound semantic_768 representation evidence', () => {
  assert.equal(evaluateSemantic768Candidate(candidate, row, true).qualified, true);
});

test('accepts a full pinned embedding_version without duplicating the model prefix', () => {
  const fullRevision = 'semantic_768:embeddinggemma:latest:a5f000000000000000000000000000000000000000000000000000000000036a';
  const observedRow = {
    ...row,
    embedding_model: 'embeddinggemma:latest',
    embedding_version: fullRevision,
    encoder_id: null,
  };
  const observedCandidate = {
    ...candidate,
    representationBindings: [{ representationId: 'semantic_768', modelRevision: fullRevision }],
  };

  const result = evaluateSemantic768Candidate(observedCandidate, observedRow, true);
  assert.equal(result.actualModelRevision, fullRevision);
  assert.equal(result.checks.modelRevision, true);
  // Missing encoder metadata remains a separate hard qualification failure.
  assert.equal(result.checks.producerMetadata, false);
  assert.equal(result.qualified, false);
});

test('rejects an unbound candidate row even when semantic fields match', () => {
  const result = evaluateSemantic768Candidate(candidate, row, false);
  assert.equal(result.qualified, false);
  assert.equal(result.checks.candidateIdentityBound, false);
});

test('does not treat the derived ordinal map as canonical authority', () => {
  assert.equal(evaluateSemantic768Candidate(candidate, row, true).checks.candidateIdentityBound, true);
  // Qualification means row-bound vector readiness only; canonical admission remains separate.
});

test('rejects revisions copied from the map when row revisions disagree', () => {
  assert.equal(evaluateSemantic768Candidate(candidate, { ...row, workspace_revision: 'sha256:' + 'b'.repeat(64) }, true).qualified, false);
});

test('rejects missing representation revision or vector digest', () => {
  assert.equal(evaluateSemantic768Candidate(candidate, { ...row, representation_revision: null }, true).qualified, false);
  assert.equal(evaluateSemantic768Candidate(candidate, { ...row, embedding_digest: null }, true).qualified, false);
});

test('rejects an unpinned or mismatched encoder revision', () => {
  assert.equal(evaluateSemantic768Candidate(candidate, { ...row, encoder_id: 'encoder-other' }, true).qualified, false);
});
