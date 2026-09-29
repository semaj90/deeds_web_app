import { getNeo4jDriver } from '../../neo4j-driver.js';

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
  relationshipEdges: Array<{
    fromPacketKey: string;
    toPacketKey: string;
    relationshipType: string;
  }>;
  depth: number;
  graphScore: number;
  pageRankPrior?: number;
  sourceRef?: string;
  featureId?: string;
}

export interface RetrievalIdentity {
  packetKey: string;
  qdrantPointId?: string | number;
  sourceRef?: string;
  featureId?: string;
}

const ALLOWED_RELATIONSHIPS = new Set([
  'IMPORTS',
  'CALLS',
  'CONTAINS',
  'USES_CONCEPT',
  'SIMILAR_TOPOLOGY',
  'IN_SOM',
]);

interface GraphPathRecord {
  packetKey: string;
  sourceRef?: string;
  featureId?: string;
  pageRankPrior: unknown;
  depth: unknown;
  relationshipPath: unknown;
  nodePacketKeys: unknown;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    const number = value.toNumber();
    return Number.isFinite(number) ? number : 0;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

// Seeds are supplied by the caller after search; this retriever only performs
// bounded, read-only expansion. Actual path metadata comes from Neo4j results.
export async function graphRetrieve(req: GraphRetrievalRequest): Promise<GraphCandidate[]> {
  const seeds = Array.from(new Set(req.seedPacketKeys.filter((key) => typeof key === 'string' && key.length > 0))).slice(0, 5);
  const allowedRelationships = req.allowedRelationships.filter((rel) => ALLOWED_RELATIONSHIPS.has(rel));
  if (
    seeds.length === 0 ||
    allowedRelationships.length === 0 ||
    (req.maxDepth !== 1 && req.maxDepth !== 2) ||
    !Number.isInteger(req.maxCandidates) ||
    req.maxCandidates < 1 ||
    req.maxCandidates > 1000
  ) return [];

  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: 'READ' });

  try {
    const perSeedLimit = Math.ceil(req.maxCandidates / seeds.length);
    const allCandidates: GraphCandidate[] = [];

    for (const seedPacketKey of seeds) {
      const result = await session.run(
        `MATCH p=(seed {packet_key: $packetKey})-[r*1..${req.maxDepth}]-(neighbor)
         WHERE all(rel IN r WHERE type(rel) IN $allowedRelationships)
           AND neighbor.packet_key IS NOT NULL
           AND neighbor.packet_key <> $packetKey
         WITH neighbor, p, length(p) AS depth,
              [rel IN relationships(p) | type(rel)] AS relationshipPath,
              [node IN nodes(p) | node.packet_key] AS nodePacketKeys,
              coalesce(neighbor.page_rank_score, 0.0) AS pageRankPrior
         RETURN DISTINCT neighbor.packet_key AS packetKey,
                neighbor.source_ref AS sourceRef,
                neighbor.feature_id AS featureId,
                pageRankPrior, depth, relationshipPath, nodePacketKeys
         ORDER BY depth ASC, pageRankPrior DESC, packetKey ASC
         LIMIT $perSeedLimit`,
        { packetKey: seedPacketKey, allowedRelationships, perSeedLimit }
      );

      const records: GraphPathRecord[] = result.records.map((record) => ({
        packetKey: record.get('packetKey') as string,
        sourceRef: record.get('sourceRef') as string | undefined,
        featureId: record.get('featureId') as string | undefined,
        pageRankPrior: record.get('pageRankPrior'),
        depth: record.get('depth'),
        relationshipPath: record.get('relationshipPath'),
        nodePacketKeys: record.get('nodePacketKeys'),
      }));

      for (const rec of records) {
        if (typeof rec.packetKey !== 'string' || rec.packetKey.length === 0) continue;
        const relationshipPath = asStringArray(rec.relationshipPath);
        const nodePacketKeys = asStringArray(rec.nodePacketKeys);
        const depth = Math.trunc(toFiniteNumber(rec.depth));
        if (
          depth < 1 ||
          depth > req.maxDepth ||
          relationshipPath.length !== depth ||
          relationshipPath.some((relationship) => !allowedRelationships.includes(relationship as GraphRetrievalRequest['allowedRelationships'][number])) ||
          nodePacketKeys.length !== depth + 1 ||
          nodePacketKeys[0] !== seedPacketKey ||
          nodePacketKeys.at(-1) !== rec.packetKey
        ) continue;
        const pageRankPrior = toFiniteNumber(rec.pageRankPrior);
        allCandidates.push({
          packetKey: rec.packetKey,
          seedPacketKey,
          relationshipPath,
          relationshipEdges: relationshipPath.map((relationshipType, index) => ({
            fromPacketKey: nodePacketKeys[index]!,
            toPacketKey: nodePacketKeys[index + 1]!,
            relationshipType,
          })),
          depth,
          // PageRank prior normalised into [0,1] — raw scores vary by graph size
          graphScore: Math.min(1, pageRankPrior / 10),
          pageRankPrior,
          ...(rec.sourceRef ? { sourceRef: rec.sourceRef } : {}),
          ...(rec.featureId ? { featureId: rec.featureId } : {}),
        });
      }
    }

    // Deduplicate by packetKey, keep the highest graphScore copy
    const seen = new Map<string, GraphCandidate>();
    for (const c of allCandidates) {
      const existing = seen.get(c.packetKey);
      if (
        !existing ||
        c.graphScore > existing.graphScore ||
        (c.graphScore === existing.graphScore && c.depth < existing.depth) ||
        (c.graphScore === existing.graphScore && c.depth === existing.depth && c.seedPacketKey < existing.seedPacketKey)
      ) {
        seen.set(c.packetKey, c);
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => b.graphScore - a.graphScore || a.depth - b.depth || a.packetKey.localeCompare(b.packetKey))
      .slice(0, req.maxCandidates);
  } finally {
    await session.close();
  }
}

export function createGraphRetriever() {
  return { retrieve: graphRetrieve };
}
