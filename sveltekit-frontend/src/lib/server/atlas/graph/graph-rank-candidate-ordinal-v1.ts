import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  CandidateFeatureRowV1Schema,
  type CandidateFeatureRowV1,
} from '../features/candidate-feature-row-v1.js';
import type { AtlasPageRankReceiptV1 } from './atlas-rapids-pagerank-client.js';

export const GRAPH_RANK_EXECUTORS = [
  'CUGRAPH_PAGERANK',
  'NEO4J_GDS_PAGERANK',
  'NETWORKX_PAGERANK',
  'CUSTOM_PAGERANK',
] as const;
export const graphRankExecutorSchema = z.enum(GRAPH_RANK_EXECUTORS);

export const GRAPH_RANK_METRICS = ['GLOBAL_PAGERANK', 'PERSONALIZED_PAGERANK'] as const;
export const graphRankMetricSchema = z.enum(GRAPH_RANK_METRICS);

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Executor-local graph rank output. gpuNodeId/nodeKey/executorLocalId terminate
 * at this boundary and are never accepted as canonical identity.
 */
export const graphRankRawHitV1Schema = z.object({
  score: z.number().finite(),
  rank: z.number().int().positive(),
  candidateOrdinal: z.number().int().nonnegative().nullable().default(null),
  canonicalId: id.nullable().default(null),
  packetKey: id.nullable().default(null),
  symbolVersionId: id.nullable().default(null),
  treeNodeId: id.nullable().default(null),
  nodeKey: id.nullable().default(null),
  gpuNodeId: z.union([z.string(), z.number()]).nullable().default(null),
  executorLocalId: z.union([z.string(), z.number()]).nullable().default(null),
}).strict();
export type GraphRankRawHitV1 = z.infer<typeof graphRankRawHitV1Schema>;

export const graphRankHitV1Schema = z.object({
  schema: z.literal('atlas.graph-rank-hit.v1'),
  candidateOrdinal: z.number().int().nonnegative(),
  score: z.number().finite(),
  rank: z.number().int().positive(),
  metric: graphRankMetricSchema,
  executor: graphRankExecutorSchema,
  graphRevision: id,
  projectionRevision: id,
  algorithmRevision: id,
  candidateSnapshotRevision: id,
  ordinalMapChecksum: checksum,
  identityAuthority: z.literal(false),
  executorIdentityEscaped: z.literal(false),
}).strict();
export type GraphRankHitV1 = z.infer<typeof graphRankHitV1Schema>;

export const graphRankNormalizationReceiptV1Schema = z.object({
  schema: z.literal('atlas.graph-rank-normalization-receipt.v1'),
  candidateSnapshotRevision: id,
  ordinalMapChecksum: checksum,
  graphRevision: id,
  projectionRevision: id,
  algorithmRevision: id,
  metric: graphRankMetricSchema,
  executor: graphRankExecutorSchema,
  inputHitCount: z.number().int().nonnegative(),
  outputHitCount: z.number().int().nonnegative(),
  rejectedHitCount: z.number().int().nonnegative(),
  executorIdsEscapedAboveBoundary: z.literal(false),
  ordinalRemappingPerformed: z.literal(false),
  rankingMutationPerformed: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: id,
  receiptChecksum: checksum,
}).strict();
export type GraphRankNormalizationReceiptV1 = z.infer<typeof graphRankNormalizationReceiptV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function candidateMatchesRawHit(
  map: CandidateOrdinalMapV1,
  ordinal: number,
  hit: GraphRankRawHitV1,
  graphRevision: string,
): boolean {
  const candidate = map.candidates[ordinal];
  if (!candidate || candidate.candidateOrdinal !== ordinal) return false;
  if (candidate.graphRevision !== graphRevision) return false;
  if (hit.canonicalId !== null && hit.canonicalId !== candidate.canonicalId) return false;
  if (hit.packetKey !== null && hit.packetKey !== candidate.packetKey) return false;
  if (hit.symbolVersionId !== null && hit.symbolVersionId !== candidate.symbolVersionId) return false;
  if (hit.treeNodeId !== null && hit.treeNodeId !== candidate.treeNodeId) return false;
  return true;
}

function resolveOrdinal(
  map: CandidateOrdinalMapV1,
  hit: GraphRankRawHitV1,
  graphRevision: string,
): number | null {
  if (hit.candidateOrdinal !== null) {
    return candidateMatchesRawHit(map, hit.candidateOrdinal, hit, graphRevision)
      ? hit.candidateOrdinal
      : null;
  }

  // nodeKey/gpuNodeId/executorLocalId are deliberately excluded from identity
  // resolution. A NetworkX/cuGraph/Neo4j adapter must provide a canonical ID,
  // packet key, symbol version, tree node ID, or an already-scoped ordinal.
  const hasCanonicalEvidence =
    hit.canonicalId !== null ||
    hit.packetKey !== null ||
    hit.symbolVersionId !== null ||
    hit.treeNodeId !== null;
  if (!hasCanonicalEvidence) return null;

  const matches = map.candidates.filter((candidate) => {
    if (candidate.graphRevision !== graphRevision) return false;
    if (hit.canonicalId !== null && hit.canonicalId !== candidate.canonicalId) return false;
    if (hit.packetKey !== null && hit.packetKey !== candidate.packetKey) return false;
    if (hit.symbolVersionId !== null && hit.symbolVersionId !== candidate.symbolVersionId) return false;
    if (hit.treeNodeId !== null && hit.treeNodeId !== candidate.treeNodeId) return false;
    return true;
  });

  return matches.length === 1 ? matches[0]!.candidateOrdinal : null;
}

/**
 * Shared graph executor boundary for PageRank/PPR implementations.
 *
 * NetworkX is a correctness oracle, Neo4j GDS/cuGraph are executors, and a
 * custom PageRank kernel may be a challenger, but all of them feed one logical
 * graph-authority feature. This function performs identity/revision
 * normalization only: it preserves executor score/rank order exactly.
 */
export function normalizeGraphRankExecutorHitsToCandidateOrdinals(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  hits: readonly z.input<typeof graphRankRawHitV1Schema>[];
  executor: z.input<typeof graphRankExecutorSchema>;
  metric: z.input<typeof graphRankMetricSchema>;
  graphRevision: string;
  projectionRevision: string;
  algorithmRevision: string;
  producerRevision: string;
}): {
  hits: GraphRankHitV1[];
  receipt: GraphRankNormalizationReceiptV1;
} {
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const rawHits = input.hits.map((hit) => graphRankRawHitV1Schema.parse(hit));
  const executor = graphRankExecutorSchema.parse(input.executor);
  const metric = graphRankMetricSchema.parse(input.metric);

  if (!input.graphRevision.trim()) throw new Error('GRAPH_RANK_GRAPH_REVISION_REQUIRED');
  if (!input.projectionRevision.trim()) throw new Error('GRAPH_RANK_PROJECTION_REVISION_REQUIRED');
  if (!input.algorithmRevision.trim()) throw new Error('GRAPH_RANK_ALGORITHM_REVISION_REQUIRED');
  if (!input.producerRevision.trim()) throw new Error('GRAPH_RANK_PRODUCER_REVISION_REQUIRED');

  const seenOrdinals = new Set<number>();
  const normalized: GraphRankHitV1[] = [];
  let rejectedHitCount = 0;

  for (const hit of rawHits) {
    const ordinal = resolveOrdinal(map, hit, input.graphRevision);
    if (ordinal === null || seenOrdinals.has(ordinal)) {
      rejectedHitCount += 1;
      continue;
    }
    seenOrdinals.add(ordinal);
    normalized.push(graphRankHitV1Schema.parse({
      schema: 'atlas.graph-rank-hit.v1',
      candidateOrdinal: ordinal,
      score: hit.score,
      rank: hit.rank,
      metric,
      executor,
      graphRevision: input.graphRevision,
      projectionRevision: input.projectionRevision,
      algorithmRevision: input.algorithmRevision,
      candidateSnapshotRevision: map.candidateSnapshotRevision,
      ordinalMapChecksum: map.ordinalMapChecksum,
      identityAuthority: false,
      executorIdentityEscaped: false,
    }));
  }

  const payload = {
    schema: 'atlas.graph-rank-normalization-receipt.v1' as const,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    graphRevision: input.graphRevision,
    projectionRevision: input.projectionRevision,
    algorithmRevision: input.algorithmRevision,
    metric,
    executor,
    inputHitCount: rawHits.length,
    outputHitCount: normalized.length,
    rejectedHitCount,
    executorIdsEscapedAboveBoundary: false as const,
    ordinalRemappingPerformed: false as const,
    rankingMutationPerformed: false as const,
    canonicalWritesAttempted: false as const,
    producerRevision: input.producerRevision,
  };

  return {
    hits: normalized,
    receipt: graphRankNormalizationReceiptV1Schema.parse({
      ...payload,
      receiptChecksum: digest(payload),
    }),
  };
}

/** Adapt the existing :8098 RAPIDS/cuGraph PageRank receipt to CandidateOrdinal. */
export function adaptAtlasRapidsPageRankReceiptToCandidateOrdinals(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  receipt: AtlasPageRankReceiptV1;
  producerRevision: string;
}): {
  hits: GraphRankHitV1[];
  receipt: GraphRankNormalizationReceiptV1;
} {
  const receipt = input.receipt;
  if (receipt.schema !== 'atlas.graph-pagerank-receipt.v1') {
    throw new Error('GRAPH_RANK_SOURCE_RECEIPT_SCHEMA_REJECTED');
  }
  if (receipt.backend !== 'cugraph.pagerank') {
    throw new Error(`GRAPH_RANK_SOURCE_BACKEND_REJECTED:${receipt.backend}`);
  }
  if (!receipt.didConverge) throw new Error('GRAPH_RANK_SOURCE_DID_NOT_CONVERGE');

  return normalizeGraphRankExecutorHitsToCandidateOrdinals({
    ordinalMap: input.ordinalMap,
    executor: 'CUGRAPH_PAGERANK',
    metric: receipt.operation === 'personalized_pagerank' ? 'PERSONALIZED_PAGERANK' : 'GLOBAL_PAGERANK',
    graphRevision: receipt.graphRevision,
    projectionRevision: receipt.projectionRevision,
    algorithmRevision: receipt.algorithmRevision,
    producerRevision: input.producerRevision,
    hits: receipt.results.map((result) => ({
      score: result.score,
      rank: result.rank,
      packetKey: result.packetKey,
      nodeKey: result.nodeKey,
      gpuNodeId: result.gpuNodeId,
    })),
  });
}

/**
 * Materialize one chosen graph-rank producer into immutable candidate rows.
 * Multiple executors may be compared in parity receipts, but they must not be
 * blended here as extra votes for the same logical graph feature.
 */
export function applyGraphRankHitsToCandidateFeatureRows(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  rows: readonly CandidateFeatureRowV1[];
  hits: readonly GraphRankHitV1[];
  outputFeatureRevision: string;
  evidenceRef: string;
}): CandidateFeatureRowV1[] {
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  if (!input.outputFeatureRevision.trim()) throw new Error('GRAPH_RANK_OUTPUT_FEATURE_REVISION_REQUIRED');
  if (!input.evidenceRef.trim()) throw new Error('GRAPH_RANK_EVIDENCE_REF_REQUIRED');
  if (input.hits.length === 0) return input.rows.map((row) => CandidateFeatureRowV1Schema.parse(row));

  const parsedHits = input.hits.map((hit) => graphRankHitV1Schema.parse(hit));
  const first = parsedHits[0]!;
  for (const hit of parsedHits) {
    if (hit.executor !== first.executor || hit.metric !== first.metric) {
      throw new Error('GRAPH_RANK_MULTIPLE_PRODUCERS_REJECTED');
    }
    if (
      hit.graphRevision !== first.graphRevision ||
      hit.projectionRevision !== first.projectionRevision ||
      hit.algorithmRevision !== first.algorithmRevision ||
      hit.candidateSnapshotRevision !== map.candidateSnapshotRevision ||
      hit.ordinalMapChecksum !== map.ordinalMapChecksum
    ) {
      throw new Error('GRAPH_RANK_REVISION_SET_MISMATCH');
    }
  }

  const byOrdinal = new Map(parsedHits.map((hit) => [hit.candidateOrdinal, hit]));
  return input.rows.map((rowInput) => {
    const row = CandidateFeatureRowV1Schema.parse(rowInput);
    const candidate = map.candidates[row.candidateOrdinal];
    if (!candidate || candidate.canonicalId !== row.canonicalId) {
      throw new Error(`GRAPH_RANK_CANDIDATE_ROW_IDENTITY_MISMATCH:${row.candidateOrdinal}`);
    }
    const hit = byOrdinal.get(row.candidateOrdinal);
    if (!hit) return row;
    if (row.graphRevision !== hit.graphRevision) {
      throw new Error(`GRAPH_RANK_CANDIDATE_ROW_REVISION_MISMATCH:${row.candidateOrdinal}`);
    }

    return CandidateFeatureRowV1Schema.parse({
      ...row,
      featureRevision: input.outputFeatureRevision,
      graphAuthority: hit.metric === 'GLOBAL_PAGERANK' ? hit.score : row.graphAuthority,
      personalizedPageRank: hit.metric === 'PERSONALIZED_PAGERANK' ? hit.score : row.personalizedPageRank,
      laneMask: [...new Set([...row.laneMask, 'graph'])],
      evidenceRefs: [...new Set([...row.evidenceRefs, input.evidenceRef])],
    });
  });
}
