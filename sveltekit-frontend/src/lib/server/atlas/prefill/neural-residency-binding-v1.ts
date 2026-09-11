import { z } from 'zod';
import type { ContextManifest } from '$lib/server/ace/context-compiler.parent-atlas.js';

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/i);

export const NeuralResidencyBindingV1Schema = z.object({
  schema: z.literal('atlas.neural-residency-binding.v1'),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: sha256HexSchema,
  featureSnapshotChecksum: sha256HexSchema,
  gpuPackChecksum: sha256HexSchema,
  residencyObservationChecksum: sha256HexSchema,
  canonicalAuthority: z.literal(false),
  rankingPromotion: z.literal(false),
}).strict();

export type NeuralResidencyBindingV1 = z.infer<typeof NeuralResidencyBindingV1Schema>;

export type ContextManifestWithNeuralResidencyV1 = ContextManifest & {
  identity: NonNullable<ContextManifest['identity']> & {
    /** Exact CandidateFeatureSnapshotV1 revision; never inferred from ordinal order. */
    candidate_snapshot_revision: string;
    /** Exact CandidateFeatureSnapshotV1 checksum; never synthesized from packet IDs. */
    feature_snapshot_checksum: string;
  };
  neural_residency_binding: NeuralResidencyBindingV1;
};

/**
 * Additively binds an already-built ContextManifest to an already-proven
 * FEAT-04/residency pair. This does not materialize GPU buffers, invoke the
 * neural decoder, mutate ranking, or perform a canonical write.
 *
 * The manifest must already carry a complete identity envelope and the same
 * ordinal-map checksum. Candidate snapshot and feature snapshot identity come
 * only from the explicit binding argument; they are never reconstructed from
 * packet order, Redis/Qdrant IDs, or the ordinal-map checksum.
 */
export function bindNeuralResidencyToContextManifestV1(input: {
  manifest: ContextManifest;
  binding: NeuralResidencyBindingV1;
}): ContextManifestWithNeuralResidencyV1 {
  const binding = NeuralResidencyBindingV1Schema.parse(input.binding);
  const identity = input.manifest.identity;
  if (!identity) throw new Error('NEURAL_RESIDENCY_MANIFEST_IDENTITY_REQUIRED');
  if (!identity.complete) throw new Error('NEURAL_RESIDENCY_MANIFEST_IDENTITY_INCOMPLETE');
  if (!identity.ordinal_map_checksum) throw new Error('NEURAL_RESIDENCY_MANIFEST_ORDINAL_MAP_REQUIRED');
  if (identity.ordinal_map_checksum !== binding.ordinalMapChecksum) {
    throw new Error('NEURAL_RESIDENCY_ORDINAL_MAP_MISMATCH');
  }

  return {
    ...input.manifest,
    identity: {
      ...identity,
      candidate_snapshot_revision: binding.candidateSnapshotRevision,
      feature_snapshot_checksum: binding.featureSnapshotChecksum,
    },
    neural_residency_binding: binding,
  };
}

export function assertNeuralResidencyManifestBindingV1(
  manifest: ContextManifestWithNeuralResidencyV1,
): ContextManifestWithNeuralResidencyV1 {
  const binding = NeuralResidencyBindingV1Schema.parse(manifest.neural_residency_binding);
  if (!manifest.identity?.complete) throw new Error('NEURAL_RESIDENCY_MANIFEST_IDENTITY_INCOMPLETE');
  if (manifest.identity.ordinal_map_checksum !== binding.ordinalMapChecksum) {
    throw new Error('NEURAL_RESIDENCY_ORDINAL_MAP_MISMATCH');
  }
  if (manifest.identity.candidate_snapshot_revision !== binding.candidateSnapshotRevision) {
    throw new Error('NEURAL_RESIDENCY_CANDIDATE_SNAPSHOT_MISMATCH');
  }
  if (manifest.identity.feature_snapshot_checksum !== binding.featureSnapshotChecksum) {
    throw new Error('NEURAL_RESIDENCY_FEATURE_SNAPSHOT_MISMATCH');
  }
  return manifest;
}
