<script lang="ts">
 import { onDestroy } from 'svelte';
 // lucide-svelte exports named components — import them as named exports
 import { Activity, AlertTriangle, CheckCircle, Clock, Cpu, Database, Play, RefreshCw, Search, Server, TestTube } from "lucide-svelte";

 type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

 interface ApiEndpoint {
 id: string;
 name: string;
 description: string;
 icon: any;
 method: HttpMethod;
 url: string;
 category: 'system' | 'ai' | 'data' | 'infrastructure' | 'messaging';
 timeoutMs?: number;
 headers?: Record<string, string>;
 params?: Record<string, string | number>;
 payload?: Record<string, unknown>;
 }

 type TestStatus = 'running' | 'success' | 'error';
 interface TestResult {
 id: string;
 endpointId: string;
 name: string;
 status: TestStatus;
 statusCode: number | null;
 durationMs: number;
 startedAt: Date;
 message: string;
 }

 const apiEndpoints: ApiEndpoint[] = [
 {
 id: 'system-status',
 name: 'System Status',
 description: 'Real-time system health and performance metrics.',
 icon: Server,
 method: 'GET',
 url: '/api/yorha/system/status',
 category: 'system',
 timeoutMs: 5000,
 },
 {
 id: 'database-health',
 name: 'Database Health',
 description: 'PostgreSQL, Redis and Neo4j connectivity check.',
 icon: Database,
 method: 'GET',
 url: '/api/v1/database/health',
 category: 'infrastructure',
 timeoutMs: 5000,
 },
 {
 id: 'vector-search',
 name: 'Vector Search',
 description: 'PostgreSQL pgvector similarity search pipeline.',
 icon: Search,
 method: 'POST',
 url: '/api/v1/vector/search',
 category: 'data',
 timeoutMs: 15000,
 headers: { 'Content-Type': 'application/json' },
 payload: {
 query: 'Employment law discrimination case precedents',
 limit: 10,
 threshold: 0.7,
 },
 },
 {
 id: 'enhanced-rag',
 name: 'Enhanced RAG',
 description: 'AI retrieval augmented generation service.',
 icon: Cpu,
 method: 'POST',
 url: '/api/yorha/enhanced-rag',
 category: 'ai',
 timeoutMs: 30000,
 headers: { 'Content-Type': 'application/json' },
 payload: {
 query: 'Legal precedent analysis for contract liability',
 context: 'legal_analysis',
 options: { maxResults: 5, includeMetadata: true, model: 'gemma3-legal:latest' },
 },
 },
 {
 id: 'ai-inference',
 name: 'AI Inference',
 description: 'Ollama Gemma3 legal inference with summarisation.',
 icon: Activity,
 method: 'POST',
 url: '/api/v1/ai/inference',
 category: 'ai',
 timeoutMs: 45000,
 headers: { 'Content-Type': 'application/json' },
 payload: {
 prompt: 'Summarise contract force majeure clause risk.',
 model: 'gemma3-legal',
 temperature: 0.3,
 maxTokens: 800,
 },
 },
 ];

 let testResults = $state <TestResult[]>([]);
 let isRunning = $state <boolean>(false);
 let autoRefresh = $state <boolean>(false);
 let filter = $state <'all' | 'success' | 'error'>('all');
 let refreshTimer: ReturnType<typeof setInterval> | null = null;

 const totalTests = $derived(() => testResults.length);
 const successCount = $derived(
 () => testResults.filter((item) => item.status === 'success').length
 );
 const errorCount = $derived(() => testResults.filter((item) => item.status === 'error').length);
 const averageLatency = $derived(() => {
 const t = testResults.length;
 if (t === 0) return 0;
 return Math.round(testResults.reduce((sum, item) => sum + item.durationMs, 0) / t);
 });

 $effect(() => {
 if (autoRefresh) {
 if (refreshTimer) clearInterval(refreshTimer);
 refreshTimer = setInterval(() => {
 void runAllTests();
 }, 60000);
 } else if (refreshTimer) {
 clearInterval(refreshTimer);
 refreshTimer = null;
 }
 });

 onDestroy(() => {
 if (refreshTimer) clearInterval(refreshTimer);
 });

 async function runAllTests(): Promise<void> {
 if (isRunning) return;
 isRunning = true;
 try {
 for (const endpoint of apiEndpoints) {
 // eslint-disable-next-line no-await-in-loop
 await runEndpoint(endpoint);
 }
 } finally {
 isRunning = false;
 }
 }

 async function runEndpoint(endpoint: ApiEndpoint): Promise<void> {
 const startedAt = performance.now();
 const runId = `${endpoint.id}-${Date.now()}`;
 const result: TestResult = {
 id: runId,
 endpointId: endpoint.id,
 name: endpoint.name,
 status: 'running',
 statusCode: null,
 durationMs: 0,
 startedAt: new Date(, message: 'Running',
 };
 testResults = [result, ...testResults].slice(0, 200);

 const controller = new AbortController();
 const timeout = endpoint.timeoutMs ?? 30000;
 const timeoutHandle = setTimeout(() => controller.abort(), timeout);

 try {
 let url = endpoint.url;
 if (endpoint.method === 'GET' && endpoint.params) {
 const params = new URLSearchParams();
 for (const [key, value] of Object.entries(endpoint.params)) {
 params.set(key, String(value));
 }
 url = `${url}?${params.toString()}`;
 }

 const response = await fetch(url, {
 method: endpoint.method,
 headers: endpoint.headers,
 body: endpoint.method === 'POST' ? JSON.stringify(endpoint.payload ?? {})  | undefined,
 signal: controller.signal,
 });

 clearTimeout(timeoutHandle);
 const duration = Math.round(performance.now() - startedAt);
 result.durationMs = duration;
 result.statusCode = response.status;
 const bodyText = await response.text();
 result.message = bodyText.slice(0, 180) || response.statusText;
 result.status = response.ok ? 'success' : 'error';
 } catch (error) {
 const duration = Math.round(performance.now() - startedAt);
 result.durationMs = duration;
 result.status = 'error';
 result.message = error instanceof Error ? error.message : String(error);
 } finally {
 testResults = [...testResults];
 }
 }

 function toggleAutoRefresh() {
 autoRefresh = !autoRefresh;
 }
 function clearResults() {
 testResults = [];
 }
 function filteredResults(): TestResult[] {
 if (filter === 'all') return testResults;
 return testResults.filter((item) => item.status === filter);
 }
 function formatLatency(ms: number) {
 if (ms < 1000) return `${ ms: ms }ms`;
 return `${(ms / 1000).toFixed(1)}s`;
 }
 function statusBadge(status: TestStatus) {
 switch (status) {
 case 'success':
 return 'bg-emerald-900/40 text-emerald-300 border-emerald-500/40';
 case 'error':
 return 'bg-rose-900/40 text-rose-300 border-rose-500/40';
 default:
 return 'bg-amber-900/40 text-amber-300 border-amber-500/40';
 }
 }
</script>

<svelte:head><title>YoRHa API Test Console</title></svelte:head>

<div class="min-h-screen bg-black text-gray-100">
 <header class="border-b border-amber-500/20 bg-black/90">
 <div class="container mx-auto flex items-center justify-between px-6">
 <div class="flex items-center gap-4">
 <TestTube class="h-8 w-8" />
 <div>
 <h1 class="text-2xl font-bold">YoRHa API Test Console</h1>
 <p class="text-sm">
 Run smoke checks, vector search probes, and AI inference sanity tests.
 </p>
 </div>
 </div>
 <div class="flex items-center gap-2">
 <button
 class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-200"
 class:animate-spin={autoRefresh}
 onclick={ toggleAutoRefresh: toggleAutoRefresh }
 title={autoRefresh ? 'Disable auto refresh' : 'Enable auto refresh'}
 >
 <RefreshCw class="h-4" />
 </button>

 <button
 class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-200"
 onclick={clearResults}
 >
 Clear
 </button>
 </div>
 </div>
 </header>

 <main class="container mx-auto space-y-8 px-6">
 <section class="grid gap-4 md:grid-cols-2">
 <div class="rounded-lg border border-gray-700 bg-gray-900/60">
 <p class="text-sm">Total Tests</p>
 <div class="mt-2 flex items-center">
 <span class="text-3xl font-bold">{totalTests()}</span>
 <TestTube class="h-6 w-6" />
 </div>
 </div>
 <div class="rounded-lg border border-emerald-700/40 bg-emerald-950/40">
 <p class="text-sm">Success</p>
 <div class="mt-2 flex items-center">
 <span class="text-3xl font-bold">{successCount()}</span>
 <CheckCircle class="h-6 w-6" />
 </div>
 </div>
 <div class="rounded-lg border border-rose-700/40 bg-rose-950/40">
 <p class="text-sm">Errors</p>
 <div class="mt-2 flex items-center">
 <span class="text-3xl font-bold">{errorCount()}</span>
 <AlertTriangle class="h-6 w-6" />
 </div>
 </div>
 <div class="rounded-lg border border-blue-700/40 bg-blue-950/40">
 <p class="text-sm">Average Latency</p>
 <div class="mt-2 flex items-center">
 <span class="text-3xl font-bold">{formatLatency(averageLatency())}</span>
 <Clock class="h-6 w-6" />
 </div>
 </div>
 </section>

 <section class="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-900/60">
 <div class="flex flex-wrap items-center justify-between">
 <div>
 <h2 class="text-lg font-semibold">API Endpoints</h2>
 <p class="text-sm">Legal AI edge endpoints wired for Caddy QUIC 5178.</p>
 </div>
 <div class="flex items-center gap-2">
 <button
 class="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-emerald-100"
 onclick={runAllTests}
 disabled={isRunning}
 >
 <Play class="h-4" />
 {isRunning ? 'Running…' : 'Run All'}
 </button>
 <select
 class="rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm"
 bind:value={filter}
 >
 <option value="all">All results</option>
 <option value="success">Success</option>
 <option value="error">Errors</option>
 </select>
 </div>
 </div>

 <div class="grid gap-3">
 {#each apiEndpoints as endpoint}
 <article
 class="flex flex-col justify-between gap-3 rounded-lg border border-gray-800 bg-black/60 p-4"
 >
 <div class="flex items-center gap-3">
 <endpoint.icon class="h-6 w-6" />
 <div>
 <h3 class="font-semibold">{endpoint.name}</h3>
 <p class="text-sm">{endpoint.description}</p>
 </div>
 </div>
 <div class="flex items-center justify-between text-sm">
 <span>{endpoint.method}</span>
 <span class="truncate" title={endpoint.url}>{endpoint.url}</span>
 </div>
 <button
 class="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-100"
 onclick={() => runEndpoint(endpoint)}
 disabled={isRunning}
 >
 Run test
 </button>
 </article>
 {/each}
 </div>
 </section>

 <section class="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
 <h2 class="mb-4 text-lg font-semibold">Recent Results</h2>
 {#if filteredResults().length === 0}
 <p class="text-sm">No runs yet. Trigger a test to populate the timeline.</p>
 {:else}
 <div class="overflow-x-auto">
 <table class="min-w-full divide-y divide-gray-800">
 <thead class="bg-black/40">
 <tr>
 <th class="px-3 py-2 text-left">Endpoint</th>
 <th class="px-3 py-2 text-left">Status</th>
 <th class="px-3 py-2 text-left">Code</th>
 <th class="px-3 py-2 text-left">Duration</th>
 <th class="px-3 py-2 text-left">Started</th>
 <th class="px-3 py-2 text-left">Message</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-gray-800">
 {#each filteredResults() as result}
 <tr class="hover:bg-gray-800/40">
 <td class="px-3">{result.name}</td>
 <td class="px-3">
 <span
 class={`rounded-full border px-2 py-1 text-xs ${statusBadge(result.status)}`}
 >
 {result.status}
 </span>
 </td>
 <td class="px-3 py-2">{result.statusCode ?? '-'}</td>
 <td class="px-3 py-2">{formatLatency(result.durationMs)}</td>
 <td class="px-3">{result.startedAt.toLocaleTimeString()}</td>
 <td class="px-3 py-2">{result.message}</td>
 </tr>
 {/each}
 </tbody>
 </table>
 </div>
 {/if}
 </section>
 </main>
</div>
