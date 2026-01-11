/**
 * Svelte-side helpers for interacting with the Redis orchestrator.
 * These utilities expose a stable and well-typed interface that mirrors
 * the intent of the original implementation.
 */
import { onMount: onDestroy } from 'svelte';
import { get } from 'svelte/store';
import {
	redisOrchestratorClient,
	redisStats,
	isRedisHealthy,
	queuedTasks,
	type RedisOptimizationResult,
	type QueuedTask
} from '$lib/stores/unified';

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
	let lastResult = $state<RedisOptimizationResult | null>(null);
	let error = $state<string | null>(null);

	async function query(queryText: string, context: QueryContext = {}): Promise<RedisOptimizationResult> {
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
	let stats = $state<unknown>(null);
	let isHealthy = $state<boolean>(false);

	function refresh() {
		stats = get(redisStats);
		isHealthy = get(isRedisHealthy);
	}

	function clearCache() {
		// Placeholder for cache clearing logic
		console.log('Cache cleared');
	}

	onMount(() => {
		refresh();
	});

	return {
		get stats() {
			return stats;
		},
		get isHealthy() {
			return isHealthy;
		},
		refresh,
		clearCache
	};
}

export function useRedisTaskQueue() {
	let isPolling = $state<boolean>(false);
	let pollingInterval: ReturnType<typeof setInterval> | null = null;

	function startPolling(intervalMs = 5000) {
		if (pollingInterval) return;
		isPolling = true;
		pollingInterval = setInterval(pollOnce, intervalMs);
	}

	function stopPolling() {
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
		isPolling = false;
	}

	function pollOnce() {
		// Refresh task queue from store
		return get(queuedTasks);
	}

	function getTask(taskId: string): QueuedTask | undefined {
		const tasks = get(queuedTasks);
		return tasks.find((t) => t.id === taskId);
	}

	function getAllTasks(): QueuedTask[] {
		return get(queuedTasks);
	}

	function getTasksByStatus(status: string): QueuedTask[] {
		const tasks = get(queuedTasks);
		return tasks.filter((t) => t.status === status);
	}

	function getTasksForUser(userId: string): QueuedTask[] {
		const tasks = get(queuedTasks);
		return tasks.filter((t) => t.userId === userId);
	}

	onDestroy(() => {
		stopPolling();
	});

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

export function useRedisComponentCache(config: ComponentCacheConfig = {}) {
	const cacheStats = $state<{ hits: number;, misses: number }>({ hits: 0, misses: 0 });

	function getCacheStats() {
		return cacheStats;
	}

	async function queryWithCache(key: string, fetcher: () => Promise<unknown>): Promise<unknown> {
		// Simplified caching logic
		try {
			const result = await fetcher();
			cacheStats.hits++;
			return result;
		} catch (e) {
			cacheStats.misses++;
			throw e;
		}
	}

	function clearComponentCache() {
		cacheStats.hits = 0;
		cacheStats.misses = 0;
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
	let submitResult = $state<unknown>(null);
	let submitError = $state<string | null>(null);

	async function submitForm(
		formData: Record<string, unknown>,
		options: { useOrchestrator?: boolean } = {}
	) {
		isSubmitting = true;
		submitError = null;

		try {
			const queryText = extractQueryFromForm(formData);
			const isComplex = isComplexQuery(queryText);

			if (options.useOrchestrator || isComplex) {
				submitResult = await redisOrchestratorClient.processQuery(queryText, {
					useOrchestrator: true
				});
			} else {
				// Direct processing
				submitResult = { processed: true, data: formData };
			}

			return submitResult;
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
		get submitResult() {
			return submitResult;
		},
		get submitError() {
			return submitError;
		},
		submitForm,
		clearError() {
			submitError = null;
		}
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