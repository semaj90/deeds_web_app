import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  buildExternalDocRetrievalProofReceipt,
  buildExternalDocsCutoverGate,
  externalDocRetrievalFixtureSetSchema,
  externalDocRetrievalProofReceiptSchema,
  externalDocsCutoverGateSchema,
  type ExternalDocRetrievalFixtureSetV1,
} from './external-doc-retrieval-proof.js';
import {
  externalDocsHybridProjectionReceiptSchema,
  type ExternalDocsHybridProjectionReceiptV1,
} from './external-doc-qdrant-hybrid.js';
import {
  externalDocsHybridProofGateSchema,
  type ExternalDocsHybridProofGateV1,
} from './external-doc-runtime-capabilities.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export interface ExternalDocRetrievalRuntimePort {
  embedSemantic768(queryText: string): Promise<number[]>;
  queryDense(input: { queryVector: number[]; k: number }): Promise<string[]>;
  queryBm25(input: { queryText: string; k: number }): Promise<string[]>;
  queryHybridRrf(input: { queryText: string; queryVector: number[]; k: number; prefetchK: number }): Promise<string[]>;
}

export const externalDocRetrievalEvaluationBundleSchema = z.object({
  schema: z.literal('atlas.external-doc-retrieval-evaluation-bundle.v1').default('atlas.external-doc-retrieval-evaluation-bundle.v1'),
  evaluation_id: z.string().min(1),
  fixture: externalDocRetrievalFixtureSetSchema,
  capability_gate: externalDocsHybridProofGateSchema,
  projection_receipt_before: externalDocsHybridProjectionReceiptSchema,
  projection_receipt_verified: externalDocsHybridProjectionReceiptSchema,
  dense_receipt: externalDocRetrievalProofReceiptSchema,
  bm25_receipt: externalDocRetrievalProofReceiptSchema,
  hybrid_receipt: externalDocRetrievalProofReceiptSchema,
  cutover_gate: externalDocsCutoverGateSchema,
  k: z.number().int().positive().max(10_000),
  prefetch_k: z.number().int().positive().max(100_000),
  evaluated_at: z.string().datetime(),
  bundle_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.capability_gate.status !== 'READY') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capability_gate'], message: 'evaluation bundle requires READY capability gate' });
  }
  if (value.projection_receipt_verified.status !== 'VERIFIED') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projection_receipt_verified'], message: 'evaluation bundle requires VERIFIED projection receipt' });
  }
  if (value.prefetch_k < value.k) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prefetch_k'], message: 'prefetch_k must be >= k' });
  }
  const expectedIds = new Set([
    value.dense_receipt.receipt_id,
    value.bm25_receipt.receipt_id,
    value.hybrid_receipt.receipt_id,
  ]);
  const observedIds = new Set([
    value.projection_receipt_verified.dense_parity_receipt_id,
    value.projection_receipt_verified.bm25_retrieval_receipt_id,
    value.projection_receipt_verified.hybrid_retrieval_receipt_id,
  ]);
  if (expectedIds.size !== 3 || [...expectedIds].some((receiptId) => !observedIds.has(receiptId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projection_receipt_verified'], message: 'verified projection must reference the three evaluation receipts' });
  }
});
export type ExternalDocRetrievalEvaluationBundleV1 = z.infer<typeof externalDocRetrievalEvaluationBundleSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function validateSemantic768(vector: number[], queryId: string): number[] {
  if (!Array.isArray(vector) || vector.length !== 768) {
    throw new Error(`EXTERNAL_DOC_QUERY_EMBEDDING_DIMENSION_MISMATCH:${queryId}:${vector?.length ?? 'null'}`);
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`EXTERNAL_DOC_QUERY_EMBEDDING_NONFINITE:${queryId}`);
  }
  return vector;
}

function uniqueRankedIds(values: readonly string[], k: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= k) break;
  }
  return result;
}

export async function evaluateExternalDocRetrieval(input: {
  port: ExternalDocRetrievalRuntimePort;
  evaluationId: string;
  fixture: ExternalDocRetrievalFixtureSetV1;
  capabilityGate: ExternalDocsHybridProofGateV1;
  projectionReceipt: ExternalDocsHybridProjectionReceiptV1;
  receiptRevision: string;
  producerRevision: string;
  evaluatedAt?: string;
  k?: number;
  prefetchK?: number;
  minimumDenseRecall?: number;
  minimumBm25Recall?: number;
  minimumHybridRecall?: number;
}): Promise<ExternalDocRetrievalEvaluationBundleV1> {
  const fixture = externalDocRetrievalFixtureSetSchema.parse(input.fixture);
  const capabilityGate = externalDocsHybridProofGateSchema.parse(input.capabilityGate);
  const projectionBefore = externalDocsHybridProjectionReceiptSchema.parse(input.projectionReceipt);

  if (capabilityGate.status !== 'READY') {
    throw new Error(`EXTERNAL_DOC_CAPABILITY_GATE_BLOCKED:${capabilityGate.blockers.join(',')}`);
  }
  if (!capabilityGate.capability_profile.shadow_collection_exists ||
      capabilityGate.capability_profile.shadow_collection_vector_mode !== 'HYBRID_DENSE_SPARSE') {
    throw new Error('EXTERNAL_DOC_SHADOW_COLLECTION_NOT_PROVEN_HYBRID');
  }
  if (fixture.source_snapshot_revision !== projectionBefore.source_snapshot_revision) {
    throw new Error('EXTERNAL_DOC_FIXTURE_PROJECTION_SOURCE_REVISION_MISMATCH');
  }

  const k = input.k ?? 10;
  const prefetchK = input.prefetchK ?? Math.max(50, k * 5);
  if (!Number.isInteger(k) || k <= 0 || !Number.isInteger(prefetchK) || prefetchK < k) {
    throw new Error('EXTERNAL_DOC_RETRIEVAL_K_INVALID');
  }

  const denseRankings: Record<string, string[]> = {};
  const bm25Rankings: Record<string, string[]> = {};
  const hybridRankings: Record<string, string[]> = {};

  for (const query of fixture.queries) {
    const queryVector = validateSemantic768(await input.port.embedSemantic768(query.query_text), query.query_id);
    const [dense, bm25, hybrid] = await Promise.all([
      input.port.queryDense({ queryVector, k }),
      input.port.queryBm25({ queryText: query.query_text, k }),
      input.port.queryHybridRrf({ queryText: query.query_text, queryVector, k, prefetchK }),
    ]);
    denseRankings[query.query_id] = uniqueRankedIds(dense, k);
    bm25Rankings[query.query_id] = uniqueRankedIds(bm25, k);
    hybridRankings[query.query_id] = uniqueRankedIds(hybrid, k);
  }

  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const commonReceipt = {
    receiptRevision: input.receiptRevision,
    fixture,
    projectionRevision: projectionBefore.projection_revision,
    qdrantVersion: capabilityGate.capability_profile.qdrant_version,
    k,
    evaluatedAt,
    producerRevision: input.producerRevision,
  };
  const denseReceipt = buildExternalDocRetrievalProofReceipt({
    ...commonReceipt,
    receiptId: `${input.evaluationId}:dense`,
    lane: 'DENSE',
    rankings: denseRankings,
  });
  const bm25Receipt = buildExternalDocRetrievalProofReceipt({
    ...commonReceipt,
    receiptId: `${input.evaluationId}:bm25`,
    lane: 'BM25',
    rankings: bm25Rankings,
  });
  const hybridReceipt = buildExternalDocRetrievalProofReceipt({
    ...commonReceipt,
    receiptId: `${input.evaluationId}:hybrid-rrf`,
    lane: 'HYBRID_RRF',
    rankings: hybridRankings,
  });

  const projectionVerified = externalDocsHybridProjectionReceiptSchema.parse({
    ...projectionBefore,
    status: 'VERIFIED',
    dense_parity_receipt_id: denseReceipt.receipt_id,
    bm25_retrieval_receipt_id: bm25Receipt.receipt_id,
    hybrid_retrieval_receipt_id: hybridReceipt.receipt_id,
  });

  const cutoverGate = buildExternalDocsCutoverGate({
    gateId: `${input.evaluationId}:cutover`,
    gateRevision: input.receiptRevision,
    projectionReceiptId: projectionVerified.receipt_id,
    capabilityGateId: capabilityGate.gate_id,
    dense: denseReceipt,
    bm25: bm25Receipt,
    hybrid: hybridReceipt,
    minimumDenseRecall: input.minimumDenseRecall,
    minimumBm25Recall: input.minimumBm25Recall,
    minimumHybridRecall: input.minimumHybridRecall,
  });

  const logicalBundle = {
    evaluation_id: input.evaluationId,
    fixture_checksum: fixture.fixture_checksum,
    capability_gate_id: capabilityGate.gate_id,
    projection_receipt_id: projectionVerified.receipt_id,
    dense_receipt_id: denseReceipt.receipt_id,
    bm25_receipt_id: bm25Receipt.receipt_id,
    hybrid_receipt_id: hybridReceipt.receipt_id,
    cutover_gate_id: cutoverGate.gate_id,
    k,
    prefetch_k: prefetchK,
    evaluated_at: evaluatedAt,
  };

  return externalDocRetrievalEvaluationBundleSchema.parse({
    evaluation_id: input.evaluationId,
    fixture,
    capability_gate: capabilityGate,
    projection_receipt_before: projectionBefore,
    projection_receipt_verified: projectionVerified,
    dense_receipt: denseReceipt,
    bm25_receipt: bm25Receipt,
    hybrid_receipt: hybridReceipt,
    cutover_gate: cutoverGate,
    k,
    prefetch_k: prefetchK,
    evaluated_at: evaluatedAt,
    bundle_checksum: sha256(logicalBundle),
    canonical_authority: false,
  });
}
