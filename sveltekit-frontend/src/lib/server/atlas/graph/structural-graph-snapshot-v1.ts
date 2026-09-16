import { createHash } from 'node:crypto';
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

/** Stage 5 binding of one graph snapshot to its executor-local ordinal map. */
export const graphOrdinalManifestV1Schema = z.object({
  schema: z.literal('atlas.graph-ordinal-manifest.v1'),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  nodeManifestChecksum: sha256,
  edgeManifestChecksum: sha256,
  ordinalMapChecksum: sha256,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  manifestChecksum: sha256,
}).strict();

export type GraphOrdinalManifestV1 = z.infer<typeof graphOrdinalManifestV1Schema>;

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

function checksum(value: Record<string, unknown>): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

/**
 * Builds a non-authoritative manifest only when the supplied snapshot and
 * ordinal-map metadata agree. It does not materialize graph rows or edges.
 */
export function buildGraphOrdinalManifestV1(input: {
  snapshot: StructuralGraphSnapshotV1;
  nodeManifestChecksum: string;
}): GraphOrdinalManifestV1 {
  const snapshot = structuralGraphSnapshotV1Schema.parse(input.snapshot);
  if (snapshot.ordinalMapChecksum !== input.snapshot.ordinalMapChecksum) {
    throw new Error('GRAPH_ORDINAL_MANIFEST_ORDINAL_MAP_MISMATCH');
  }
  const payload = {
    schema: 'atlas.graph-ordinal-manifest.v1' as const,
    workspaceRevision: snapshot.workspaceRevision,
    graphRevision: snapshot.graphRevision,
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    nodeManifestChecksum: input.nodeManifestChecksum,
    edgeManifestChecksum: snapshot.edgeArtifact.checksum,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    nodeCount: snapshot.nodeCount,
    edgeCount: snapshot.edgeCount,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return graphOrdinalManifestV1Schema.parse({ ...payload, manifestChecksum: checksum(payload) });
}

/**
 * Validate a graph descriptor without loading its potentially large edge
 * artifact. Candidate ordinals are meaningful only under the bound snapshot.
 */
export function validateStructuralGraphSnapshotV1(input: unknown): StructuralGraphSnapshotV1 {
  return structuralGraphSnapshotV1Schema.parse(input);
}
