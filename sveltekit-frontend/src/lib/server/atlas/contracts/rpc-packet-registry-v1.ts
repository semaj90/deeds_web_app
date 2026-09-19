import { z } from 'zod';

export const RPC_PACKET_REGISTRY_SCHEMA_V1 = 'atlas.rpc-packet-registry.v1' as const;

const id = z.string().trim().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/i);

export const RegistryLaneKindV1Schema = z.enum([
  'bm25_pg_fts',
  'pgvector',
  'qdrant_dense',
  'qdrant_sparse',
  'cuvs_rapids',
  'fastapi_gpu',
]);

export type RegistryLaneKindV1 = z.infer<typeof RegistryLaneKindV1Schema>;

export const RegistryWritePolicyV1Schema = z.enum(['READ_ONLY', 'PROJECTION_ONLY', 'CANONICAL_GATED']);

export const CanonicalPacketRegistryIdentityV1Schema = z.object({
  schema: z.literal(RPC_PACKET_REGISTRY_SCHEMA_V1),
  workspaceId: id,
  workspaceRevision: id,
  packetKey: id,
  packetRevision: id,
  sourceRef: id,
  sourceRevision: id,
  contentHash: digest,
}).strict();

export type CanonicalPacketRegistryIdentityV1 = z.infer<typeof CanonicalPacketRegistryIdentityV1Schema>;

export const PacketRegistryLaneDescriptorV1Schema = z.object({
  laneId: id,
  kind: RegistryLaneKindV1Schema,
  owner: id,
  status: z.enum(['READY', 'DEGRADED', 'BLOCKED', 'UNPROVEN']),
  representationId: id.nullable(),
  representationRevision: id.nullable(),
  modelRevision: id.nullable(),
  collection: id.nullable(),
  vectorName: id.nullable(),
  tags: z.array(id).default([]),
  indexAlgorithm: z.enum(['GIN_FTS', 'IVFFLAT', 'HNSW', 'CAGRA', 'NONE']),
  indexRevision: id.nullable(),
  projectionChecksum: digest.nullable(),
  writePolicy: RegistryWritePolicyV1Schema,
}).strict();

export type PacketRegistryLaneDescriptorV1 = z.infer<typeof PacketRegistryLaneDescriptorV1Schema>;

export const PacketRegistryEntryV1Schema = CanonicalPacketRegistryIdentityV1Schema.extend({
  lanes: z.array(PacketRegistryLaneDescriptorV1Schema),
  registryRevision: id,
}).strict();

export type PacketRegistryEntryV1 = z.infer<typeof PacketRegistryEntryV1Schema>;

export const SemanticAstPacketV1Schema = CanonicalPacketRegistryIdentityV1Schema.extend({
  chunkId: id.nullable(),
  treeNodeId: id,
  nodeKind: id,
  qualifiedSymbol: id.nullable(),
  parentTreeNodeId: id.nullable(),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().gte(0),
  parserName: id,
  parserRevision: id,
  grammarRevision: id,
  astContentHash: digest,
}).strict().superRefine((value, ctx) => {
  if (value.byteEnd < value.byteStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byteEnd'], message: 'byteEnd must be >= byteStart' });
  }
});

export type SemanticAstPacketV1 = z.infer<typeof SemanticAstPacketV1Schema>;

export function isCanonicalPacketRegistryIdentityV1(value: unknown): value is CanonicalPacketRegistryIdentityV1 {
  return CanonicalPacketRegistryIdentityV1Schema.safeParse(value).success;
}

export function isPromotionEligibleRegistryEntryV1(entry: PacketRegistryEntryV1): boolean {
  return entry.lanes.length > 0 && entry.lanes.every((lane) => lane.status === 'READY' && lane.writePolicy !== 'CANONICAL_GATED');
}
