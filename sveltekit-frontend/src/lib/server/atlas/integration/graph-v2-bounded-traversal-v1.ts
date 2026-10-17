import {
  readGraphV2RetrievalFanoutStrictV1,
  type GraphV2FanoutCandidateV1,
  type GraphV2FanoutSeedV1,
} from './graph-v2-retrieval-fanout-v1.js';

const SHA256_REVISION = /^sha256:[0-9a-f]{64}$/i;
const MAX_DEPTH = 3;
const MAX_FRONTIER = 64;
const MAX_CANDIDATES = 64;
const READ_CONCURRENCY = 4;

export type GraphV2TraversalCandidateV1 = GraphV2FanoutCandidateV1 & {
  traversalDepth: number;
  relationPathIds: string[];
};

export interface GraphV2TraversalReaderV1 {
  read(input: {
    seeds: readonly GraphV2FanoutSeedV1[];
    workspaceRevision: string;
    graphRevision: string;
    limit?: number;
  }): Promise<GraphV2FanoutCandidateV1[]>;
}

export async function executeGraphV2BoundedTraversalV1(input: {
  seeds: readonly GraphV2FanoutSeedV1[];
  workspaceRevision: string;
  graphRevision: string;
  maxDepth?: number;
  limit?: number;
}, reader: GraphV2TraversalReaderV1 = { read: readGraphV2RetrievalFanoutStrictV1 }): Promise<GraphV2TraversalCandidateV1[]> {
  if (!SHA256_REVISION.test(input.workspaceRevision) || !/^[a-f0-9]{64}$/i.test(input.graphRevision)) return [];
  const maxDepth = Math.max(1, Math.min(MAX_DEPTH, Math.trunc(input.maxDepth ?? MAX_DEPTH)));
  const limit = Math.max(1, Math.min(MAX_CANDIDATES, Math.trunc(input.limit ?? MAX_CANDIDATES)));
  const seeds = uniqueSeeds(input.seeds).slice(0, MAX_FRONTIER);
  let frontier = seeds.map((seed) => ({ seed, relationPathIds: [] as string[], confidence: 1 }));
  const bestPaths = new Map(seeds.map((seed) => [identityKey(seed), { depth: 0, confidence: 1, relationPathIds: [] as string[] }]));
  const candidates = new Map<string, GraphV2TraversalCandidateV1>();

  for (let depth = 1; depth <= maxDepth && frontier.length && candidates.size < limit; depth += 1) {
    const next = new Map<string, (typeof frontier)[number]>();
    for (let offset = 0; offset < frontier.length; offset += READ_CONCURRENCY) {
      const parentBatch = frontier.slice(offset, offset + READ_CONCURRENCY);
      const pages = await Promise.all(parentBatch.map(async (parent) => ({
        parent,
        hits: await reader.read({
          seeds: [parent.seed],
          workspaceRevision: input.workspaceRevision,
          graphRevision: input.graphRevision,
          limit,
        }),
      })));
      for (const { parent, hits } of pages) {
        for (const hit of hits) {
          if (hit.workspaceRevision !== input.workspaceRevision || hit.graphRevision !== input.graphRevision
            || !SHA256_REVISION.test(hit.sourceRevision) || !hit.packetKey.trim() || !hit.sourceRef.trim()
            || !hit.relationId.trim() || !Number.isFinite(hit.relationConfidence)
            || hit.relationConfidence < 0 || hit.relationConfidence > 1) continue;
          const key = identityKey(hit);
          const relationPathIds = [...parent.relationPathIds, hit.relationId];
          const confidence = parent.confidence * hit.relationConfidence;
          const prior = bestPaths.get(key);
          if (prior && !isBetterPath(depth, confidence, relationPathIds, prior)) continue;
          const path = { depth, confidence, relationPathIds };
          bestPaths.set(key, path);
          const candidate: GraphV2TraversalCandidateV1 = {
            ...hit,
            relationConfidence: confidence,
            traversalDepth: depth,
            relationPathIds,
          };
          candidates.set(key, candidate);
          const nextPrior = next.get(key);
          if (!nextPrior || isBetterPath(depth, confidence, relationPathIds, {
            depth,
            confidence: nextPrior.confidence,
            relationPathIds: nextPrior.relationPathIds,
          })) next.set(key, { seed: hit, relationPathIds, confidence });
        }
      }
    }
    frontier = [...next.values()].slice(0, MAX_FRONTIER);
  }

  return [...candidates.values()].sort((a, b) => a.traversalDepth - b.traversalDepth
    || b.relationConfidence - a.relationConfidence || a.packetKey.localeCompare(b.packetKey)).slice(0, limit);
}

function isBetterPath(
  depth: number,
  confidence: number,
  relationPathIds: readonly string[],
  previous: { depth: number; confidence: number; relationPathIds: readonly string[] },
): boolean {
  if (depth !== previous.depth) return depth < previous.depth;
  if (confidence !== previous.confidence) return confidence > previous.confidence;
  return relationPathIds.join('\u0000').localeCompare(previous.relationPathIds.join('\u0000')) < 0;
}

function uniqueSeeds(seeds: readonly GraphV2FanoutSeedV1[]): GraphV2FanoutSeedV1[] {
  const unique = new Map<string, GraphV2FanoutSeedV1>();
  for (const seed of seeds) {
    if (!seed.packetKey.trim() || !seed.sourceRef.trim() || !SHA256_REVISION.test(seed.sourceRevision)) continue;
    unique.set(identityKey(seed), seed);
  }
  return [...unique.values()].sort((a, b) => identityKey(a).localeCompare(identityKey(b)));
}

function identityKey(value: Pick<GraphV2FanoutSeedV1, 'packetKey' | 'sourceRef' | 'sourceRevision'>): string {
  return `${value.packetKey}\u0000${value.sourceRef}\u0000${value.sourceRevision}`;
}
