/**
 * neo4j-gds.ts — Neo4j Graph Data Science + APOC integration.
 *
 * Provides:
 *   ensureGdsProjection()  — idempotent codeTopology graph projection
 *   runPageRankMutate()    — writes graphPageRank back to File/Cluster nodes
 *   runLouvainMutate()     — writes louvainCommunity back to File/Cluster nodes
 *   getImpactNeighborhood()— 3-hop APOC path expansion for impact analysis
 *   getGdsStatus()         — checks APOC + GDS availability
 */

import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GdsStatus {
  apocAvailable: boolean;
  gdsAvailable: boolean;
  projectionExists: boolean;
  apocVersion?: string;
  gdsVersion?: string;
}

export interface ImpactNode {
  stableKey: string;
  labels: string[];
  path?: string;
  distance: number;
}

export interface ImpactResult {
  stableKey: string;
  affected: ImpactNode[];
  totalCount: number;
  durationMs: number;
}

export interface CategorizedImpactNode {
  stableKey: string;
  path?: string;
  distance: number;
}

export interface CategorizedImpactResult {
  stableKey: string;
  impacted: {
    routes: CategorizedImpactNode[];
    tests: CategorizedImpactNode[];
    clusters: CategorizedImpactNode[];
    wikiNotes: CategorizedImpactNode[];
    researchNotes: CategorizedImpactNode[];
    files: CategorizedImpactNode[];
  };
  paths: Array<{ from: string; to: string; type: string }>;
  totalCount: number;
  durationMs: number;
  apocUsed: boolean;
}

export interface PageRankResult {
  nodesUpdated: number;
  durationMs: number;
}

export interface LouvainResult {
  nodesUpdated: number;
  communities: number;
  durationMs: number;
}

const PROJECTION_NAME = 'codeTopology';

// ── Plugin availability ───────────────────────────────────────────────────────

export async function getGdsStatus(): Promise<GdsStatus> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  let apocAvailable = false;
  let gdsAvailable = false;
  let projectionExists = false;
  let apocVersion: string | undefined;
  let gdsVersion: string | undefined;

  try {
    // APOC check
    try {
      const r = await session.run(`RETURN apoc.version() AS v`);
      apocVersion = r.records[0]?.get('v') ?? 'unknown';
      apocAvailable = true;
    } catch { /* apoc not installed */ }

    // GDS check
    try {
      const r = await session.run(`CALL gds.version() YIELD version RETURN version`);
      gdsVersion = r.records[0]?.get('version') ?? 'unknown';
      gdsAvailable = true;
    } catch { /* gds not installed */ }

    // Projection existence
    if (gdsAvailable) {
      try {
        const r = await session.run(
          `CALL gds.graph.exists($name) YIELD exists RETURN exists`,
          { name: PROJECTION_NAME }
        );
        projectionExists = r.records[0]?.get('exists') ?? false;
      } catch { /* ignore */ }
    }
  } finally {
    await session.close();
  }

  return { apocAvailable, gdsAvailable, projectionExists, apocVersion, gdsVersion };
}

// ── Graph projection ──────────────────────────────────────────────────────────

/**
 * Create (or recreate) the codeTopology in-memory GDS projection.
 * Idempotent — drops existing projection first if present.
 */
export async function ensureGdsProjection(force = false): Promise<{ created: boolean; nodeCount: number; relationshipCount: number }> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    // Drop if force-refreshing
    if (force) {
      try {
        await session.run(`CALL gds.graph.drop($name, false) YIELD graphName`, { name: PROJECTION_NAME });
      } catch { /* didn't exist, fine */ }
    }

    // Check if projection already exists
    const existsResult = await session.run(
      `CALL gds.graph.exists($name) YIELD exists RETURN exists`,
      { name: PROJECTION_NAME }
    );
    const exists = existsResult.records[0]?.get('exists') ?? false;
    if (exists && !force) {
      const infoResult = await session.run(
        `CALL gds.graph.list($name) YIELD nodeCount, relationshipCount RETURN nodeCount, relationshipCount`,
        { name: PROJECTION_NAME }
      );
      const rec = infoResult.records[0];
      return {
        created: false,
        nodeCount: rec?.get('nodeCount') ?? 0,
        relationshipCount: rec?.get('relationshipCount') ?? 0,
      };
    }

    // Create projection
    const result = await session.run(`
      CALL gds.graph.project(
        $name,
        ['File', 'Directory', 'Cluster', 'WikiNote', 'ResearchNote', 'SummaryLens'],
        {
          IMPORTS:            { orientation: 'NATURAL' },
          CONTAINS:           { orientation: 'NATURAL' },
          BELONGS_TO_CLUSTER: { orientation: 'UNDIRECTED' },
          REFERENCES:         { orientation: 'NATURAL' },
          SIMILAR_TOPOLOGY:   { orientation: 'UNDIRECTED' },
          HAS_CHUNK:          { orientation: 'NATURAL' }
        }
      )
      YIELD nodeCount, relationshipCount
    `, { name: PROJECTION_NAME });

    const rec = result.records[0];
    return {
      created: true,
      nodeCount: rec?.get('nodeCount') ?? 0,
      relationshipCount: rec?.get('relationshipCount') ?? 0,
    };
  } finally {
    await session.close();
  }
}

// ── PageRank ──────────────────────────────────────────────────────────────────

/**
 * Run GDS PageRank and write scores back to nodes as `graphPageRank`.
 * Requires ensureGdsProjection() to have been called first.
 */
export async function runPageRankMutate(): Promise<PageRankResult> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  const t0 = Date.now();

  try {
    // Run PageRank and write into projection
    await session.run(`
      CALL gds.pageRank.mutate($name, {
        maxIterations: 20,
        dampingFactor: 0.85,
        mutateProperty: 'graphPageRank'
      })
    `, { name: PROJECTION_NAME });

    // Write scores back to actual graph nodes
    const writeResult = await session.run(`
      CALL gds.graph.nodeProperties.write($name, ['graphPageRank'])
      YIELD propertiesWritten
      RETURN propertiesWritten
    `, { name: PROJECTION_NAME });

    const nodesUpdated = writeResult.records[0]?.get('propertiesWritten') ?? 0;
    return { nodesUpdated, durationMs: Date.now() - t0 };
  } finally {
    await session.close();
  }
}

// ── Louvain community detection ───────────────────────────────────────────────

/**
 * Run Louvain community detection and write community IDs back to nodes.
 */
export async function runLouvainMutate(): Promise<LouvainResult> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  const t0 = Date.now();

  try {
    await session.run(`
      CALL gds.louvain.mutate($name, {
        mutateProperty: 'louvainCommunity'
      })
    `, { name: PROJECTION_NAME });

    const writeResult = await session.run(`
      CALL gds.graph.nodeProperties.write($name, ['louvainCommunity'])
      YIELD propertiesWritten
      RETURN propertiesWritten
    `, { name: PROJECTION_NAME });

    // Count distinct communities written
    const countResult = await session.run(`
      MATCH (n) WHERE n.louvainCommunity IS NOT NULL
      RETURN count(DISTINCT n.louvainCommunity) AS communities
    `);

    const nodesUpdated = writeResult.records[0]?.get('propertiesWritten') ?? 0;
    const communities  = countResult.records[0]?.get('communities') ?? 0;
    return { nodesUpdated, communities, durationMs: Date.now() - t0 };
  } finally {
    await session.close();
  }
}

// ── Impact analysis ───────────────────────────────────────────────────────────

/**
 * 3-hop APOC path expansion from a node identified by stableKey.
 * Returns all reachable nodes within maxDepth hops, sorted by distance.
 *
 * Falls back to pure Cypher variable-length path if APOC is unavailable.
 */
export async function getImpactNeighborhood(
  stableKey: string,
  maxDepth = 3,
  limit = 100,
): Promise<ImpactResult> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  const t0 = Date.now();

  try {
    const status = await getGdsStatus();

    let rows: Array<{ labels: string[]; stableKey: string; path?: string; distance: number }> = [];

    if (status.apocAvailable) {
      // APOC path expansion — richer, handles relationship direction
      const result = await session.run(`
        MATCH (start {stableKey: $stableKey})
        CALL apoc.path.subgraphNodes(start, {
          maxLevel: $maxDepth,
          limit: $limit
        })
        YIELD node
        WHERE node <> start AND node.stableKey IS NOT NULL
        WITH node,
             length(shortestPath((start)-[*]-(node))) AS distance
        RETURN labels(node) AS labels,
               node.stableKey   AS stableKey,
               node.path        AS path,
               distance
        ORDER BY distance ASC
        LIMIT $limit
      `, { stableKey, maxDepth, limit });

      rows = result.records.map(r => ({
        labels:    r.get('labels') as string[],
        stableKey: r.get('stableKey') as string,
        path:      r.get('path') as string | undefined,
        distance:  r.get('distance') as number,
      }));
    } else {
      // Pure Cypher fallback — variable-length path
      const result = await session.run(`
        MATCH (start {stableKey: $stableKey})
        MATCH p = (start)-[*1..$maxDepth]-(n)
        WHERE n.stableKey IS NOT NULL AND n <> start
        WITH n, min(length(p)) AS distance
        RETURN labels(n) AS labels,
               n.stableKey AS stableKey,
               n.path      AS path,
               distance
        ORDER BY distance ASC
        LIMIT $limit
      `, { stableKey, maxDepth, limit });

      rows = result.records.map(r => ({
        labels:    r.get('labels') as string[],
        stableKey: r.get('stableKey') as string,
        path:      r.get('path') as string | undefined,
        distance:  r.get('distance') as number,
      }));
    }

    return {
      stableKey,
      affected: rows,
      totalCount: rows.length,
      durationMs: Date.now() - t0,
    };
  } finally {
    await session.close();
  }
}

// ── Manifold4 coordinate sync ─────────────────────────────────────────────────

export interface Manifold4Row {
  stableKey: string;
  path: string;
  manifold4: [number, number, number, number];
}

/**
 * Write 4D manifold coordinates ([som_x, som_y, semantic_z, grpo_w]) back to
 * the corresponding :File nodes in Neo4j as manifold4X/Y/Z/W properties.
 *
 * Uses APOC UNWIND when available for batch efficiency; falls back to serial
 * MERGE otherwise.  Safe to call repeatedly — SET is idempotent.
 */
export async function syncManifold4ToNeo4j(rows: Manifold4Row[]): Promise<{ synced: number; durationMs: number }> {
  if (rows.length === 0) return { synced: 0, durationMs: 0 };

  const driver = getNeo4jDriver();
  const t0 = Date.now();
  const BATCH = 500;
  let synced = 0;

  const { apocAvailable } = await getGdsStatus().catch(() => ({ apocAvailable: false }));

  if (apocAvailable) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const session = driver.session({ database: 'neo4j' });
      try {
        await session.run(
          `
          UNWIND $rows AS row
          MATCH (f {stableKey: row.stableKey})
          SET f.manifold4X = row.x,
              f.manifold4Y = row.y,
              f.manifold4Z = row.z,
              f.manifold4W = row.w,
              f.path       = row.path
          `,
          {
            rows: slice.map(r => ({
              stableKey: r.stableKey,
              path:      r.path,
              x: r.manifold4[0],
              y: r.manifold4[1],
              z: r.manifold4[2],
              w: r.manifold4[3],
            })),
          }
        );
        synced += slice.length;
      } catch (err) {
        console.warn('[neo4j-gds] syncManifold4 APOC batch failed, falling back to serial:', (err as Error)?.message);
        // serial fallback for this batch
        const s2 = driver.session({ database: 'neo4j' });
        try {
          for (const r of slice) {
            try {
              await s2.run(
                `MATCH (f {stableKey: $sk}) SET f.manifold4X=$x, f.manifold4Y=$y, f.manifold4Z=$z, f.manifold4W=$w, f.path=$path`,
                { sk: r.stableKey, path: r.path, x: r.manifold4[0], y: r.manifold4[1], z: r.manifold4[2], w: r.manifold4[3] }
              );
              synced++;
            } catch { /* skip individual node */ }
          }
        } finally {
          await s2.close();
        }
      } finally {
        await session.close();
      }
    }
  } else {
    const session = driver.session({ database: 'neo4j' });
    try {
      for (const r of rows) {
        try {
          await session.run(
            `MATCH (f {stableKey: $sk}) SET f.manifold4X=$x, f.manifold4Y=$y, f.manifold4Z=$z, f.manifold4W=$w, f.path=$path`,
            { sk: r.stableKey, path: r.path, x: r.manifold4[0], y: r.manifold4[1], z: r.manifold4[2], w: r.manifold4[3] }
          );
          synced++;
        } catch { /* skip */ }
      }
    } finally {
      await session.close();
    }
  }

  return { synced, durationMs: Date.now() - t0 };
}

// ── Top PageRank nodes ────────────────────────────────────────────────────────

export interface AuthorityNode {
  stableKey: string;
  labels: string[];
  path?: string;
  graphPageRank: number;
  louvainCommunity?: number;
}

export async function getTopAuthorityNodes(limit = 25): Promise<AuthorityNode[]> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (n)
      WHERE n.graphPageRank IS NOT NULL AND n.stableKey IS NOT NULL
      RETURN labels(n)         AS labels,
             n.stableKey       AS stableKey,
             n.path            AS path,
             n.graphPageRank   AS graphPageRank,
             n.louvainCommunity AS louvainCommunity
      ORDER BY n.graphPageRank DESC
      LIMIT $limit
    `, { limit });

    return result.records.map(r => ({
      labels:           r.get('labels') as string[],
      stableKey:        r.get('stableKey') as string,
      path:             r.get('path') as string | undefined,
      graphPageRank:    r.get('graphPageRank') as number,
      louvainCommunity: r.get('louvainCommunity') as number | undefined,
    }));
  } finally {
    await session.close();
  }
}

// ── Categorized impact analysis ───────────────────────────────────────────────

const REL_FILTER = 'IMPORTS|CONTAINS|BELONGS_TO_CLUSTER|REFERENCES|EVIDENCE_FOR|DOCUMENTS|CONSULTED';

/**
 * APOC-backed 3-hop impact expansion with node categorization.
 * Uses apoc.path.expandConfig with directed relationship filter.
 * Falls back to variable-length Cypher when APOC is unavailable.
 */
export async function getImpactCategorized(
  stableKey: string,
  maxDepth = 3,
  limit = 250,
): Promise<CategorizedImpactResult> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  const t0 = Date.now();

  const impacted: CategorizedImpactResult['impacted'] = {
    routes: [], tests: [], clusters: [], wikiNotes: [], researchNotes: [], files: [],
  };
  const paths: CategorizedImpactResult['paths'] = [];

  try {
    const status = await getGdsStatus();
    let rows: Array<{ labels: string[]; stableKey: string; path?: string; distance: number; relType?: string }> = [];

    if (status.apocAvailable) {
      const result = await session.run(`
        MATCH (start {stableKey: $stableKey})
        CALL apoc.path.expandConfig(start, {
          relationshipFilter: $relFilter,
          minLevel: 1,
          maxLevel: $maxDepth,
          bfs: true,
          limit: $limit
        })
        YIELD path
        WITH last(nodes(path)) AS node,
             length(path) AS distance,
             type(last(relationships(path))) AS relType
        WHERE node.stableKey IS NOT NULL AND node.stableKey <> $stableKey
        RETURN DISTINCT
          labels(node) AS labels,
          node.stableKey AS stableKey,
          node.path      AS nodePath,
          distance,
          relType
        ORDER BY distance ASC
        LIMIT $limit
      `, { stableKey, relFilter: REL_FILTER, maxDepth, limit });

      rows = result.records.map(r => ({
        labels:    r.get('labels') as string[],
        stableKey: r.get('stableKey') as string,
        path:      r.get('nodePath') as string | undefined,
        distance:  r.get('distance') as number,
        relType:   r.get('relType') as string | undefined,
      }));
    } else {
      const result = await session.run(`
        MATCH (start {stableKey: $stableKey})
        MATCH p = (start)-[r:IMPORTS|CONTAINS|BELONGS_TO_CLUSTER|REFERENCES|EVIDENCE_FOR|DOCUMENTS|CONSULTED*1..$maxDepth]->(n)
        WHERE n.stableKey IS NOT NULL AND n.stableKey <> $stableKey
        WITH n, min(length(p)) AS distance, type(last(relationships(p))) AS relType
        RETURN DISTINCT
          labels(n) AS labels,
          n.stableKey AS stableKey,
          n.path      AS nodePath,
          distance,
          relType
        ORDER BY distance ASC
        LIMIT $limit
      `, { stableKey, maxDepth, limit });

      rows = result.records.map(r => ({
        labels:    r.get('labels') as string[],
        stableKey: r.get('stableKey') as string,
        path:      r.get('nodePath') as string | undefined,
        distance:  r.get('distance') as number,
        relType:   r.get('relType') as string | undefined,
      }));
    }

    for (const row of rows) {
      const node: CategorizedImpactNode = {
        stableKey: row.stableKey,
        path:      row.path,
        distance:  row.distance,
      };
      if (row.relType) {
        paths.push({ from: stableKey, to: row.stableKey, type: row.relType });
      }

      const lbls = row.labels.map(l => l.toLowerCase());
      const p    = (row.path ?? '').toLowerCase();

      if (lbls.includes('cluster')) {
        impacted.clusters.push(node);
      } else if (lbls.includes('wikinote')) {
        impacted.wikiNotes.push(node);
      } else if (lbls.includes('researchnote')) {
        impacted.researchNotes.push(node);
      } else if (p.includes('src/routes') || lbls.includes('route')) {
        impacted.routes.push(node);
      } else if (p.includes('.test.') || p.includes('.spec.') || lbls.includes('testfile')) {
        impacted.tests.push(node);
      } else {
        impacted.files.push(node);
      }
    }

    return {
      stableKey,
      impacted,
      paths,
      totalCount: rows.length,
      durationMs: Date.now() - t0,
      apocUsed: status.apocAvailable,
    };
  } finally {
    await session.close();
  }
}