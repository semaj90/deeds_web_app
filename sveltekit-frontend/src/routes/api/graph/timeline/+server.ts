import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const TIMELINE_TYPES = ['case', 'evidence', 'person', 'citation', 'report'] as const;

const timelineQuerySchema = z.object({
	caseId: z.string().uuid('Invalid case ID').optional(),
	limit: z.coerce.number().int().min(1).max(200).optional().default(50),
	types: z.string().optional().transform((v) => {
		if (!v) return [...TIMELINE_TYPES];
		return v.split(',').filter((t): t is typeof TIMELINE_TYPES[number] =>
			(TIMELINE_TYPES as readonly string[]).includes(t)
		);
	})
});

interface TimelineNode {
	id: string;
	type: typeof TIMELINE_TYPES[number];
	title: string;
	timestamp: string;
	metadata: Record<string, unknown>;
}

/**
 * GET /api/graph/timeline
 * Return a unified timeline of events across cases, evidence, POIs, citations
 * Query: ?caseId=xxx&limit=50&types=case,evidence,person,citation
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const parsed = timelineQuerySchema.safeParse({
		caseId: url.searchParams.get('caseId') || undefined,
		limit: url.searchParams.get('limit') || undefined,
		types: url.searchParams.get('types') || undefined
	});
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query parameters' }, { status: 400 });
	}
	const { caseId, limit, types } = parsed.data;

	const nodes: TimelineNode[] = [];

	// Parallel queries for each timeline source
	const queries: Promise<void>[] = [];

	if (types.includes('case')) {
		queries.push(
			db.execute(sql`
				SELECT id, title, status, priority, created_at, updated_at
				FROM cases
				${caseId ? sql`WHERE id = ${caseId}` : sql`WHERE user_id = ${locals.user.id}`}
				ORDER BY created_at DESC LIMIT ${limit}
			`).then(r => {
				for (const row of r.rows as Record<string, any>[]) {
					nodes.push({
						id: row.id, type: 'case', title: row.title ?? 'Untitled Case',
						timestamp: row.created_at, metadata: { status: row.status, priority: row.priority },
					});
				}
			}).catch(() => {})
		);
	}

	if (types.includes('evidence')) {
		queries.push(
			db.execute(sql`
				SELECT id, title, file_type, created_at
				FROM evidence
				${caseId ? sql`WHERE case_id = ${caseId}` : sql``}
				ORDER BY created_at DESC LIMIT ${limit}
			`).then(r => {
				for (const row of r.rows as Record<string, any>[]) {
					nodes.push({
						id: row.id, type: 'evidence', title: row.title ?? 'Evidence',
						timestamp: row.created_at, metadata: { fileType: row.file_type },
					});
				}
			}).catch(() => {})
		);
	}

	if (types.includes('person')) {
		queries.push(
			db.execute(sql`
				SELECT id, name, threat_level, status, created_at
				FROM persons_of_interest
				${caseId ? sql`WHERE ${caseId} = ANY(case_ids)` : sql``}
				ORDER BY created_at DESC LIMIT ${limit}
			`).then(r => {
				for (const row of r.rows as Record<string, any>[]) {
					nodes.push({
						id: row.id, type: 'person', title: row.name ?? 'Unknown',
						timestamp: row.created_at, metadata: { threatLevel: row.threat_level, status: row.status },
					});
				}
			}).catch(() => {})
		);
	}

	if (types.includes('citation')) {
		queries.push(
			db.execute(sql`
				SELECT id, citation_text, created_at
				FROM citations
				${caseId ? sql`WHERE case_id = ${caseId}` : sql``}
				ORDER BY created_at DESC LIMIT ${limit}
			`).then(r => {
				for (const row of r.rows as Record<string, any>[]) {
					nodes.push({
						id: row.id, type: 'citation', title: (row.citation_text ?? '').slice(0, 100),
						timestamp: row.created_at, metadata: {},
					});
				}
			}).catch(() => {})
		);
	}

	if (types.includes('report')) {
		queries.push(
			db.execute(sql`
				SELECT id, title, status, created_at
				FROM reports
				${caseId ? sql`WHERE case_id = ${caseId}` : sql``}
				ORDER BY created_at DESC LIMIT ${limit}
			`).then(r => {
				for (const row of r.rows as Record<string, any>[]) {
					nodes.push({
						id: row.id, type: 'report', title: row.title ?? 'Report',
						timestamp: row.created_at, metadata: { status: row.status },
					});
				}
			}).catch(() => {})
		);
	}

	await Promise.all(queries);

	// Sort all nodes by timestamp descending
	nodes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

	return json({
		nodes: nodes.slice(0, limit),
		totalNodes: nodes.length,
		caseId: caseId || null,
		types,
	});
};
