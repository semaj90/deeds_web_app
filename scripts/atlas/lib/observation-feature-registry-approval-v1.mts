import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import {
  observationFeatureChecksum,
  observationFeatureRegistrySchema,
} from '../../../packages/parent-atlas/src/core/observation-feature-compiler.ts';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

const reviewReceiptSchema = z.object({
  schema: z.literal('atlas.observation-feature-registry-review-receipt.v1'),
  receipt_id: z.string().min(1),
  decision: z.literal('APPROVE'),
  reviewer_id: z.string().min(1),
  reviewed_at: z.string().datetime({ offset: true }),
  proposal_checksum: checksum,
  registry_revision: z.string().min(1),
  registry_checksum: checksum,
  signature_algorithm: z.literal('Ed25519').optional(),
  signature: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
}).strict();
export type ObservationFeatureReviewReceiptV1 = z.infer<typeof reviewReceiptSchema>;

const proposalSchema = z.object({
  schema: z.literal('atlas.orf-ast-feature-registry-proposal.v1'),
  registry: z.unknown(),
  ast_grep_mappings: z.array(z.object({
    feature_id: z.string().min(1),
    ast_kinds: z.array(z.string().min(1)).min(1),
    review_state: z.literal('REVIEW_REQUIRED'),
  }).strict()).min(1),
  symbol_kind_hints: z.array(z.object({
    feature_id: z.string().min(1),
    symbol_kinds: z.array(z.string().min(1)).min(1),
    review_state: z.literal('REVIEW_REQUIRED'),
  }).strict()).min(1),
  status: z.literal('PROPOSAL_ONLY_REQUIRES_REVIEW'),
  proposal_revision: z.string().min(1),
  proposal_checksum: checksum,
  reviewer_id: z.null(),
  review_receipt: z.null(),
  runtime_eligible: z.literal(false),
  canonical_authority: z.literal(false),
  persistent_store_writes_performed: z.literal(false),
}).strict();

const approvedArtifactSchema = z.object({
  schema: z.literal('atlas.observation-feature-registry-approved-artifact.v1'),
  proposal: proposalSchema,
  review_receipt: reviewReceiptSchema,
}).strict();

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function observationFeatureReviewReceiptSigningBytesV1(receipt: ObservationFeatureReviewReceiptV1): Buffer {
  const { signature: _signature, ...payload } = receipt;
  return Buffer.from(canonicalJson(payload), 'utf8');
}

export function validateApprovedObservationFeatureRegistryArtifactV1(input: {
  artifact: unknown;
  authorizedReviewerIds: readonly string[];
  trustedApprovalReceiptChecksum: string;
  reviewerPublicKeys?: Readonly<Record<string, string>>;
}) {
  if (input.authorizedReviewerIds.length === 0) throw new Error('TRUSTED_REVIEWER_ALLOWLIST_REQUIRED');
  const artifact = approvedArtifactSchema.parse(input.artifact);
  const registry = observationFeatureRegistrySchema.parse(artifact.proposal.registry);
  const proposalPayload = {
    schema: artifact.proposal.schema,
    registry,
    ast_grep_mappings: artifact.proposal.ast_grep_mappings,
    symbol_kind_hints: artifact.proposal.symbol_kind_hints,
  };
  const proposalChecksum = digest(proposalPayload);
  if (proposalChecksum !== artifact.proposal.proposal_checksum) throw new Error('PROPOSAL_CHECKSUM_MISMATCH');
  if (artifact.proposal.proposal_revision !== `proposal:sha256:${proposalChecksum}`) throw new Error('PROPOSAL_REVISION_MISMATCH');

  const registryChecksum = observationFeatureChecksum({
    registry_revision: registry.registry_revision,
    definitions: registry.definitions,
  });
  if (registryChecksum !== registry.registry_checksum) throw new Error('REGISTRY_CHECKSUM_MISMATCH');
  const revisionDefinitions = registry.definitions.map(({ ordinal: _ordinal, ...definition }) => definition);
  if (registry.registry_revision !== `proposal:sha256:${observationFeatureChecksum(revisionDefinitions)}`) {
    throw new Error('REGISTRY_REVISION_MISMATCH');
  }

  const receipt = artifact.review_receipt;
  if (!input.authorizedReviewerIds.includes(receipt.reviewer_id)) throw new Error('REVIEWER_NOT_AUTHORIZED');
  if (receipt.proposal_checksum !== proposalChecksum) throw new Error('REVIEW_RECEIPT_PROPOSAL_MISMATCH');
  if (receipt.registry_revision !== registry.registry_revision) throw new Error('REVIEW_RECEIPT_REVISION_MISMATCH');
  if (receipt.registry_checksum !== registry.registry_checksum) throw new Error('REVIEW_RECEIPT_REGISTRY_MISMATCH');
  if (observationFeatureChecksum(receipt) !== input.trustedApprovalReceiptChecksum) {
    throw new Error('REVIEW_RECEIPT_TRUST_ANCHOR_MISMATCH');
  }

  let authenticationStatus: 'APPROVAL_BINDINGS_VALIDATED_NOT_AUTHENTICATED' | 'REVIEW_SIGNATURE_VERIFIED_NOT_RUNTIME_ELIGIBLE' = 'APPROVAL_BINDINGS_VALIDATED_NOT_AUTHENTICATED';
  if (receipt.signature_algorithm !== undefined || receipt.signature !== undefined) {
    if (receipt.signature_algorithm !== 'Ed25519' || receipt.signature === undefined) {
      throw new Error('REVIEW_SIGNATURE_ENVELOPE_INCOMPLETE');
    }
    const publicKeyPem = input.reviewerPublicKeys?.[receipt.reviewer_id];
    if (!publicKeyPem) throw new Error('REVIEWER_PUBLIC_KEY_UNAVAILABLE');
    const signatureValid = verify(
      null,
      observationFeatureReviewReceiptSigningBytesV1(receipt),
      createPublicKey(publicKeyPem),
      Buffer.from(receipt.signature, 'base64'),
    );
    if (!signatureValid) throw new Error('REVIEW_SIGNATURE_INVALID');
    authenticationStatus = 'REVIEW_SIGNATURE_VERIFIED_NOT_RUNTIME_ELIGIBLE';
  }

  return {
    status: authenticationStatus,
    approval_receipt_id: receipt.receipt_id,
    reviewer_id: receipt.reviewer_id,
    proposal_checksum: proposalChecksum,
    registry_revision: registry.registry_revision,
    registry_checksum: registry.registry_checksum,
    runtime_eligible: false as const,
    canonical_authority: false as const,
  };
}
