/**
 * cugraph-pagerank-adapter.ts — cuGraph/RAPIDS PageRank backend for the same
 * canonical `graph_analysis_runs` / `graph_node_metrics` tables that
 * pagerank-analysis-adapter.ts (Neo4j-GDS) already writes.
 *
 * IMPORTANT PROMOTION BOUNDARY:
 * The current atlas-gpu-8098 PageRank HTTP contract returns a bounded top-K
 * selection (client max 512), not a full V-row PageRank vector. Therefore this
 * adapter MUST persist the bounded result as `pagerank_cugraph_shadow`, never
 * canonical `pagerank`. Canonical PageRank promotion requires a separate
 * FULL_VECTOR artifact + same-revision CPU/GPU parity proof before packetKey
 * collapse.
 *
 * This is a second BACKEND under one canonical capability, not a competing
 * owner — same registry pattern already used for neo4j-gds-pagerank,
 * neo4j-gds-louvain-leiden, neo4j-gds-cheirank, neo4j-gds-kcore (see
 * docs/architecture/runtime-ownership-registry.json's `graph_analysis`
 * capability). Selected via GraphAnalysisRequest.engine === 'cugraph-rapids'
 * in graph-analysis-runner.ts.
 *
 * Precondition (fail-closed, not auto-loaded): a graph projection must
 * already be resident in the atlas-gpu-8098 sidecar via POST /v1/graph/load
 * before this adapter can run. This adapter deliberately does not attempt to
 * load one itself — picking which frozen GRAPH_SNAPSHOT_PARITY artifact to
 * load is a separate operational decision (see
 * openspec/changes/parent-atlas-graph-runtime-python-consolidation), not
 * something to guess at from inside a PageRank call. If nothing is resident,
 * this returns a skipped result with a clear reason, matching this file's own
 * runSkippedAnalysis() convention in graph-analysis-runner.ts.
 *
 * packetKey resolution: the cuGraph service already resolves packet_key
 * directly from the loaded nodes.parquet artifact's own `packet_key` column
 * (see atlas_rapids_graph_runtime.py's ResidentGraph), so — unlike the
 * Neo4j-GDS adapter — there is no separate Postgres path->packetKey
 * resolution step here. A null packetKey result is skipped, not written.
 */

import type { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { createAtlasRapidsPageRankClient, type AtlasPageRankResultV1, type AtlasGraphResidentStatusV1 } from '$lib/server/atlas/graph/atlas-rapids-pagerank-client.js';
import {
	GraphAnalysisRunSchema,
	GraphMetricResultSchema,
	type GraphAnalysisRun,
	type GraphMetricResult,
} from './graph-analysis-types.js';
import { graphAlgorithmRevision } from './graph-algorithm-revision.js';

const ALGORITHM_REVISION = graphAlgorithmRevision('pagerank');
const PARAMETER_REVISION_PREFIX = 'cugraph-maxIter-alpha';
const DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas';
const SHADOW_METRIC_NAME = 'pagerank_cugraph_shadow';

export type CuGraphPageRankSelectionModeV1 = 'TOP_K_SHADOW';

export interface CuGraphPageRankResultSemanticsV1 {
	algorithm: 'pagerank';
	backend: 'cugraph';
	selectionMode: CuGraphPageRankSelectionModeV1;
	vertexCount: number;
	resultVertexCount: number;
	resultCoverage: number;
	graphRevision: string;
	projectionRevision: string;
	metricName: typeof SHADOW_METRIC_NAME;
	canonicalMetricEligible: false;
}

export interface CuGraphPageRankAnalysisOptions {
	maxIterations?: number;
	dampingFactor?: number;
	limit?: number;
	sidecarUrl?: string | null;
}

export interface CuGraphPageRankAnalysisResult {
	run: GraphAnalysisRun;
	metricsWritten: number;
	unresolvedPacketKeys: number;
	excludedPacketKeys: number;
	resultSemantics?: CuGraphPageRankResultSemanticsV1;
	skippedReason?: string;
}

async function buildSkippedResult(
	reason: string,
	graphRevision: string,
	nodeCount: number,
	edgeCount: number,
	sidecarUrl: string | null,
): Promise<CuGraphPageRankAnalysisResult> {
	const startedAt = new Date().toISOString();
	const run: GraphAnalysisRun = GraphAnalysisRunSchema.parse({
		runId: randomUUID(),
		algorithm: 'pagerank',
		algorithmRevision: ALGORITHM_REVISION,
		parameterRevision: `${PARAMETER_REVISION_PREFIX}-skipped`,
		workspaceRevision: DEFAULT_WORKSPACE_REVISION,
		sourceRevision: graphRevision,
		backendPreference: 'gpu-sidecar',
		backendActual: 'gpu-sidecar',
		gpuAccelerated: false,
		sidecarUrl,
		inputHash: null,
		outputHash: null,
		graphRevision,
		projectionRevision: graphRevision,
		projectionName: 'cugraph-resident',
		nodeCount,
		relationshipCount: edgeCount,
		startedAt,
		completedAt: new Date().toISOString(),
		status: 'succeeded',
		parameters: { reason },
		metrics: { skipped: true, reason },
	});
	return { run, metricsWritten: 0, unresolvedPacketKeys: 0, excludedPacketKeys: 0, skippedReason: reason };
}

export async function runCuGraphPageRankAnalysis(
	db: Pool,
	options: CuGraphPageRankAnalysisOptions = {},
): Promise<CuGraphPageRankAnalysisResult> {
	const { maxIterations = 100, dampingFactor = 0.85, limit = 128, sidecarUrl = null } = options;
	const client = createAtlasRapidsPageRankClient(sidecarUrl ?? undefined);

	let residentStatus: AtlasGraphResidentStatusV1;
	try {
		residentStatus = await client.resident();
	} catch (err) {
		return buildSkippedResult(
			`ATLAS_RAPIDS_GRAPH_SIDECAR_UNREACHABLE:${err instanceof Error ? err.message : String(err)}`,
			'unknown',
			0,
			0,
			sidecarUrl,
		);
	}

	if (!residentStatus.resident) {
		return buildSkippedResult(
			'ATLAS_RAPIDS_GRAPH_NOT_RESIDENT: no graph projection loaded in the atlas-gpu-8098 sidecar — call POST /v1/graph/load with a reviewed GRAPH_SNAPSHOT_PARITY artifact first; this adapter does not auto-load one',
			'unknown',
			0,
			0,
			sidecarUrl,
		);
	}

	const { graphRevision, nodeCount, edgeCount } = residentStatus.resident;
	const startedAt = new Date().toISOString();
	const inputHash = createHash('sha256')
		.update(JSON.stringify({ algorithm: 'pagerank', backend: 'cugraph-rapids', graphRevision, maxIterations, dampingFactor, limit }))
		.digest('hex');

	const receipt = await client.pagerank({
		graphRevision,
		topK: limit,
		alpha: dampingFactor,
		maxIter: maxIterations,
	});

	const completedAt = new Date().toISOString();
	const runId = randomUUID();
	const outputHash = createHash('sha256')
		.update(JSON.stringify(receipt.results.map((r) => ({ nodeKey: r.nodeKey, packetKey: r.packetKey, score: r.score }))))
		.digest('hex');

	const resultVertexCount = receipt.results.length;
	const resultCoverage = nodeCount > 0 ? resultVertexCount / nodeCount : 0;
	const resultSemantics: CuGraphPageRankResultSemanticsV1 = {
		algorithm: 'pagerank',
		backend: 'cugraph',
		selectionMode: 'TOP_K_SHADOW',
		vertexCount: nodeCount,
		resultVertexCount,
		resultCoverage,
		graphRevision,
		projectionRevision: receipt.projectionRevision,
		metricName: SHADOW_METRIC_NAME,
		canonicalMetricEligible: false,
	};

	const run: GraphAnalysisRun = GraphAnalysisRunSchema.parse({
		runId,
		algorithm: 'pagerank',
		algorithmRevision: ALGORITHM_REVISION,
		parameterRevision: `${PARAMETER_REVISION_PREFIX}-${maxIterations}-${dampingFactor}`,
		workspaceRevision: DEFAULT_WORKSPACE_REVISION,
		sourceRevision: graphRevision,
		backendPreference: 'gpu-sidecar',
		backendActual: 'gpu-sidecar',
		gpuAccelerated: true,
		sidecarUrl: sidecarUrl ?? (process.env.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098'),
		inputHash,
		outputHash,
		graphRevision,
		projectionRevision: receipt.projectionRevision,
		projectionName: 'cugraph-resident',
		nodeCount,
		relationshipCount: edgeCount,
		startedAt,
		completedAt,
		status: 'succeeded',
		parameters: { maxIterations, dampingFactor, topK: limit, selectionMode: resultSemantics.selectionMode },
		metrics: {
			topNodesReturned: resultVertexCount,
			vertexCount: nodeCount,
			resultCoverage,
			metricName: SHADOW_METRIC_NAME,
			canonicalMetricEligible: false,
			didConverge: receipt.didConverge,
			cacheHit: receipt.cacheHit,
		},
	});

	// packetKey -> highest score seen, same discipline as the Neo4j-GDS adapter's
	// byPacketKey dedup (graph_node_metrics' primary key is (runId, packetKey,
	// metricName) — one row per packet per run).
	// IMPORTANT: this packet collapse is SHADOW-ONLY. CPU/GPU canonical parity
	// must compare the full GraphOrdinal/nodeKey result before this reduction.
	const byPacketKey = new Map<string, { score: number }>();
	let unresolved = 0;
	for (const node of receipt.results as AtlasPageRankResultV1[]) {
		if (!node.packetKey) {
			unresolved++;
			continue;
		}
		const existing = byPacketKey.get(node.packetKey);
		if (!existing || node.score > existing.score) {
			byPacketKey.set(node.packetKey, { score: node.score });
		}
	}

	const metricRows: GraphMetricResult[] = [];
	const createdAt = new Date().toISOString();
	for (const [packetKey, { score }] of byPacketKey) {
		metricRows.push(
			GraphMetricResultSchema.parse({
				runId,
				packetKey,
				symbolVersionId: null,
				metricName: SHADOW_METRIC_NAME,
				metricValue: score,
				graphRevision,
				algorithmRevision: ALGORITHM_REVISION,
				createdAt,
			}),
		);
	}

	// Transactional, same shape as pagerank-analysis-adapter.ts: a
	// graph_analysis_runs row with status='succeeded' must never exist without
	// its full graph_node_metrics batch also having landed.
	const pgClient = await db.connect();
	try {
		await pgClient.query('BEGIN');

		await pgClient.query(
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

		// Same Postgres bound-parameter ceiling as pagerank-analysis-adapter.ts
		// (65,535 per query / 7 columns each -> batch below ~9,362 rows).
		const BATCH_SIZE = 3000;
		for (let offset = 0; offset < metricRows.length; offset += BATCH_SIZE) {
			const batch = metricRows.slice(offset, offset + BATCH_SIZE);
			const values: string[] = [];
			const params: unknown[] = [];
			batch.forEach((m, i) => {
				const base = i * 7;
				values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`);
				params.push(m.runId, m.packetKey, m.symbolVersionId, m.metricName, m.metricValue, m.graphRevision, m.algorithmRevision);
			});
			await pgClient.query(
				`INSERT INTO graph_node_metrics
					(run_id, packet_key, symbol_version_id, metric_name, metric_value, graph_revision, algorithm_revision)
				 VALUES ${values.join(',')}`,
				params,
			);
		}

		await pgClient.query('COMMIT');
	} catch (err) {
		await pgClient.query('ROLLBACK');
		throw err;
	} finally {
		pgClient.release();
	}

	return {
		run,
		metricsWritten: metricRows.length,
		unresolvedPacketKeys: unresolved,
		excludedPacketKeys: 0,
		resultSemantics,
	};
}
