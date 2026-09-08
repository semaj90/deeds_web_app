import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * TileMaterializerV1 — pure byte-residency mechanics. Takes an artifact reference (packetKey,
 * sourceRef, qdrantPointId, etc.) named by a control word or assembly plan and resolves it to
 * bytes staged on a given backend. CANNOT decide what the bytes mean — that's the assembler's and
 * validator's job. See
 * openspec/changes/parent-atlas-packet-control-word-record/design.md's "Five operations" table.
 *
 * Non-goal (this change): no production wiring into ACE/BitFrost/SeaweedFS/mmap/GPU. The
 * interface is real; `createFixtureTileMaterializerV1` below is a FIXTURE-ONLY in-memory
 * implementation for proof-gate tests, never for production use.
 */

export const ArtifactReferenceV1Schema = z
  .object({
    packetKey: z.string().min(1),
    sourceRef: z.string().min(1).optional(),
    qdrantPointId: z.string().min(1).optional(),
    representationKind: z.string().min(1),
  })
  .strict();
export type ArtifactReferenceV1 = z.infer<typeof ArtifactReferenceV1Schema>;

export const MATERIALIZATION_BACKENDS_V1 = ['SEAWEEDFS', 'MMAP', 'RAM', 'GPU'] as const;
export type MaterializationBackendV1 = (typeof MATERIALIZATION_BACKENDS_V1)[number];

export const MATERIALIZED_TILE_SCHEMA = 'atlas.materialized-tile.v1' as const;

export const MaterializedTileV1Schema = z
  .object({
    schema: z.literal(MATERIALIZED_TILE_SCHEMA),
    packetKey: z.string().min(1),
    backend: z.enum(MATERIALIZATION_BACKENDS_V1),
    byteLength: z.number().int().nonnegative(),
    checksum: z.string().min(1),
    residency: z.enum(['ABSENT', 'COLD', 'WARM', 'HOT_CPU', 'HOT_GPU', 'CONSUMED']),
  })
  .strict();
export type MaterializedTileV1 = z.infer<typeof MaterializedTileV1Schema>;

export interface TileMaterializerV1 {
  materialize(ref: ArtifactReferenceV1, backend: MaterializationBackendV1): Promise<MaterializedTileV1>;
}

const BACKEND_TO_DEFAULT_RESIDENCY: Record<MaterializationBackendV1, MaterializedTileV1['residency']> = {
  SEAWEEDFS: 'COLD',
  MMAP: 'WARM',
  RAM: 'HOT_CPU',
  GPU: 'HOT_GPU',
};

/**
 * createFixtureTileMaterializerV1 — FIXTURE-ONLY in-memory implementation of TileMaterializerV1,
 * backed by a plain Map<packetKey, bytes>. Used exclusively by this change's proof-gate tests.
 * Never wire this into production code — it has no real SeaweedFS/mmap/GPU backing at all.
 */
export function createFixtureTileMaterializerV1(store: ReadonlyMap<string, Uint8Array>): TileMaterializerV1 {
  return {
    async materialize(ref, backend) {
      const bytes = store.get(ref.packetKey);
      if (!bytes) {
        throw new Error(`fixture tile materializer: no bytes registered for packetKey "${ref.packetKey}"`);
      }
      const checksum = createHash('sha256').update(bytes).digest('hex');
      return MaterializedTileV1Schema.parse({
        schema: MATERIALIZED_TILE_SCHEMA,
        packetKey: ref.packetKey,
        backend,
        byteLength: bytes.length,
        checksum,
        residency: BACKEND_TO_DEFAULT_RESIDENCY[backend],
      });
    },
  };
}
