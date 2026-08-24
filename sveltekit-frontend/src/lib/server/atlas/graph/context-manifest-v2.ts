import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import type { ContextManifestV1 } from './graph-runtime-contracts.js';

/**
 * CM-02 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration).
 *
 * ContextManifestV1 identifies a manifest by requestId/snapshotId/graphRevision
 * + candidateCount — it does not bind the full evidence-revision set that the
 * newer prefill/ontology contracts already carry (sourceRevision,
 * representationRevision, featureRevision, ontologyRevision, modelRevision,
 * prompt-template revision). ContextManifestV2 does NOT replace
 * ContextManifestV1 or become a second manifest owner: it is a strict
 * superset — every V1 field is carried through unchanged, plus a checksum
 * over the evidence-revision set and the identity components that make one
 * manifest instance reproducible. Nothing here creates, ranks, or persists a
 * manifest; it is purely a stronger identity computed FROM an existing V1
 * manifest plus revision inputs the caller already has.
 */

const revisionOrNull = z.union([z.string().min(1), z.null()]);

export const ContextManifestV2IdentityInputSchema = z.object({
  selectedOrdinalSetChecksum: z.string().min(1),
  evidenceRevisions: z.object({
    sourceRevision: revisionOrNull,
    representationRevision: revisionOrNull,
    featureRevision: revisionOrNull,
    ontologyRevision: revisionOrNull,
    modelRevision: revisionOrNull,
    promptTemplateRevision: revisionOrNull,
  }),
  ordinalMapChecksum: z.string().min(1),
  retrievalPolicyRevision: z.string().min(1),
  acePlaybookRevision: z.string().min(1),
}).strict();

export type ContextManifestV2IdentityInput = z.infer<typeof ContextManifestV2IdentityInputSchema>;

export const ContextManifestV2Schema = z.object({
  schema: z.literal('atlas.context-manifest.v2'),
  v1: z.custom<ContextManifestV1>((value) => typeof value === 'object' && value !== null),
  identityInput: ContextManifestV2IdentityInputSchema,
  identityChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type ContextManifestV2 = z.infer<typeof ContextManifestV2Schema>;

/**
 * Binds an existing ContextManifestV1 to a revision-qualified identity
 * checksum. The checksum covers exactly the fields listed in Gap ACE-1:
 * selectedOrdinalSetChecksum + evidenceRevisionChecksum(-equivalent, folded
 * into the same digest) + ordinalMapChecksum + retrievalPolicyRevision +
 * acePlaybookRevision + modelRevision + promptTemplateRevision. It does not
 * recompute or validate V1's own fields (candidateCount, graphRevision,
 * etc.) — those stay owned by whatever already builds ContextManifestV1.
 */
export function buildContextManifestV2(
  v1: ContextManifestV1,
  identityInput: ContextManifestV2IdentityInput,
): ContextManifestV2 {
  const parsedInput = ContextManifestV2IdentityInputSchema.parse(identityInput);
  const identityChecksum = canonicalSha256V1({
    schema: 'atlas.context-manifest-v2-identity.v1',
    v1RequestId: v1.requestId,
    v1SnapshotId: v1.snapshotId,
    v1CandidateBucket: v1.candidateBucket,
    ...parsedInput,
  });
  return ContextManifestV2Schema.parse({
    schema: 'atlas.context-manifest.v2',
    v1,
    identityInput: parsedInput,
    identityChecksum,
  });
}
