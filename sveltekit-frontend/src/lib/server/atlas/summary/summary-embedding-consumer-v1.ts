import { createHash } from 'node:crypto';
import { SummaryEmbeddingJobV1Schema, type SummaryEmbeddingJobV1, type SummaryRoutingPayloadV1 } from './summary-routing-payload-v1.js';
import {
  buildSummaryEmbeddingReceiptV1, dispositionFor, vectorDigestV1,
  type SummaryEmbeddingDispositionV1, type SummaryEmbeddingOutcomeV1, type SummaryEmbeddingReceiptV1, type SummaryEmbeddingReceiptInputV1,
} from './summary-embedding-receipt-v1.js';

/**
 * SUM-EMB-RMQ-02: PURE state machine over injected ports (no amqplib/pg/HTTP). The consumer never trusts the message:
 * it re-reads the canonical row, recompiles the payload, and fails closed before any embedding call. RabbitMQ is a thin
 * outer adapter that maps `disposition` onto ack/nack. Legacy HINT summaries never reach here (job projection is CURRENT-only).
 */
export interface EmbeddingRuntimeResultV1 {
  executorId: string; representationId: string; representationRevision: string; modelRevision: string; tokenizerRevision: string | null;
  promptRevision: string | null; dimension: number; normalized: boolean; vector: Float32Array; outputChecksum: string;
}
export interface SummaryEmbeddingWriteV1 {
  chunkRowId: string; summaryDigest: string; sourceRevision: string; workspaceRevision: string; representationId: string; representationRevision: string;
  vector: Float32Array; vectorDigest: string; meta: Record<string, unknown>;
}
export interface SummaryEmbeddingWriteResultV1 { status: 'WRITTEN' | 'LOST_RACE'; committed: boolean }
export interface SummaryEmbeddingReadbackV1 { summaryDigest: string; representationRevision: string; vectorDigest: string }
export interface SummaryEmbeddingConsumerDepsV1 {
  repository: {
    /** current canonical payload plus the exact summary_text bytes it was compiled from */
    rereadRoutingPayload(job: SummaryEmbeddingJobV1): Promise<{ payload: SummaryRoutingPayloadV1; summaryText: string }>;
    writeEmbedding(input: SummaryEmbeddingWriteV1): Promise<SummaryEmbeddingWriteResultV1>;
    readBackEmbedding(input: { chunkRowId: string; summaryDigest: string; representationRevision: string }): Promise<SummaryEmbeddingReadbackV1 | null>;
  };
  embedder: { embed(input: { text: string; expectedSummaryDigest: string }): Promise<EmbeddingRuntimeResultV1> };
}
export interface SummaryEmbeddingResultV1 { outcome: SummaryEmbeddingOutcomeV1; disposition: SummaryEmbeddingDispositionV1; receipt: SummaryEmbeddingReceiptV1 | null; reasons: string[] }

const REPRESENTATION_ID = 'semantic_768';
const NORM_TOLERANCE = 1e-3;
const sha = (t: string) => `sha256:${createHash('sha256').update(t, 'utf8').digest('hex')}`;

export async function processSummaryEmbeddingJobV1(
  rawJob: unknown, deps: SummaryEmbeddingConsumerDepsV1, opts: { attempt?: number; maxAttempts?: number } = {},
): Promise<SummaryEmbeddingResultV1> {
  const attempt = opts.attempt ?? 1; const maxAttempts = opts.maxAttempts ?? 3;
  const parsed = SummaryEmbeddingJobV1Schema.safeParse(rawJob);
  if (!parsed.success) return { outcome: 'BLOCKED_JOB_SCHEMA', disposition: 'ACK', receipt: null, reasons: ['JOB_SCHEMA_INVALID'] };
  const job = parsed.data;

  let base: SummaryEmbeddingReceiptInputV1 = {
    jobId: job.jobId, chunkRowId: job.chunkRowId, canonicalChunkId: job.canonicalChunkId, sourceRevision: job.sourceRevision, workspaceRevision: job.workspaceRevision,
    summaryDigest: job.summaryDigest, routingPayloadChecksum: null, representationId: job.representationId, representationRevision: null, modelRevision: null,
    tokenizerRevision: null, promptRevision: null, executorId: null, vectorDigest: null, dimension: null, normalized: null,
    writeStatus: 'NOT_ATTEMPTED', readbackStatus: 'NOT_ATTEMPTED', outcome: 'PROCESSED', reasons: [], writesPerformed: false,
  };
  const finish = (outcome: SummaryEmbeddingOutcomeV1, reasons: string[] = [], patch: Partial<SummaryEmbeddingReceiptInputV1> = {}): SummaryEmbeddingResultV1 => {
    const receipt = buildSummaryEmbeddingReceiptV1({ ...base, ...patch, outcome, reasons });
    return { outcome, disposition: dispositionFor(outcome, attempt, maxAttempts), receipt, reasons };
  };

  let current: { payload: SummaryRoutingPayloadV1; summaryText: string };
  try { current = await deps.repository.rereadRoutingPayload(job); } catch { return finish('RETRYABLE_REPOSITORY_UNAVAILABLE', ['REREAD_FAILED']); }
  const p = current.payload;
  base = { ...base, routingPayloadChecksum: p.payloadChecksum };

  // exact identity re-check against the CURRENT canonical row, never the message
  if (p.identity.chunkRowId !== job.chunkRowId || p.identity.packetKey !== job.packetKey || p.identity.sourceRef !== job.sourceRef) return finish('BLOCKED_JOB_PAYLOAD_DRIFT', ['IDENTITY_DRIFT']);
  if (p.identity.canonicalChunkId !== job.canonicalChunkId) return finish('BLOCKED_CANONICAL_CHUNK_CHANGED', ['CANONICAL_CHUNK_CHANGED']);
  if (p.identity.workspaceRevision !== job.workspaceRevision) return finish('BLOCKED_WORKSPACE_REVISION_CHANGED', ['WORKSPACE_REVISION_CHANGED']);
  if (p.identity.sourceRevision !== job.sourceRevision) return finish('BLOCKED_SOURCE_REVISION_CHANGED', ['SOURCE_REVISION_CHANGED']);
  if (p.summary.state !== 'CURRENT') {
    return p.summary.blockReasons.includes('NOT_ADMITTED') ? finish('BLOCKED_SUMMARY_NOT_ADMITTED', ['NOT_ADMITTED']) : finish('BLOCKED_SUMMARY_NOT_CURRENT', [`STATE_${p.summary.state}`]);
  }
  if (p.summary.source !== 'CANONICAL_SUMMARY_TEXT' || p.summary.admissionStatus !== 'ADMITTED') return finish('BLOCKED_SUMMARY_NOT_ADMITTED', ['NOT_ADMITTED']);
  if (p.summary.textDigest !== job.summaryDigest || sha(current.summaryText) !== job.summaryDigest) return finish('BLOCKED_SUMMARY_CHANGED', ['SUMMARY_DIGEST_CHANGED']);
  if (p.semantic.summaryEmbeddingAvailable) return finish('ALREADY_MATERIALIZED', ['BOUND_VECTOR_PRESENT'], { representationRevision: p.semantic.representationRevision, vectorDigest: p.semantic.vectorDigest });

  let r: EmbeddingRuntimeResultV1;
  try { r = await deps.embedder.embed({ text: current.summaryText, expectedSummaryDigest: job.summaryDigest }); } catch { return finish('RETRYABLE_EMBEDDER_UNAVAILABLE', ['EMBEDDER_CALL_FAILED']); }
  const runtime = { representationRevision: r.representationRevision || null, modelRevision: r.modelRevision || null, tokenizerRevision: r.tokenizerRevision, promptRevision: r.promptRevision, executorId: r.executorId, dimension: r.dimension, normalized: r.normalized };
  if (r.representationId !== REPRESENTATION_ID || !r.representationRevision) return finish('BLOCKED_REPRESENTATION_MISMATCH', ['REPRESENTATION_MISMATCH'], runtime);
  if (!r.modelRevision) return finish('BLOCKED_MODEL_REVISION_MISSING', ['MODEL_REVISION_MISSING'], runtime);
  if (r.dimension !== 768 || r.vector.length !== 768) return finish('BLOCKED_EMBEDDER_DIMENSION', [`DIMENSION_${r.vector.length}`], runtime);
  let sumSq = 0;
  for (let i = 0; i < r.vector.length; i++) { const x = r.vector[i]; if (!Number.isFinite(x)) return finish('BLOCKED_EMBEDDER_NONFINITE', ['NONFINITE_COMPONENT'], runtime); sumSq += x * x; }
  if (Math.abs(Math.sqrt(sumSq) - 1) > NORM_TOLERANCE || r.normalized !== true) return finish('BLOCKED_EMBEDDER_NOT_NORMALIZED', ['NORM_NOT_UNIT'], runtime);
  const vectorDigest = vectorDigestV1(r.vector);
  const stamped = { ...runtime, vectorDigest };

  let write: SummaryEmbeddingWriteResultV1;
  try {
    write = await deps.repository.writeEmbedding({
      chunkRowId: job.chunkRowId, summaryDigest: job.summaryDigest, sourceRevision: job.sourceRevision, workspaceRevision: job.workspaceRevision,
      representationId: REPRESENTATION_ID, representationRevision: r.representationRevision, vector: r.vector, vectorDigest,
      meta: { schema: 'atlas.summary-embedding-provenance.v1', representationId: REPRESENTATION_ID, representationRevision: r.representationRevision, modelRevision: r.modelRevision, executorId: r.executorId, summaryInputDigest: job.summaryDigest, vectorDigest, jobId: job.jobId },
    });
  } catch { return finish('RETRYABLE_REPOSITORY_UNAVAILABLE', ['WRITE_FAILED'], stamped); }
  let back: SummaryEmbeddingReadbackV1 | null;
  try { back = await deps.repository.readBackEmbedding({ chunkRowId: job.chunkRowId, summaryDigest: job.summaryDigest, representationRevision: r.representationRevision }); } catch { return finish('RETRYABLE_REPOSITORY_UNAVAILABLE', ['READBACK_FAILED'], { ...stamped, writeStatus: write.status, writesPerformed: write.committed }); }
  const matches = !!back && back.vectorDigest === vectorDigest && back.summaryDigest === job.summaryDigest && back.representationRevision === r.representationRevision;
  const wp = { ...stamped, writeStatus: write.status, writesPerformed: write.committed };
  if (write.status === 'LOST_RACE') return matches ? finish('ALREADY_MATERIALIZED', ['LOST_RACE_SAME_VECTOR'], { ...wp, readbackStatus: 'MATCH' }) : finish('BLOCKED_WRITE_RACE', ['LOST_RACE_DIFFERENT_STATE'], { ...wp, readbackStatus: back ? 'MISMATCH' : 'ABSENT' });
  if (!matches) return finish('BLOCKED_READBACK_MISMATCH', [back ? 'READBACK_DIGEST_DIFFERS' : 'READBACK_ABSENT'], { ...wp, readbackStatus: back ? 'MISMATCH' : 'ABSENT' });
  return finish('PROCESSED', [], { ...wp, readbackStatus: 'MATCH' });
}
