import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const RETRIEVAL_PROOF_LANES = ['DENSE', 'BM25', 'HYBRID_RRF'] as const;

export const externalDocRetrievalQueryFixtureSchema = z.object({
  schema: z.literal('atlas.external-doc-retrieval-query-fixture.v1').default('atlas.external-doc-retrieval-query-fixture.v1'),
  query_id: id,
  query_revision: revision,
  query_text: z.string().min(1),
  expected_relevant_chunk_ids: z.array(id).min(1),
  source_snapshot_revision: revision,
  notes: z.string().nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ExternalDocRetrievalQueryFixtureV1 = z.infer<typeof externalDocRetrievalQueryFixtureSchema>;

export const externalDocRetrievalFixtureSetSchema = z.object({
  schema: z.literal('atlas.external-doc-retrieval-fixture-set.v1').default('atlas.external-doc-retrieval-fixture-set.v1'),
  fixture_revision: revision,
  source_snapshot_revision: revision,
  queries: z.array(externalDocRetrievalQueryFixtureSchema).min(1),
  fixture_checksum: checksum,
  frozen: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const ids = value.queries.map((query) => query.query_id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['queries'], message: 'query ids must be unique' });
  }
  if (value.queries.some((query) => query.source_snapshot_revision !== value.source_snapshot_revision)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['queries'], message: 'all query fixtures must target the fixture source snapshot revision' });
  }
});
export type ExternalDocRetrievalFixtureSetV1 = z.infer<typeof externalDocRetrievalFixtureSetSchema>;

export const externalDocRetrievalQueryResultSchema = z.object({
  query_id: id,
  lane: z.enum(RETRIEVAL_PROOF_LANES),
  k: z.number().int().positive().max(10_000),
  ranked_chunk_ids: z.array(id).max(10_000),
  recall_at_k: z.number().finite().min(0).max(1),
  reciprocal_rank: z.number().finite().min(0).max(1),
  result_checksum: checksum,
}).strict();
export type ExternalDocRetrievalQueryResultV1 = z.infer<typeof externalDocRetrievalQueryResultSchema>;

export const externalDocRetrievalProofReceiptSchema = z.object({
  schema: z.literal('atlas.external-doc-retrieval-proof-receipt.v1').default('atlas.external-doc-retrieval-proof-receipt.v1'),
  receipt_id: id,
  receipt_revision: revision,
  fixture_revision: revision,
  fixture_checksum: checksum,
  source_snapshot_revision: revision,
  projection_revision: revision,
  collection_name: z.literal('external_programming_docs_hybrid_768'),
  qdrant_version: z.string().min(1),
  lane: z.enum(RETRIEVAL_PROOF_LANES),
  k: z.number().int().positive().max(10_000),
  per_query: z.array(externalDocRetrievalQueryResultSchema).min(1),
  mean_recall_at_k: z.number().finite().min(0).max(1),
  mean_reciprocal_rank: z.number().finite().min(0).max(1),
  evaluated_at: z.string().datetime(),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.per_query.some((row) => row.lane !== value.lane || row.k !== value.k)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['per_query'], message: 'per-query lane/k must match receipt lane/k' });
  }
  const recall = value.per_query.reduce((sum, row) => sum + row.recall_at_k, 0) / value.per_query.length;
  const mrr = value.per_query.reduce((sum, row) => sum + row.reciprocal_rank, 0) / value.per_query.length;
  if (Math.abs(recall - value.mean_recall_at_k) > 1e-12) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mean_recall_at_k'], message: 'mean recall must equal per-query mean' });
  }
  if (Math.abs(mrr - value.mean_reciprocal_rank) > 1e-12) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mean_reciprocal_rank'], message: 'mean reciprocal rank must equal per-query mean' });
  }
});
export type ExternalDocRetrievalProofReceiptV1 = z.infer<typeof externalDocRetrievalProofReceiptSchema>;

export const externalDocsCutoverGateSchema = z.object({
  schema: z.literal('atlas.external-docs-cutover-gate.v1').default('atlas.external-docs-cutover-gate.v1'),
  gate_id: id,
  gate_revision: revision,
  source_collection: z.literal('external_programming_docs_768'),
  shadow_collection: z.literal('external_programming_docs_hybrid_768'),
  projection_receipt_id: id,
  capability_gate_id: id,
  dense_receipt_id: id,
  bm25_receipt_id: id,
  hybrid_receipt_id: id,
  minimum_dense_recall: z.number().finite().min(0).max(1),
  minimum_bm25_recall: z.number().finite().min(0).max(1),
  minimum_hybrid_recall: z.number().finite().min(0).max(1),
  dense_recall: z.number().finite().min(0).max(1),
  bm25_recall: z.number().finite().min(0).max(1),
  hybrid_recall: z.number().finite().min(0).max(1),
  hybrid_not_worse_than_best_single_lane: z.boolean(),
  old_collection_snapshot_required: z.literal(true).default(true),
  old_collection_delete_allowed: z.literal(false).default(false),
  status: z.enum(['READY_FOR_CUTOVER', 'BLOCKED']),
  blockers: z.array(z.enum([
    'DENSE_RECALL_BELOW_FLOOR',
    'BM25_RECALL_BELOW_FLOOR',
    'HYBRID_RECALL_BELOW_FLOOR',
    'HYBRID_REGRESSION',
  ])).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if ((value.status === 'READY_FOR_CUTOVER') !== (value.blockers.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'cutover is ready iff blockers is empty' });
  }
});
export type ExternalDocsCutoverGateV1 = z.infer<typeof externalDocsCutoverGateSchema>;

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

export function buildExternalDocRetrievalFixtureSet(input: {
  fixtureRevision: string;
  sourceSnapshotRevision: string;
  queries: Array<Omit<ExternalDocRetrievalQueryFixtureV1, 'schema' | 'canonical_authority'>>;
}): ExternalDocRetrievalFixtureSetV1 {
  const queries = input.queries.map((query) => externalDocRetrievalQueryFixtureSchema.parse({
    ...query,
    canonical_authority: false,
  }));
  const fixtureChecksum = sha256({
    fixture_revision: input.fixtureRevision,
    source_snapshot_revision: input.sourceSnapshotRevision,
    queries: [...queries].sort((a, b) => a.query_id.localeCompare(b.query_id)),
  });
  return externalDocRetrievalFixtureSetSchema.parse({
    fixture_revision: input.fixtureRevision,
    source_snapshot_revision: input.sourceSnapshotRevision,
    queries,
    fixture_checksum: fixtureChecksum,
    frozen: true,
    canonical_authority: false,
  });
}

export function scoreRetrievalQuery(input: {
  fixture: ExternalDocRetrievalQueryFixtureV1;
  lane: ExternalDocRetrievalQueryResultV1['lane'];
  k: number;
  rankedChunkIds: readonly string[];
}): ExternalDocRetrievalQueryResultV1 {
  const expected = new Set(input.fixture.expected_relevant_chunk_ids);
  const ranked = input.rankedChunkIds.slice(0, input.k);
  const hits = new Set(ranked.filter((id) => expected.has(id)));
  const firstRelevantIndex = ranked.findIndex((id) => expected.has(id));
  const recall = hits.size / expected.size;
  const reciprocalRank = firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1);
  return externalDocRetrievalQueryResultSchema.parse({
    query_id: input.fixture.query_id,
    lane: input.lane,
    k: input.k,
    ranked_chunk_ids: ranked,
    recall_at_k: recall,
    reciprocal_rank: reciprocalRank,
    result_checksum: sha256({
      query_id: input.fixture.query_id,
      lane: input.lane,
      k: input.k,
      ranked_chunk_ids: ranked,
    }),
  });
}

export function buildExternalDocRetrievalProofReceipt(input: {
  receiptId: string;
  receiptRevision: string;
  fixture: ExternalDocRetrievalFixtureSetV1;
  projectionRevision: string;
  qdrantVersion: string;
  lane: ExternalDocRetrievalQueryResultV1['lane'];
  k: number;
  rankings: Record<string, readonly string[]>;
  evaluatedAt: string;
  producerRevision: string;
}): ExternalDocRetrievalProofReceiptV1 {
  const perQuery = input.fixture.queries.map((fixture) => scoreRetrievalQuery({
    fixture,
    lane: input.lane,
    k: input.k,
    rankedChunkIds: input.rankings[fixture.query_id] ?? [],
  }));
  return externalDocRetrievalProofReceiptSchema.parse({
    receipt_id: input.receiptId,
    receipt_revision: input.receiptRevision,
    fixture_revision: input.fixture.fixture_revision,
    fixture_checksum: input.fixture.fixture_checksum,
    source_snapshot_revision: input.fixture.source_snapshot_revision,
    projection_revision: input.projectionRevision,
    collection_name: 'external_programming_docs_hybrid_768',
    qdrant_version: input.qdrantVersion,
    lane: input.lane,
    k: input.k,
    per_query: perQuery,
    mean_recall_at_k: perQuery.reduce((sum, row) => sum + row.recall_at_k, 0) / perQuery.length,
    mean_reciprocal_rank: perQuery.reduce((sum, row) => sum + row.reciprocal_rank, 0) / perQuery.length,
    evaluated_at: input.evaluatedAt,
    producer_revision: input.producerRevision,
    canonical_authority: false,
  });
}

export function buildExternalDocsCutoverGate(input: {
  gateId: string;
  gateRevision: string;
  projectionReceiptId: string;
  capabilityGateId: string;
  dense: ExternalDocRetrievalProofReceiptV1;
  bm25: ExternalDocRetrievalProofReceiptV1;
  hybrid: ExternalDocRetrievalProofReceiptV1;
  minimumDenseRecall?: number;
  minimumBm25Recall?: number;
  minimumHybridRecall?: number;
}): ExternalDocsCutoverGateV1 {
  if (input.dense.lane !== 'DENSE' || input.bm25.lane !== 'BM25' || input.hybrid.lane !== 'HYBRID_RRF') {
    throw new Error('CUTOVER_RECEIPT_LANE_MISMATCH');
  }
  const fixtureChecksums = new Set([input.dense.fixture_checksum, input.bm25.fixture_checksum, input.hybrid.fixture_checksum]);
  const snapshots = new Set([input.dense.source_snapshot_revision, input.bm25.source_snapshot_revision, input.hybrid.source_snapshot_revision]);
  const projections = new Set([input.dense.projection_revision, input.bm25.projection_revision, input.hybrid.projection_revision]);
  if (fixtureChecksums.size !== 1 || snapshots.size !== 1 || projections.size !== 1) {
    throw new Error('CUTOVER_RECEIPTS_MUST_SHARE_FIXTURE_SNAPSHOT_AND_PROJECTION');
  }

  const minDense = input.minimumDenseRecall ?? 0.95;
  const minBm25 = input.minimumBm25Recall ?? 0.80;
  const minHybrid = input.minimumHybridRecall ?? 0.95;
  const blockers: ExternalDocsCutoverGateV1['blockers'] = [];
  if (input.dense.mean_recall_at_k < minDense) blockers.push('DENSE_RECALL_BELOW_FLOOR');
  if (input.bm25.mean_recall_at_k < minBm25) blockers.push('BM25_RECALL_BELOW_FLOOR');
  if (input.hybrid.mean_recall_at_k < minHybrid) blockers.push('HYBRID_RECALL_BELOW_FLOOR');
  const bestSingle = Math.max(input.dense.mean_recall_at_k, input.bm25.mean_recall_at_k);
  const noRegression = input.hybrid.mean_recall_at_k >= bestSingle;
  if (!noRegression) blockers.push('HYBRID_REGRESSION');

  return externalDocsCutoverGateSchema.parse({
    gate_id: input.gateId,
    gate_revision: input.gateRevision,
    source_collection: 'external_programming_docs_768',
    shadow_collection: 'external_programming_docs_hybrid_768',
    projection_receipt_id: input.projectionReceiptId,
    capability_gate_id: input.capabilityGateId,
    dense_receipt_id: input.dense.receipt_id,
    bm25_receipt_id: input.bm25.receipt_id,
    hybrid_receipt_id: input.hybrid.receipt_id,
    minimum_dense_recall: minDense,
    minimum_bm25_recall: minBm25,
    minimum_hybrid_recall: minHybrid,
    dense_recall: input.dense.mean_recall_at_k,
    bm25_recall: input.bm25.mean_recall_at_k,
    hybrid_recall: input.hybrid.mean_recall_at_k,
    hybrid_not_worse_than_best_single_lane: noRegression,
    old_collection_snapshot_required: true,
    old_collection_delete_allowed: false,
    status: blockers.length === 0 ? 'READY_FOR_CUTOVER' : 'BLOCKED',
    blockers,
    canonical_authority: false,
  });
}
