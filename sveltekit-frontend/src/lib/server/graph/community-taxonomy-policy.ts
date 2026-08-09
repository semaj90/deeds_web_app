/**
 * community-taxonomy-policy.ts — Graph Analysis Run/Promotion Contract, Patch E
 * (GA3/GA4 — community evaluation).
 *
 * Computes CommunityEvaluationSchema for one graph_analysis_runs row from
 * already-persisted graph_communities / graph_analysis_runs data. Pure
 * evaluation — never decides promotion; that's GA9/Patch I's job.
 *
 * Feeds directly into README.md point 10's open question: does community
 * quality differ meaningfully across atlas_dependency_v1 / atlas_execution_v1
 * / atlas_feature_v1, and does Leiden differ from Louvain on the projections
 * where both can run? See evaluateAllCommunityRuns() for the comparison
 * table this produces.
 *
 * Hard constraint discovered live 2026-08-09: Neo4j GDS's Leiden
 * implementation requires an undirected graph
 * (`java.lang.IllegalArgumentException: The Leiden algorithm works only with
 * undirected graphs`). `IMPORTS`/`CALLS` are projected NATURAL (directed) in
 * neo4j-gds-client.ts's ensureProjectionClient — Leiden cannot run against
 * atlas_dependency_v1 or atlas_execution_v1 without a separate
 * undirected-orientation override, which is out of this patch's scope (a
 * real modeling decision — forcing directed dependency/call edges undirected
 * changes their semantics, not implied by README point 10). Leiden results
 * below are therefore atlas_feature_v1-only; Louvain results span all three.
 */

import type { Pool } from 'pg';
import { CommunityEvaluationSchema, type CommunityEvaluation } from './graph-analysis-types.js';

interface CommunitySizeRow {
	member_count: number;
}

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
	return sorted[idx];
}

/**
 * Evaluate one specific run (by runId) already written to
 * graph_analysis_runs/graph_communities. Assumes algorithm is 'louvain' or
 * 'leiden' — throws if the run isn't a community run or doesn't exist.
 */
export async function evaluateCommunityRun(db: Pool, runId: string): Promise<CommunityEvaluation> {
	const { rows: runRows } = await db.query<{
		algorithm: string;
		graph_revision: string;
		metrics: { assignments?: number; unresolvedPacketKeys?: number; modularity?: number };
	}>(
		`SELECT algorithm, graph_revision, metrics FROM graph_analysis_runs WHERE run_id = $1`,
		[runId],
	);
	const run = runRows[0];
	if (!run) throw new Error(`No graph_analysis_runs row for runId ${runId}`);
	if (run.algorithm !== 'louvain' && run.algorithm !== 'leiden') {
		throw new Error(`evaluateCommunityRun only supports louvain/leiden, got '${run.algorithm}'`);
	}

	const { rows: sizeRows } = await db.query<CommunitySizeRow>(
		`SELECT member_count FROM graph_communities WHERE run_id = $1 ORDER BY member_count ASC`,
		[runId],
	);
	if (sizeRows.length === 0) {
		throw new Error(`No graph_communities rows for runId ${runId} — run may have failed or not completed`);
	}

	const sizes = sizeRows.map((r) => Number(r.member_count));
	const communityCount = sizes.length;
	const singletonCount = sizes.filter((s) => s === 1).length;
	const totalAssigned = sizes.reduce((sum, s) => sum + s, 0);

	// assignments/unresolvedPacketKeys are the exact counters
	// runCommunityAnalysis (graph-analysis-runner.ts) computed at run time —
	// coverage here is "fraction of CodebaseFile-with-path nodes that
	// resolved to a packet_key and got a community assignment", not "fraction
	// of graph nodes with a non-null community property" (GDS assigns every
	// projected node a community, including isolated singletons, so that
	// alternative definition would always read 1.0 and tell us nothing).
	const assignments = Number(run.metrics?.assignments ?? totalAssigned);
	const unresolved = Number(run.metrics?.unresolvedPacketKeys ?? 0);
	const coverage = assignments + unresolved > 0 ? assignments / (assignments + unresolved) : 0;

	// modularity is captured live by runCommunityAnalysis's gds.<algo>.mutate
	// YIELD (graph-analysis-runner.ts) and persisted into metrics — read it
	// back rather than recomputing or guessing. Runs written before this
	// field existed (pre-2026-08-09 Patch E) fall back to 0, which is a
	// legitimate "unknown, not measured" value here since Louvain/Leiden
	// modularity is always > 0 for any non-trivial partition — a 0 is
	// visibly a missing-data marker, not a plausible real score.
	const modularity = Number(run.metrics?.modularity ?? 0);

	const evaluation: CommunityEvaluation = CommunityEvaluationSchema.parse({
		graphRevision: run.graph_revision,
		algorithm: run.algorithm,
		coverage,
		modularity,
		communityCount,
		singletonRatio: singletonCount / communityCount,
		p50CommunitySize: percentile(sizes, 0.5),
		p95CommunitySize: percentile(sizes, 0.95),
		maxCommunitySize: sizes[sizes.length - 1],
		subsystemPurity: null,
		stability: null,
	});

	return evaluation;
}

export interface CommunityRunSummary {
	runId: string;
	algorithm: string;
	projectionName: string;
	startedAt: string;
}

/** List all completed community (louvain/leiden) runs, most recent first per (algorithm, projectionName). */
export async function listCommunityRuns(db: Pool): Promise<CommunityRunSummary[]> {
	const { rows } = await db.query<CommunityRunSummary>(
		`SELECT DISTINCT ON (algorithm, projection_name) run_id AS "runId", algorithm, projection_name AS "projectionName", started_at AS "startedAt"
		 FROM graph_analysis_runs
		 WHERE algorithm IN ('louvain', 'leiden') AND status = 'succeeded'
		 ORDER BY algorithm, projection_name, started_at DESC`,
	);
	return rows;
}

export interface CommunityComparisonRow {
	algorithm: string;
	projectionName: string;
	evaluation: CommunityEvaluation;
}

/**
 * The actual answer to README point 10: evaluate every distinct
 * (algorithm, namedProjection) combination that has a completed run, most
 * recent run per combination. Directly comparable — same evaluation function,
 * same metric set, across projections instead of tuning one algorithm's
 * resolution parameter on the undifferentiated combined graph.
 */
export async function evaluateAllCommunityRuns(db: Pool): Promise<CommunityComparisonRow[]> {
	const runs = await listCommunityRuns(db);
	const results: CommunityComparisonRow[] = [];
	for (const run of runs) {
		const evaluation = await evaluateCommunityRun(db, run.runId);
		results.push({ algorithm: run.algorithm, projectionName: run.projectionName, evaluation });
	}
	return results;
}
