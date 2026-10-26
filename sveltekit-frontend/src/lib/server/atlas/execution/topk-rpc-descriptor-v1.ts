import { z } from 'zod';
import type { HyperRagPacketRpcResult } from '../../retrieval/hyperrag-packet-rpc.js';
import {
  TopKExecutionSchema,
  topKInputChecksumV1,
  topKManifestChecksumV1,
  type TopKExecutionV1,
  type TopKVerificationV1,
} from './topk-execution-receipt-v1.js';

/**
 * Bounded descriptor that lets the EXISTING HyperRAG Packet RPC result reference a Top-K execution receipt.
 * References and checksums only: no score matrices, no vectors, no source text. It is evidence, not identity:
 * it adds no retrieval vote, does not reorder `packets`, and carries `verified` only when an independent replay
 * verdict is supplied. Attaching it never writes anything.
 */
export const TOPK_RPC_DESCRIPTOR_SCHEMA = 'atlas.topk.rpc-descriptor.v1' as const;
export const TOPK_RPC_MAX_SELECTED = 25 as const;

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);

export const TopKRpcDescriptorSchema = z.object({
  schema: z.literal(TOPK_RPC_DESCRIPTOR_SCHEMA),
  executionId: z.string().regex(/^topk:[a-f0-9]{64}$/),
  manifestChecksum: hex64,
  inputChecksum: hex64,
  outputDigest: hex64,
  ordinalMapDigest: hex64,
  workspaceRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  algorithm: z.literal('cpu_exact'),
  backend: z.literal('cpu'),
  k: z.number().int().min(1).max(100),
  selected: z.array(z.object({
    rank: z.number().int().positive(),
    ordinal: z.number().int().nonnegative(),
    canonicalId: z.string().min(1),
  }).strict()).max(TOPK_RPC_MAX_SELECTED),
  truncated: z.boolean(),
  status: z.enum(['PASS', 'FAIL']),
  verified: z.enum(['VERIFIED_PASS', 'VERIFIED_FAIL', 'NOT_VERIFIED']),
  canonicalAuthority: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  writesPerformed: z.literal(false),
  gpuExecuted: z.literal(false),
}).strict();
export type TopKRpcDescriptorV1 = z.infer<typeof TopKRpcDescriptorSchema>;

export type HyperRagPacketRpcResultWithTopKV1 = HyperRagPacketRpcResult & { topk_execution?: TopKRpcDescriptorV1 | null };

export function buildTopKRpcDescriptorV1(params: {
  execution: TopKExecutionV1;
  verification?: Pick<TopKVerificationV1, 'status' | 'executionId'> | null;
}): TopKRpcDescriptorV1 {
  const execution = TopKExecutionSchema.parse(params.execution);
  const selected = execution.selected.slice(0, TOPK_RPC_MAX_SELECTED).map((s) => ({ rank: s.rank, ordinal: s.ordinal, canonicalId: s.canonicalId }));
  // A verdict for a different execution is not evidence for this one.
  const verdict = params.verification?.executionId === execution.executionId ? params.verification.status : undefined;
  return TopKRpcDescriptorSchema.parse({
    schema: TOPK_RPC_DESCRIPTOR_SCHEMA,
    executionId: execution.executionId,
    manifestChecksum: topKManifestChecksumV1(execution),
    inputChecksum: topKInputChecksumV1(execution),
    outputDigest: execution.outputDigest,
    ordinalMapDigest: execution.ordinalMapDigest,
    workspaceRevision: execution.workspaceRevision,
    candidateSnapshotRevision: execution.candidateSnapshotRevision,
    algorithm: execution.algorithm,
    backend: execution.backend,
    k: execution.k,
    selected,
    truncated: execution.selected.length > selected.length,
    status: execution.status,
    verified: verdict === 'VERIFIED_PASS' || verdict === 'VERIFIED_FAIL' ? verdict : 'NOT_VERIFIED',
    canonicalAuthority: false,
    retrievalVoteAdded: false,
    writesPerformed: false,
    gpuExecuted: false,
  });
}

/** Returns a new result; `packets` and `trace` are passed through untouched (same references, same order). */
export function attachTopKDescriptorToRpcResultV1(
  result: HyperRagPacketRpcResult,
  descriptor: TopKRpcDescriptorV1,
): HyperRagPacketRpcResultWithTopKV1 {
  return { ...result, topk_execution: TopKRpcDescriptorSchema.parse(descriptor) };
}
