import { z } from 'zod';

export const STRUCTURAL_GRAPH_SNAPSHOT_SCHEMA = 'atlas.structural-graph-snapshot.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const structuralGraphSnapshotV1Schema = z.object({
  schema: z.literal(STRUCTURAL_GRAPH_SNAPSHOT_SCHEMA),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: sha256,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  edgeArtifact: z.object({
    format: z.literal('ARROW_IPC'),
    checksum: sha256,
    ref: z.string().min(1),
  }).strict(),
  canonicalAuthority: z.literal(false),
}).strict();

export type StructuralGraphSnapshotV1 = z.infer<typeof structuralGraphSnapshotV1Schema>;

/**
 * Validate a graph descriptor without loading its potentially large edge
 * artifact. Candidate ordinals are meaningful only under the bound snapshot.
 */
export function validateStructuralGraphSnapshotV1(input: unknown): StructuralGraphSnapshotV1 {
  return structuralGraphSnapshotV1Schema.parse(input);
}
