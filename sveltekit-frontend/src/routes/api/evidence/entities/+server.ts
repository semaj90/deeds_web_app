/**
 * GET /api/evidence/entities — Cross-evidence entity & forensic flag search
 *
 * Query params:
 *   ?label=PERSON          — filter by entity label
 *   ?text=John             — fuzzy match on entity text (ILIKE)
 *   ?caseId=uuid           — scope to a specific case
 *   ?flagType=PII_SSN      — search forensic flags by type
 *   ?severity=high         — filter forensic flags by severity
 *   ?mode=entities|flags|both (default: both)
 *   ?limit=50              — max results per category (default 50, max 500)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const entitiesQuerySchema = z.object({
	label: z.string().max(100).nullish(),
	text: z.string().max(1000).nullish(),
	caseId: z.string().max(100).nullish(),
	flagType: z.string().max(100).nullish(),
	severity: z.enum(['low', 'medium', 'high']).nullish(),
	mode: z.enum(['entities', 'flags', 'both']).default('both'),
	limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = entitiesQuerySchema.safeParse({
		label: url.searchParams.get('label'),
		text: url.searchParams.get('text'),
		caseId: url.searchParams.get('caseId'),
		flagType: url.searchParams.get('flagType'),
		severity: url.searchParams.get('severity'),
		mode: url.searchParams.get('mode') ?? undefined,
		limit: url.searchParams.get('limit') ?? undefined,
	});
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
	const { label, text, caseId, flagType, severity, mode, limit } = parsed.data;

	const results: { entities?: Record<string, unknown>[]; flags?: Record<string, unknown>[]; counts?: Record<string, unknown> | null } = {};

	// Cross-evidence entity search
	if (mode === 'entities' || mode === 'both') {
		const conditions: ReturnType<typeof sql>[] = [];

		if (label) {
			conditions.push(sql`ee.entity_label = ${label}`);
		}
		if (text) {
			conditions.push(sql`ee.entity_text ILIKE ${'%' + text + '%'}`);
		}
		if (caseId) {
			conditions.push(sql`ee.case_id = ${caseId}`);
		}

		const whereClause =
      conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

		try {
			const entityResult = await db.execute(sql`
				SELECT ee.id, ee.evidence_id, ee.case_id, ee.entity_text, ee.entity_label,
					ee.confidence, ee.source, ee.created_at,
					e.title AS evidence_title, e.evidence_type, e.file_type
				FROM evidence_entities ee
				LEFT JOIN evidence e ON e.id = ee.evidence_id
				${whereClause}
				ORDER BY ee.confidence DESC NULLS LAST, ee.created_at DESC
				LIMIT ${limit}
			`);
			results.entities = entityResult.rows ?? [];
		} catch (err) {
			console.warn('[Entities API] Query failed:', err);
			results.entities = [];
		}
	}

	// Cross-evidence forensic flag search
	if (mode === 'flags' || mode === 'both') {
		const conditions: ReturnType<typeof sql>[] = [];

		if (flagType) {
			conditions.push(sql`ef.flag_type = ${flagType}`);
		}
		if (severity) {
			conditions.push(sql`ef.severity = ${severity}`);
		}
		if (caseId) {
			conditions.push(sql`ef.case_id = ${caseId}`);
		}

		const whereClause =
      conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

		try {
			const flagResult = await db.execute(sql`
				SELECT ef.id, ef.evidence_id, ef.case_id, ef.flag_type, ef.description,
					ef.severity, ef.metadata, ef.created_at,
					e.title AS evidence_title, e.evidence_type, e.file_type
				FROM evidence_forensic_flags ef
				LEFT JOIN evidence e ON e.id = ef.evidence_id
				${whereClause}
				ORDER BY
					CASE ef.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
					ef.created_at DESC
				LIMIT ${limit}
			`);
			results.flags = flagResult.rows ?? [];
		} catch (err) {
			console.warn('[Entities API] Forensic flags query failed:', err);
			results.flags = [];
		}
	}

	// Aggregate counts for dashboard
	try {
		const countResult = await db.execute(sql`
			SELECT
				(SELECT COUNT(*) FROM evidence_entities) AS total_entities,
				(SELECT COUNT(DISTINCT entity_label) FROM evidence_entities) AS unique_labels,
				(SELECT COUNT(*) FROM evidence_forensic_flags) AS total_flags,
				(SELECT COUNT(*) FROM evidence_forensic_flags WHERE severity = 'high') AS high_severity_flags
		`);
		results.counts = countResult.rows?.[0] ?? null;
	} catch {
		results.counts = null;
	}

	return json(results);
};