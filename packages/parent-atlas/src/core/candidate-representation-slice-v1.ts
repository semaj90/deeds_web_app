import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * CandidateRepresentationSliceV1 — the output shape for a FETCH_LATENT_REPRESENTATION /
 * FETCH_LATENT action (FETCH-LATENT-OPERATOR-01, parent-atlas-retrieval-lineage-dag-convergence).
 *
 * Deliberately contains ONLY checksums and ordinals -- never a raw vector array. This matches
 * this repo's own hard rule (Wire Format Layering Rule / "large arrays travel by reference, not
 * inline in a JSON descriptor") that already governs every other packet descriptor in this
 * codebase. A DAG receipt or ContextManifest carrying this slice can prove which candidates'
 * representation data was fetched, at what revision, and that the fetch succeeded/degraded --
 * without ever putting float payloads inside DAG JSON.
 */
export const candidateRepresentationSliceV1Schema = z.object({
  schema: z.literal('atlas.candidate-representation-slice.v1').default('atlas.candidate-representation-slice.v1'),
  candidateSnapshotRevision: id,
  ordinalMapChecksum: sha256Hex,
  representationId: id,
  representationRevision: revision,
  vectorsChecksum: sha256Hex,
  candidateOrdinals: z.array(z.number().int().nonnegative()),
  requested: z.number().int().nonnegative(),
  found: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  canonicalAuthority: z.literal(false).default(false),
  writesPerformed: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.found > value.requested) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['found'], message: 'CANDIDATE_REPRESENTATION_SLICE_FOUND_EXCEEDS_REQUESTED' });
  }
  if (value.candidateOrdinals.length !== value.found) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidateOrdinals'], message: 'CANDIDATE_REPRESENTATION_SLICE_ORDINAL_COUNT_MISMATCH' });
  }
});

export type CandidateRepresentationSliceV1 = z.infer<typeof candidateRepresentationSliceV1Schema>;

export function buildCandidateRepresentationSliceV1(
  input: Omit<CandidateRepresentationSliceV1, 'schema' | 'canonicalAuthority' | 'writesPerformed'>,
): CandidateRepresentationSliceV1 {
  return candidateRepresentationSliceV1Schema.parse({
    ...input,
    schema: 'atlas.candidate-representation-slice.v1' as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  });
}
