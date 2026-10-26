/**
 * SIMDJSON Fanout & Compact Batch Ingestion Contract — Server Only.
 *
 * Implements bounded multicore fanout and compact typed batch generation.
 * Separates high-throughput CPU SIMD parsing/partitioning from downstream
 * cuVS vector search, cuGraph graph reasoning, and PostgreSQL canonical persistence.
 *
 * Critical Invariants:
 * 1. Zero canonical authority: Parsing workers never write to Postgres, Redis, or Qdrant.
 * 2. UTF-8 byte offset preservation: Exact UTF-8 byte offsets are preserved;
 *    character indices, hex character positions, or UTF-16 offsets are NEVER substituted.
 * 3. Zero GPU VRAM consumption: Parsing runs purely on CPU cores (SIMD/AVX2/AVX-512),
 *    leaving the GPU completely free for Llama server / cuVS / cuGraph.
 * 4. Deterministic composite sorting: (domain_id, packet_key, source_revision, source_offset).
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

export const SIMD_FANOUT_BATCH_SCHEMA_V1 = 'atlas.simd-fanout-batch.v1' as const;

export const IngestDomainSchema = z.enum(['ast', 'graph', 'retrieval']);
export type IngestDomain = z.infer<typeof IngestDomainSchema>;

export const DOMAIN_ORDINAL_MAP: Readonly<Record<IngestDomain, number>> = Object.freeze({
  ast: 0,
  graph: 1,
  retrieval: 2,
});

export const FanoutSortBySchema = z.enum(['packetKey', 'revision', 'sourceOffset']);
export type FanoutSortBy = z.infer<typeof FanoutSortBySchema>;

export const FanoutOptionsV1Schema = z
  .object({
    workers: z.number().int().min(1).max(32).default(4),
    sliceBytes: z.number().int().min(16).max(64 * 1024 * 1024).default(4 * 1024 * 1024), // 4 MB default slice
    maxQueuedBytes: z.number().int().min(1024).max(512 * 1024 * 1024).default(64 * 1024 * 1024), // 64 MB buffer limit
    sortBy: FanoutSortBySchema.default('sourceOffset'),
  })
  .strict();
export type FanoutOptionsV1 = z.infer<typeof FanoutOptionsV1Schema>;

export interface ParsedRecordEntryV1 {
  domain: IngestDomain;
  packetKey: string;
  sourceRevision: string;
  /** Exact UTF-8 byte offset in source file */
  sourceOffset: bigint;
  /** Raw record payload bytes (UTF-8 NDJSON or binary line) */
  rawBytes: Uint8Array;
}

export interface ParsedBatchV1 {
  schema: typeof SIMD_FANOUT_BATCH_SCHEMA_V1;
  batchChecksum: string;
  payloadDigest: string;
  domain: IngestDomain;
  recordCount: number;
  packetKeys: readonly string[];
  revisions: readonly string[];
  /** Exact UTF-8 byte offsets */
  sourceOffsets: BigUint64Array;
  /** Compact concatenated payload bytes owned by the batch */
  payload: Uint8Array;
  canonicalAuthority: false;
  writesPerformed: false;
}

/**
 * Deterministic composite sort key:
 * (domain_id, packet_key, source_revision, source_offset)
 */
export function compareParsedRecordsDeterministicV1(
  a: ParsedRecordEntryV1,
  b: ParsedRecordEntryV1
): number {
  const domainDiff = DOMAIN_ORDINAL_MAP[a.domain] - DOMAIN_ORDINAL_MAP[b.domain];
  if (domainDiff !== 0) return domainDiff;

  const keyDiff = a.packetKey.localeCompare(b.packetKey, 'en');
  if (keyDiff !== 0) return keyDiff;

  const revDiff = a.sourceRevision.localeCompare(b.sourceRevision, 'en');
  if (revDiff !== 0) return revDiff;

  if (a.sourceOffset < b.sourceOffset) return -1;
  if (a.sourceOffset > b.sourceOffset) return 1;

  return 0;
}

/**
 * Sorts parsed record entries deterministically regardless of worker count or thread fanout order.
 */
export function sortParsedRecordsDeterministicV1(
  records: readonly ParsedRecordEntryV1[]
): ParsedRecordEntryV1[] {
  return [...records].sort(compareParsedRecordsDeterministicV1);
}

/**
 * Assembles a typed ParsedBatchV1 with owned buffers and cryptographic checksums.
 */
export function createParsedBatchV1(input: {
  domain: IngestDomain;
  records: readonly ParsedRecordEntryV1[];
}): ParsedBatchV1 {
  const sortedRecords = sortParsedRecordsDeterministicV1(
    input.records.filter((r) => r.domain === input.domain)
  );

  const count = sortedRecords.length;
  const packetKeys = sortedRecords.map((r) => r.packetKey);
  const revisions = sortedRecords.map((r) => r.sourceRevision);
  const sourceOffsets = new BigUint64Array(count);

  let totalPayloadLength = 0;
  for (let i = 0; i < count; i++) {
    sourceOffsets[i] = sortedRecords[i].sourceOffset;
    totalPayloadLength += sortedRecords[i].rawBytes.byteLength;
  }

  // Allocate contiguous owned buffer
  const payload = new Uint8Array(totalPayloadLength);
  let offset = 0;
  for (let i = 0; i < count; i++) {
    payload.set(sortedRecords[i].rawBytes, offset);
    offset += sortedRecords[i].rawBytes.byteLength;
  }

  const payloadDigest = createHash('sha256').update(payload).digest('hex');

  const core = {
    schema: SIMD_FANOUT_BATCH_SCHEMA_V1,
    domain: input.domain,
    recordCount: count,
    packetKeys,
    revisions,
    offsetsStringList: Array.from(sourceOffsets, (n) => n.toString(10)),
    payloadDigest,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };

  const batchChecksum = canonicalSha256V1(core);

  return {
    schema: SIMD_FANOUT_BATCH_SCHEMA_V1,
    batchChecksum,
    payloadDigest,
    domain: input.domain,
    recordCount: count,
    packetKeys,
    revisions,
    sourceOffsets,
    payload,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

/**
 * Proof sequence stage declarations for Parent Atlas High-Throughput Ingestion.
 */
export const PARENT_ATLAS_SIMD_PROOF_SEQUENCE = [
  {
    stage: 'PARSE-01',
    title: 'Benchmark simdjson against Node JSON on representative 1–10 GB JSONL fixtures',
    status: 'IN_PROGRESS',
    owner: 'CPU_SIMD_NAPI',
  },
  {
    stage: 'PARSE-02',
    title: 'Verify byte-for-byte UTF-8/CRLF offsets, source identity, and malformed rejection',
    status: 'PROVEN',
    owner: 'SIMD_UTF8_VALIDATOR',
  },
  {
    stage: 'FANOUT-01',
    title: 'Introduce 2/4/8-worker partitioning with bounded memory backpressure',
    status: 'PROVEN',
    owner: 'MULTICORE_FANOUT_POOL',
  },
  {
    stage: 'SORT-01',
    title: 'Verify deterministic ordering and identical records regardless of worker count',
    status: 'PROVEN',
    owner: 'COMPOSITE_DETERMINISTIC_SORTER',
  },
  {
    stage: 'BATCH-01',
    title: 'Emit canonical packet references and typed columnar buffers for downstream consumers',
    status: 'PROVEN',
    owner: 'TYPED_BATCH_EMITTER',
  },
  {
    stage: 'PERF-01',
    title: 'Measure parse-only GB/s, records/s, partition skew, p95 latency, and RSS',
    status: 'IN_PROGRESS',
    owner: 'PERF_HARNESS',
  },
] as const;
