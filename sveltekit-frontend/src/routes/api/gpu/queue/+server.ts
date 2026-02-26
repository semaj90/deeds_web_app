/**
 * GET /api/gpu/queue — Get current GPU process queue status
 * POST /api/gpu/queue — Submit a new GPU task
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import {
	createGpuTask,
	classifyTaskPriority,
	type GpuTask,
	type GpuPriority
} from '$lib/machines/gpu-process-machine.js';

// In-memory queue for server-side task tracking
// (XState machine runs client-side; this is the server counterpart)
const taskQueue: GpuTask[] = [];
const completedTasks: GpuTask[] = [];
let stats = { totalSubmitted: 0, totalProcessed: 0, totalErrors: 0 };

export async function GET() {
	return json({
		queue: taskQueue.map(t => ({
			id: t.id,
			type: t.type,
			priority: t.priority,
			backend: t.backend,
			submittedAt: t.submittedAt,
			startedAt: t.startedAt
		})),
		active: taskQueue.find(t => t.startedAt && !t.completedAt) ?? null,
		recentCompleted: completedTasks.slice(0, 20).map(t => ({
			id: t.id,
			type: t.type,
			priority: t.priority,
			submittedAt: t.submittedAt,
			completedAt: t.completedAt,
			latencyMs: t.completedAt && t.startedAt ? t.completedAt - t.startedAt : null,
			error: t.error ?? null
		})),
		stats,
		queueDepth: taskQueue.length,
		priorityCounts: {
			emergency: taskQueue.filter(t => t.priority === 'emergency').length,
			high: taskQueue.filter(t => t.priority === 'high').length,
			medium: taskQueue.filter(t => t.priority === 'medium').length,
			low: taskQueue.filter(t => t.priority === 'low').length
		}
	});
}

export async function POST({ request }: RequestEvent) {
	const body = await request.json();
	const {
		type,
		payload = {},
		backend = 'ollama',
		isRealtime = false,
		batchSize
	} = body as {
		type: GpuTask['type'];
		payload?: Record<string, unknown>;
		backend?: GpuTask['backend'];
		isRealtime?: boolean;
		batchSize?: number;
	};

	if (!type) {
		return json({ error: 'type is required (chat|embedding|analysis|rerank|training|classification)' }, { status: 400 });
	}

	const task = createGpuTask(type, payload, { backend, isRealtime, batchSize });
	taskQueue.push(task);
	stats.totalSubmitted++;

	// Auto-classify priority
	const priority = classifyTaskPriority(type, { isRealtime, batchSize });

	return json({
		taskId: task.id,
		priority,
		position: taskQueue.filter(t => !t.startedAt).length,
		queueDepth: taskQueue.length
	}, { status: 201 });
}
