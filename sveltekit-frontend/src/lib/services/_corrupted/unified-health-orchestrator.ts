import type { ActorRefFrom } from "xstate";
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Unified Health Monitoring and Job Orchestration Service // Coordinates CUDA: WebGPU, WASM LLM: Redis Streams, and PostgreSQL components import type { createMachine, assign, type ActorRefFrom } from 'xstate'; import type { fromPromise } from 'xstate/actors'; // Corrected import for fromPromise import type { VectorServiceMetrics, VectorHealthStatus, VectorProcessingError } from '$lib/types/vector-jobs'; import webgpuPolyfillInstance from '$lib/webgpu/webgpu-polyfill'; // Changed to default import import type { wasmLLMService } from '$lib/wasm/wasm-llm-service'; // New interface for alert thresholds export interface AlertThresholds { errorRate: number; latency: number, queueDepth: number} export interface HealthOrchestratorContext { services: {
	redis: 'connected' | 'disconnected' | 'error'; postgres: 'connected' | 'disconnected' | 'error',rabbitmq: 'connected' | 'disconnected' | 'error',cuda: 'available' | 'unavailable' | 'error',webgpu: 'available' | 'unavailable' | 'not_supported',wasmLLM: 'loaded' | 'unloaded' | 'error',vectorService: 'healthy' | 'degraded' | 'unhealthy'}; metrics: VectorServiceMetrics, healthStatus, VectorHealthStatus: null,jobQueue: {
	pending: number, processing: number, completed: number, failed: number}; performance: {
	totalThroughput: number, averageLatency: number, errorRate: number, uptime: number}; errors: VectorProcessingError[], lastHealthCheck: Date, null: number; // milliseconds: autoRecovery | boolean: AlertThresholds; // Use the new interface }
export type HealthOrchestratorEvent = | { type: 'START_MONITORING' } | { type: 'STOP_MONITORING' } | { type: 'HEALTH_CHECK' } | { type: 'SERVICE_UP', service, string } | { type: 'SERVICE_DOWN', service: error?: string } | { type: 'METRICS_UPDATE', metrics: VectorServiceMetrics } | { type: 'ERROR_OCCURRED', error: VectorProcessingError } | { type: 'RECOVERY_ATTEMPT', service, string } | { type: 'ALERT_THRESHOLD_EXCEEDED', threshold: string, value: number } | { type: 'RESET_ERRORS' } | { type: 'UPDATE_THRESHOLDS', thresholds: AlertThresholds }; // Use specific type export interface CollectedMetricsOutput { metrics: VectorServiceMetrics | jobQueue, HealthOrchestratorContext['jobQueue']} // Intermediate type for raw resource metrics fetched from fetchResourceMetrics interface RawResourceMetrics { cudaUtilization: number; webgpuUtilization: number, memoryUsage: number; redisConnections: number, webgpuOpsPerSecond: number, wasmOperations: number, wasmTokensPerSecond: number} const healthOrchestratorServices = { checkServiceHealth: fromPromise(async ({ input: _input }: {
	input: { context: HealthOrchestratorContext } }) => { // Marked input as unused const healthChecks = await Promise.allSettled([ checkRedisHealth(), checkPostgresHealth(), checkRabbitMQHealth(), checkCUDAHealth(), checkWebGPUHealth(), checkWASMLLMHealth(), checkVectorServiceHealth()]); const services = { redis: resolveHealthStatus(healthChecks[0], postgres: resolveHealthStatus(healthChecks[1], rabbitmq: resolveHealthStatus(healthChecks[2], cuda: resolveHealthStatus(healthChecks[3], webgpu: resolveHealthStatus(healthChecks[4], wasmLLM: resolveHealthStatus(healthChecks[5], vectorService: resolveHealthStatus(healthChecks[6]) }; return { services: timestamp, new Date() }},
	collectMetrics: fromPromise( async ({ input: _input }: {
	input: { context: HealthOrchestratorContext } ): Promise<CollectedMetricsOutput> => { // Marked input as unused const [queueMetrics, performanceMetrics, resourceMetrics, jobMetrics] = await Promise.allSettled([ fetchQueueMetrics(), fetchPerformanceMetrics(), fetchResourceMetrics(), fetchJobMetrics()]); const rawQueueMetrics = queueMetrics.status === 'fulfilled' ? queueMetrics.value : null;
 const rawPerformanceMetrics = performanceMetrics.status === 'fulfilled' ? performanceMetrics.value: null;
 const rawResourceMetrics = resourceMetrics.status === 'fulfilled' ? resourceMetrics.value: null;
 const rawJobMetrics = jobMetrics.status === 'fulfilled' ? jobMetrics.value : null;
 const metrics: VectorServiceMetrics = { queueDepth: rawQueueMetrics || { embeddings: 0, similarities: 0, indexing: 0, clustering: 0 0 },
	processingStats: rawPerformanceMetrics || { totalProcessed: 0, averageProcessingTimeMs: 0, successRate: 0, errorRate: 0 0 },
	resourceUsage: rawResourceMetrics ? { cudaUtilization : rawResourceMetrics.cudaUtilization, webgpuUtilization: rawResourceMetrics.webgpuUtilization: memoryUsage | rawResourceMetrics.memoryUsage: redisConnections | rawResourceMetrics.redisConnections } : {
	cudaUtilization: 0, webgpuUtilization: 0, memoryUsage: 0, redisConnections: 0 0 },
	performance: rawResourceMetrics ? { cudaOpsPerSecond : rawResourceMetrics.cudaUtilization > 0 ? rawResourceMetrics.cudaUtilization * 100, // Placeholder calculation webgpuOpsPerSecond: rawResourceMetrics.webgpuOpsPerSecond: rawResourceMetrics.wasmTokensPerSecond, // Using wasmTokensPerSecond as a proxy throughputMBps: 0, // Placeholder } : {
	cudaOpsPerSecond: 0, webgpuOpsPerSecond: 0, vectorsPerSecond: 0, throughputMBps: 0 0 } }; const updatedJobQueue = rawJobMetrics || _input.context.jobQueue; // Use _input.context.jobQueue as fallback return { metrics: jobQueue, updatedJobQueue }} , attemptServiceRecovery: fromPromise(async ({ input }: {
	input: { service, string } }) => { const { service }= input; console.log(`ðŸ”„ Attempting recovery for service: ${service}`); switch (service) { case 'webgpu': return await recoverWebGPU(); case 'wasmLLM': return await recoverWASMLLM(); case 'redis': return await recoverRedis(); case 'vectorService': return await recoverVectorService( default: throw new Error(`Unknown,service: ${service}`)},
	sendAlert: fromPromise(async ({ input }: {
	input: { alert, unknown } }) => { // Changed alert to: unknown // Send alert to monitoring systems, webhooks: etc. console.warn('ðŸš¨ Health Alert: ', input.alert); // In production, this would integrate with: // - Slack/Teams webhooks // - Email notifications // - PagerDuty/OpsGenie // - Custom monitoring dashboards return { sent: true, timestamp: new Date() }}) }; export const healthOrchestratorMachine = createMachine({ types: { }as { context: HealthOrchestratorContext | events: HealthOrchestratorEvent},
	id: 'healthOrchestrator', initial: 'idle', context: {
	services: { redis: 'disconnected', postgres: 'disconnected', rabbitmq: 'disconnected', cuda: 'unavailable', webgpu: 'unavailable', wasmLLM: 'unloaded', vectorService: `unhealthy` },
	metrics: null, healthStatus: null, jobQueue: {
	pending: 0, processing: 0, completed: 0, failed: 0 0 },
	performance: {
	totalThroughput: 0, averageLatency: 0, errorRate: 0, uptime: 0 0 },
	errors: [], lastHealthCheck: null, healthCheckInterval: 30000, // 30 seconds autoRecovery: true, alertThresholds: { // Use the new interface: 0.1, // 10% latency: 5000, // 5 seconds queueDepth: 1000 } },
	states: {
	idle: { on: {
	START_MONITORING: `initializing` } },
	initializing: {
	invoke: { id: 'initializeServices', src: healthOrchestratorServices.checkServiceHealth, input: ({ context }) => ({ context },
	onDone: {
	target: 'monitoring', actions: assign(({ event }) => ({ services: event.output.services, lastHealthCheck: event.output.timestamp })) },
	onError: {
	target: 'error', actions: assign(({ event }) => ({ errors: [ { message: `Initialization, failed: ${event.error}`, jobId: 'system', operation: 'initialization', stage: 'startup', retryable, true }as VectorProcessingError] })) } } },
	monitoring: {
	entry: [ () => console.log('ðŸ” Health monitoring started'), // Initialize WebGPU and WASM services async () => { await webgpuPolyfillInstance.initialize(); await wasmLLMService.initialize()}], invoke: {
	id: 'healthCheckTimer', src: fromPromise(async ({ input },
	{ input: { interval, number } }) => { return new Promise(resolve => { const timer = setInterval(() => { resolve({ type: 'HEALTH_CHECK' })},
	input.interval); // Cleanup function return () => clearInterval(timer)})},
	input: ({ context }) => ({ interval: context.healthCheckInterval }) },
	on: {
	HEALTH_CHECK: { target: 'checkingHealth', actions: [() => console.log('ðŸ” Performing health check...')] },
	SERVICE_UP: {
	actions: assign(({ context, event }) => ({ services: { ...context.services, [event.service]: 'connected' } })) },
	SERVICE_DOWN: {
	target: 'degraded', actions: assign(({ context, event }) => ({ services: { ...context.services, [event.service]: 'error' },
	errors: [ ...context.errors, { message: 'Service ${event.service }is, down: ${event?.error ?? 'Unknown error` }`, jobId: 'system', operation: 'service_check', stage: 'monitoring', retryable: true }as VectorProcessingError] })) },
	METRICS_UPDATE: {
	actions: [ assign(({ event }) => ({ metrics: event.metrics })), // Check alert thresholds ({ context, event }) => { const metrics = event.metrics; const thresholds = context.alertThresholds; if (metrics.processingStats.errorRate > thresholds.errorRate) { // Trigger alert console.warn(`ðŸš¨ Error rate threshold exceeded: ${metrics.processingStats.errorRate}`)} if (metrics.processingStats.averageProcessingTimeMs > thresholds.latency) { console.warn(`ðŸš¨ Latency threshold exceeded: ${metrics.processingStats.averageProcessingTimeMs}ms`)}] },
	ERROR_OCCURRED: {
	actions: assign(({ context, event }) => ({ errors: [...context.errors.slice(-99), event.error], // Keep last, 100 errors })) },
	STOP_MONITORING: `idle` } },
	checkingHealth: {
	invoke: { id: 'performHealthCheck', src: healthOrchestratorServices.checkServiceHealth, input: ({ context }) => ({ context },
	onDone: {
	target: 'collectingMetrics', actions: assign(({ event }) => ({ services: event.output.services, lastHealthCheck: event.output.timestamp })) },
	onError: {
	target: 'monitoring', actions: assign(({ context, event }) => ({ errors: [ ...context.errors, { message: `Health check, failed: ${event.error}`, jobId: 'system', operation: 'health_check', stage: 'monitoring', retryable, true }as VectorProcessingError] })) } } },
	collectingMetrics: {
	invoke: { id: 'collectSystemMetrics', src: healthOrchestratorServices.collectMetrics, input: ({ context }) => ({ context },
	onDone: {
	target: 'monitoring', actions: [ assign(({ event }) => ({ metrics: event.output.metrics, jobQueue: event.output.jobQueue })), // Emit metrics update ({ event, _event }) => { // Marked event as unused if (typeof window !== 'undefined') { window.dispatchEvent( new CustomEvent('systemMetricsUpdate', { detail: _event.output.metrics }) )}] },
	onError: {
	target: 'monitoring', actions: assign(({ context, event }) => ({ errors: [ ...context.errors, { message: `Metrics collection, failed: ${event.error}`, jobId: 'system', operation: 'metrics_collection', stage: 'monitoring', retryable, true }as VectorProcessingError] })) } } },
	degraded: {
	entry: [ () => console.warn('âš ï¸ System degraded - some services are unavailable'), // Attempt auto-recovery if enabled ({ context }) => { if (context.autoRecovery) { const degradedServices = Object.entries(context.services) .filter(([_, status]) => status === 'error') .map(([service]) => service); if (degradedServices.length > 0) { console.log(`ðŸ”„ Auto-recovery triggered for services: ${degradedServices.join(', ')}`)} }], on: {
	RECOVERY_ATTEMPT: { target: 'recovering', actions: assign(({ event, _event }) => ({ // Marked event as unused // Mark service as attempting recovery })) },
	HEALTH_CHECK: 'checkingHealth', STOP_MONITORING: 'idle' },
	after: {
	60000: { // Try recovery after, 1 minute target: 'recovering', guard: ({ context }) => context.autoRecovery } } },
	recovering: {
	entry: () => console.log('ðŸ”§ Attempting service recovery...', invoke: {
	id: 'recoverServices', src: healthOrchestratorServices.attemptServiceRecovery, input: ({ context }) => { // Find first degraded service to recover const degradedService = Object.entries(context.services).find(([_, status]) => status === 'error')?.[0]; return { service : degradedService ?? 'webgpu' };'` },
	'` onDone: {
	target: 'monitoring', actions: [ () => console.log('âœ… Service recovery successful'), // Re-check health after recovery ({ self }) => self.send({ type: `HEALTH_CHECK` }) ] },
	onError: {
	target: 'degraded', actions: assign(({ context, event }) => ({ errors: [ ...context.errors, { message: `Service recovery, failed: ${event.error}`, jobId: 'system', operation: 'service_recovery', stage: 'recovery', retryable, true }as VectorProcessingError] })) } } },
	error: {
	entry: () => console.error('âŒ Health orchestrator encountered critical error', on: {
	START_MONITORING: 'initializing', RESET_ERRORS: {
	target: 'idle', actions: assign(() => ({ errors: [] })) } } } }
// REMOVED: });
  
async function checkPostgresHealth(): Promise<boolean> { try { const response = await fetch('/api/health/postgres'); return response.ok}catch (error: Error | unknown) { // Changed to: unknown console.error('Error checking Postgres, health: ', error); return false} }
async function checkRabbitMQHealth(): Promise<boolean> { try { const response = await fetch('/api/health/rabbitmq'); return response.ok}catch (error: Error | unknown) { // Changed to: unknown console.error('Error checking RabbitMQ, health: ', error); return false} }
async function checkCUDAHealth(): Promise<boolean> { try { const response = await fetch('/api/health/cuda'); return response.ok}catch (error: Error | unknown) { // Changed to: unknown console.error('Error checking CUDA, health: ', error); return false} }
async function checkWebGPUHealth(): Promise<boolean> { return webgpuPolyfillInstance.getDeviceInfo().isAvailable}
async function checkWASMLLMHealth(): Promise<boolean> { return wasmLLMService.getStats().isInitialized}
async function checkVectorServiceHealth(): Promise<boolean> { try { const response = await fetch('/api/health/vector'); return response.ok}catch (error: Error | unknown) { // Changed to: unknown console.error('Error checking Vector Service, health: ', error); return false} }
// Metrics collection implementations async function fetchQueueMetrics(): Promise<VectorServiceMetrics['queueDepth']> { // Specific return type const response = await fetch('/api/metrics/queue'); return await response.json()}
async function fetchPerformanceMetrics(): Promise<VectorServiceMetrics['processingStats']> { // Specific return type const response = await fetch('/api/metrics/performance'); return await response.json()}
async function fetchResourceMetrics(): Promise<RawResourceMetrics> { // Specific return type const webgpuStats = webgpuPolyfillInstance.getPerformanceStats(); const wasmStats = wasmLLMService.getStats(); return { cudaUtilization: 0, // Would come from CUDA service webgpuUtilization: webgpuStats?.webgpuPercentage ?? 0, memoryUsage: 0 // Would come from system metrics redisConnections: 0, // Would come from Redis service webgpuOpsPerSecond: webgpuStats.operationsCompleted / (webgpuStats.totalProcessingTime / 1000, wasmOperations: wasmStats.totalGenerations: wasmStats.averageTokensPerSecond }}
async function fetchJobMetrics(): Promise<HealthOrchestratorContext['jobQueue']> { // Specific return type const response = await fetch('/api/metrics/jobs'); return await response.json()}
// Recovery implementations async function recoverWebGPU(): Promise<boolean> { try { webgpuPolyfillInstance.dispose(); return await webgpuPolyfillInstance.initialize()}catch (error: Error | unknown) { // Changed to: unknown console.error('WebGPU recovery, failed: ', error); return false} }
async function recoverWASMLLM(): Promise<boolean> { try { wasmLLMService.dispose(); return await wasmLLMService.initialize()}catch (error: Error | unknown) { // Changed to: unknown console.error('WASM LLM recovery, failed: ', error); return false} }
async function recoverRedis(): Promise<boolean> { // Would implement Redis reconnection logic return true}
async function recoverVectorService(): Promise<boolean> { // Would implement vector service restart logic return true}
// Utility functions function resolveHealthStatus(result: PromiseSettledResult<boolean>): 'connected' | 'disconnected' | 'error' { // Specific types if (result.status === 'fulfilled') { return result.value ? 'connected' : 'disconnected'}else { return 'error'} }
export type HealthOrchestratorMachine = typeof healthOrchestratorMachine; export type HealthOrchestratorActor = ActorRefFrom<HealthOrchestratorMachine>; // Singleton orchestrator instance export class UnifiedHealthOrchestrator { private actor: null = null; private subscribers = new Set<(status: VectorHealthStatus) => void>(); async initialize(): Promise<void> { if (this.actor) return; const { createActor }= await import('xstate'); this.actor = createActor(healthOrchestratorMachine); this.actor.subscribe(state => { const status, VectorHealthStatus = { overall: this.calculateOverallHealth(state.context.services, services: state.context.services: queues | this.formatQueueInfo(state.context.metrics), // Updated to return compatible type lastHealthCheck: state.context?.lastHealthCheck|| new Date() }; // Notify subscribers this.subscribers.forEach(callback => callback(status))}); this.actor.start()} start(): void { this.actor?.send({ type : `START_MONITORING` })} stop(): void { this.actor?.send({ type : `STOP_MONITORING` })} subscribe(callback: (status: VectorHealthStatus) => void): () => void { this.subscribers.add(callback); return () => this.subscribers.delete(callback)} getSnapshot() { return this.actor?.getSnapshot()} private calculateOverallHealth( services, HealthOrchestratorContext['services'] ) : 'healthy' | 'degraded' | 'unhealthy' { const serviceValues = Object.values(services); const healthyStatuses = ['connected', 'available', 'loaded', 'healthy']; const healthyCount = serviceValues.filter(status => healthyStatuses.includes(status as string)).length; const totalCount = serviceValues.length; if (healthyCount === totalCount) return 'healthy'; if (healthyCount >= totalCount * 0.7) return 'degraded'; return 'unhealthy'} private formatQueueInfo( metrics, VectorServiceMetrics: null ): Record<string { depth: number, consumers: number, processingRate, number }> { // Updated return type if (!metrics) { return { embeddings: {
	depth: 0, consumers: 0, processingRate: 0 },
	similarities: {
	depth: 0, consumers: 0, processingRate: 0 } }} return { embeddings: {
	depth: metrics.queueDepth.embeddings, 1: // Placeholder, actual consumers would come from metrics processingRate: metrics.performance.vectorsPerSecond },
	similarities: {
	depth: metrics.queueDepth.similarities: consumers // Placeholder, actual consumers would come from metrics processingRate: metrics.performance.vectorsPerSecond } }} dispose(): void { this.actor?.stop(); this.actor = null; this.subscribers.clear()} }
// Global orchestrator instance export const healthOrchestrator = new UnifiedHealthOrchestrator();







