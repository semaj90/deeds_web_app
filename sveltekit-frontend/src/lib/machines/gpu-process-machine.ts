/**
 * GPU Process Classifier — XState v5 Priority Queue Machine
 *
 * Manages GPU inference tasks with priority scheduling:
 *   EMERGENCY (0) — real-time legal brief deadlines, courtroom queries
 *   HIGH (1)      — active user chat, document analysis
 *   MEDIUM (2)    — batch embeddings, RAG indexing
 *   LOW (3)       — QLoRA training, background reranking
 *
 * Integrates with GPU Arbiter for VRAM lease management.
 */
import { assign, setup, fromPromise } from 'xstate';

// ── Types ────────────────────────────────────────────────────────────────

export type GpuPriority = 'emergency' | 'high' | 'medium' | 'low';

export interface GpuTask {
	id: string;
	type: 'chat' | 'embedding' | 'analysis' | 'rerank' | 'training' | 'classification';
	priority: GpuPriority;
	backend: 'ollama' | 'tensorrt' | 'onnx';
	payload: Record<string, unknown>;
	submittedAt: number;
	startedAt?: number;
	completedAt?: number;
	result?: unknown;
	error?: string;
}

interface GpuQueueContext {
	queue: GpuTask[];
	active: GpuTask | null;
	completed: GpuTask[];
	maxCompleted: number;
	processing: boolean;
	error: string | null;
	stats: {
		totalProcessed: number;
		totalErrors: number;
		avgLatencyMs: number;
	};
}

type GpuQueueEvent =
	| { type: 'SUBMIT'; task: GpuTask }
	| { type: 'PROCESS_NEXT' }
	| { type: 'TASK_COMPLETE'; taskId: string; result: unknown }
	| { type: 'TASK_ERROR'; taskId: string; error: string }
	| { type: 'CLEAR_COMPLETED' };

// ── Priority sorting ─────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<GpuPriority, number> = {
	emergency: 0,
	high: 1,
	medium: 2,
	low: 3
};

function sortByPriority(tasks: GpuTask[]): GpuTask[] {
	return [...tasks].sort((a, b) => {
		const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
		if (pDiff !== 0) return pDiff;
		return a.submittedAt - b.submittedAt; // FIFO within same priority
	});
}

// ── Task type → priority classifier ──────────────────────────────────────

export function classifyTaskPriority(
	type: GpuTask['type'],
	metadata?: { isRealtime?: boolean; batchSize?: number }
): GpuPriority {
	if (metadata?.isRealtime) return 'emergency';

	switch (type) {
		case 'chat':
			return 'high';
		case 'analysis':
		case 'classification':
			return 'high';
		case 'embedding':
			return (metadata?.batchSize ?? 1) > 10 ? 'medium' : 'high';
		case 'rerank':
			return 'medium';
		case 'training':
			return 'low';
		default:
			return 'medium';
	}
}

// ── Process task actor ───────────────────────────────────────────────────

const processTask = fromPromise(async (ctx: any) => {
	const task = ctx.input as GpuTask;
	// Simulate dispatching to appropriate backend
	// In production, this calls the actual inference endpoints
	const endpoint = getEndpointForTask(task);

	const res = await fetch(endpoint.url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(endpoint.body),
		signal: AbortSignal.timeout(task.type === 'training' ? 300_000 : 30_000)
	});

	if (!res.ok) {
		throw new Error(`GPU task failed: HTTP ${res.status}`);
	}

	return res.json();
});

function getEndpointForTask(task: GpuTask): { url: string; body: Record<string, unknown> } {
	switch (task.type) {
		case 'chat':
			return {
				url: '/api/chat',
				body: { message: task.payload.message, model: task.payload.model ?? 'gemma4-rotorquant:latest' }
			};
		case 'embedding':
			return {
				url: '/api/embed',
				body: { text: task.payload.text, model: task.payload.model ?? 'embeddinggemma:latest' }
			};
		case 'analysis':
			return {
				url: '/api/nlp/sentiment',
				body: { text: task.payload.text }
			};
		case 'classification':
			return {
				url: '/api/nlp/classify',
				body: { text: task.payload.text }
			};
		case 'rerank':
			return {
				url: '/api/evidence/search',
				body: { query: task.payload.query, limit: task.payload.limit ?? 10 }
			};
		case 'training':
			return {
				url: '/api/admin/qlora/start',
				body: task.payload
			};
		default:
			return { url: '/api/chat', body: task.payload };
	}
}

// ── XState v5 Machine ────────────────────────────────────────────────────

export const gpuProcessMachine = setup({
	types: {} as {
		context: GpuQueueContext;
		events: GpuQueueEvent;
	},
	actors: {
		processTask
	}
}).createMachine({
	id: 'gpuProcessQueue',
	initial: 'idle',
	context: {
		queue: [],
		active: null,
		completed: [],
		maxCompleted: 50,
		processing: false,
		error: null,
		stats: {
			totalProcessed: 0,
			totalErrors: 0,
			avgLatencyMs: 0
		}
	},
	states: {
		idle: {
			on: {
				SUBMIT: {
					actions: assign({
						queue: ({ context, event }) =>
							sortByPriority([...context.queue, event.task]),
						error: () => null
					}),
					target: 'scheduling'
				},
				CLEAR_COMPLETED: {
					actions: assign({
						completed: () => []
					})
				}
			}
		},
		scheduling: {
			always: [
				{
					guard: ({ context }) => context.queue.length > 0 && !context.active,
					target: 'processing'
				},
				{
					guard: ({ context }) => context.queue.length === 0,
					target: 'idle'
				},
				{
					// Already processing, stay in scheduling but accept new tasks
					target: 'waiting'
				}
			]
		},
		waiting: {
			on: {
				SUBMIT: {
					actions: assign({
						queue: ({ context, event }) =>
							sortByPriority([...context.queue, event.task])
					})
				},
				TASK_COMPLETE: {
					actions: assign({
						active: () => null,
						completed: ({ context, event }) => {
							const task = context.active;
							if (!task) return context.completed;
							const done = {
								...task,
								completedAt: Date.now(),
								result: event.result
							};
							return [done, ...context.completed].slice(0, context.maxCompleted);
						},
						stats: ({ context }) => {
							const latency = context.active?.startedAt
								? Date.now() - context.active.startedAt
								: 0;
							const total = context.stats.totalProcessed + 1;
							return {
								totalProcessed: total,
								totalErrors: context.stats.totalErrors,
								avgLatencyMs: Math.round(
									(context.stats.avgLatencyMs * context.stats.totalProcessed + latency) / total
								)
							};
						}
					}),
					target: 'scheduling'
				},
				TASK_ERROR: {
					actions: assign({
						active: () => null,
						error: ({ event }) => event.error,
						stats: ({ context }) => ({
							...context.stats,
							totalErrors: context.stats.totalErrors + 1
						})
					}),
					target: 'scheduling'
				}
			}
		},
		processing: {
			entry: assign({
				active: ({ context }) => {
					const [next] = context.queue;
					return next ? { ...next, startedAt: Date.now() } : null;
				},
				queue: ({ context }) => context.queue.slice(1),
				processing: () => true
			}),
			invoke: {
				src: 'processTask',
				input: ({ context }) => context.active!,
				onDone: {
					actions: assign({
						active: () => null,
						processing: () => false,
						completed: ({ context, event }) => {
							const task = context.active;
							if (!task) return context.completed;
							const done = { ...task, completedAt: Date.now(), result: event.output };
							return [done, ...context.completed].slice(0, context.maxCompleted);
						},
						stats: ({ context }) => {
							const latency = context.active?.startedAt
								? Date.now() - context.active.startedAt
								: 0;
							const total = context.stats.totalProcessed + 1;
							return {
								totalProcessed: total,
								totalErrors: context.stats.totalErrors,
								avgLatencyMs: Math.round(
									(context.stats.avgLatencyMs * context.stats.totalProcessed + latency) / total
								)
							};
						}
					}),
					target: 'scheduling'
				},
				onError: {
					actions: assign({
						active: () => null,
						processing: () => false,
						error: ({ event }) => String(event.error),
						stats: ({ context }) => ({
							...context.stats,
							totalErrors: context.stats.totalErrors + 1
						})
					}),
					target: 'scheduling'
				}
			},
			on: {
				SUBMIT: {
					actions: assign({
						queue: ({ context, event }) =>
							sortByPriority([...context.queue, event.task])
					})
				}
			}
		}
	}
});

// ── Helper to create task IDs ────────────────────────────────────────────

let taskCounter = 0;

export function createGpuTask(
	type: GpuTask['type'],
	payload: Record<string, unknown>,
	opts?: { backend?: GpuTask['backend']; isRealtime?: boolean; batchSize?: number }
): GpuTask {
	return {
		id: `gpu-${Date.now()}-${++taskCounter}`,
		type,
		priority: classifyTaskPriority(type, { isRealtime: opts?.isRealtime, batchSize: opts?.batchSize }),
		backend: opts?.backend ?? 'ollama',
		payload,
		submittedAt: Date.now()
	};
}
