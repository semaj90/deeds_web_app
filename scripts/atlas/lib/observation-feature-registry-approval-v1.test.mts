import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  buildObservationFeatureRegistry,
  observationFeatureChecksum,
} from '../../../packages/parent-atlas/src/core/observation-feature-compiler.ts';
import {
  ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1,
  buildOrfAstFeatureRegistryProposalEnvelopeV1,
} from './orf-ast-feature-definition-proposal-v1.mjs';
import {
  observationFeatureReviewReceiptSigningBytesV1,
  validateApprovedObservationFeatureRegistryArtifactV1,
  type ObservationFeatureReviewReceiptV1,
} from './observation-feature-registry-approval-v1.mjs';

function artifactFixture() {
  const definitions = ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1.map(({ feature_id, family, value_kind, description, evidence_requirements, missing_value_policy }) => ({
    feature_id, family, value_kind, description, evidence_requirements, missing_value_policy,
  }));
  const registryRevision = `proposal:sha256:${observationFeatureChecksum(definitions)}`;
  const registry = buildObservationFeatureRegistry({ registryRevision, definitions });
  const proposal = buildOrfAstFeatureRegistryProposalEnvelopeV1(registry);
  return {
    schema: 'atlas.observation-feature-registry-approved-artifact.v1',
    proposal,
    review_receipt: {
      schema: 'atlas.observation-feature-registry-review-receipt.v1',
      receipt_id: 'review-fixture-1',
      decision: 'APPROVE',
      reviewer_id: 'reviewer-fixture',
      reviewed_at: '2026-10-09T12:00:00Z',
      proposal_checksum: proposal.proposal_checksum,
      registry_revision: registry.registry_revision,
      registry_checksum: registry.registry_checksum,
    },
  };
}

test('approval validator checks exact checksums and external reviewer authority without granting runtime eligibility', () => {
  const result = validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: artifactFixture(),
    authorizedReviewerIds: ['reviewer-fixture'],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(artifactFixture().review_receipt),
  });
  assert.equal(result.status, 'APPROVAL_BINDINGS_VALIDATED_NOT_AUTHENTICATED');
  assert.equal(result.runtime_eligible, false);
  assert.equal(result.canonical_authority, false);
});

test('approval validator rejects the proposal artifact without a receipt', () => {
  const fixture = artifactFixture();
  assert.throws(() => validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: fixture.proposal,
    authorizedReviewerIds: ['reviewer-fixture'],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(fixture.review_receipt),
  }));
});

test('approval validator rejects unauthorized reviewers and mismatched receipt checksums', () => {
  const fixture = artifactFixture();
  assert.throws(() => validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: fixture,
    authorizedReviewerIds: ['another-reviewer'],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(fixture.review_receipt),
  }), /REVIEWER_NOT_AUTHORIZED/);

  const altered = structuredClone(fixture);
  altered.review_receipt.proposal_checksum = '0'.repeat(64);
  assert.throws(() => validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: altered,
    authorizedReviewerIds: ['reviewer-fixture'],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(fixture.review_receipt),
  }), /REVIEW_RECEIPT_PROPOSAL_MISMATCH/);
});

test('approval validator requires a trusted external receipt checksum', () => {
  const fixture = artifactFixture();
  assert.throws(() => validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: fixture,
    authorizedReviewerIds: ['reviewer-fixture'],
    trustedApprovalReceiptChecksum: '0'.repeat(64),
  }), /REVIEW_RECEIPT_TRUST_ANCHOR_MISMATCH/);
  assert.throws(() => validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: fixture,
    authorizedReviewerIds: [],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(fixture.review_receipt),
  }), /TRUSTED_REVIEWER_ALLOWLIST_REQUIRED/);
});

test('approval validator rejects mutation of the registry after review', () => {
  const fixture = artifactFixture();
  fixture.proposal.registry.definitions[0].description = 'mutated after review';
  assert.throws(() => validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: fixture,
    authorizedReviewerIds: ['reviewer-fixture'],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(fixture.review_receipt),
  }), /PROPOSAL_CHECKSUM_MISMATCH/);
});

test('verifies an Ed25519 reviewer signature without enabling runtime eligibility', () => {
  const fixture = artifactFixture();
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const receipt = fixture.review_receipt as ObservationFeatureReviewReceiptV1;
  receipt.signature_algorithm = 'Ed25519';
  receipt.signature = sign(null, observationFeatureReviewReceiptSigningBytesV1(receipt), privateKey).toString('base64');

  const result = validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: fixture,
    authorizedReviewerIds: ['reviewer-fixture'],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(receipt),
    reviewerPublicKeys: {
      'reviewer-fixture': publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  });

  assert.equal(result.status, 'REVIEW_SIGNATURE_VERIFIED_NOT_RUNTIME_ELIGIBLE');
  assert.equal(result.runtime_eligible, false);
  assert.equal(result.canonical_authority, false);
});

test('canonical signing bytes are stable across receipt property ordering', () => {
  const receipt = artifactFixture().review_receipt as ObservationFeatureReviewReceiptV1;
  const reordered = Object.fromEntries(Object.entries(receipt).reverse()) as ObservationFeatureReviewReceiptV1;

  assert.deepEqual(
    observationFeatureReviewReceiptSigningBytesV1(reordered),
    observationFeatureReviewReceiptSigningBytesV1(receipt),
  );
});

test('rejects a signed review receipt when the signature does not bind its current contents', () => {
  const fixture = artifactFixture();
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const receipt = fixture.review_receipt as ObservationFeatureReviewReceiptV1;
  receipt.signature_algorithm = 'Ed25519';
  receipt.signature = sign(null, observationFeatureReviewReceiptSigningBytesV1(receipt), privateKey).toString('base64');
  receipt.receipt_id = 'modified-after-signing';

  assert.throws(() => validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: fixture,
    authorizedReviewerIds: ['reviewer-fixture'],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(receipt),
    reviewerPublicKeys: {
      'reviewer-fixture': publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  }), /REVIEW_SIGNATURE_INVALID/);
});

test('rejects a signed review receipt without its trusted reviewer key', () => {
  const fixture = artifactFixture();
  const { privateKey } = generateKeyPairSync('ed25519');
  const receipt = fixture.review_receipt as ObservationFeatureReviewReceiptV1;
  receipt.signature_algorithm = 'Ed25519';
  receipt.signature = sign(null, observationFeatureReviewReceiptSigningBytesV1(receipt), privateKey).toString('base64');

  assert.throws(() => validateApprovedObservationFeatureRegistryArtifactV1({
    artifact: fixture,
    authorizedReviewerIds: ['reviewer-fixture'],
    trustedApprovalReceiptChecksum: observationFeatureChecksum(receipt),
  }), /REVIEWER_PUBLIC_KEY_UNAVAILABLE/);
});
