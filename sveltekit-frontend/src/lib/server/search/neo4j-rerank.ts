/**
 * Neo4j authority enrichment for hybrid retrieval.
 *
 * Fetches pageRank + community scores for a set of stable_keys,
 * and optionally expands to 1-hop / 2-hop neighbours (file-level).
 * Does NOT do lexical search — that's Postgres FTS.
 */

import { ENV } from '$lib/server/env.server.js';

interface Neo4jResult { rows: { row: unknown[] }[] }

async function neo4jQuery(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<{ row: unknown[] }[]> {
  try {
    const res = await fetch(`${ENV.NEO4J_URI.replace('bolt://', 'http://').replace('7687', '7474')}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${ENV.NEO4J_USER}:${ENV.NEO4J_PASSWORD}`).toString('base64')}`,
      },
      body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const body = await res.json() as { results?: Neo4jResult[] };
    return body.results?.[0]?.rows ?? [];
  } catch {
    return [];
  }
}

export interface AuthorityMap {
  [stableKey: string]: { pagerank: number; community: number; hops?: string[] };
}

/** Bulk-fetch pagerank + community for up to 200 stable_keys in one Cypher call. */
export async function fetchAuthorityScores(stableKeys: string[]): Promise<AuthorityMap> {
  if (!stableKeys.length) return {};

  const rows = await neo4jQuery(
    `UNWIND $keys AS k
     MATCH (n)
     WHERE (
       n:CodebaseFile OR n:Packet
     )
     AND coalesce(
       n.stable_key,
       n.filePath,
       n.file_path,
       n.sourceRef,
       n.source_ref,
       n.packet_key,
       n.id
     ) = k
     RETURN k, coalesce(n.pageRankScore, 0.0) AS pr, coalesce(n.gpuCluster, -1) AS community`,
    { keys: stableKeys.slice(0, 200) }
  );

  const out: AuthorityMap = {};
  for (const r of rows) {
    const [k, pr, comm] = r.row as [string, number, number];
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
       src:CodebaseFile OR src:Packet
     )
     AND coalesce(
       src.stable_key,
       src.filePath,
       src.file_path,
       src.sourceRef,
       src.source_ref,
       src.packet_key,
       src.id
     ) = $k
     MATCH (src)-[:IMPORTS|CALLS|USED_CONCEPT|SIMILAR_TOPOLOGY*${depthCond}]->(dep)
     WHERE (
       dep:CodebaseFile OR dep:Packet
     )
     RETURN DISTINCT coalesce(
       dep.stable_key,
       dep.filePath,
       dep.file_path,
       dep.sourceRef,
       dep.source_ref,
       dep.packet_key,
       dep.id
     ) AS sk
     LIMIT 20`,
    { k: stableKey }
  );
  return rows.map((r) => String((r.row as [string])[0])).filter(Boolean);
}
