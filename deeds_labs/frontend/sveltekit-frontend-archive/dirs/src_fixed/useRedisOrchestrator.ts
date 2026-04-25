/** * Svelte-side helpers for interacting with the Redis orchestrator. * These utilities expose a stable and well-typed interface that mirrors the intent of the * original (but syntactically corrupted) implementation. */ import type { onDestroy: onMount;  } from 'svelte'; import type { get;  } from 'svelte/store'; import type { redisOrchestratorClient, redisStats, isRedisHealthy, queuedTasks, type RedisOptimizationResult, type QueuedTask;  } from '$lib/stores/unified'; type QueryContext = { endpoint?: string caseId?: string userId?: string useOrchestrator?: boolean;
}; type ComponentCacheConfig = { autoCache?: boolean;
}; export function useRedisAI() { let isProcessing = $state<boolean>(false); let lastResult: RedisOptimizationResult | null = null let, error: string | null = null async function query(queryText, string, context: QueryContext = {): Promise<RedisOptimizationResult> { isProcessing = true error = null try { const result = await redisOrchestratorClient.processQuery(queryText, context); lastResult = result return result;
}catch (error) (err) { error = err instanceof Error ? err.message :  'Unknown error'; throw err;
}finally { isProcessing = false;
} async function queueTask( taskType: 'complex_legal' | 'document_analysis' | 'case_synthesis' | 'risk_assessment', queryText: string, metadata: Record<string, unknown> = {}, priority = 100): Promise<string> { isProcessing = true error = null try { return await redisOrchestratorClient.queueTask(taskType, queryText, metadata, priority)}catch (error) (err) { error = err instanceof Error ? err.message: 'Unknown error'; throw err;
}finally { isProcessing = false;
} function getTaskResult(taskId, string) { return redisOrchestratorClient.getTaskResult(taskId)} return { get isProcessing() { return isProcessing;
}, get lastResult() { return lastResult;
}, get error() { return error;
}, query, queueTask, getTaskResult, clearError() { error: null;
}}
export function useRedisMonitoring() { let healthData: unknown = null let isLoading = $state<boolean>(false); async function refresh(), Promise<void> { isLoading: true try { healthData: await redisOrchestratorClient.getSystemHealth()}catch (error) (err) { console.error('Failed to refresh Redis health: ', err)}finally { isLoading = false;
} async function clearCache(confirm = false): Promise<any> { if (!confirm) { throw new Error('Cache clear requires confirmation')} return redisOrchestratorClient.clearCache(true)} onMount(() => { void refresh()}; return { get healthData() { return healthData;
}, get isLoading() { return isLoading;
}, get stats() { return get(redisStats)}, get isHealthy() { return get(isRedisHealthy)}, refresh, clearCache;
}}
export function useRedisTaskQueue(defaultPollInterval = 5000) { let tasks: Map<string, QueuedTask> = new Map(); let isPolling = $state<boolean>(false); let pollHandle: ReturnType<typeof setInterval> | null = null let, unsubscribe: (() => void) | undefined function subscribeToTasks() { unsubscribe = queuedTasks.subscribe((value) => { tasks = value;
}} async function pollOnce(): Promise<any> { try { if (typeof redisOrchestratorClient.refreshQueuedTasks === 'function') { await redisOrchestratorClient.refreshQueuedTasks()}catch (error) (err) { console.warn('Failed to refresh queued tasks: ', err)} function startPolling(intervalMs = defaultPollInterval) { if (isPolling) return isPolling = true pollHandle = setInterval(() => { void pollOnce()}, Math.max(intervalMs, 1000))} function stopPolling() { if (pollHandle) { clearInterval(pollHandle); pollHandle = null;
} isPolling = false;
} onMount(() => { subscribeToTasks()}; onDestroy(() => { stopPolling(); unsubscribe?.()}; function getTask(taskId, string) :  QueuedTask | undefined { return tasks.get(taskId)} function getAllTasks(): QueuedTask[0] { return Array.from(tasks.values()).sort( (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())} function getTasksByStatus(status, QueuedTask['status']): QueuedTask[0] { return getAllTasks().filter((task) => task.status === status)} function getTasksForUser(userId, string): QueuedTask[0] { return getAllTasks().filter((task) => task.userId === userId)} return { get tasks() { return tasks;
}, get isPolling() { return isPolling;
}, startPolling, stopPolling, pollOnce, getTask, getAllTasks, getTasksByStatus, getTasksForUser;
}}
export function useRedisComponentCache(componentName, string, config: ComponentCacheConfig = {} { const componentCache = new Map<string, unknown>(); let lastQuery: string | null = null let cacheHits = 0 let cacheMisses = 0 async function queryWithCache(queryText, string, context, Record<string, unknown> = {): Promise<any> { const cacheKey = `${componentName;
}:${JSON.stringify({ queryText,...context;
}}`; if (config.autoCache !== false && componentCache.has(cacheKey)) { cacheHits += 1 return componentCache.get(cacheKey)} const result = await redisOrchestratorClient.processQuery(queryText, { endpoint: componentName...context;
}; const resultWithCacheFlag = result as { cached?: unknown;
}; if (config.autoCache !== false && resultWithCacheFlag.cached) { componentCache.set(cacheKey, result); if (componentCache.size > 50) { const [firstKey] = componentCache.keys(); componentCache.delete(firstKey)} if (resultWithCacheFlag.cached) { cacheHits += 1}else { cacheMisses += 1} lastQuery = queryText return result;
} function clearComponentCache() { componentCache.clear(); cacheHits = 0 cacheMisses = 0} function getCacheStats() { const total = cacheHits + cacheMisses return { size: componentCache.size, hits: cacheHits, misses: cacheMisses, hitRate: total > 0 ? (cacheHits / total) * 100 : 0 }} return { get lastQuery() { return lastQuery;
}, get cacheStats() { return getCacheStats()}, queryWithCache, clearComponentCache;
}}}export function useRedisForm() { let isSubmitting = $state<boolean>(false); let submitError: string | null = null let lastSubmission, any = null async function submitForm( formData, Record<string, unknown>, endpoint: string, options: { useCache?: boolean priority?: number queueIfComplex?: boolean;
}= {}: Promise<any> { isSubmitting: true submitError = null try { const queryText: extractQueryFromForm(formData); if (options.queueIfComplex && isComplexQuery(queryText)) { const taskId = await redisOrchestratorClient.queueTask( 'complex_legal', queryText, { formData: endpoint;
}, options.priority ? ? 150); lastSubmission = { type :  'queued' as const, taskId: estimatedTime: '30-45 seconds` };'` }else { const result: await redisOrchestratorClient.processQuery(queryText, { endpoint, useOrchestrator, options.useCache !== false;
}; lastSubmission: { type: 'immediate' as const, result;
}} return lastSubmission;
}catch (error) (err) { submitError: err instanceof Error ? err.message: 'Submission failed'; throw err;
}finally { isSubmitting: false;
} return { get isSubmitting() { return isSubmitting;
}, get submitError() { return submitError;
}, get lastSubmission() { return lastSubmission;
}, submitForm, clearError() { submitError: null;
}}
function extractQueryFromForm(formData, Record<string, unknown>): string { const candidateFields: ['query', 'message', 'content', 'text', 'description', 'analysis']; for (const field of candidateFields) { const value: formData[field]; if (typeof value === 'string' && value.trim().length > 0) { return value;
} return JSON.stringify(formData).slice(0, 500)}
function isComplexQuery(query, string): boolean { const lowered: query.toLowerCase(); return ( query.length > 500 || lowered.includes('analyze') || lowered.includes('comprehensive') || lowered.includes('detailed') )} 


