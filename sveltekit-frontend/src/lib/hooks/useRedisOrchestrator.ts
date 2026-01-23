/**
 * Svelte-side helpers for interacting with the Redis orchestrator.
 * These utilities expose a stable and well-typed interface that mirrors the intent of the
 * original (but syntactically corrupted) implementation.
 */

import type {
    isRedisHealthy,
    QueuedTask,
    queuedTasks,
    RedisOptimizationResult,
    redisOrchestratorClient
} from '$lib/stores/unified';
import { get } from 'svelte/store';

type QueryContext = {
	endpoint?: string;
	caseId?: string;
	userId?: string;
	useOrchestrator?: boolean;
};

type ComponentCacheConfig = {
	autoCache?: boolean;
};

export function useRedisAI() {
	let isProcessing = $state<boolean>(false);
	let lastResult: RedisOptimizationResult | null = null;
	let error: string | null = null;

	async function query(
		queryText: string,
		context: QueryContext = {}
	): Promise<RedisOptimizationResult> {
		isProcessing = true;
		error = null;
		try {
			const result = await redisOrchestratorClient.processQuery(queryText, context);
			lastResult = result;
			return result;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			throw err;
		} finally {
			isProcessing = false;
		}
	}

	async function queueTask(
		taskType: 'complex_legal' | 'document_analysis' | 'case_synthesis' | 'risk_assessment',
		queryText: string,
		metadata: Record<string, unknown> = {},
		priority = 100
	): Promise<string> {
		isProcessing = true;
		error = null;
		try {
			return await redisOrchestratorClient.queueTask(taskType, queryText, metadata, priority);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			throw err;
		} finally {
			isProcessing = false;
		}
	}

	function getTaskResult(taskId: string) {
		return redisOrchestratorClient.getTaskResult(taskId);
	}

	return {
		get isProcessing() {
			return isProcessing;
		},
		get lastResult() {
			return lastResult;
		},
		get error() {
			return error;
		},
		query,
		queueTask,
		getTaskResult,
		clearError() {
			error = null;
		}
	};
}

export function useRedisMonitoring() {
	let healthData: unknown = null;
	let isLoading = $state<boolean>(false);

	async function refresh(): Promise<void> {
		isLoading = true;
		try {
			healthData = await redisOrchestratorClient.getSystemHealth();
		} catch (err) {
			console.error('Failed to refresh Redis health:', err);
		} finally {
			isLoading = false;
		}
	}

	async function clearCache(confirm = false): Promise<unknown> {
		if (!confirm) {
			throw new Error('Cache clear requires confirmation');
		}
		return redisOrchestratorClient.clearCache();
	}

	return {
		get healthData() {
			return healthData;
		},
		get isHealthy() {
			return get(isRedisHealthy);
		},
		refresh,
		clearCache
	};
}

export function useRedisTaskQueue(defaultPollInterval = 5000) {
	let tasks: Map<string, QueuedTask> = new Map();
	let isPolling = $state<boolean>(false);
	let pollHandle: ReturnType<typeof setInterval> | null = null;
	let unsubscribe: (() => void) | undefined;

	function subscribeToTasks() {
		unsubscribe = queuedTasks.subscribe((value) => {
			tasks = value;
		});
	}

	async function pollOnce(): Promise<unknown> {
		try {
			if (typeof redisOrchestratorClient.refreshQueuedTasks === 'function') {
				await redisOrchestratorClient.refreshQueuedTasks();
			}
		} catch (err) {
			console.error('Failed to poll tasks:', err);
		}
	}

	function startPolling() {
		if (!isPolling) {
			isPolling = true;
			subscribeToTasks();
			pollHandle = setInterval(pollOnce, defaultPollInterval);
		}
	}

	function stopPolling() {
		if (isPolling) {
			isPolling = false;
			if (pollHandle) {
				clearInterval(pollHandle);
				pollHandle = null;
			}
			if (unsubscribe) {
				unsubscribe();
			}
		}
	}

	function getTask(taskId: string): QueuedTask | undefined {
		return tasks.get(taskId);
	}

	function getAllTasks(): QueuedTask[] {
		return Array.from(tasks.values());
	}

	function getTasksByStatus(status: string): QueuedTask[] {
		return getAllTasks().filter((task) => task.status === status);
	}

	function getTasksForUser(userId: string): QueuedTask[] {
		return getAllTasks().filter((task) => task.userId === userId);
	}

	return {
		get isPolling() {
			return isPolling;
		},
		startPolling,
		stopPolling,
		pollOnce,
		getTask,
		getAllTasks,
		getTasksByStatus,
		getTasksForUser
	};
}

export function useRedisComponentCache(componentName: string, config: ComponentCacheConfig = {}) {
	const componentCache = new Map<string, unknown>();
	let lastQuery: string | null = null;
	let cacheHits = 0;
	let cacheMisses = 0;

	async function queryWithCache(
		queryText: string,
		context: Record<string, unknown> = {}
	): Promise<unknown> {
		const cacheKey = `${componentName}:${JSON.stringify({ queryText, ...context })}`;

		if (config.autoCache !== false && componentCache.has(cacheKey)) {
			cacheHits += 1;
			return componentCache.get(cacheKey);
		}

		cacheMisses += 1;
		const result = await redisOrchestratorClient.processQuery(queryText, context);
		componentCache.set(cacheKey, result);
		lastQuery = queryText;
		return result;
	}

	function clearComponentCache() {
		componentCache.clear();
	}

	function getCacheStats() {
		return {
			size: componentCache.size,
			hits: cacheHits,
			misses: cacheMisses,
			hitRate: cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0
		};
	}

	return {
		get cacheStats() {
			return getCacheStats();
		},
		queryWithCache,
		clearComponentCache
	};
}

export function useRedisForm() {
	let isSubmitting = $state<boolean>(false);
	let submitError: string | null = null;
	let lastSubmission: unknown = null;

	async function submitForm(
		formData: Record<string, unknown>,
		endpoint: string,
		options: {
			useCache?: boolean;
			priority?: number;
			queueIfComplex?: boolean;
		} = {}
	): Promise<unknown> {
		isSubmitting = true;
		submitError = null;

		try {
			const queryText = extractQueryFromForm(formData);

			if (options.queueIfComplex && isComplexQuery(queryText)) {
				const taskId = await redisOrchestratorClient.queueTask(
					'complex_legal',
					queryText,
					formData,
					options.priority
				);
				lastSubmission = { taskId, queued: true };
				return lastSubmission;
			}

			const result = await redisOrchestratorClient.processQuery(queryText, {
				endpoint,
				...formData
			});
			lastSubmission = result;
			return result;
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Unknown error';
			throw err;
		} finally {
			isSubmitting = false;
		}
	}

	return {
		get isSubmitting() {
			return isSubmitting;
		},
		get submitError() {
			return submitError;
		},
		get lastSubmission() {
			return lastSubmission;
		},
		submitForm
	};
}

function extractQueryFromForm(formData: Record<string, unknown>): string {
	const candidateFields = ['query', 'message', 'content', 'text', 'description', 'analysis'];

	for (const field of candidateFields) {
		const value = formData[field];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value;
		}
	}

	return JSON.stringify(formData).slice(0, 500);
}

function isComplexQuery(query: string): boolean {
	const lowered = query.toLowerCase();
	return (
		query.length > 500 ||
		lowered.includes('analyze') ||
		lowered.includes('comprehensive') ||
		lowered.includes('detailed')
	);
}

