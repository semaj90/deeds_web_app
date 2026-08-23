import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import type { AtlasBfsReceiptV1 } from './atlas-rapids-bfs-client.js';

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const graphNeighborhoodHitV1Schema = z.object({
  schema: z.literal('atlas.graph-neighborhood-hit.v1'),
  candidateOrdinal: z.number().int().nonnegative(),
  hop: z.number().int().nonnegative(),
  proximity: z.number().finite().min(0).max(1),
  rank: z.number().int().positive(),
  executor: z.literal('CUGRAPH_BFS'),
  graphRevision: id,
  projectionRevision: id,
  algorithmRevision: id,
  candidateSnapshotRevision: id,
  ordinalMapChecksum: checksum,
  identityAuthority: z.literal(false),
  executorIdentityEscaped: z.literal(false),
}).strict();
export type GraphNeighborhoodHitV1 = z.infer<typeof graphNeighborhoodHitV1Schema>;

export const graphNeighborhoodNormalizationReceiptV1Schema = z.object({
  schema: z.literal('atlas.graph-neighborhood-normalization-receipt.v1'),
  candidateSnapshotRevision: id,
  ordinalMapChecksum: checksum,
  graphRevision: id,
  projectionRevision: id,
  algorithmRevision: id,
  executor: z.literal('CUGRAPH_BFS'),
  inputHitCount: z.number().int().nonnegative(),
  outputHitCount: z.number().int().nonnegative(),
  rejectedHitCount: z.number().int().nonnegative(),
  gpuNodeIdsEscapedAboveBoundary: z.literal(false),
  predecessorIdsEscapedAboveBoundary: z.literal(false),
  ordinalRemappingPerformed: z.literal(false),
  rankingMutationPerformed: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: id,
  receiptChecksum: checksum,
}).strict();
export type GraphNeighborhoodNormalizationReceiptV1 = z.infer<typeof graphNeighborhoodNormalizationReceiptV1Schema>;

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

function resolveOrdinalByCanonicalEvidence(
  map: CandidateOrdinalMapV1,
  hit: { packetKey: string | null; nodeKey: string },
  graphRevision: string,
): number | null {
  if (hit.packetKey === null) return null;
  const matches = map.candidates.filter((candidate) =>
    candidate.graphRevision === graphRevision && candidate.packetKey === hit.packetKey
  );
  return matches.length === 1 ? matches[0]!.candidateOrdinal : null;
}

/**
 * Adapt the resident cuGraph BFS receipt to snapshot-scoped candidate ordinals.
 *
 * graph_node_key and gpu_node_id remain graph projection/executor coordinates;
 * packetKey is the only identity evidence in the current frozen graph artifact
 * that is allowed to resolve into CandidateOrdinal here. Missing/ambiguous
 * packet identity is rejected rather than guessed.
 */
export function adaptAtlasRapidsBfsReceiptToCandidateOrdinals(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  receipt: AtlasBfsReceiptV1;
  producerRevision: string;
}): {
  hits: GraphNeighborhoodHitV1[];
  receipt: GraphNeighborhoodNormalizationReceiptV1;
} {
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const source = input.receipt;
  if (source.schema !== 'atlas.graph-bfs-receipt.v1') throw new Error('GRAPH_BFS_SOURCE_RECEIPT_SCHEMA_REJECTED');
  if (source.backend !== 'cugraph.bfs') throw new Error(`GRAPH_BFS_SOURCE_BACKEND_REJECTED:${source.backend}`);
  if (source.direction !== 'outbound') throw new Error(`GRAPH_BFS_DIRECTION_NOT_PROVEN:${source.direction}`);
  if (!input.producerRevision.trim()) throw new Error('GRAPH_BFS_PRODUCER_REVISION_REQUIRED');

  const seenOrdinals = new Set<number>();
  const normalized: GraphNeighborhoodHitV1[] = [];
  let rejectedHitCount = 0;

  for (const hit of source.results) {
    const ordinal = resolveOrdinalByCanonicalEvidence(map, hit, source.graphRevision);
    if (ordinal === null || seenOrdinals.has(ordinal)) {
      rejectedHitCount += 1;
      continue;
    }
    seenOrdinals.add(ordinal);
    normalized.push(graphNeighborhoodHitV1Schema.parse({
      schema: 'atlas.graph-neighborhood-hit.v1',
      candidateOrdinal: ordinal,
      hop: hit.hop,
      proximity: hit.proximity,
      rank: hit.rank,
      executor: 'CUGRAPH_BFS',
      graphRevision: source.graphRevision,
      projectionRevision: source.projectionRevision,
      algorithmRevision: source.algorithmRevision,
      candidateSnapshotRevision: map.candidateSnapshotRevision,
      ordinalMapChecksum: map.ordinalMapChecksum,
      identityAuthority: false,
      executorIdentityEscaped: false,
    }));
  }

  const payload = {
    schema: 'atlas.graph-neighborhood-normalization-receipt.v1' as const,
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    graphRevision: source.graphRevision,
    projectionRevision: source.projectionRevision,
    algorithmRevision: source.algorithmRevision,
    executor: 'CUGRAPH_BFS' as const,
    inputHitCount: source.results.length,
    outputHitCount: normalized.length,
    rejectedHitCount,
    gpuNodeIdsEscapedAboveBoundary: false as const,
    predecessorIdsEscapedAboveBoundary: false as const,
    ordinalRemappingPerformed: false as const,
    rankingMutationPerformed: false as const,
    canonicalWritesAttempted: false as const,
    producerRevision: input.producerRevision,
  };

  return {
    hits: normalized,
    receipt: graphNeighborhoodNormalizationReceiptV1Schema.parse({
      ...payload,
      receiptChecksum: digest(payload),
    }),
  };
}
