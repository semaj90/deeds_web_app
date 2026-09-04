import { z } from 'zod';

/**
 * Governed owner contract for the OaK DAG candidate-side latent_256 fetch
 * (FETCH-LATENT-OPERATOR-01, parent-atlas-retrieval-lineage-dag-convergence).
 *
 * Distinct from oak-neural-latent-owner-v1.ts: that contract governs a QUERY-TIME encode call
 * (fresh text -> semantic_768 -> latent_256 via the live GPU decoder, SHADOW_READONLY). This
 * contract governs CANDIDATE-SIDE hydration -- fetching already-materialized latent_256 vectors
 * for known candidate ids that a prior retrieval pass already produced. No encoder call, no GPU
 * involvement, pure Postgres read. Both are legitimate FETCH_LATENT sub-cases, not duplicates of
 * each other.
 *
 * The raw vector array is NEVER part of this contract's output -- only checksums/ordinals/counts
 * (CandidateRepresentationSliceV1), per this repo's hard rule against embedding large numeric
 * arrays in DAG JSON descriptors.
 *
 * FETCH-LATENT-DERIVED-VIEWS-02: `representationId` selects which member of
 * NESTED_LATENT_REPRESENTATION_FAMILY_V1 (representation-artifact-v1.ts) this request resolves.
 * `latent_256` (default, back-compat) is an exact physical read via the provider below.
 * `latent_128` is a DERIVED+VIRTUAL view -- the handler fetches the SAME latent_256 parent row,
 * then applies NESTED_PREFIX_L2_RENORMALIZE (latent-derived-view-transform-v1.ts) before
 * computing the derived-view checksum; no separate storage, no separate provider. `latent_64` is
 * deliberately NOT accepted here: it is LEARNED+PERSISTED (its own NestedSemanticAutoencoder
 * forward pass over semantic_768, per representation-artifact-v1.ts's own live-verified comment),
 * not a transform of latent_256 -- and codebase_chunk_index has no `latent_64_checkpoint_revision`
 * column to bind provenance against (checked live; only latent_256 has one). Reusing
 * latent_256_checkpoint_revision for latent_64 would assert an unproven identity between two
 * independently-writable columns. Leave latent_64 candidate-side FETCH_LATENT open until that
 * column exists -- do not fake the binding to close this gate early.
 */

export const OAK_CANDIDATE_LATENT_STRICT_V1 =
  'sveltekit-frontend/src/lib/server/retrieval/latent256-candidate-provider.ts#PostgresLatent256CandidateProvider' as const;

export const OAK_CANDIDATE_LATENT_SUPPORTED_REPRESENTATION_IDS = ['latent_256', 'latent_128'] as const;

export const oakCandidateLatentInputV1Schema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(1000),
  candidateSnapshotRevision: z.string().min(1),
  representationId: z.enum(OAK_CANDIDATE_LATENT_SUPPORTED_REPRESENTATION_IDS).default('latent_256'),
  representationRevision: z.string().min(1),
  checkpointRevision: z.string().min(1),
}).strict();

export type OakCandidateLatentInputV1 = z.infer<typeof oakCandidateLatentInputV1Schema>;
