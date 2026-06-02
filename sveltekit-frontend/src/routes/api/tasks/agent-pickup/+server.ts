import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { agentPickupQueue, taskSemanticPackets } from '$lib/server/db/schema/tasks.js';
import { eq, desc, and, isNull, sql, count } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ queue: [], depth: 0, total: 0 }, { status: 401 });

	try {
		const [depthResult, recent] = await Promise.all([
			db.select({ count: sql<number>`count(*)::int` })
				.from(agentPickupQueue)
				.where(isNull(agentPickupQueue.picked_up_at)),
			db.select({
				id: agentPickupQueue.id,
				task_id: agentPickupQueue.task_id,
				packet_id: agentPickupQueue.packet_id,
				status: agentPickupQueue.status,
				lane: agentPickupQueue.lane,
				picked_up_at: agentPickupQueue.picked_up_at,
				completed_at: agentPickupQueue.completed_at,
				available_at: agentPickupQueue.available_at,
				created_at: agentPickupQueue.created_at,
				attempts: agentPickupQueue.attempts,
				error: agentPickupQueue.error,
			})
				.from(agentPickupQueue)
				.orderBy(desc(agentPickupQueue.created_at))
				.limit(20),
		]);

		const depth = depthResult[0]?.count ?? 0;
		return json({ queue: recent, depth, total: recent.length });
	} catch (err) {
		console.error('[api/tasks/agent-pickup] GET error:', err);
		return json({ queue: [], depth: 0, total: 0 });
	}
};

const enqueueSchema = z.object({
	packet_id: z.string().max(200),
	task_id: z.string().max(200).optional(),
	lane: z.string().max(100).default('semantic_packet'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	const parsed = enqueueSchema.safeParse(body);
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message }, { status: 400 });

	const { packet_id, task_id, lane } = parsed.data;

	try {
		const [row] = await db.insert(agentPickupQueue).values({
			packet_id,
			task_id: task_id ?? packet_id,
			lane,
			status: 'pending',
			attempts: 0,
			max_attempts: 3,
			available_at: new Date(),
			created_at: new Date(),
			updated_at: new Date(),
		}).returning();

		// Mark the packet as agent_pickup_ready
		await db.update(taskSemanticPackets)
			.set({ agent_pickup_ready: true, updated_at: new Date() })
			.where(eq(taskSemanticPackets.feature_id, packet_id));

		return json({ item: row }, { status: 201 });
	} catch (err) {
		console.error('[api/tasks/agent-pickup] POST error:', err);
		return json({ error: 'Failed to enqueue' }, { status: 500 });
	}
};
