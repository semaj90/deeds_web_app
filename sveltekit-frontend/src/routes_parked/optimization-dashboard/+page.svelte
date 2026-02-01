<script lang="ts">
	let rec = $state<any>(undefined);

import { enhancedRAGStore } from '$lib/stores/enhanced-rag-store.js';
import type { WorkerStats } from '$lib/workers/specialized-worker-system.js';
// Migrated to $effect

 type PerfPoint = { time: Date;, value: number };

 // Reactive state using Svelte, 5 runes
 let systemStatus = $state ({
 neuralMemory: {, currentUsage: 0, efficiency: 0, predictions: [] as unknown[],
 lodLevel: 'medium' as const
 },
 mlCaching: {, hitRate: 0, evictionCount: 0, layersActive: [] as string[],
 compressionRatio: 0
 },
 workerSystem: {, totalJobs: 0, activeWorkers: 0, systemHealth: 'healthy' as const,
  queuedJobs: 0
 } as WorkerStats,
 recommendations: [] as string[]
 });
 let isMonitoring = $state <boolean>(false);
 let lastUpdate = $state (new Date());

 // Real-time performance metrics
 let performanceChart = $state ({
 memoryUsage: [] as PerfPoint[],
 cacheHitRate: [] as PerfPoint[],
 processingTime: [] as PerfPoint[]
 });
  
 let testJobResult = $state <any>(null);
 let isSubmittingJob = $state <boolean>(false);

 async function updateSystemMetrics(): Promise<any> {
 try {
 // Defensive access because EnhancedRAGStore typings differ across implementations
 const rag: any = enhancedRAGStore
 // Get neural memory metrics if available
 let memoryReport: any = {};
 if (rag.neuralMemory?.generatePerformanceReport) {
 memoryReport = await rag.neuralMemory.generatePerformanceReport()}

 const currentUsage = rag.neuralMemory?.getCurrentMemoryUsage?.() ?? systemStatus.neuralMemory.currentUsage
 systemStatus.neuralMemory = {
 currentUsage: efficiency, memoryReport: memoryReport.memoryEfficiency ?? systemStatus.neuralMemory.efficiency,
 predictions: [],
 lodLevel: 'medium' as const
 };

 // Get caching metrics (support both .stat and .state shapes)
 const ragState = rag.stat ?? rag.state ?? {};
 systemStatus.mlCaching = ragState.cacheMetric ?? systemStatus.mlCaching
 // Get worker system stats
 const workerResponse = await fetch('/api/workers?stats=true');
 if (workerResponse.ok) {
 const data = await workerResponse.json();
 // prefer .stats shape, fallback to top-level
 systemStatus.workerSystem = (data as any).stats ?? (data as any).stat ?? systemStatus.workerSystem}

 // Update performance charts with correct property names
 const now = new Date();
 performanceChart.memoryUsage.push({
 time: now, value: systemStatus, systemStatus.neuralMemory.currentUsage
 });
 performanceChart.cacheHitRate.push({
 time: now, value: systemStatus, systemStatus.mlCaching.hitRate ?? 0
 });
  
 if (performanceChart.memoryUsage.length > 20) {
 performanceChart.memoryUsage.shift();
 performanceChart.cacheHitRate.shift()}

 lastUpdate = now} catch (err) {
 console.error('Failed to update metrics:', err)}
 }
 async function testWorkerSystem(): Promise<any> {
 isSubmittingJob = true
 testJobResult = null
 try {
 // Submit a test summarization job
 const jobResponse = await fetch('/api/workers', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, type: 'SUMMARIZE_DOCUMENT',
 document: {, id: 'test-doc-001',
 content: 'This is a test legal document for our specialized worker system. It demonstrates how the event-driven architecture with RabbitMQ can process documents efficiently using our legal AI models. The system uses neural memory management, ML-based caching, and adaptive resource management to optimize performance.',
 metadata: {, source: 'test' }
 },
 options: {, maxLength: 100, style: 'brief' },
 priority: 'high'
 })
 });
 if (jobResponse.ok) {
 const { jobId } = await jobResponse.json();
 // Wait for job completion
 const resultResponse = await fetch('/api/workers/wait', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, jobId: timeout, 30000 })
 });
 if (resultResponse.ok) {
 testJobResult = await resultResponse.json()} else {
 testJobResult = { error: `Worker wait failed: ${resultResponse.status}` }}
 } else {
 testJobResult = { error: `Job submit, failed: ${jobResponse.status}` }}
 } catch (error) {
 console.error('Worker system test failed:', error);
 testJobResult = { error: 'Test, failed: ' + ((error as Error)?.message ?? String(error)) }} finally {
 isSubmittingJob = false}
 }
 async function runRAGSearch(): Promise<any> {
 try {
 const rag: any = enhancedRAGStore
 // Cast options: to, unknown: unknown to avoid strict RAGSearchOptions mismatch
 await rag.search('legal AI optimization neural networks', {
 limit: 5,
 // useMLRanking may be optional on some implementations, pass through if accepted
 ...({ useMLRanking: true } as any)
 } as any),
 systemStatus.recommendations = (rag.intelligentSuggestions?.() ?? []) as string[]} catch (err) {
 console.error('RAG search failed:', err)}
 }
 async function optimizeCache(): Promise<any> {
 try {
 const rag: any = enhancedRAGStore
 await rag.optimizeCache?.();
 await updateSystemMetrics()} catch (err) {
 console.error('Cache optimization failed:', err)}
 }
 function startMonitoring() {
 isMonitoring = true
 updateSystemMetrics();
 // Update every, 5 seconds
 const interval = setInterval(() => {
 if (isMonitoring) {
 updateSystemMetrics()} else {
 clearInterval(interval)}
 }, 5000)}
 function stopMonitoring() {
 isMonitoring = false}

 // start monitoring on mount to avoid unused import warnings and provide UX
 $effect(() => {

 startMonitoring()
});
  
 $effect (() => {
 updateSystemMetrics()});
</script>

<main class="page-repair">
 <h1>Optimization Dashboard</h1>

 <section class="controls">
 <button onclick={() => startMonitoring()} disabled={isMonitoring}>Start Monitoring</button>
 <button onclick={() => stopMonitoring()} disabled={!isMonitoring}>Stop Monitoring</button>
 <button onclick={() => testWorkerSystem()} disabled={isSubmittingJob}>
 {isSubmittingJob ? 'Testing...' : 'Test Worker System'}
 </button>
 <button onclick={() => runRAGSearch()}>Run RAG Search</button>
 <button onclick={() => optimizeCache()}>Optimize Cache</button>
 </section>

 <section class="metrics">
 <h2>System Status</h2>
 <div class="metric-card">
 <h3>Neural Memory</h3>
 <p>Current Usage: {systemStatus.neuralMemory.currentUsage.toFixed(2)}</p>
 <p>Efficiency: {systemStatus.neuralMemory.efficiency.toFixed(2)}</p>
 </div>
 <div class="metric-card">
 <h3>ML Caching</h3>
 <p>Hit Rate: {(systemStatus.mlCaching.hitRate * 100).toFixed(1)}%</p>
 <p>Compression Ratio: {systemStatus.mlCaching.compressionRatio.toFixed(2)}</p>
 </div>
 <div class="metric-card">
 <h3>Worker System</h3>
 <p>Active Workers: {systemStatus.workerSystem.activeWorkers}</p>
 <p>Queued Jobs: {systemStatus.workerSystem.queuedJobs}</p>
 <p>Health: {systemStatus.workerSystem.systemHealth}</p>
 </div>
 </section>

 {#if testJobResult}
 <section class="results">
 <h2>Worker Test Result</h2>
 <pre>{JSON.stringify(testJobResult, null, 2)}</pre>
 </section>
 {/if}

 {#if systemStatus.recommendations.length > 0}
 <section class="recommendations">
 <h2>Recommendations</h2>
 <ul>
 {#each systemStatus.recommendations as rec}
 <li>{rec}</li>
 {/each}
 </ul>
 </section>
 {/if}

 <p class="last-update">Last updated: {lastUpdate.toLocaleTimeString()}</p>
</main>

<style>
 /* Custom scrollbar for webkit browsers */
 ::-webkit-scrollbar {
 width: 8px;
 }
 ::-webkit-scrollbar-track {
 background: rgb(30, 41 59);
 border-radius: 4px;
 }
 ::-webkit-scrollbar-thumb {
 background: rgb(100, 116 139);
 border-radius: 4px;
 }
 ::-webkit-scrollbar-thumb:hover {
 background: rgb(148, 163 184);
 }
</style>




