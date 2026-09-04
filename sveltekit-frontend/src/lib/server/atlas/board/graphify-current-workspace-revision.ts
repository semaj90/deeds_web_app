import { sql } from 'drizzle-orm';

import { db, pgRows } from '$lib/server/db/client.js';

export const GRAPHIFY_CURRENT_WORKSPACE_REVISION_SCHEMA =
	'atlas.graphify-current-workspace-revision.v1' as const;

/**
 * KANBAN-RECOMMENDATION-REVISION-BINDING-01 (parent-atlas-retrieval-lineage-dag-convergence):
 * reads the most recent PROVEN workspaceRevision/graphRevision pair from `graphify_runs` — the
 * live canonical source, not a timestamp. `graphify_executions` (the new execution ledger from
 * GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02) is intentionally NOT read here yet: it has no production
 * writer wired up, so preferring it would silently starve this resolver the moment that table
 * exists but is still empty. Revisit once a coordinator writes through it.
 *
 * Read-only. Never falls back to a timestamp or other non-content-derived value as a
 * `workspaceRevision` — the frozen identity model (see this file's own project CLAUDE.md and
 * `GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02`) treats that substitution as the exact bug this resolver
 * exists to close. When no real revision is known yet, callers get `null` and must propagate that
 * absence explicitly rather than inventing a value.
 */
export type GraphifyCurrentWorkspaceRevisionV1 = {
	schema: typeof GRAPHIFY_CURRENT_WORKSPACE_REVISION_SCHEMA;
	workspaceRevision: string;
	graphRevision: string | null;
	runId: string;
	completedAt: string | null;
};

let cached: { value: GraphifyCurrentWorkspaceRevisionV1 | null; resolvedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

/**
 * Reads the most recent `graphify_runs` row that has a real (sha256:-prefixed) `workspace_revision`,
 * preferring COMPLETED rows over RUNNING/FAILED ones. Returns `null` — never a timestamp or other
 * placeholder — when no such row exists yet (e.g. before the first successful Graphify run).
 *
 * `graphRevision` is currently derived from `source_manifest_digest` (the closest live column to a
 * derived-graph-output identity) since `graphify_runs` has no dedicated `graph_revision` column —
 * this is a real, documented gap, not a silent assumption: `source_manifest_digest` identifies the
 * *source manifest* the graph was built from, not the graph output itself, so treat this as a
 * provisional stand-in until a real `graphRevision` column/producer exists (tracked under this
 * file's own frozen-identity-model gates, not invented here).
 */
export async function resolveCurrentGraphifyWorkspaceRevision(options?: {
	skipCache?: boolean;
}): Promise<GraphifyCurrentWorkspaceRevisionV1 | null> {
	if (!options?.skipCache && cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS) {
		return cached.value;
	}

	// Degraded Response Contract (project CLAUDE.md): a DB-unavailable environment (unit tests
	// without a live Postgres, a transient connection failure) must degrade to "no proven
	// revision yet" — the same `null` outcome as an empty result set — never throw and break the
	// caller. Never fabricate a value on failure; `null` is the only safe degraded output here.
	let rows: Array<{
		run_id: string;
		workspace_revision: string | null;
		source_manifest_digest: string | null;
		completed_at: string | null;
		status: string;
	}>;
	try {
		rows = pgRows(
			await db.execute(sql`
				SELECT run_id, workspace_revision, source_manifest_digest, completed_at, status
				FROM graphify_runs
				WHERE workspace_revision IS NOT NULL
				ORDER BY (status = 'COMPLETED') DESC, started_at DESC
				LIMIT 1
			`),
		);
	} catch (error) {
		console.warn('[graphify-current-workspace-revision] DB query failed, degrading to null:', error);
		cached = { value: null, resolvedAt: Date.now() };
		return null;
	}

	const row = rows[0];
	const value: GraphifyCurrentWorkspaceRevisionV1 | null = row?.workspace_revision
		? {
				schema: GRAPHIFY_CURRENT_WORKSPACE_REVISION_SCHEMA,
				workspaceRevision: row.workspace_revision,
				graphRevision: row.source_manifest_digest ? `sha256:${row.source_manifest_digest}` : null,
				runId: row.run_id,
				completedAt: row.completed_at,
			}
		: null;

	cached = { value, resolvedAt: Date.now() };
	return value;
}
