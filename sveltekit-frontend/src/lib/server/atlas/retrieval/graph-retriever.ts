import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

export interface GraphRetrievalRequest {
  seedPacketKeys: string[];
  allowedRelationships: Array<
    | 'IMPORTS'
    | 'CALLS'
    | 'CONTAINS'
    | 'USES_CONCEPT'
    | 'SIMILAR_TOPOLOGY'
    | 'IN_SOM'
  >;
  maxDepth: 1 | 2;
  maxCandidates: number;
}

export interface GraphCandidate {
  packetKey: string;
  seedPacketKey: string;
  relationshipPath: string[];
  depth: number;
  graphScore: number;
  pageRankPrior?: number;
}

export interface RetrievalIdentity {
  packetKey: string;
  qdrantPointId?: string | number;
  sourceRef?: string;
  featureId?: string;
}

// Seeds are the fused top-K results; graph is a bounded expansion, not a standalone sweep.
// maxCandidates hard-stops the traversal so a dense graph can't blow out the context budget.
export async function graphRetrieve(req: GraphRetrievalRequest): Promise<GraphCandidate[]> {
  const seeds = req.seedPacketKeys.slice(0, 5);
  if (seeds.length === 0) return [];

  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: 'READ' });

  try {
    const relFilter = req.allowedRelationships.join('|');
    const perSeedLimit = Math.ceil(req.maxCandidates / seeds.length);
    const allCandidates: GraphCandidate[] = [];

    for (const seedPacketKey of seeds) {
      let records: Array<{ packetKey: string; sourceRef?: string; featureId?: string; pageRankPrior: number }> = [];

      try {
        // Try APOC path expansion first (more precise depth control)
        const apocResult = await session.run(
          `MATCH (seed {packet_key: $packetKey})
           CALL apoc.path.subgraphNodes(seed, {
             relationshipFilter: $relFilter,
             maxLevel: $maxDepth,
             limit: $perSeedLimit
           }) YIELD node
           WHERE node.packet_key IS NOT NULL AND node.packet_key <> $packetKey
           RETURN node.packet_key AS packetKey,
                  node.source_ref AS sourceRef,
                  node.feature_id AS featureId,
                  coalesce(node.page_rank_score, 0.0) AS pageRankPrior
           LIMIT $perSeedLimit`,
          { packetKey: seedPacketKey, relFilter, maxDepth: req.maxDepth, perSeedLimit }
        );
        records = apocResult.records.map(r => ({
          packetKey: r.get('packetKey') as string,
          sourceRef: r.get('sourceRef') as string | undefined,
          featureId: r.get('featureId') as string | undefined,
          pageRankPrior: r.get('pageRankPrior') as number,
        }));
      } catch {
        // APOC not available — fall back to variable-length MATCH
        const allowedRels = req.allowedRelationships;
        const fallbackResult = await session.run(
          `MATCH (seed {packet_key: $packetKey})-[r*1..${req.maxDepth}]-(neighbor)
           WHERE type(r[-1]) IN $allowedRels
             AND neighbor.packet_key IS NOT NULL
             AND neighbor.packet_key <> $packetKey
           RETURN DISTINCT
             neighbor.packet_key AS packetKey,
             neighbor.source_ref AS sourceRef,
             neighbor.feature_id AS featureId,
             coalesce(neighbor.page_rank_score, 0.0) AS pageRankPrior
           LIMIT $perSeedLimit`,
          { packetKey: seedPacketKey, allowedRels, perSeedLimit }
        );
        records = fallbackResult.records.map(r => ({
          packetKey: r.get('packetKey') as string,
          sourceRef: r.get('sourceRef') as string | undefined,
          featureId: r.get('featureId') as string | undefined,
          pageRankPrior: r.get('pageRankPrior') as number,
        }));
      }

      for (const rec of records) {
        allCandidates.push({
          packetKey: rec.packetKey,
          seedPacketKey,
          relationshipPath: req.allowedRelationships,
          depth: req.maxDepth,
          // PageRank prior normalised into [0,1] — raw scores vary by graph size
          graphScore: Math.min(1, rec.pageRankPrior / 10),
          pageRankPrior: rec.pageRankPrior,
        });
      }
    }

    // Deduplicate by packetKey, keep the highest graphScore copy
    const seen = new Map<string, GraphCandidate>();
    for (const c of allCandidates) {
      const existing = seen.get(c.packetKey);
      if (!existing || c.graphScore > existing.graphScore) {
        seen.set(c.packetKey, c);
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => b.graphScore - a.graphScore)
      .slice(0, req.maxCandidates);
  } finally {
    await session.close();
  }
}

export function createGraphRetriever() {
  return { retrieve: graphRetrieve };
}
