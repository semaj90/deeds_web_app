import {
  OAK_CANDIDATE_LATENT_STRICT_V1,
  oakCandidateLatentInputV1Schema,
  buildCandidateRepresentationSliceV1,
  deriveNestedPrefixL2RenormalizedView,
  type CandidateRepresentationSliceV1,
} from '@deeds/parent-atlas';
import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';
import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';
import {
  LATENT_256_DIM,
  PostgresLatent256CandidateProvider,
  type Latent256CandidateProviderV1,
} from '$lib/server/retrieval/latent256-candidate-provider.js';
import { createHash } from 'node:crypto';

const LATENT_128_DIM = 128;

/**
 * Candidate-side FETCH_LATENT handler (FETCH-LATENT-OPERATOR-01 + FETCH-LATENT-DERIVED-VIEWS-02,
 * parent-atlas-retrieval-lineage-dag-convergence): hydrates already-materialized latent_256
 * vectors for known candidate ids via the existing, proven PostgresLatent256CandidateProvider,
 * and optionally derives the `latent_128` DERIVED+VIRTUAL view from that same parent read
 * (representation-artifact-v1.ts's NESTED_LATENT_REPRESENTATION_FAMILY_V1 / origin+materialization
 * contract). `latent_64` is deliberately NOT handled here -- see the comment on
 * OAK_CANDIDATE_LATENT_SUPPORTED_REPRESENTATION_IDS in oak-candidate-latent-owner-v1.ts for why.
 *
 * Distinct from oak-dag-neural-latent-handler-v1.ts (query-time encode via the live GPU
 * neural-decoder service, SHADOW_READONLY): this handler does no encoding and no GPU work --
 * pure Postgres read of already-stored latent_256 data, plus (for latent_128) a pure in-process
 * prefix+L2-renormalize transform of that same read. Both are legitimate FETCH_LATENT sub-cases
 * sharing one action kind, matching this repo's existing many-operators-one-action-kind pattern
 * (see actionKindForOperator in kernel-bound-dag-planner-v1.ts).
 *
 * Output is CandidateRepresentationSliceV1 -- checksums and ordinals only. The provider's raw
 * `vectors` map (and, for latent_128, the derived vectors computed from it) are read here and
 * then deliberately discarded before returning; neither must ever reach the DAG receipt.
 */
function computeDerivedVectorsChecksum(vectors: ReadonlyMap<string, readonly number[]>): string {
  const digest = createHash('sha256');
  for (const [candidateId, vector] of [...vectors.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    digest.update(candidateId);
    const bytes = Buffer.alloc(vector.length * 4);
    for (let index = 0; index < vector.length; index += 1) {
      bytes.writeFloatLE(vector[index]!, index * 4);
    }
    digest.update(bytes);
  }
  return digest.digest('hex');
}

export function createOakDagCandidateLatentHandlerV1(
  provider: Latent256CandidateProviderV1 = new PostgresLatent256CandidateProvider(),
): OakDagActionHandlerV1 {
  return {
    implementationRef: OAK_CANDIDATE_LATENT_STRICT_V1,
    operatorId: 'op:candidate_latent_256',
    operatorKind: 'FETCH_LATENT_REPRESENTATION',
    actionKinds: ['FETCH_LATENT'],
    outputContract: 'atlas.candidate-representation-slice.v1',
    run: async ({ binding }: { binding: KernelDagExecutionBindingV1 }): Promise<CandidateRepresentationSliceV1> => {
      const args = oakCandidateLatentInputV1Schema.parse(binding.boundArguments);

      // The provider always reads the LEARNED+PERSISTED latent_256 parent -- there is no
      // separate storage for latent_128 to read from. representationId only changes what this
      // handler does with the parent read AFTER hydration, never the query itself.
      const result = await provider.hydrate({
        candidateIds: args.candidateIds,
        candidateSnapshotRevision: args.candidateSnapshotRevision,
        representationRevision: args.representationRevision,
        checkpointRevision: args.checkpointRevision,
      });

      const candidateOrdinals = result.outcomes
        .filter((outcome) => outcome.status === 'AVAILABLE')
        .map((outcome) => outcome.candidateOrdinal);

      const ordinalMapChecksum = createHash('sha256')
        .update(args.candidateIds.join(','))
        .digest('hex');

      if (args.representationId === 'latent_256') {
        // vectors (raw floats) intentionally not destructured/read past this point -- only the
        // provider's own precomputed vectorsChecksum crosses into the DAG receipt.
        return buildCandidateRepresentationSliceV1({
          candidateSnapshotRevision: args.candidateSnapshotRevision,
          ordinalMapChecksum,
          representationId: 'latent_256',
          representationRevision: args.representationRevision,
          vectorsChecksum: result.vectorsChecksum,
          candidateOrdinals,
          requested: result.requested,
          found: result.found,
          degraded: result.missing + result.revisionMismatch + result.invalidShape + result.identityUnresolved,
        });
      }

      // representationId === 'latent_128': derive from the parent latent_256 read via
      // NESTED_PREFIX_L2_RENORMALIZE. Any candidate whose parent vector doesn't have exactly
      // LATENT_256_DIM entries is dropped from the derived set and folded into `degraded` --
      // this handler never fabricates a shorter/longer view.
      const derivedVectors = new Map<string, readonly number[]>();
      let deriveRejected = 0;
      for (const [candidateId, parentVector] of result.vectors.entries()) {
        if (parentVector.length !== LATENT_256_DIM) {
          deriveRejected += 1;
          continue;
        }
        try {
          derivedVectors.set(candidateId, deriveNestedPrefixL2RenormalizedView(parentVector, LATENT_128_DIM));
        } catch {
          deriveRejected += 1;
        }
      }
      const derivedOrdinalSet = new Set(
        result.outcomes
          .filter((outcome) => outcome.status === 'AVAILABLE' && derivedVectors.has(outcome.canonicalId ?? ''))
          .map((outcome) => outcome.candidateOrdinal),
      );

      return buildCandidateRepresentationSliceV1({
        candidateSnapshotRevision: args.candidateSnapshotRevision,
        ordinalMapChecksum,
        representationId: 'latent_128',
        representationRevision: args.representationRevision,
        vectorsChecksum: computeDerivedVectorsChecksum(derivedVectors),
        candidateOrdinals: candidateOrdinals.filter((ordinal) => derivedOrdinalSet.has(ordinal)),
        requested: result.requested,
        found: derivedVectors.size,
        degraded:
          result.missing +
          result.revisionMismatch +
          result.invalidShape +
          result.identityUnresolved +
          deriveRejected,
      });
    },
  };
}
