import { json, type RequestHandler } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, pgRows } from '$lib/server/db/client';
import {
	agentPickupQueue,
	taskClusterLinks,
	taskFileLinks,
	taskSemanticPackets,
	workspaceTasks,
} from '$lib/server/db/schema/tasks';
import { getCachedTaskSemanticPacketRecord, runTaskSemanticPacketLifecycle } from '$lib/server/tasks/semantic-packets.js';

const postSchema = z.object({
	taskId: z.coerce.number().int().positive().optional(),
	dryRun: z.coerce.boolean().optional().default(false),
	action: z.enum(['run', 'claim']).optional().default('run'),
	lane: z.string().trim().min(1).optional().default('semantic_packet'),
});

const getSchema = z.object({
	taskId: z.coerce.number().int().positive().optional(),
	queueId: z.string().trim().min(1).optional(),
	lane: z.string().trim().min(1).optional(),
});

type QueueRow = {
	id: number | string;
	task_id: string;
	packet_id: string | null;
	status: string | null;
	lane: string | null;
	picked_up_at: string | Date | null;
	completed_at: string | Date | null;
	available_at: string | Date | null;
	created_at: string | Date | null;
	updated_at: string | Date | null;
	attempts: number | null;
	max_attempts: number | null;
	error: string | null;
};

async function loadLatestPacket(taskId: number) {
	return db
		.select()
		.from(taskSemanticPackets)
		.where(eq(taskSemanticPackets.workspace_task_id, taskId))
		.orderBy(desc(taskSemanticPackets.created_at))
		.limit(1)
		.then((rows) => rows[0] ?? null);
}

async function loadLatestQueue(taskId: number) {
	return db
		.select()
		.from(agentPickupQueue)
		.where(eq(agentPickupQueue.task_id, String(taskId)))
		.orderBy(desc(agentPickupQueue.created_at))
		.limit(1)
		.then((rows) => rows[0] ?? null);
}

async function loadTask(taskId: number) {
	return db
		.select()
		.from(workspaceTasks)
		.where(eq(workspaceTasks.id, taskId))
		.limit(1)
		.then((rows) => rows[0] ?? null);
}

async function loadFileLinks(taskId: number) {
	return db
		.select()
		.from(taskFileLinks)
		.where(eq(taskFileLinks.workspace_task_id, taskId))
		.orderBy(desc(taskFileLinks.created_at))
		.then((rows) => rows.map((row) => row.file_path).filter((value): value is string => Boolean(value)));
}

async function loadClusterLinks(taskId: number) {
	return db
		.select()
		.from(taskClusterLinks)
		.where(eq(taskClusterLinks.workspace_task_id, taskId))
		.orderBy(desc(taskClusterLinks.created_at))
		.then((rows) => rows);
}

async function loadNextQueuedTask(lane = 'semantic_packet'): Promise<QueueRow | null> {
	const rows = pgRows<QueueRow>(
		await db.execute(sql`
			SELECT
				q.id,
				q.task_id,
				q.packet_id,
				q.status,
				'semantic_packet'::text AS lane,
				q.picked_up_at,
				q.completed_at,
				q.available_at,
				q.created_at,
				q.updated_at,
				q.attempts,
				q.max_attempts,
				q.error
			FROM agent_pickup_queue q
			JOIN task_semantic_packets p ON p.id::text = q.packet_id
			WHERE q.status = 'queued'
				AND q.available_at <= NOW()
				AND p.deleted = false
				AND p.agent_pickup_ready = true
				AND COALESCE(q.lane, 'semantic_packet') = ${lane}
			ORDER BY COALESCE(NULLIF(p.confidence::text, '')::numeric, 0::numeric) DESC, p.updated_at ASC, q.created_at ASC
			LIMIT 1
		`)
	);
	return rows[0] ?? null;
}

async function buildWorkflowStatus(taskId?: number, queueId?: string, lane = 'semantic_packet') {
	let queue = null as QueueRow | null;
	let packet = null as Awaited<ReturnType<typeof loadLatestPacket>> | null;
	let task = null as Awaited<ReturnType<typeof loadTask>> | null;

	if (queueId) {
		queue = await db
			.select()
			.from(agentPickupQueue)
			.where(eq(agentPickupQueue.id, Number(queueId)))
			.limit(1)
			.then((rows) => rows[0] ?? null);
		if (queue?.packet_id) {
			packet = await db
				.select()
				.from(taskSemanticPackets)
				.where(eq(taskSemanticPackets.id, Number(queue.packet_id)))
				.limit(1)
				.then((rows) => rows[0] ?? null);
		}
		if (queue?.task_id) task = await loadTask(Number(queue.task_id));
	} else if (taskId) {
		packet = await loadLatestPacket(taskId);
		queue = await loadLatestQueue(taskId);
		task = await loadTask(taskId);
	} else {
		queue = await loadNextQueuedTask(lane);
		if (queue?.packet_id) {
			packet = await db
				.select()
				.from(taskSemanticPackets)
				.where(eq(taskSemanticPackets.id, Number(queue.packet_id)))
				.limit(1)
				.then((rows) => rows[0] ?? null);
		}
		if (queue?.task_id) task = await loadTask(Number(queue.task_id));
	}

	const resolvedTaskId = task?.id ?? (queue?.task_id ? Number(queue.task_id) : taskId ?? null);
	const resolvedPacketId = packet?.id ? String(packet.id) : queue?.packet_id ?? null;
	const cached = resolvedTaskId ? await getCachedTaskSemanticPacketRecord(Number(resolvedTaskId)) : null;
	const fileLinks = resolvedTaskId ? await loadFileLinks(Number(resolvedTaskId)) : [];
	const clusterLinks = resolvedTaskId ? await loadClusterLinks(Number(resolvedTaskId)) : [];
	const nextQueue = await loadNextQueuedTask(lane);
	const nextPacket = nextQueue?.packet_id
		? await db
				.select()
				.from(taskSemanticPackets)
				.where(eq(taskSemanticPackets.id, Number(nextQueue.packet_id)))
				.limit(1)
				.then((rows) => rows[0] ?? null)
		: null;
	const nextTask = nextQueue?.task_id ? await loadTask(Number(nextQueue.task_id)) : null;

	return {
		mode: queueId ? 'queue' : taskId ? 'task' : 'next',
		taskId: resolvedTaskId ?? null,
		queueId: queue?.id ?? null,
		packetId: resolvedPacketId,
		task,
		queue,
		packet,
		cached,
		fileLinks,
		clusterLinks,
		nextQueuedTask: nextQueue
			? {
					queueId: nextQueue.id,
					taskId: Number(nextQueue.task_id),
					packetId: nextQueue.packet_id,
					status: nextPacket?.status ?? null,
					featureId: nextPacket?.feature_id ?? null,
					sourceRef: nextPacket?.source_ref ?? null,
					nextAction: nextPacket?.next_action ?? null,
					confidence: Number(nextPacket?.confidence ?? 0),
					clusterId: nextPacket?.cluster_id ?? null,
					centroidId: nextPacket?.centroid_id ?? null,
					taskTitle: nextTask?.title ?? nextTask?.name ?? null,
				}
			: null,
	};
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = getSchema.safeParse({
		taskId: url.searchParams.get('taskId') ?? undefined,
		queueId: url.searchParams.get('queueId') ?? undefined,
		lane: url.searchParams.get('lane') ?? undefined,
	});
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const taskId = parsed.data.taskId ?? undefined;
	const queueId = parsed.data.queueId ?? undefined;
	const lane = parsed.data.lane ?? 'semantic_packet';

	try {
		const status = await buildWorkflowStatus(taskId, queueId, lane);
		return json({ ok: true, status });
	} catch (error) {
		console.error('[api/tasks/packets/workflow] GET error:', error);
		return json({ ok: false, error: 'Failed to load task semantic packet workflow status' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	const parsed = postSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	try {
		// CLAIM action: atomically mark next queued row as picked_up so PICK_NEXT has a visible effect
		if (parsed.data.action === 'claim') {
			const lane = parsed.data.lane ?? 'semantic_packet';
			const next = await loadNextQueuedTask(lane);
			if (!next) {
				return json({ ok: true, claimed: null, message: 'No queued tasks available' });
			}
			await db
				.update(agentPickupQueue)
				.set({
					status: 'in_progress',
					picked_up_at: new Date(),
					updated_at: new Date(),
				})
				.where(eq(agentPickupQueue.id, Number(next.id)));
			const status = await buildWorkflowStatus(Number(next.task_id), undefined, lane);
			return json({ ok: true, claimed: { queueId: String(next.id), taskId: Number(next.task_id) }, status });
		}

		if (!parsed.data.taskId) {
			return json({ error: 'taskId is required for run/dryRun' }, { status: 400 });
		}

		if (parsed.data.dryRun) {
			const status = await buildWorkflowStatus(parsed.data.taskId);
			return json({ ok: true, dryRun: true, status });
		}

		const result = await runTaskSemanticPacketLifecycle(parsed.data.taskId);
		return json({ ok: true, packet: result, cached: result.cached ?? null });
	} catch (error) {
		console.error('[api/tasks/packets/workflow] POST error:', error);
		return json({ ok: false, error: 'Failed to run task semantic packet workflow' }, { status: 500 });
	}
};
