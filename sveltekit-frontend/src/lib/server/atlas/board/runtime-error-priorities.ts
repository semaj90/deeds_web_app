import { pool } from '$lib/server/db/client.js';

export interface RuntimeErrorPriority {
	fingerprint: string;
	source: 'error_events' | 'error_logs';
	routePath: string;
	kind: string;
	severity: string;
	message: string;
	occurrences: number;
	lastSeen: string;
	priorityScore: number;
	/**
	 * First application-source file seen in the group's stored stacks (e.g. `src/routes/+page.svelte`),
	 * newest occurrence first. File path only: browser stacks carry compiled-module line numbers that do
	 * not map to source lines, so none is exposed. `null` when no stack has an application frame
	 * (typically dependency-only frames such as Vite pre-bundled Svelte internals).
	 */
	firstAppFrame: string | null;
}

export interface RuntimeErrorPriorityReport {
	status: 'AVAILABLE' | 'UNAVAILABLE';
	total: number;
	top10: RuntimeErrorPriority[];
	top100: RuntimeErrorPriority[];
}

const emptyReport: RuntimeErrorPriorityReport = {
	status: 'UNAVAILABLE',
	total: 0,
	top10: [],
	top100: [],
};

export async function loadRuntimeErrorPriorities(): Promise<RuntimeErrorPriorityReport> {
	try {
		const result = await pool.query<{
			fingerprint: string;
			source: 'error_events' | 'error_logs';
			route_path: string;
			kind: string;
			severity: string;
			message: string;
			occurrences: number;
			last_seen: Date | string;
			priority_score: number | string;
			first_app_frame: string | null;
			total_count: number | string;
		}>(`
			WITH source_events AS (
				SELECT
					'error_events'::text AS source,
					split_part(route_path, '?', 1) AS route_path,
					kind::text AS kind,
					CASE lower(severity::text) WHEN 'warning' THEN 'warn' ELSE lower(severity::text) END AS severity,
					message,
					collected_at AS occurred_at,
					(regexp_match(stack, '(src[/\\\\](?:routes|lib)[/\\\\][^\\s?:",]+)'))[1] AS first_app_frame
				FROM error_events
				WHERE collected_at >= now() - interval '30 days'
				UNION ALL
				SELECT
					'error_logs'::text AS source,
					split_part(coalesce(route_path, context_key, file_path, '(unknown)'), '?', 1) AS route_path,
					error_category::text AS kind,
					CASE lower(severity::text) WHEN 'warning' THEN 'warn' ELSE lower(severity::text) END AS severity,
					message,
					created_at AS occurred_at,
					(regexp_match(stack, '(src[/\\\\](?:routes|lib)[/\\\\][^\\s?:",]+)'))[1] AS first_app_frame
				FROM error_logs
				WHERE created_at >= now() - interval '30 days'
					AND resolved = false
			), grouped AS (
				SELECT
					md5(concat_ws('|', source, route_path, kind, severity,
						regexp_replace(lower(message), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]+', '#', 'g')
					)) AS fingerprint,
					source,
					route_path,
					kind,
					severity,
					left(min(message), 400) AS message,
					count(*)::integer AS occurrences,
					max(occurred_at) AS last_seen,
						(array_agg(first_app_frame ORDER BY occurred_at DESC) FILTER (WHERE first_app_frame IS NOT NULL))[1] AS first_app_frame
				FROM source_events
				GROUP BY 1, 2, 3, 4, 5,
					regexp_replace(lower(message), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]+', '#', 'g')
			), scored AS (
				SELECT *, round((
					CASE severity WHEN 'critical' THEN 5.0 WHEN 'error' THEN 4.0 WHEN 'warn' THEN 2.0 ELSE 1.0 END
					* (1.0 + ln(occurrences::numeric))
					* exp(-least(greatest(extract(epoch FROM (now() - last_seen)) / 86400.0, 0), 365) / 14.0)
				)::numeric, 4)::float8 AS priority_score
				FROM grouped
			)
			SELECT fingerprint, source, route_path, kind, severity, message, occurrences,
				last_seen, priority_score, first_app_frame, count(*) OVER ()::integer AS total_count
			FROM scored
			ORDER BY priority_score DESC, occurrences DESC, last_seen DESC, fingerprint ASC
			LIMIT 100
		`);

		const top100 = result.rows.map((row) => ({
			fingerprint: row.fingerprint,
			source: row.source,
			routePath: row.route_path,
			kind: row.kind,
			severity: row.severity,
			message: row.message,
			occurrences: Number(row.occurrences),
			lastSeen: new Date(row.last_seen).toISOString(),
			priorityScore: Number(row.priority_score),
			firstAppFrame: row.first_app_frame ?? null,
		}));
		return {
			status: 'AVAILABLE',
			total: Number(result.rows[0]?.total_count ?? 0),
			top10: top100.slice(0, 10),
			top100,
		};
	} catch (error) {
		console.error('[daily-graphify-board] runtime error ranking unavailable:', error);
		return emptyReport;
	}
}
