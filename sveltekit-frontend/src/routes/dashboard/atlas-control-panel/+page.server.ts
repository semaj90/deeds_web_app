import type { PageServerLoad } from './$types';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { loadWorkspaceAdmissionPanelV1 } from '$lib/server/atlas/admission/workspace-admission-panel-v1.js';
import {
	listKanbanTaskEvents,
	listKanbanTasks,
	type KanbanTask,
	type KanbanTaskEvent,
} from '$lib/server/atlas/kanban-task-board.js';

export const load: PageServerLoad = async ({ fetch, locals }) => {
	let operations: {
		catalogStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'ADMIN_ONLY';
		tables: Array<{ tableName: string; exists: boolean; indexNames: string[] }>;
		errorCounts: { total: number; unresolved: number } | null;
		graphifyAdmission: Awaited<ReturnType<typeof loadWorkspaceAdmissionPanelV1>> | null;
		kanbanBoard: {
			tasks: KanbanTask[];
			total: number;
			recentEvents: KanbanTaskEvent[];
		} | null;
		error?: string;
	} = {
		catalogStatus: locals.user?.role === 'admin' ? 'UNAVAILABLE' : 'ADMIN_ONLY',
		tables: [],
		errorCounts: null,
		graphifyAdmission: null,
		kanbanBoard: null,
	};

	if (locals.user?.role === 'admin') {
		try {
			const catalog = await db.execute(sql`
				WITH wanted(table_name) AS (VALUES
					('atlas_directories'), ('atlas_packets'), ('atlas_representations'),
					('atlas_hyperedges'), ('codebase_chunk_index'), ('error_logs'),
					('graphify_executions'), ('graphify_files'), ('graphify_runs'),
					('graphify_symbols'), ('kanban_tasks'), ('graphify_audit_kanban')
				)
				SELECT wanted.table_name,
				       relation.oid IS NOT NULL AS table_exists,
				       COALESCE(array_agg(index_relation.relname ORDER BY index_relation.relname)
				         FILTER (WHERE index_relation.oid IS NOT NULL), ARRAY[]::text[]) AS index_names
				FROM wanted
				LEFT JOIN pg_class relation
				  ON relation.relname = wanted.table_name AND relation.relnamespace = 'public'::regnamespace
				 AND relation.relkind IN ('r', 'p')
				LEFT JOIN pg_index index_entry ON index_entry.indrelid = relation.oid
				LEFT JOIN pg_class index_relation ON index_relation.oid = index_entry.indexrelid
				GROUP BY wanted.table_name, relation.oid
				ORDER BY wanted.table_name
			`);
			const catalogRows = catalog.rows as Array<Record<string, unknown>>;
			operations.tables = catalogRows.map((row) => ({
				tableName: String(row.table_name),
				exists: row.table_exists === true,
				indexNames: Array.isArray(row.index_names) ? row.index_names.map(String) : [],
			}));
			operations.catalogStatus = 'AVAILABLE';

			if (operations.tables.some((table) => table.tableName === 'error_logs' && table.exists)) {
				const counts = await db.execute(sql`
					SELECT count(*)::int AS total,
					       count(*) FILTER (WHERE resolved = false)::int AS unresolved
					FROM public.error_logs
				`);
				const row = counts.rows[0] as Record<string, number> | undefined;
				if (row) operations.errorCounts = { total: Number(row.total), unresolved: Number(row.unresolved) };
			}
		} catch (error) {
			operations.error = error instanceof Error ? error.message : String(error);
		}

		try {
			operations.graphifyAdmission = await loadWorkspaceAdmissionPanelV1();
		} catch (error) {
			operations.error = [operations.error, error instanceof Error ? error.message : String(error)]
				.filter(Boolean)
				.join('; ');
		}

		try {
			const [board, recentEvents] = await Promise.all([
				listKanbanTasks({ limit: 30 }),
				listKanbanTaskEvents({ limit: 15 }),
			]);
			operations.kanbanBoard = {
				tasks: board.tasks,
				total: board.total,
				recentEvents,
			};
		} catch (error) {
			operations.error = [operations.error, error instanceof Error ? error.message : String(error)]
				.filter(Boolean)
				.join('; ');
		}
	}

	try {
		const cacheStatsRes = await fetch('/api/acp/kv-cache-stats', {
			method: 'GET',
			signal: AbortSignal.timeout(5000)
		});

		if (!cacheStatsRes.ok) {
			console.error('Failed to fetch cache stats:', cacheStatsRes.status);
			return { cacheStats: null, error: 'Cache stats unavailable', operations };
		}

		const cacheStats = await cacheStatsRes.json();
		return { cacheStats, operations };
	} catch (error) {
		console.error('Error loading cache stats:', error);
		return { cacheStats: null, error: 'Failed to load cache stats', operations };
	}
};
