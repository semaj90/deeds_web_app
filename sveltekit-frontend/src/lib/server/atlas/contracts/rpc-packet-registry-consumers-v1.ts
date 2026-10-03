import { z } from 'zod';
import {
  CanonicalPacketRegistryIdentityV1Schema,
  RPC_PACKET_REGISTRY_SCHEMA_V1,
} from './rpc-packet-registry-v1.js';

const id = z.string().trim().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/i);

export const RegistrySnapshotManifestV1Schema = z.object({
  schema: z.literal('atlas.registry-snapshot-manifest.v1'),
  manifestId: id,
  workspaceId: id,
  workspaceRevision: id,
  packetCount: z.number().int().nonnegative(),
  manifestChecksum: digest,
  createdAt: z.string(),
  format: z.enum(['arrow_ipc', 'mmap_raw']),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type RegistrySnapshotManifestV1 = z.infer<typeof RegistrySnapshotManifestV1Schema>;

export const FutureConsumerKindV1Schema = z.enum([
  'xgboost',
  'pytorch',
  'reinforcement_learning',
  'kernel_dag',
  'hypergraph_rag',
  'agentic_dense_search',
]);

export type FutureConsumerKindV1 = z.infer<typeof FutureConsumerKindV1Schema>;

export const FutureConsumerReceiptV1Schema = z.object({
  schema: z.literal('atlas.future-consumer-receipt.v1'),
  consumerKind: FutureConsumerKindV1Schema,
  consumerId: id,
  manifestChecksum: digest,
  inputPacketCount: z.number().int().nonnegative(),
  replayChecksum: digest,
  admitted: z.boolean(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  generatedAt: z.string(),
}).strict();

export type FutureConsumerReceiptV1 = z.infer<typeof FutureConsumerReceiptV1Schema>;

export const AgenticDenseSearchAdmissionV1Schema = z.object({
  schema: z.literal('atlas.agentic-dense-search-admission.v1'),
  workspaceId: id,
  workspaceRevision: id,
  packetKey: id,
  packetRevision: id,
  contentHash: digest,
  evidenceBudget: z.number().int().positive().max(100),
  canonicalAuthority: z.boolean(),
  writesPerformed: z.literal(false),
}).strict();

export type AgenticDenseSearchAdmissionV1 = z.infer<typeof AgenticDenseSearchAdmissionV1Schema>;

export function admitAgenticDenseSearchContextV1(
  identity: z.infer<typeof CanonicalPacketRegistryIdentityV1Schema>,
  evidenceBudget = 30
): AgenticDenseSearchAdmissionV1 {
  const parsed = CanonicalPacketRegistryIdentityV1Schema.parse(identity);
  return AgenticDenseSearchAdmissionV1Schema.parse({
    schema: 'atlas.agentic-dense-search-admission.v1',
    workspaceId: parsed.workspaceId,
    workspaceRevision: parsed.workspaceRevision,
    packetKey: parsed.packetKey,
    packetRevision: parsed.packetRevision,
    contentHash: parsed.contentHash,
    evidenceBudget,
    canonicalAuthority: true,
    writesPerformed: false,
  });
}
