/**
 * Neo4j authority enrichment for hybrid retrieval.
 *
 * Fetches pageRank + community scores for a set of stable_keys,
 * and optionally expands to 1-hop / 2-hop neighbours (file-level).
 * Does NOT do lexical search — that's Postgres FTS.
 */

import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

async function neo4jQuery(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<neo4jQueryRow[]> {
  const driver = getNeo4jDriver();
  const session = driver.session({ database: 'neo4j' });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => {
      const row: Record<string, unknown> = {};
      for (const key of record.keys) {
        if (typeof key !== 'string') continue;
        row[key] = record.get(key);
      }
      return row;
    });
  } catch {
    return [];
  } finally {
    await session.close().catch(() => {});
  }
}

type neo4jQueryRow = Record<string, unknown>;

export interface AuthorityMap {
  [stableKey: string]: { pagerank: number; community: number; hops?: string[] };
}

const GRAPH_NODE_LABELS = [
  'CodebaseFile',
  'ParentAtlasSource',
  'ParentAtlasFeature',
  'Packet',
  'SourceRef',
  'Feature',
  'Concept',
  'Trace',
  'Community',
  'Centroid',
  'Function',
  'InteractiveSession',
  'ToolDomain',
  'Inference',
  'Intent',
  'Tool',
] as const;

function nodeKeyExpr(alias: string): string {
  return `coalesce(
    ${alias}.stable_key,
    ${alias}.filePath,
    ${alias}.file_path,
    ${alias}.sourceRef,
    ${alias}.source_ref,
    ${alias}.packet_key,
    ${alias}.source_ref_key,
    ${alias}.path,
    ${alias}.normalized_path,
    ${alias}.id
  )`;
}

/** Bulk-fetch pagerank + community for up to 200 stable_keys in one Cypher call. */
export async function fetchAuthorityScores(stableKeys: string[]): Promise<AuthorityMap> {
  if (!stableKeys.length) return {};

  const rows = await neo4jQuery(
    `UNWIND $keys AS k
     MATCH (n)
     WHERE (
       ${GRAPH_NODE_LABELS.map((label) => `n:${label}`).join(' OR ')}
     )
     AND ${nodeKeyExpr('n')} = k
     RETURN k AS k, coalesce(n.pageRankScore, 0.0) AS pr, coalesce(n.gpuCluster, -1) AS community`,
    { keys: stableKeys.slice(0, 200) }
  );

  const out: AuthorityMap = {};
  for (const r of rows) {
    const k = String(r.k ?? '');
    const pr = Number(r.pr ?? 0);
    const comm = Number(r.community ?? -1);
    if (!k) continue;
    out[k] = { pagerank: pr, community: comm };
  }
  return out;
}

/** 1-hop file neighbour expansion — returns stable_keys of directly imported files. */
export async function expandNeighbours(
  stableKey: string,
  hops: 1 | 2 = 1
): Promise<string[]> {
  const depthCond = hops === 2 ? '1..2' : '1';
  const rows = await neo4jQuery(
    `MATCH (src)
     WHERE (
       ${GRAPH_NODE_LABELS.map((label) => `src:${label}`).join(' OR ')}
     )
     AND ${nodeKeyExpr('src')} = $k
     MATCH (src)-[:IMPORTS|CALLS|USED_CONCEPT|SIMILAR_TOPOLOGY|BELONGS_TO_FEATURE|HAS_CENTROID*${depthCond}]-(dep)
     WHERE (
       ${GRAPH_NODE_LABELS.map((label) => `dep:${label}`).join(' OR ')}
     )
     RETURN DISTINCT ${nodeKeyExpr('dep')} AS sk
     LIMIT 20`,
    { k: stableKey }
  );
  return rows.map((r) => String(r.sk ?? '')).filter(Boolean);
}
