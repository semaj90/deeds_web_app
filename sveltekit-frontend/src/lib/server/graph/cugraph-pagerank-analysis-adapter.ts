import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  GraphAnalysisRunSchema,
  GraphMetricResultSchema,
  type GraphAnalysisRun,
  type GraphMetricResult,
} from './graph-analysis-types.js';
import {
  createAtlasRapidsPageRankClient,
  type AtlasPageRankReceiptV1,
} from '$lib/server/atlas/graph/atlas-rapids-pagerank-client.js';

const DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas';
const MAX_GPU_RESULTS = 512;
const CHALLENGER_METRIC_NAME = 'pagerank_cugraph';

export interface CuGraphPageRankAnalysisOptions {
  graphRevision: string;
  projectionName?: string;
  maxIterations?: number;
  dampingFactor?: number;
  tolerance?: number;
  limit?: number;
  sidecarUrl?: string | null;
  deadlineMs?: number;
}

export interface CuGraphPageRankAnalysisResult {
  run: GraphAnalysisRun;
  metricsWritten: number;
  unresolvedPacketKeys: number;
  excludedPacketKeys: number;
  receipt: AtlasPageRankReceiptV1;
}

/**
 * Execute bounded global PageRank through the resident cuGraph sidecar and
 * persist the result through the shared graph-analysis tables.
 *
 * The GPU runtime intentionally returns at most 512 rows. Until a frozen
 * parity/promotion gate explicitly promotes this executor, rows are written as
 * `pagerank_cugraph`, not `pagerank`, so GraphFeatureSnapshotV1 cannot silently
 * replace the established PageRank authority lane with a partial top-K result.
 */
export async function runCuGraphPageRankAnalysis(
  db: Pool,
  options: CuGraphPageRankAnalysisOptions,
): Promise<CuGraphPageRankAnalysisResult> {
  const graphRevision = options.graphRevision?.trim();
  if (!graphRevision) throw new Error('CUGRAPH_PAGERANK_GRAPH_REVISION_REQUIRED');

  const maxIterations = options.maxIterations ?? 100;
  const dampingFactor = options.dampingFactor ?? 0.85;
  const tolerance = options.tolerance ?? 1e-6;
  const requestedLimit = options.limit ?? 128;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_GPU_RESULTS) {
    throw new Error(`CUGRAPH_PAGERANK_LIMIT_OUT_OF_RANGE:${requestedLimit}:max=${MAX_GPU_RESULTS}`);
  }

  const sidecarUrl = options.sidecarUrl?.trim()
    || process.env.ATLAS_RAPIDS_SIDECAR_URL
    || 'http://127.0.0.1:8098';
  const projectionName = options.projectionName?.trim() || 'atlas-rapids-resident';
  const client = createAtlasRapidsPageRankClient(sidecarUrl);
  const startedAt = new Date().toISOString();
  const inputHash = createHash('sha256')
    .update(JSON.stringify({
      algorithm: 'pagerank',
      backend: 'cugraph.pagerank',
      graphRevision,
      projectionName,
      maxIterations,
      dampingFactor,
      tolerance,
      requestedLimit,
    }))
    .digest('hex');

  const receipt = await client.pagerank({
    graphRevision,
    topK: requestedLimit,
    alpha: dampingFactor,
    tol: tolerance,
    maxIter: maxIterations,
    deadlineMs: options.deadlineMs,
  });

  if (receipt.operation !== 'pagerank') {
    throw new Error(`CUGRAPH_PAGERANK_UNEXPECTED_OPERATION:${receipt.operation}`);
  }
  if (receipt.graphRevision !== graphRevision) {
    throw new Error(`CUGRAPH_PAGERANK_GRAPH_REVISION_MISMATCH:${receipt.graphRevision}:${graphRevision}`);
  }
  if (!receipt.didConverge) throw new Error('CUGRAPH_PAGERANK_DID_NOT_CONVERGE');

  const completedAt = new Date().toISOString();
  const runId = randomUUID();
  const outputHash = createHash('sha256')
    .update(JSON.stringify(receipt.results.map((row) => ({
      nodeKey: row.nodeKey,
      packetKey: row.packetKey,
      score: row.score,
    }))))
    .digest('hex');

  const run = GraphAnalysisRunSchema.parse({
    runId,
    algorithm: 'pagerank',
    algorithmRevision: receipt.algorithmRevision,
    parameterRevision: `cugraph-${maxIterations}-${dampingFactor}-${tolerance}`,
    workspaceRevision: DEFAULT_WORKSPACE_REVISION,
    sourceRevision: receipt.graphRevision,
    backendPreference: 'gpu-sidecar',
    backendActual: 'gpu-sidecar',
    gpuAccelerated: true,
    sidecarUrl,
    inputHash,
    outputHash,
    graphRevision: receipt.graphRevision,
    projectionRevision: receipt.projectionRevision,
    projectionName,
    nodeCount: receipt.nodeCount,
    relationshipCount: receipt.edgeCount,
    startedAt,
    completedAt,
    status: 'succeeded',
    parameters: {
      maxIterations,
      dampingFactor,
      tolerance,
      requestedLimit,
      resultScope: 'TOP_K_BOUNDED',
      metricName: CHALLENGER_METRIC_NAME,
    },
    metrics: {
      resultsReturned: receipt.results.length,
      didConverge: receipt.didConverge,
      cacheHit: receipt.cacheHit,
      kernelMs: receipt.timings.kernelMs,
      resultSelectMs: receipt.timings.resultSelectMs,
      nodeTableHash: receipt.nodeTableHash,
      edgeTableHash: receipt.edgeTableHash,
      promotionState: 'CHALLENGER_SHADOW',
    },
  });

  const createdAt = new Date().toISOString();
  const byPacketKey = new Map<string, number>();
  let unresolvedPacketKeys = 0;
  for (const row of receipt.results) {
    if (!row.packetKey) {
      unresolvedPacketKeys += 1;
      continue;
    }
    const existing = byPacketKey.get(row.packetKey);
    if (existing === undefined || row.score > existing) byPacketKey.set(row.packetKey, row.score);
  }

  const metricRows: GraphMetricResult[] = [...byPacketKey.entries()].map(([packetKey, score]) =>
    GraphMetricResultSchema.parse({
      runId,
      packetKey,
      symbolVersionId: null,
      metricName: CHALLENGER_METRIC_NAME,
      metricValue: score,
      graphRevision: receipt.graphRevision,
      algorithmRevision: receipt.algorithmRevision,
      createdAt,
    }),
  );

  const dbClient = await db.connect();
  try {
    await dbClient.query('BEGIN');
    await dbClient.query(
      `INSERT INTO graph_analysis_runs (
        run_id, algorithm, algorithm_revision, parameter_revision, workspace_revision,
        source_revision, started_at, completed_at, status, parameters, metrics,
        backend_preference, backend_actual, gpu_accelerated, sidecar_url,
        input_hash, output_hash, graph_revision, projection_revision, projection_name,
        node_count, relationship_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        run.runId,
        run.algorithm,
        run.algorithmRevision,
        run.parameterRevision,
        run.workspaceRevision,
        run.sourceRevision,
        run.startedAt,
        run.completedAt,
        run.status,
        JSON.stringify(run.parameters),
        JSON.stringify(run.metrics),
        run.backendPreference,
        run.backendActual,
        run.gpuAccelerated,
        run.sidecarUrl,
        run.inputHash,
        run.outputHash,
        run.graphRevision,
        run.projectionRevision,
        run.projectionName,
        run.nodeCount,
        run.relationshipCount,
      ],
    );

    const BATCH_SIZE = 3000;
    for (let offset = 0; offset < metricRows.length; offset += BATCH_SIZE) {
      const batch = metricRows.slice(offset, offset + BATCH_SIZE);
      if (batch.length === 0) continue;
      const values: string[] = [];
      const params: unknown[] = [];
      batch.forEach((metric, index) => {
        const base = index * 7;
        values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`);
        params.push(
          metric.runId,
          metric.packetKey,
          metric.symbolVersionId,
          metric.metricName,
          metric.metricValue,
          metric.graphRevision,
          metric.algorithmRevision,
        );
      });
      await dbClient.query(
        `INSERT INTO graph_node_metrics
          (run_id, packet_key, symbol_version_id, metric_name, metric_value, graph_revision, algorithm_revision)
         VALUES ${values.join(',')}`,
        params,
      );
    }

    await dbClient.query('COMMIT');
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    dbClient.release();
  }

  return {
    run,
    metricsWritten: metricRows.length,
    unresolvedPacketKeys,
    excludedPacketKeys: 0,
    receipt,
  };
}
