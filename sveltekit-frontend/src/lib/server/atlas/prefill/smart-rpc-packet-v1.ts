import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from './canonical-hash-v1.js';

const revision = z.string().min(1);

export const SmartRpcArtifactRefV1Schema = z.object({
  artifactId: z.string().min(1),
  representationId: z.string().min(1),
  representationRevision: revision,
  checksumSha256: sha256HexSchema,
  format: z.enum(['ARROW_IPC', 'MMAP_F32', 'MMAP_F16', 'JSON', 'MSGPACK', 'PROTOBUF', 'RAW_BYTES']),
  byteLength: z.number().int().nonnegative(),
}).strict();

export const SmartRpcPacketV1Schema = z.object({
  schema: z.literal('atlas.smart-rpc-packet.v1'),
  packetHash: sha256HexSchema,
  identity: z.object({
    canonicalId: z.string().min(1),
    packetKey: z.string().min(1),
    workspaceRevision: revision,
    sourceRevision: revision,
    graphRevision: revision,
    representationRevision: revision,
  }).strict(),
  structural: z.object({
    symbolVersionId: z.string().min(1),
    treeNodeId: z.string().min(1),
    grammarRevision: revision,
  }).strict().nullable(),
  ordinals: z.object({
    registryRevision: revision,
    registryChecksumSha256: sha256HexSchema,
    semanticOrdinal: z.number().int().nonnegative().nullable(),
    graphOrdinal: z.number().int().nonnegative().nullable(),
    tensorRow: z.number().int().nonnegative().nullable(),
  }).strict(),
  representations: z.object({
    semanticSnapshotRef: SmartRpcArtifactRefV1Schema.nullable(),
    hypergraphSnapshotRef: SmartRpcArtifactRefV1Schema.nullable(),
    featureMatrixRef: SmartRpcArtifactRefV1Schema.nullable(),
    tensorArtifactRefs: z.array(SmartRpcArtifactRefV1Schema).max(256),
  }).strict(),
  evidenceRefs: z.array(z.string().min(1)).max(4096),
  artifactRefs: z.array(z.string().min(1)).max(4096),
  execution: z.object({
    workflowId: z.string().min(1),
    workflowRevision: z.number().int().nonnegative(),
    actionId: z.string().min(1),
    dagNodeId: z.string().min(1),
    attempt: z.number().int().positive(),
  }).strict().nullable(),
  checksumSha256: sha256HexSchema,
}).strict();

export type SmartRpcArtifactRefV1 = z.infer<typeof SmartRpcArtifactRefV1Schema>;
export type SmartRpcPacketV1 = z.infer<typeof SmartRpcPacketV1Schema>;

/**
 * SmartRpcPacketV1 is intentionally a manifest. Large tensors, vector corpora,
 * AST trees and incidence arrays must stay behind checksum-qualified artifact
 * handles; this packet moves identity, ordinals, revisions and execution lineage.
 */
export function buildSmartRpcPacketV1(input: Omit<SmartRpcPacketV1, 'schema' | 'checksumSha256'>): SmartRpcPacketV1 {
  const payload = {
    schema: 'atlas.smart-rpc-packet.v1' as const,
    ...input,
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
    artifactRefs: [...new Set(input.artifactRefs)].sort(),
    representations: {
      ...input.representations,
      tensorArtifactRefs: [...input.representations.tensorArtifactRefs]
        .sort((a, b) => a.artifactId.localeCompare(b.artifactId, 'en')),
    },
  };
  const checksumSha256 = createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex');
  return SmartRpcPacketV1Schema.parse({ ...payload, checksumSha256 });
}
