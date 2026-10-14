import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { ContextManifestV1Schema, type ContextManifestV1 } from './graph-runtime-contracts.js';

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
 * manifest instance reproducible. The V1 shape is schema-validated before it
 * is bound; this still does not establish source authority or evidence admission.
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
  // Optional so manifests built before ordered-selection binding keep their identity checksum.
  orderedSelectionChecksum: z.string().min(1).optional(),
}).strict();

export type ContextManifestV2IdentityInput = z.infer<typeof ContextManifestV2IdentityInputSchema>;

export const ContextManifestV2Schema = z.object({
  schema: z.literal('atlas.context-manifest.v2'),
  v1: ContextManifestV1Schema,
  identityInput: ContextManifestV2IdentityInputSchema,
  identityChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type ContextManifestV2 = z.infer<typeof ContextManifestV2Schema>;

/**
 * Binds an existing ContextManifestV1 to a revision-qualified identity
 * checksum. The checksum covers exactly the fields listed in Gap ACE-1:
 * selectedOrdinalSetChecksum + evidenceRevisionChecksum(-equivalent, folded
 * into the same digest) + ordinalMapChecksum + retrievalPolicyRevision +
 * acePlaybookRevision + modelRevision + promptTemplateRevision. The complete
 * V1 shape is validated by its owning schema; source authority/admission remain separate.
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

/**
 * Set identity of the selected candidate ordinals. Order-insensitive by design: it proves which
 * candidates were chosen, not the order they appear in the prompt.
 */
export function computeSelectedOrdinalSetChecksumV1(input: {
  snapshotId: string;
  ordinalMapChecksum: string;
  selectedOrdinals: readonly number[];
}): string {
  const sorted = [...input.selectedOrdinals].sort((a, b) => a - b);
  if (sorted.some((n) => !Number.isSafeInteger(n) || n < 0) || new Set(sorted).size !== sorted.length) {
    throw new Error('INVALID_SELECTED_ORDINALS');
  }
  return canonicalSha256V1({
    schema: 'atlas.selected-ordinal-set.v1',
    snapshotId: input.snapshotId,
    ordinalMapChecksum: input.ordinalMapChecksum,
    ordinals: sorted,
  });
}

/**
 * Ordered identity of the prompt selection: prompt-order ordinals, selected node keys and evidence refs.
 * Order-sensitive by design: the same set in a different order yields a different checksum.
 */
export function computeOrderedSelectionChecksumV1(input: {
  ordinals: readonly number[];
  selectedNodeKeys: readonly string[];
  evidenceRefs: readonly string[];
}): string {
  return canonicalSha256V1({
    schema: 'atlas.ordered-selection.v1',
    ordinals: [...input.ordinals],
    selectedNodeKeys: [...input.selectedNodeKeys],
    evidenceRefs: [...input.evidenceRefs],
  });
}

/**
 * Independent V2 admission check. Recomputes the selection identities from the ordinals and
 * manifest the caller actually observed, and rejects any disagreement with the stored checksums.
 */
export function verifyContextManifestV2Selection(
  v2: ContextManifestV2,
  observed: { snapshotId: string; ordinalMapChecksum: string; selectedOrdinals: readonly number[] },
): void {
  const expectedSet = computeSelectedOrdinalSetChecksumV1(observed);
  if (expectedSet !== v2.identityInput.selectedOrdinalSetChecksum) {
    throw new Error('CM2_SELECTED_ORDINAL_SET_MISMATCH');
  }
  if (v2.v1.candidateCount !== observed.selectedOrdinals.length) {
    throw new Error(`CM2_CANDIDATE_COUNT_MISMATCH: manifest ${v2.v1.candidateCount}, observed ${observed.selectedOrdinals.length}`);
  }
  if (v2.identityInput.orderedSelectionChecksum !== undefined) {
    const expectedOrdered = computeOrderedSelectionChecksumV1({
      ordinals: observed.selectedOrdinals,
      selectedNodeKeys: v2.v1.selectedNodeKeys,
      evidenceRefs: v2.v1.evidenceRefs,
    });
    if (expectedOrdered !== v2.identityInput.orderedSelectionChecksum) {
      throw new Error('CM2_ORDERED_SELECTION_MISMATCH');
    }
  }
}
