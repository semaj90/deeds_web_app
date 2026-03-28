import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema.js';
import { desc, sql } from 'drizzle-orm';

const caseStatusValues = [
	'open',
	'in_progress',
	'pending_review',
	'closed',
	'archived',
	'active',
	'pending',
	'under_review'
] as const;

const casePriorityValues = ['low', 'medium', 'high', 'critical', 'urgent'] as const;

/** GET /api/yorha/cases — List cases for YoRHa command center */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 50);
		const status = url.searchParams.get('status');

		const baseQuery = db
			.select({
				id: cases.id,
				title: cases.title,
				status: cases.status,
				priority: cases.priority,
				createdAt: cases.createdAt,
				updatedAt: cases.updatedAt
			})
			.from(cases)
			.orderBy(desc(cases.updatedAt))
			.limit(limit);

		const rows = status
			? await baseQuery.where(sql`${cases.status} = ${status}`)
			: await baseQuery;

		return json({ data: rows });
	} catch (err) {
		console.error('[/api/yorha/cases] GET error:', err);
		return json({ data: [] }, { status: 500 });
	}
};

const createCaseSchema = z.object({
	title: z.string().min(1).max(500),
	description: z.string().max(10000).optional(),
	status: z.enum(caseStatusValues).default('open'),
	priority: z.enum(casePriorityValues).default('medium')
});

/** POST /api/yorha/cases — Create a new case */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = createCaseSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const [newCase] = await db
			.insert(cases)
			.values({
				title: parsed.data.title,
				description: parsed.data.description ?? '',
				status: parsed.data.status,
				priority: parsed.data.priority
			})
			.returning();

		return json({ data: newCase }, { status: 201 });
	} catch (err) {
		console.error('[/api/yorha/cases] POST error:', err);
		return json({ error: 'Failed to create case' }, { status: 500 });
	}
};
