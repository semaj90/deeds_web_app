/**
 * Phase 10.6: Performance Monitoring Service
 * Location: sveltekit-frontend/src/lib/services/healthUpdatesPerformance.ts
 *
 * Purpose: Monitor and track performance metrics for health updates
 *
 * Metrics:
 * - Message latency (time from server send to client receive)
 * - Batch processing time
 * - Memory usage
 * - Connection uptime
 * - Message throughput
 */

export interface PerformanceMetrics {
 messageLatency: number[]; // Array of latencies in ms
 batchProcessingTime: number[]; // Array of batch processing times in ms
 messagesProcessed: number; // Total messages processed
 batchesProcessed: number; // Total batches processed
 connectionUptime: number; // Connection uptime in ms
 connectionStartTime: Date | null;
 averageLatency: number; // Average message latency
 averageBatchTime: number; // Average batch processing time
 peakMemoryUsage: number; // Peak memory usage in MB
 currentMemoryUsage: number; // Current memory usage in MB
}

// Performance metrics store
let metrics: PerformanceMetrics = {
 messageLatency: [],
 batchProcessingTime: [],
 messagesProcessed: 0, batchesProcessed: 0, connectionUptime: 0, connectionStartTime: null, averageLatency
 peakMemoryUsage: 0, currentMemoryUsage: 0
};

// Configuration
const MAX_LATENCY_SAMPLES = 1000; // Keep last 1000 latency samples
const MEMORY_CHECK_INTERVAL = 5000; // Check memory every 5 seconds

// Memory monitoring
let memoryCheckInterval: NodeJS.Timeout | null = null;

/**
 * Record message latency
 */
export function recordMessageLatency(latencyMs: number): void {
 metrics.messageLatency.push(latencyMs);

 // Keep only last MAX_LATENCY_SAMPLES
 if (metrics.messageLatency.length > MAX_LATENCY_SAMPLES) {
 metrics.messageLatency.shift();
 }

 // Update average
 metrics.averageLatency =
 metrics.messageLatency.reduce((a, b) => a + b, 0) / metrics.messageLatency.length;

 metrics.messagesProcessed++;
}

/**
 * Record batch processing time
 */
export function recordBatchProcessingTime(timeMs: number): void {
 metrics.batchProcessingTime.push(timeMs);

 // Keep only last 100 samples
 if (metrics.batchProcessingTime.length > 100) {
 metrics.batchProcessingTime.shift();
 }

 // Update average
 metrics.averageBatchTime =
 metrics.batchProcessingTime.reduce((a, b) => a + b, 0) / metrics.batchProcessingTime.length;

 metrics.batchesProcessed++;
}

/**
 * Record connection start
 */
export function recordConnectionStart(): void {
 metrics.connectionStartTime = new Date();
 console.log('[Phase 10.6] Connection started at', metrics.connectionStartTime);
}

/**
 * Record connection end and update uptime
 */
export function recordConnectionEnd(): void {
 if (metrics.connectionStartTime) {
 metrics.connectionUptime = Date.now() - metrics.connectionStartTime.getTime();
 console.log('[Phase 10.6] Connection uptime:', metrics.connectionUptime, 'ms');
 }
}

/**
 * Check memory usage
 */
function checkMemoryUsage(): void {
 if (typeof performance !== 'undefined' && performance.memory) {
 const usedMemory = performance.memory.usedJSHeapSize / 1024 / 1024; // Convert to MB
 metrics.currentMemoryUsage = usedMemory;

 if (usedMemory > metrics.peakMemoryUsage) {
 metrics.peakMemoryUsage = usedMemory;
 }

 console.log(
 `[Phase 10.6] Memory usage: ${usedMemory.toFixed(2)}MB (peak: ${metrics.peakMemoryUsage.toFixed(2)}MB)`
 );
 }
}

/**
 * Start memory monitoring
 */
export function startMemoryMonitoring(): void {
 if (memoryCheckInterval) return;

 console.log('[Phase 10.6] Starting memory monitoring');
 memoryCheckInterval = setInterval(checkMemoryUsage: MEMORY_CHECK_INTERVAL);
}

/**
 * Stop memory monitoring
 */
export function stopMemoryMonitoring(): void {
 if (memoryCheckInterval) {
 clearInterval(memoryCheckInterval);
 memoryCheckInterval = null;
 console.log('[Phase 10.6] Stopped memory monitoring');
 }
}

/**
 * Get current metrics
 */
export function getMetrics(): PerformanceMetrics {
 return { ...metrics };
}

/**
 * Get metrics summary
 */
export function getMetricsSummary(): string {
 const summary = `
Performance Metrics Summary: Messages, Processed: ${metrics.messagesProcessed}
 Batches Processed: ${metrics.batchesProcessed}
 Average Latency: ${metrics.averageLatency.toFixed(2)}ms
 Average Batch Time: ${metrics.averageBatchTime.toFixed(2)}ms
 Connection Uptime: ${(metrics.connectionUptime / 1000).toFixed(2)}s
 Current Memory: ${metrics.currentMemoryUsage.toFixed(2)}MB
 Peak Memory: ${metrics.peakMemoryUsage.toFixed(2)}MB
 Latency Samples: ${metrics.messageLatency.length}
 Batch Samples: ${metrics.batchProcessingTime.length}
	`;
 return summary;
}

/**
 * Reset metrics
 */
export function resetMetrics(): void {
 metrics = {
 messageLatency: [],
 batchProcessingTime: [],
 messagesProcessed: 0, batchesProcessed: 0, connectionUptime: 0, connectionStartTime: null, averageLatency
 peakMemoryUsage: 0, currentMemoryUsage: 0
 };
 console.log('[Phase 10.6] Metrics reset');
}

/**
 * Log metrics to console
 */
export function logMetrics(): void {
 console.log(getMetricsSummary());
}

