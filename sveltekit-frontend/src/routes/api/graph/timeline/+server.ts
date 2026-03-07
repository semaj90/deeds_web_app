import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

interface TimelineNode {
	id: string;
	type: 'case' | 'evidence' | 'person' | 'citation' | 'report';
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

	const caseId = url.searchParams.get('caseId');
	const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
	const types = (url.searchParams.get('types') || 'case,evidence,person,citation,report').split(',');

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
				for (const row of r.rows as any[]) {
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
				for (const row of r.rows as any[]) {
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
				for (const row of r.rows as any[]) {
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
				for (const row of r.rows as any[]) {
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
				for (const row of r.rows as any[]) {
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
		caseId: caseId ?? null,
		types,
	});
};
