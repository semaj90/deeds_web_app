import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOkfGroundedNlpAlignmentV1 } from './okf-grounded-nlp-alignment-v1.mjs';

function fixture() {
  return {
    okfSchema: {
      capability_card_contract: {
        canonical_authority: false,
        design_only: true,
        runtime_enforced: false,
        envelope: {
          required: ['source_ref', 'source_revision', 'workspace_revision', 'producer_revision', 'evidence_refs', 'checksum'],
          properties: {
            source_ref: { type: 'string' },
            source_revision: { type: 'string' },
            workspace_revision: { type: 'string' },
            producer_revision: { type: 'string' },
            evidence_refs: { type: 'array' },
            checksum: { type: 'string' },
            authority: { properties: { canonical_authority: { const: false } } },
          },
        },
      },
    },
    okfIndex: { canonical_authority: false },
    pydanticSchema: {
      required: ['sourceRef', 'sourceRevision', 'workspaceRevision', 'extractorRevision', 'evidenceKey', 'evidenceSpan', 'canonicalAuthority'],
      properties: {
        sourceRef: { type: 'string' },
        sourceRevision: { type: 'string' },
        workspaceRevision: { type: 'string' },
        extractorRevision: { type: 'string' },
        evidenceKey: { type: 'string' },
        evidenceSpan: { type: 'object' },
        canonicalAuthority: { const: false },
      },
    },
  };
}

test('reports common lineage and non-authority alignment without equating schemas', () => {
  const result = buildOkfGroundedNlpAlignmentV1(fixture());
  assert.equal(result.status, 'SHARED_GUARDS_ALIGNED_SHAPE_REVIEW_REQUIRED');
  assert.equal(result.authorityAligned, true);
  assert.ok(result.sharedBindings.every((binding) => binding.bothRequired));
  assert.equal(result.evidenceShape.equivalenceClaimed, false);
  assert.equal(result.semanticCrosswalks.cardProducerRevisionToFactExtractorRevision, 'REVIEW_REQUIRED_NOT_ASSUMED_EQUIVALENT');
  assert.equal(result.runtimeAdmission, false);
});

test('rejects a missing shared revision or weakened authority boundary', () => {
  const input = fixture();
  input.pydanticSchema.required = input.pydanticSchema.required.filter((field) => field !== 'sourceRevision');
  input.pydanticSchema.properties.canonicalAuthority.const = true;
  const result = buildOkfGroundedNlpAlignmentV1(input);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.mismatches.sort(), ['NON_AUTHORITY_CONSTRAINT_NOT_SHARED', 'SHARED_SOURCE_REVISION_FIELDS_NOT_REQUIRED_ON_BOTH']);
});
