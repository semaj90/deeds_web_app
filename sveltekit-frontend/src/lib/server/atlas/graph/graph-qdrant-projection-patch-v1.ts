import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  verifyGraphSnapshotRevisionV1,
  type GraphSnapshotRevisionV1,
} from './graph-snapshot-revision-v1.js';

const id = z.string().trim().min(1);
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const graphRevision = z.string().regex(/^[a-f0-9]{64}$/);

const strongIdentitySchema = z.object({
  packetKey: id,
  canonicalId: id.nullable().optional(),
  symbolVersionId: id.nullable().optional(),
  sourceRef: id.nullable().optional(),
  treeNodeId: id.nullable().optional(),
}).strict();

export const graphQdrantProjectionPatchV1Schema = z.object({
  schema: z.literal('atlas.graph-qdrant-projection-patch.v1'),
  qdrantCollection: z.literal('codebase_chunks_768_v2'),
  qdrantPointId: id,
  mutation: z.literal('SET_PAYLOAD_ONLY'),
  vectorWrite: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  identityAuthority: z.literal(false),
  snapshotId: z.string().uuid(),
  workspaceWorldRevision: contentRevision,
  sourceRevision: contentRevision,
  graphRevision,
  representationId: z.literal('semantic_768'),
  representationRevision: id,
  identity: strongIdentitySchema,
  payload: z.object({
    packet_key: id,
    canonical_id: id.nullable().optional(),
    symbol_version_id: id.nullable().optional(),
    source_ref: id.nullable().optional(),
    tree_node_id: id.nullable().optional(),
    workspace_world_revision: contentRevision,
    source_revision: contentRevision,
    graph_revision: graphRevision,
    representation_id: z.literal('semantic_768'),
    representation_revision: id,
  }).strict(),
  patchChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type GraphQdrantProjectionPatchV1 = z.infer<typeof graphQdrantProjectionPatchV1Schema>;

export interface BuildGraphQdrantProjectionPatchV1Input {
  graphSnapshot: GraphSnapshotRevisionV1;
  qdrantPointId: string;
  packetKey: string;
  canonicalId?: string | null;
  symbolVersionId?: string | null;
  sourceRef?: string | null;
  treeNodeId?: string | null;
  sourceRevision: string;
  representationRevision: string | number;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksum(value: Record<string, unknown>): string {
  return createHash('sha256')
    .update('atlas.graph-qdrant-projection-patch.v1')
    .update('\0')
    .update(canonicalJson(value))
    .digest('hex');
}

/**
 * Plans the graph-owned portion of the canonical Qdrant payload projection.
 *
 * This function does not call Qdrant and cannot write vectors. The Qdrant point
 * ID is a projection address only. Identity remains packet/symbol/canonical
 * lineage, and graph/workspace/source revisions come from their canonical owners.
 */
export function buildGraphQdrantProjectionPatchV1(
  input: BuildGraphQdrantProjectionPatchV1Input,
): GraphQdrantProjectionPatchV1 {
  const snapshot = verifyGraphSnapshotRevisionV1(input.graphSnapshot);
  const representationRevision = String(input.representationRevision).trim();
  if (!representationRevision) throw new Error('GRAPH_QDRANT_REPRESENTATION_REVISION_REQUIRED');

  const parsed = z.object({
    qdrantPointId: id,
    packetKey: id,
    canonicalId: id.nullable().optional(),
    symbolVersionId: id.nullable().optional(),
    sourceRef: id.nullable().optional(),
    treeNodeId: id.nullable().optional(),
    sourceRevision: contentRevision,
  }).strict().parse({
    qdrantPointId: input.qdrantPointId,
    packetKey: input.packetKey,
    canonicalId: input.canonicalId ?? null,
    symbolVersionId: input.symbolVersionId ?? null,
    sourceRef: input.sourceRef ?? null,
    treeNodeId: input.treeNodeId ?? null,
    sourceRevision: input.sourceRevision,
  });

  const identity = {
    packetKey: parsed.packetKey,
    canonicalId: parsed.canonicalId,
    symbolVersionId: parsed.symbolVersionId,
    sourceRef: parsed.sourceRef,
    treeNodeId: parsed.treeNodeId,
  };

  const payload = {
    packet_key: parsed.packetKey,
    canonical_id: parsed.canonicalId,
    symbol_version_id: parsed.symbolVersionId,
    source_ref: parsed.sourceRef,
    tree_node_id: parsed.treeNodeId,
    workspace_world_revision: snapshot.workspaceRevision,
    source_revision: parsed.sourceRevision,
    graph_revision: snapshot.graphRevision,
    representation_id: 'semantic_768' as const,
    representation_revision: representationRevision,
  };

  const withoutChecksum = {
    schema: 'atlas.graph-qdrant-projection-patch.v1' as const,
    qdrantCollection: 'codebase_chunks_768_v2' as const,
    qdrantPointId: parsed.qdrantPointId,
    mutation: 'SET_PAYLOAD_ONLY' as const,
    vectorWrite: false as const,
    canonicalWritesAllowed: false as const,
    identityAuthority: false as const,
    snapshotId: snapshot.snapshotId,
    workspaceWorldRevision: snapshot.workspaceRevision,
    sourceRevision: parsed.sourceRevision,
    graphRevision: snapshot.graphRevision,
    representationId: 'semantic_768' as const,
    representationRevision,
    identity,
    payload,
  };

  return graphQdrantProjectionPatchV1Schema.parse({
    ...withoutChecksum,
    patchChecksum: checksum(withoutChecksum),
  });
}

export function verifyGraphQdrantProjectionPatchV1(input: unknown): GraphQdrantProjectionPatchV1 {
  const parsed = graphQdrantProjectionPatchV1Schema.parse(input);
  const { patchChecksum, ...withoutChecksum } = parsed;
  const expected = checksum(withoutChecksum);
  if (patchChecksum !== expected) throw new Error(`GRAPH_QDRANT_PROJECTION_PATCH_CHECKSUM_MISMATCH:${parsed.qdrantPointId}`);

  if (parsed.payload.packet_key !== parsed.identity.packetKey) {
    throw new Error(`GRAPH_QDRANT_PROJECTION_PACKET_KEY_MISMATCH:${parsed.qdrantPointId}`);
  }
  if (parsed.payload.workspace_world_revision !== parsed.workspaceWorldRevision) {
    throw new Error(`GRAPH_QDRANT_PROJECTION_WORKSPACE_REVISION_MISMATCH:${parsed.qdrantPointId}`);
  }
  if (parsed.payload.source_revision !== parsed.sourceRevision) {
    throw new Error(`GRAPH_QDRANT_PROJECTION_SOURCE_REVISION_MISMATCH:${parsed.qdrantPointId}`);
  }
  if (parsed.payload.graph_revision !== parsed.graphRevision) {
    throw new Error(`GRAPH_QDRANT_PROJECTION_GRAPH_REVISION_MISMATCH:${parsed.qdrantPointId}`);
  }
  if (parsed.payload.representation_revision !== parsed.representationRevision) {
    throw new Error(`GRAPH_QDRANT_PROJECTION_REPRESENTATION_REVISION_MISMATCH:${parsed.qdrantPointId}`);
  }

  return parsed;
}
