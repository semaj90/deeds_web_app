import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { taskSemanticPackets, workspaceTasks, taskFileLinks, taskClusterLinks, agentPickupQueue } from '$lib/server/db/schema/tasks.js';
import { eq, desc, and, isNull, isNotNull, sql } from 'drizzle-orm';

const listSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
	status: z.enum(['todo', 'doing', 'blocked', 'done', 'all']).default('all'),
	feature_id: z.string().max(200).optional(),
	agent_ready: z.enum(['true', 'false']).optional(),
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ packets: [], total: 0 }, { status: 401 });

	const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return json({ packets: [], total: 0, error: parsed.error.issues[0]?.message }, { status: 400 });

	const { limit, offset, status, feature_id, agent_ready } = parsed.data;

	try {
		const conditions = [];
		if (status !== 'all') conditions.push(eq(taskSemanticPackets.status, status));
		if (feature_id) conditions.push(eq(taskSemanticPackets.feature_id, feature_id));
		if (agent_ready === 'true') conditions.push(eq(taskSemanticPackets.agent_pickup_ready, true));
		if (agent_ready === 'false') conditions.push(eq(taskSemanticPackets.agent_pickup_ready, false));

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const [rows, countResult] = await Promise.all([
			db.select({
				id: taskSemanticPackets.id,
				point_kind: taskSemanticPackets.point_kind,
				workspace_id: taskSemanticPackets.workspace_id,
				feature_id: taskSemanticPackets.feature_id,
				source_ref: taskSemanticPackets.source_ref,
				file_path: taskSemanticPackets.file_path,
				summary_llm: taskSemanticPackets.summary_llm,
				next_action: taskSemanticPackets.next_action,
				confidence: taskSemanticPackets.confidence,
				status: taskSemanticPackets.status,
				agent_pickup_ready: taskSemanticPackets.agent_pickup_ready,
				cluster_id: taskSemanticPackets.cluster_id,
				centroid_id: taskSemanticPackets.centroid_id,
				semantic_path: taskSemanticPackets.semantic_path,
				related_feature_ids: taskSemanticPackets.related_feature_ids,
				related_file_paths: taskSemanticPackets.related_file_paths,
				created_at: taskSemanticPackets.created_at,
				updated_at: taskSemanticPackets.updated_at,
			})
				.from(taskSemanticPackets)
				.where(where)
				.orderBy(desc(taskSemanticPackets.created_at))
				.limit(limit)
				.offset(offset),
			db.select({ count: sql<number>`count(*)::int` }).from(taskSemanticPackets).where(where),
		]);

		return json({ packets: rows, total: countResult[0]?.count ?? 0 });
	} catch (err) {
		console.error('[api/tasks/packets] GET error:', err);
		return json({ packets: [], total: 0 });
	}
};

const createSchema = z.object({
	workspace_task_id: z.number().int().optional(),
	feature_id: z.string().max(200),
	source_ref: z.string().max(1000).optional(),
	file_path: z.string().max(1000).optional(),
	summary_llm: z.string().max(4000).optional(),
	next_action: z.string().max(2000).optional(),
	confidence: z.number().min(0).max(1).default(0.7),
	status: z.enum(['todo', 'doing', 'blocked', 'done']).default('todo'),
	cluster_id: z.string().max(200).optional(),
	semantic_path: z.array(z.string()).default([]),
	related_feature_ids: z.array(z.string()).default([]),
	related_file_paths: z.array(z.string()).default([]),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	const parsed = createSchema.safeParse(body);
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message }, { status: 400 });

	const data = parsed.data;
	try {
		const [row] = await db.insert(taskSemanticPackets).values({
			point_kind: 'task_summary',
			workspace_task_id: data.workspace_task_id,
			feature_id: data.feature_id,
			source_ref: data.source_ref ?? data.file_path ?? data.feature_id,
			file_path: data.file_path,
			summary_llm: data.summary_llm,
			next_action: data.next_action,
			confidence: String(data.confidence),
			status: data.status,
			cluster_id: data.cluster_id,
			semantic_path: data.semantic_path,
			related_feature_ids: data.related_feature_ids,
			related_file_paths: data.related_file_paths,
			agent_pickup_ready: false,
		}).returning();
		return json({ packet: row }, { status: 201 });
	} catch (err) {
		console.error('[api/tasks/packets] POST error:', err);
		return json({ error: 'Failed to create packet' }, { status: 500 });
	}
};