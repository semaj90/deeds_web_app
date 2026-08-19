import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDefaultEvidenceClaimPolicies,
  claimSchema,
  evidenceObservationSchema,
  verifyClaimAgainstPolicy,
} from '../dist/core/claim-verification.js';

const sha = (c) => c.repeat(64);

function evidence(overrides) {
  return evidenceObservationSchema.parse({
    evidence_id: 'evidence:1',
    evidence_revision: 'evidence-r1',
    subject_canonical_ids: ['symbol:a', 'symbol:b'],
    evidence_kind: 'AST_FACT',
    source_ref: 'src/a.ts',
    source_revision: 'src-r1',
    producer: 'tree-sitter',
    producer_revision: 'tree-sitter-r1',
    algorithm_revision: 'grammar-r1',
    input_checksums: [],
    output_checksum: sha('a'),
    locator: { byte_start: 10, byte_end: 20, ast_path: [0, 1], symbol_id: 'symbol:a' },
    observed_value: { relation: 'calls' },
    reproducible: true,
    trust_class: 'SOURCE_GROUNDED',
    canonical_authority: false,
    ...overrides,
  });
}

test('CALLS cannot be verified by vector/model/graph scores alone', () => {
  const policy = buildDefaultEvidenceClaimPolicies('policy-r1').find((item) => item.claim_type === 'CALLS');
  const claim = claimSchema.parse({
    claim_id: 'claim:calls',
    claim_revision: 'claim-r1',
    claim_type: 'CALLS',
    subject_canonical_ids: ['symbol:a', 'symbol:b'],
    evidence_refs: ['evidence:vector'],
    producer_revision: 'test-r1',
  });
  const receipt = verifyClaimAgainstPolicy({
    claim,
    policy,
    evidence: [evidence({
      evidence_id: 'evidence:vector',
      evidence_kind: 'EXACT_VECTOR_DISTANCE',
      producer: 'cuvs-bruteforce',
      trust_class: 'DETERMINISTIC_DERIVED',
      locator: {},
      observed_value: { cosine: 0.95 },
      output_checksum: sha('b'),
    })],
    receipt_id: 'receipt:1',
    producer_revision: 'test-r1',
  });
  assert.equal(receipt.verdict, 'INSUFFICIENT_EVIDENCE');
  assert.ok(receipt.missing_required_kinds.includes('AST_FACT'));
});

test('CALLS is verified by source-grounded AST evidence', () => {
  const policy = buildDefaultEvidenceClaimPolicies('policy-r1').find((item) => item.claim_type === 'CALLS');
  const claim = claimSchema.parse({
    claim_id: 'claim:calls',
    claim_revision: 'claim-r1',
    claim_type: 'CALLS',
    subject_canonical_ids: ['symbol:a', 'symbol:b'],
    evidence_refs: ['evidence:ast'],
    producer_revision: 'test-r1',
  });
  const receipt = verifyClaimAgainstPolicy({
    claim,
    policy,
    evidence: [evidence({ evidence_id: 'evidence:ast' })],
    receipt_id: 'receipt:2',
    producer_revision: 'test-r1',
  });
  assert.equal(receipt.verdict, 'VERIFIED');
});

test('DATA_FLOWS_TO requires a CodeQL-style dataflow path', () => {
  const policy = buildDefaultEvidenceClaimPolicies('policy-r1').find((item) => item.claim_type === 'DATA_FLOWS_TO');
  const claim = claimSchema.parse({
    claim_id: 'claim:flow',
    claim_revision: 'claim-r1',
    claim_type: 'DATA_FLOWS_TO',
    subject_canonical_ids: ['symbol:source', 'symbol:sink'],
    evidence_refs: ['evidence:path'],
    producer_revision: 'test-r1',
  });
  const receipt = verifyClaimAgainstPolicy({
    claim,
    policy,
    evidence: [evidence({
      evidence_id: 'evidence:path',
      evidence_kind: 'DATAFLOW_PATH',
      producer: 'codeql',
      output_checksum: sha('c'),
      observed_value: { path: ['source', 'sink'] },
    })],
    receipt_id: 'receipt:3',
    producer_revision: 'test-r1',
  });
  assert.equal(receipt.verdict, 'VERIFIED');
  assert.equal(receipt.codeql_path_evidence_ref, 'evidence:path');
});

test('AUTHORIZES_MUTATION requires rule proof plus another grounded observation', () => {
  const policy = buildDefaultEvidenceClaimPolicies('policy-r1').find((item) => item.claim_type === 'AUTHORIZES_MUTATION');
  const claim = claimSchema.parse({
    claim_id: 'claim:auth',
    claim_revision: 'claim-r1',
    claim_type: 'AUTHORIZES_MUTATION',
    subject_canonical_ids: ['feature:x', 'route:y'],
    evidence_refs: ['evidence:rule', 'evidence:schema'],
    producer_revision: 'test-r1',
  });
  const receipt = verifyClaimAgainstPolicy({
    claim,
    policy,
    evidence: [
      evidence({
        evidence_id: 'evidence:rule',
        evidence_kind: 'RULE_PROOF',
        producer: 'souffle',
        trust_class: 'DETERMINISTIC_DERIVED',
        locator: {},
        observed_value: { tuple: 'AuthorizedMutation(...)' },
        output_checksum: sha('d'),
      }),
      evidence({
        evidence_id: 'evidence:schema',
        evidence_kind: 'SCHEMA_READBACK',
        producer: 'postgres-introspector',
        trust_class: 'SOURCE_GROUNDED',
        observed_value: { ownership_key: 'owner_id' },
        output_checksum: sha('e'),
      }),
    ],
    receipt_id: 'receipt:4',
    producer_revision: 'test-r1',
  });
  assert.equal(receipt.verdict, 'VERIFIED');
  assert.equal(receipt.deterministic_rule_proof_ref, 'evidence:rule');
});
