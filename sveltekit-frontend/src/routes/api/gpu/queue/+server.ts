/**
 * GET /api/gpu/queue — Get current GPU process queue status
 * POST /api/gpu/queue — Submit a new GPU task
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createGpuTask,
	classifyTaskPriority,
	type GpuTask,
} from '$lib/machines/gpu-process-machine.js';
import { z } from 'zod';

const GPU_TASK_TYPES = ['chat', 'embedding', 'analysis', 'rerank', 'training', 'classification'] as const;

const gpuQueueSchema = z.object({
	type: z.enum(GPU_TASK_TYPES),
	payload: z.record(z.string(), z.unknown()).optional().default({}),
	backend: z.enum(['ollama', 'tensorrt', 'onnx']).optional().default('ollama'),
	isRealtime: z.boolean().optional().default(false),
	batchSize: z.number().int().min(1).max(256).optional()
});

// In-memory queue for server-side task tracking
// (XState machine runs client-side; this is the server counterpart)
const taskQueue: GpuTask[] = [];
const completedTasks: GpuTask[] = [];
let stats = { totalSubmitted: 0, totalProcessed: 0, totalErrors: 0 };

export const GET: RequestHandler = async () => {
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

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json();
	const parsed = gpuQueueSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { type, payload, backend, isRealtime, batchSize } = parsed.data;

	try {
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
	} catch (err) {
		console.error('GPU queue submit error:', err);
		return json({ error: 'Failed to submit GPU task' }, { status: 500 });
	}
}
