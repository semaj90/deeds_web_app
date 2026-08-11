/**
 * pagerank-analysis-adapter.ts — Graph Analysis Run/Promotion Contract, Patch C.
 *
 * Wraps neo4j-gds-client.ts's runPageRankClient()/getTopPageRankClient() — the
 * only one of five PageRank code paths in this repo with a runtime proof
 * against the live graph (GR2/GR3 in the sibling
 * parent-atlas-graph-runtime-enhancement change). Writes one graph_analysis_runs
 * row + one graph_node_metrics row per resolved node.
 *
 * Deliberately does NOT touch:
 *   - atlas_graph_authority_runs / atlas_graph_authority_scores (v1) — dead
 *     code, zero callers of PageRankPromotionGate, one stale 2026-07-22 row.
 *   - atlas_graph_authority_runs_v2 / atlas_graph_authority_scores_v2 — writer
 *     functions exist but have zero callers; the one 2026-08-09 row came from
 *     a fixture-only NetworkX oracle (python/parent_atlas_networkx_pagerank.py)
 *     that only prints JSON to stdout, never touches Postgres.
 *   - graphify-authority.mjs (Neo4j-property + Redis + Qdrant path) or
 *     run-pagerank.ts (CouchDB + GPU path) — separate, untouched paths.
 *   - search-runtime.ts's blendScores() — wiring the promoted authority
 *     signal into retrieval ranking is blocked on the authority-provenance
 *     audit owned by parent-atlas-retrieval-lod-algorithm-taxonomy, and is
 *     GA9/Patch I territory, not this patch's GA1 scope.
 *
 * packet_key resolution: Neo4j CodebaseFile.path -> atlas_packets.source_ref,
 * exact or 'sveltekit-frontend/'-prefixed. Verified live 2026-08-09 against a
 * 2000-node random sample: 1307 exact + 578 prefixed matches = 94.25%
 * resolution rate. Nodes that don't resolve are counted in
 * `unresolvedPacketKeys` and skipped (not written), not silently dropped.
 */

import type { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import {
	ensureProjectionClient,
	runPageRankClient,
	getTopPageRankClient,
	PROJECTION_NAME,
} from './neo4j-gds-client.js';
import {
	GraphAnalysisRunSchema,
	GraphMetricResultSchema,
	type GraphAnalysisRun,
	type GraphMetricResult,
} from './graph-analysis-types.js';
import { classifyGraphPacketPath, resolveCodebaseFilePacketKeys, lookupPacketKey } from './graph-packet-key-resolver.js';

const ALGORITHM_REVISION = 'neo4j-gds-pagerank-mutate-v1';
const PARAMETER_REVISION_PREFIX = 'maxIter-damping';
const DEFAULT_WORKSPACE_REVISION = 'workspace:parent-atlas';

export interface PageRankAnalysisOptions {
	maxIterations?: number;
	dampingFactor?: number;
	/** getTopPageRankClient has no "unlimited" mode — pass a ceiling above the live node count. */
	limit?: number;
}

export interface PageRankAnalysisResult {
	run: GraphAnalysisRun;
	metricsWritten: number;
	unresolvedPacketKeys: number;
	excludedPacketKeys: number;
}

export async function runPageRankAnalysis(
	db: Pool,
	options: PageRankAnalysisOptions = {},
): Promise<PageRankAnalysisResult> {
	const { maxIterations = 20, dampingFactor = 0.85, limit = 200_000 } = options;

	const projection = await ensureProjectionClient(PROJECTION_NAME, false);
	const startedAt = new Date().toISOString();
	const inputHash = createHash('sha256')
		.update(JSON.stringify({
			algorithm: 'pagerank',
			projectionName: PROJECTION_NAME,
			maxIterations,
			dampingFactor,
			limit,
		}))
		.digest('hex');

	await runPageRankClient(PROJECTION_NAME, { maxIterations, dampingFactor });
	// Filter to CodebaseFile explicitly — the projection includes 15+ node
	// labels (Function, Concept, Trace, ...), several of which carry the same
	// `path` property as their containing file. Confirmed live 2026-08-09:
	// leaving nodeType unfiltered produced duplicate (runId, packetKey,
	// metricName) rows from distinct non-file nodes resolving to the same
	// packet_key, which graph_node_metrics' primary key correctly rejected.
	const topNodes = await getTopPageRankClient(limit, 'CodebaseFile', 'pageRankScore');

	const completedAt = new Date().toISOString();
	const runId = randomUUID();
	// No separate projection-versioning table exists yet (that's the
	// GraphProjectionManifest concept from graph-projection-manifest.ts, not
	// yet persisted anywhere) — derive a content-based revision from the
	// projection's own reported shape so re-runs against an unchanged graph
	// are at least distinguishable from re-runs after a topology change.
	const graphRevision = createHash('sha256')
		.update(`${PROJECTION_NAME}:${projection.nodeCount}:${projection.relationshipCount}`)
		.digest('hex');
	const outputHash = createHash('sha256')
		.update(JSON.stringify(topNodes.map((n) => ({
			stableKey: n.stableKey,
			path: n.path ?? null,
			graphPageRank: n.graphPageRank,
			louvainCommunity: n.louvainCommunity ?? null,
		}))))
		.digest('hex');

	const run: GraphAnalysisRun = GraphAnalysisRunSchema.parse({
		runId,
		algorithm: 'pagerank',
		algorithmRevision: ALGORITHM_REVISION,
		parameterRevision: `${PARAMETER_REVISION_PREFIX}-${maxIterations}-${dampingFactor}`,
		workspaceRevision: DEFAULT_WORKSPACE_REVISION,
		sourceRevision: graphRevision,
		// This adapter runs entirely in-process (TypeScript calling Neo4j GDS
		// procedures over bolt) — no Python/Rust/GPU sidecar involved, so
		// 'native-ts' is accurate for both fields here, not the envelope's own
		// 'offline' default (which describes a different execution shape).
		backendPreference: 'native-ts',
		backendActual: 'native-ts',
		gpuAccelerated: false,
		sidecarUrl: null,
		inputHash,
		outputHash,
		graphRevision,
		projectionRevision: graphRevision,
		projectionName: PROJECTION_NAME,
		nodeCount: projection.nodeCount,
		relationshipCount: projection.relationshipCount,
		startedAt,
		completedAt,
		status: 'succeeded',
		parameters: { maxIterations, dampingFactor, mutateProperty: 'pageRankScore' },
		metrics: { topNodesReturned: topNodes.length },
	});

	const paths = topNodes.map((n) => n.path).filter((p): p is string => !!p);
	const resolved = await resolveCodebaseFilePacketKeys(db, paths);

	const createdAt = new Date().toISOString();
	// packetKey -> highest score seen. graph_node_metrics' primary key is
	// (runId, packetKey, metricName) — one row per packet per run, so any
	// packetKey collision (e.g. two CodebaseFile nodes somehow sharing a
	// path) must be resolved before insert, not left to the DB constraint to
	// reject mid-transaction. Max score is the defensible pick: PageRank
	// scores are non-negative, so the higher one reflects the more-connected
	// of the two nodes.
	const byPacketKey = new Map<string, { score: number }>();
	let unresolved = 0;
	let excluded = 0;
	for (const node of topNodes) {
		const classification = classifyGraphPacketPath(node.path ?? '');
		if (classification.kind === 'excluded') {
			excluded++;
			continue;
		}
		const packetKey = lookupPacketKey(resolved, node.path);
		if (!packetKey) {
			unresolved++;
			continue;
		}
		const existing = byPacketKey.get(packetKey);
		if (!existing || node.graphPageRank > existing.score) {
			byPacketKey.set(packetKey, { score: node.graphPageRank });
		}
	}

	const metricRows: GraphMetricResult[] = [];
	for (const [packetKey, { score }] of byPacketKey) {
		metricRows.push(
			GraphMetricResultSchema.parse({
				runId,
				packetKey,
				symbolVersionId: null,
				metricName: 'pagerank',
				metricValue: score,
				graphRevision,
				algorithmRevision: ALGORITHM_REVISION,
				createdAt,
			}),
		);
	}

	// Transactional: a graph_analysis_runs row with status='succeeded' must
	// never exist without its full graph_node_metrics batch also having
	// landed. Found the hard way — an untransacted first attempt hit the
	// Postgres bound-parameter ceiling (below) mid-metrics-insert and left a
	// 'succeeded' run row with zero metrics rows behind it.
	const client = await db.connect();
	try {
		await client.query('BEGIN');

		await client.query(
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

		// Postgres wire protocol caps bound parameters at 65,535 per query
		// (16-bit bind-message field) — 7 columns means >9,362 rows would
		// overflow a single INSERT. Batch conservatively below that ceiling.
		const BATCH_SIZE = 3000;
		for (let offset = 0; offset < metricRows.length; offset += BATCH_SIZE) {
			const batch = metricRows.slice(offset, offset + BATCH_SIZE);
			const values: string[] = [];
			const params: unknown[] = [];
			batch.forEach((m, i) => {
				const base = i * 7;
				values.push(
					`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`,
				);
				params.push(
					m.runId,
					m.packetKey,
					m.symbolVersionId,
					m.metricName,
					m.metricValue,
					m.graphRevision,
					m.algorithmRevision,
				);
			});
			await client.query(
				`INSERT INTO graph_node_metrics
					(run_id, packet_key, symbol_version_id, metric_name, metric_value, graph_revision, algorithm_revision)
				 VALUES ${values.join(',')}`,
				params,
			);
		}

		await client.query('COMMIT');
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}

	return { run, metricsWritten: metricRows.length, unresolvedPacketKeys: unresolved, excludedPacketKeys: excluded };
}
