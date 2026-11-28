import { createHash, randomUUID } from 'node:crypto';
import neo4j from 'neo4j-driver';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { GraphAnalysisRunSchema, type GraphAnalysisRun } from './graph-analysis-types.js';
import { graphAlgorithmRevision } from './graph-algorithm-revision.js';
import { ensureProjectionClient, PROJECTION_NAME } from './neo4j-gds-client.js';

export type StreamGdsAlgorithm = 'knn' | 'bfs' | 'dijkstra' | 'astar';

/** Default Neo4j GDS heap/memory ceiling for bounded subgraph estimation (8 GiB). */
export const DEFAULT_NEO4J_GDS_MEMORY_CAP_BYTES = 8 * 1024 * 1024 * 1024;
export const DEFAULT_KNN_SUBGRAPH_CAP = 5000;
export const DEFAULT_KNN_REL_CAP = 25000;

export interface StreamGdsAnalysisOptions {
  algorithm: StreamGdsAlgorithm;
  projectionName?: string;
  workspaceRevision?: string;
  limit?: number;
  k?: number;
  maxDepth?: number;
  sourcePacketKey?: string;
  targetPacketKey?: string;
  maxEstimatedBytes?: number;
}

export interface StreamGdsRecord {
  sourceKey: string;
  targetKey?: string;
  scoreOrCost: number;
  pathKeys?: string[];
}

export interface StreamGdsAnalysisResult {
  run: GraphAnalysisRun;
  records: StreamGdsRecord[];
  estimatedBytes: number | null;
  writesPerformed: false;
  canonicalAuthority: false;
  skippedReason?: string;
}

function buildRun(params: {
  algorithm: StreamGdsAlgorithm;
  projectionName: string;
  workspaceRevision: string;
  nodeCount: number;
  relationshipCount: number;
  startedAt: string;
  status: 'succeeded' | 'failed';
  backendActual: 'native-ts' | 'offline';
  parameters: Record<string, unknown>;
  metrics: Record<string, unknown>;
  records: StreamGdsRecord[];
}): GraphAnalysisRun {
  const graphRevision = createHash('sha256')
    .update(`${params.projectionName}:${params.nodeCount}:${params.relationshipCount}`)
    .digest('hex');
  const outputHash = createHash('sha256')
    .update(JSON.stringify(params.records))
    .digest('hex');

  return GraphAnalysisRunSchema.parse({
    runId: randomUUID(),
    algorithm: params.algorithm,
    algorithmRevision: graphAlgorithmRevision(params.algorithm),
    parameterRevision: `stream-${params.algorithm}-v1`,
    workspaceRevision: params.workspaceRevision,
    sourceRevision: graphRevision,
    backendPreference: 'native-ts',
    backendActual: params.backendActual,
    gpuAccelerated: false,
    sidecarUrl: null,
    inputHash: graphRevision,
    outputHash,
    graphRevision,
    projectionRevision: graphRevision,
    projectionName: params.projectionName,
    nodeCount: params.nodeCount,
    relationshipCount: params.relationshipCount,
    startedAt: params.startedAt,
    completedAt: new Date().toISOString(),
    status: params.status,
    parameters: params.parameters,
    metrics: params.metrics,
  });
}

/**
 * Stream-only Neo4j GDS adapter for knn, bfs, dijkstra, and astar.
 * Performs zero Neo4j or PG18 writes and drops any ephemeral subgraph projection in finally.
 */
export async function runStreamGdsAnalysis(
  options: StreamGdsAnalysisOptions,
): Promise<StreamGdsAnalysisResult> {
  const startedAt = new Date().toISOString();
  const projectionName = options.projectionName ?? PROJECTION_NAME;
  const workspaceRevision = options.workspaceRevision ?? 'workspace:parent-atlas';
  const maxEstimatedBytes = options.maxEstimatedBytes ?? DEFAULT_NEO4J_GDS_MEMORY_CAP_BYTES;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
  const topK = Math.max(1, Math.min(options.k ?? 10, 50));
  const session = getNeo4jDriver().session();
  let ephemeralProjection: string | null = null;

  try {
    // A* requires geo coordinates (latitude/longitude) on graph nodes; CodebaseFile nodes lack them.
    if (options.algorithm === 'astar') {
      const checkRes = await session.run(
        `MATCH (n:CodebaseFile) WHERE n.latitude IS NOT NULL AND n.longitude IS NOT NULL RETURN count(n) AS cnt`,
      );
      const geoCount = Number(checkRes.records[0]?.get('cnt') ?? 0);
      if (geoCount === 0) {
        const run = buildRun({
          algorithm: 'astar',
          projectionName,
          workspaceRevision,
          nodeCount: 0,
          relationshipCount: 0,
          startedAt,
          status: 'failed',
          backendActual: 'offline',
          parameters: { limit, sourcePacketKey: options.sourcePacketKey ?? null, targetPacketKey: options.targetPacketKey ?? null },
          metrics: { skipped: true, reason: 'ASTAR_GEO_COORDS_NOT_PRESENT_ON_GRAPH' },
          records: [],
        });
        return {
          run,
          records: [],
          estimatedBytes: null,
          writesPerformed: false,
          canonicalAuthority: false,
          skippedReason: 'ASTAR_GEO_COORDS_NOT_PRESENT_ON_GRAPH',
        };
      }
    }

    let estimatedBytes: number | null = null;
    let projNodeCount = 0;
    let projRelCount = 0;

    if (options.algorithm === 'knn') {
      const nodeQuery = `MATCH (n:CodebaseFile) WHERE n.pagerank IS NOT NULL RETURN id(n) AS id, coalesce(n.pagerank, 0.0) AS pagerank LIMIT ${DEFAULT_KNN_SUBGRAPH_CAP}`;
      const relQuery = `MATCH (a:CodebaseFile)-[r]-(b:CodebaseFile) WHERE a.pagerank IS NOT NULL AND b.pagerank IS NOT NULL RETURN id(a) AS source, id(b) AS target, type(r) AS type LIMIT ${DEFAULT_KNN_REL_CAP}`;
      const estRes = await session.run(
        `CALL gds.graph.project.cypher.estimate($nodeQuery, $relQuery)
         YIELD bytesMin, bytesMax
         RETURN bytesMin, bytesMax`,
        { nodeQuery, relQuery },
      );
      const estRow = estRes.records[0];
      if (estRow) {
        const bytesMax = Number(estRow.get('bytesMax') ?? estRow.get('bytesMin') ?? 0);
        estimatedBytes = Number.isFinite(bytesMax) ? bytesMax : 0;
        if (estimatedBytes > maxEstimatedBytes) {
          const run = buildRun({
            algorithm: 'knn',
            projectionName,
            workspaceRevision,
            nodeCount: 0,
            relationshipCount: 0,
            startedAt,
            status: 'failed',
            backendActual: 'offline',
            parameters: { limit, topK, maxEstimatedBytes },
            metrics: { skipped: true, reason: 'GDS_ESTIMATE_EXCEEDS_MEMORY_CAP', estimatedBytes },
            records: [],
          });
          return {
            run,
            records: [],
            estimatedBytes,
            writesPerformed: false,
            canonicalAuthority: false,
            skippedReason: 'GDS_ESTIMATE_EXCEEDS_MEMORY_CAP',
          };
        }
      }
      ephemeralProjection = `atlas_knn_stream_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const projRes = await session.run(
        `CALL gds.graph.project.cypher($projName, $nodeQuery, $relQuery)
         YIELD nodeCount, relationshipCount
         RETURN nodeCount, relationshipCount`,
        { projName: ephemeralProjection, nodeQuery, relQuery },
      );
      projNodeCount = Number(projRes.records[0]?.get('nodeCount') ?? 0);
      projRelCount = Number(projRes.records[0]?.get('relationshipCount') ?? 0);
    } else {
      const proj = await ensureProjectionClient(projectionName, false);
      projNodeCount = proj.nodeCount;
      projRelCount = proj.relationshipCount;
    }

    const activeProjection = ephemeralProjection ?? projectionName;
    const records: StreamGdsRecord[] = [];

    if (options.algorithm === 'knn') {
      const res = await session.run(
        `CALL gds.knn.stream($projName, { topK: $topK, nodeProperties: ['pagerank'] })
         YIELD node1, node2, similarity
         RETURN gds.util.asNode(node1).stableKey AS sourceKey,
                gds.util.asNode(node2).stableKey AS targetKey,
                similarity AS score
         ORDER BY score DESC
         LIMIT $limit`,
        { projName: activeProjection, topK: neo4j.int(topK), limit: neo4j.int(limit) },
      );
      for (const rec of res.records) {
        const sourceKey = String(rec.get('sourceKey') ?? '');
        const targetKey = String(rec.get('targetKey') ?? '');
        if (sourceKey && targetKey) {
          records.push({ sourceKey, targetKey, scoreOrCost: Number(rec.get('score') ?? 0) });
        }
      }
    } else if (options.algorithm === 'bfs') {
      if (!options.sourcePacketKey) {
        throw new Error('sourcePacketKey is required for bfs stream analysis');
      }
      const maxDepth = Math.max(1, Math.min(options.maxDepth ?? 3, 6));
      const res = await session.run(
        `MATCH (s {stableKey: $sourceKey})
         CALL gds.bfs.stream($projName, { sourceNode: id(s), maxDepth: $maxDepth })
         YIELD path
         WITH path, range(0, size(nodes(path)) - 1) AS idxs
         UNWIND idxs AS idx
         WITH nodes(path)[idx] AS n, idx AS hop
         RETURN n.stableKey AS targetKey, min(hop) AS hops
         ORDER BY hops ASC, targetKey ASC
         LIMIT $limit`,
        { projName: activeProjection, sourceKey: options.sourcePacketKey, maxDepth: neo4j.int(maxDepth), limit: neo4j.int(limit) },
      );
      for (const rec of res.records) {
        const targetKey = String(rec.get('targetKey') ?? '');
        if (targetKey) {
          records.push({
            sourceKey: options.sourcePacketKey,
            targetKey,
            scoreOrCost: Number(rec.get('hops') ?? 0),
          });
        }
      }
    } else if (options.algorithm === 'dijkstra' || options.algorithm === 'astar') {
      if (!options.sourcePacketKey || !options.targetPacketKey) {
        throw new Error(`sourcePacketKey and targetPacketKey are required for ${options.algorithm} stream analysis`);
      }
      const proc = options.algorithm === 'dijkstra' ? 'gds.shortestPath.dijkstra.stream' : 'gds.shortestPath.astar.stream';
      const configClause = options.algorithm === 'astar'
        ? `{ sourceNode: id(s), targetNode: id(t), latitudeProperty: 'latitude', longitudeProperty: 'longitude' }`
        : `{ sourceNode: id(s), targetNode: id(t) }`;
      const res = await session.run(
        `MATCH (s {stableKey: $sourceKey}), (t {stableKey: $targetKey})
         CALL ${proc}($projName, ${configClause})
         YIELD totalCost, nodeIds
         RETURN totalCost, [nid IN nodeIds | gds.util.asNode(nid).stableKey] AS pathKeys
         LIMIT 1`,
        { projName: activeProjection, sourceKey: options.sourcePacketKey, targetKey: options.targetPacketKey },
      );
      for (const rec of res.records) {
        const pathKeys = (rec.get('pathKeys') as string[] | null) ?? [];
        records.push({
          sourceKey: options.sourcePacketKey,
          targetKey: options.targetPacketKey,
          scoreOrCost: Number(rec.get('totalCost') ?? 0),
          pathKeys: pathKeys.map((k) => String(k ?? '')).filter(Boolean),
        });
      }
    }

    const run = buildRun({
      algorithm: options.algorithm,
      projectionName: activeProjection,
      workspaceRevision,
      nodeCount: projNodeCount,
      relationshipCount: projRelCount,
      startedAt,
      status: 'succeeded',
      backendActual: 'native-ts',
      parameters: { limit, topK, sourcePacketKey: options.sourcePacketKey ?? null, targetPacketKey: options.targetPacketKey ?? null },
      metrics: { streamRecordCount: records.length, estimatedBytes, streamOnly: true, neo4jGdsStream: true },
      records,
    });

    return {
      run,
      records,
      estimatedBytes,
      writesPerformed: false,
      canonicalAuthority: false,
    };
  } finally {
    if (ephemeralProjection) {
      await session.run(`CALL gds.graph.drop($projName, false)`, { projName: ephemeralProjection }).catch(() => {});
    }
    await session.close().catch(() => {});
  }
}
