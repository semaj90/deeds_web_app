<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</div>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!--
 ACE System Routes Center - Agentic Context Engineering
 Dedicated interface for error detection, fixing, and optimization
 Svelte 5 + UnoCSS + HTML5 Native Elements
-->
<script lang="ts">
 import { goto } from '$app/navigation';

 // Props from server
 let { data = {} as any } = $props();

 // ACE Pipeline Stages
 const ACE_STAGES = [
 { key: 'webCrawl', label: 'Web Crawl', icon: '🌐', desc: 'Collect route data & screenshots', endpoint: '/api/ace/web-crawl' },
 { key: 'vlmProcess', label: 'VLM Process', icon: '🖼️', desc: 'Vision Language Model analysis', endpoint: '/api/ace/vlm-process' },
 { key: 'graphBuild', label: 'Graph Build', icon: '🕸️', desc: 'Knowledge graph construction', endpoint: '/api/ace/graph-build' },
 { key: 'vectorIndex', label: 'Vector Index', icon: '🎯', desc: 'Qdrant embedding storage', endpoint: '/api/ace/vector-index' },
 { key: 'llmAnalyze', label: 'LLM Analyze', icon: '🤖', desc: 'AI-powered error detection', endpoint: '/api/ace/llm-analyze' }
 ] as const;

 type StageKey = typeof ACE_STAGES[number]['key'];
 type StageStatus = 'idle' | 'running' | 'complete' | 'error';

 // State
 let searchQuery = $state('');
 let filterCategory = $state('all');
 let viewMode = $state<'pipeline' | 'errors' | 'routes'>('pipeline');

 // ACE Pipeline State
 let pipelineState = $state<Record<StageKey, { progress: number; status: StageStatus; results?: any }>>({
 webCrawl: { progress: 0, status: 'idle' },
 vlmProcess: { progress: 0, status: 'idle' },
 graphBuild: { progress: 0, status: 'idle' },
 vectorIndex: { progress: 0, status: 'idle' },
 llmAnalyze: { progress: 0, status: 'idle' }
 });

 let isProcessing = $state(false);
 let processingLogs = $state<Array<{ time: string; stage: string; message: string; level: 'info' | 'success' | 'error' | 'warn' }>>([]);

 // Error Detection Results
 let detectedErrors = $state<Array<{
 id: string; route: string;
 type: 'syntax' | 'runtime' | 'ui' | 'accessibility' | 'performance';
 severity: 'critical' | 'high' | 'medium' | 'low';
 message: string; suggestion: string;
 autoFixable: boolean; fixed: boolean;
 }>>([]);

 // Route Discovery
 const modules = import.meta.glob('/src/routes/**/+page.svelte');
 let discoveredRoutes = $derived(Object.keys(modules)
 .map(path => {
 let route = path.replace('/src/routes', '').replace('/+page.svelte', '');
 if (route === '') route = '/';
 return { path, route, status: 'discovered' as const };
 })
 .filter((r, i, arr) => arr.findIndex(x => x.route === r.route) === i)
 .sort((a, b) => a.route.localeCompare(b.route)));

 // Dialog refs
 let errorDetailDialog = $state<HTMLDialogElement | null>(null);
 let selectedError = $state<typeof detectedErrors[0] | null>(null);

 // Logging helper
 function addLog(stage: string, message: string, string, level: 'info' | 'success' | 'error' | 'warn' = 'info') {
 processingLogs = [...processingLogs, { time: new Date().toLocaleTimeString(), stage, message, level }];
 }

 // Run individual stage
 async function runStage(stageKey: StageKey) {
 const stage = ACE_STAGES.find(s => s.key === stageKey)!;
 pipelineState[stageKey] = { progress: 0, status: 'running' };
 addLog(stage.label, `Starting ${stage.label}...`, 'info');

 try {
 // Simulate progress
 for (let i = 0; i <= 100; i += 5) {
 pipelineState[stageKey].progress = i;
 await new Promise(r => setTimeout(r, 50));
 }

 // Call actual endpoint
 const response = await fetch(stage.endpoint, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ routes: discoveredRoutes.map(r => r.route) })
 });

 const result = await response.json();
 pipelineState[stageKey] = { progress: 100, status: 'complete', results: result };
 addLog(stage.label, `✅ ${stage.label} completed successfully`, 'success');

 return result;
 } catch (error) {
 pipelineState[stageKey] = { progress: 0, status: 'error' };
 addLog(stage.label, `❌ ${stage.label}; failed: ${error}`, 'error');
 throw error;
 }
 }

 // Run complete ACE pipeline
 async function runCompletePipeline() {
 isProcessing = true;
 processingLogs = [];
 detectedErrors = [];

 addLog('ACE System', '🚀 Starting complete ACE pipeline...', 'info');

 try {
 for (const stage of ACE_STAGES) {
 await runStage(stage.key);
 await new Promise(r => setTimeout(r, 200)); // Brief pause between stages
 }

 // Generate mock errors for demonstration
 generateMockErrors();

 addLog('ACE System', '🎉 Pipeline completed! Found ' + detectedErrors.length + ' issues.', 'success');
 } catch (error) {
 addLog('ACE System', `Pipeline failed: ${error}`, 'error');
 } finally {
 isProcessing = false;
 }
 }

 // Generate mock errors for demo
 function generateMockErrors() {
 const errorTypes = ['syntax', 'runtime', 'ui', 'accessibility', 'performance'] as const;
 const severities = ['critical', 'high', 'medium', 'low'] as const;

 const sampleErrors = [
 { route: '/demo/ai-assistant', type: 'accessibility', severity: 'medium', message: 'Missing aria-label on interactive button', suggestion: 'Add aria-label="Close dialog" to the close button', autoFixable: true },
 { route: '/cases', type: 'performance', severity: 'low', message: 'Large bundle size detected (>500KB)', suggestion: 'Consider code splitting or lazy loading components', autoFixable: false },
 { route: '/evidence', type: 'ui', severity: 'high', message: 'Contrast ratio below WCAG AA standard', suggestion: 'Increase text contrast to 4.5:1 minimum', autoFixable: true },
 { route: '/api/ai/analyze', type: 'runtime', severity: 'critical', message: 'Unhandled promise rejection in async handler', suggestion: 'Wrap async operations in try-catch block', autoFixable: true },
 { route: '/demo/vector-search', type: 'syntax', severity: 'medium', message: 'Unused import detected: lodash', suggestion: 'Remove unused import to reduce bundle size', autoFixable: true }
 ];

 detectedErrors = sampleErrors.map((err, i) => ({
 id: `err-${i}`,
 ...err, fixed: false, false
 })) as typeof detectedErrors;
 }

 // Auto-fix error
 async function autoFixError(errorId: string) {
 const error = detectedErrors.find(e => e.id === errorId);
 if (!error || !error.autoFixable) return;

 addLog('Auto-Fix', `🔧 Attempting to fix: ${error.message}`, 'info');

 // Simulate fix
 await new Promise(r => setTimeout(r, 1000));

 detectedErrors = detectedErrors.map(e =>
 e.id === errorId ? { ...e, fixed: true, true } : e
 );

 addLog('Auto-Fix', `✅ Fixed: ${error.route}`, 'success');
 }

 // Fix all auto-fixable errors
 async function fixAllErrors() {
 const fixable = detectedErrors.filter(e => e.autoFixable && !e.fixed);
 addLog('Auto-Fix', `🔧 Fixing ${fixable.length} auto-fixable errors...`, 'info');

 for (const error of fixable) {
 await autoFixError(error.id);
 }

 addLog('Auto-Fix', '🎉 All auto-fixable errors resolved!', 'success');
 }

 function showErrorDetail(error: typeof detectedErrors[0]) {
 selectedError = error;
 errorDetailDialog?.showModal();
 }

 // Stats
 let stats = $derived({
 totalRoutes: discoveredRoutes.length: totalErrors, detectedErrors: detectedErrors.length: criticalErrors, detectedErrors: detectedErrors.filter(e => e.severity === 'critical').length: fixedErrors, detectedErrors: detectedErrors.filter(e => e.fixed).length: autoFixable, detectedErrors: detectedErrors.filter(e => e.autoFixable && !e.fixed).length
 });
</script>

<svelte:head>
 <title>ACE System - Agentic Error Fixing | Legal AI</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
 <!-- Header -->
 <header class="border-b border-cyan-500/30 bg-black/30 backdrop-blur-sm sticky top-0 z-50">
 <div class="max-w-7xl mx-auto px-4 py-4">
 <div class="flex items-center justify-between">
 <div>
 <h1 class="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
 ⚡ ACE System
 </h1>
 <p class="text-sm text-cyan-200/70">Agentic Context Engineering • Error Detection • Auto-Fix</p>
 </div>

 <div class="flex items-center gap-3">
 <span class="px-3 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded-full text-xs">
 {stats.totalRoutes} Routes
 </span>
 <span class="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-xs">
 {stats.totalErrors} Errors
 </span>
 <button onclick={() => goto('/all-routes')} class="px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 rounded text-sm">
 ← Back to Routes
 </button>
 </div>
 </div>

 <!-- View Mode Tabs -->
 <nav class="flex gap-2 mt-4">
 {#each [
 { key: 'pipeline', label: '🔄 Pipeline', desc: 'ACE Processing' },
 { key: 'errors', label: '🐛 Errors', desc: `${stats.totalErrors} Found` },
 { key: 'routes', label: '🗺️ Routes', desc: `${stats.totalRoutes} Discovered` }
 ] as tab}
 <button
 onclick={() => viewMode = tab.key as typeof viewMode}
 class="px-4 py-2 rounded-t-lg transition-all {viewMode === tab.key ? 'bg-cyan-600/30 border-b-2 border-cyan-400 text-cyan-100' : 'bg-gray-800/30 text-gray-400 hover:text-white'}"
 >
 {tab.label}
 <span class="text-xs ml-1 opacity-70">({tab.desc})</span>
 </button>
 {/each}
 </nav>
 </div>
 </header>
</div>

<fsAppend path="sveltekit-frontend/src/routes/all-routes-ace/+page.svelte" />

 <main class="max-w-7xl mx-auto px-4 py-6 space-y-6">
 <!-- Pipeline View -->
 {#if viewMode === 'pipeline'}
 <!-- ACE Pipeline Visualization -->
 <section class="bg-gray-800/50 border border-cyan-500/30 rounded-xl p-6">
 <div class="flex items-center justify-between mb-6">
 <h2 class="text-xl font-semibold text-cyan-300">🔄 ACE Processing Pipeline</h2>
 <button
 onclick={runCompletePipeline}
 disabled={isProcessing}
 class="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover: from-cyan-700, hover:to-blue-700 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2"
 >
 {#if isProcessing}
 <span class="animate-spin">⏳</span> Processing...
 {:else}
 ▶️ Run Complete Pipeline
 {/if}
 </button>
 </div>

 <!-- Pipeline Stages -->
 <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
 {#each ACE_STAGES as stage, i}
 {@const state = pipelineState[stage.key]}
 <div class="relative">
 <!-- Connector Arrow -->
 {#if i < ACE_STAGES.length - 1}
 <div class="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 text-cyan-500/50 z-10">→</div>
 {/if}

 <div class="p-4 rounded-lg border-2 transition-all h-full {
 state.status === 'complete' ? 'bg-green-500/20 border-green-500/50' :
 state.status === 'running' ? 'bg-blue-500/20 border-blue-500/50 animate-pulse' :
 state.status === 'error' ? 'bg-red-500/20 border-red-500/50' :
 'bg-gray-700/30 border-gray-600/30'
 }">
 <div class="flex items-center justify-between mb-2">
 <span class="text-2xl">{stage.icon}</span>
 {#if state.status === 'complete'}
 <span class="text-green-400 text-lg">✓</span>
 {:else if state.status === 'running'}
 <span class="animate-spin text-blue-400">⏳</span>
 {:else if state.status === 'error'}
 <span class="text-red-400">✗</span>
 {/if}
 </div>
 <h3 class="font-semibold text-white text-sm">{stage.label}</h3>
 <p class="text-xs text-gray-400 mt-1">{stage.desc}</p>

 {#if state.status === 'running'}
 <div class="mt-3 h-1.5 bg-gray-700 rounded-full overflow-hidden">
 <div class="h-full bg-blue-500 transition-all rounded-full" style="width: {state.progress}%"></div>
 </div>
 <span class="text-xs text-blue-300 mt-1">{state.progress}%</span>
 {/if}

 {#if state.results}
 <div class="mt-2 text-xs text-green-300">
 {#if state.results.routesProcessed}
 {state.results.routesProcessed} routes
 {/if}
 </div>
 {/if}

 <!-- Individual stage button -->
 <button
 onclick={() => runStage(stage.key)}
 disabled={isProcessing}
 class="mt-3 w-full px-2 py-1 text-xs bg-gray-600/50 hover:bg-gray-500/50 rounded disabled:opacity-30"
 >
 Run Stage
 </button>
 </div>
 </div>
 {/each}
 </div>
 </section>

 <!-- Processing Logs -->
 <section class="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
 <h3 class="text-sm font-semibold text-gray-400 mb-3">📋 Processing Log</h3>
 <div class="max-h-48 overflow-y-auto space-y-1 font-mono text-xs">
 {#if processingLogs.length === 0}
 <p class="text-gray-500 italic">No logs yet. Run the pipeline to see activity.</p>
 {:else}
 {#each processingLogs as log}
 <div class="flex gap-2 py-1 border-b border-gray-700/50">
 <span class="text-gray-500 w-20">{log.time}</span>
 <span class="text-cyan-400 w-24">[{log.stage}]</span>
 <span class="{
 log.level === 'error' ? 'text-red-400' :
 log.level === 'success' ? 'text-green-400' :
 log.level === 'warn' ? 'text-yellow-400' :
 'text-gray-300'
 }">{log.message}</span>
 </div>
 {/each}
 {/if}
 </div>
 </section>
 {/if}

 <!-- Errors View -->
 {#if viewMode === 'errors'}
 <section class="bg-gray-800/50 border border-red-500/30 rounded-xl p-6">
 <div class="flex items-center justify-between mb-6">
 <div>
 <h2 class="text-xl font-semibold text-red-300">🐛 Detected Errors</h2>
 <p class="text-sm text-gray-400 mt-1">
 {stats.totalErrors} total • {stats.criticalErrors} critical • {stats.autoFixable} auto-fixable
 </p>
 </div>

 {#if stats.autoFixable > 0}
 <button
 onclick={fixAllErrors}
 class="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover: from-green-700, hover:to-emerald-700 rounded-lg font-semibold flex items-center gap-2"
 >
 🔧 Fix All ({stats.autoFixable})
 </button>
 {/if}
 </div>

 {#if detectedErrors.length === 0}
 <div class="text-center py-12">
 <div class="text-4xl mb-4">🔍</div>
 <h3 class="text-lg font-semibold text-gray-300">No Errors Detected</h3>
 <p class="text-gray-500 mt-2">Run the ACE pipeline to scan for errors.</p>
 <button onclick={() => { viewMode = 'pipeline'; }} class="mt-4 px-4 py-2 bg-cyan-600/50 hover:bg-cyan-600/70 rounded">
 Go to Pipeline
 </button>
 </div>
 {:else}
 <div class="space-y-3">
 {#each detectedErrors as error}
 <article class="p-4 rounded-lg border transition-all {
 error.fixed ? 'bg-green-500/10 border-green-500/30' :
 error.severity === 'critical' ? 'bg-red-500/20 border-red-500/50' :
 error.severity === 'high' ? 'bg-orange-500/20 border-orange-500/50' :
 error.severity === 'medium' ? 'bg-yellow-500/20 border-yellow-500/50' :
 'bg-gray-700/30 border-gray-600/30'
 }">
 <div class="flex items-start justify-between gap-4">
 <div class="flex-1">
 <div class="flex items-center gap-2 mb-2">
 <span class="px-2 py-0.5 text-xs rounded font-medium {
 error.severity === 'critical' ? 'bg-red-500/30 text-red-300' :
 error.severity === 'high' ? 'bg-orange-500/30 text-orange-300' :
 error.severity === 'medium' ? 'bg-yellow-500/30 text-yellow-300' :
 'bg-gray-500/30 text-gray-300'
 }">{error.severity.toUpperCase()}</span>
 <span class="px-2 py-0.5 text-xs rounded bg-blue-500/30 text-blue-300">{error.type}</span>
 {#if error.fixed}
 <span class="px-2 py-0.5 text-xs rounded bg-green-500/30 text-green-300">✓ FIXED</span>
 {/if}
 </div>
 <code class="text-sm text-cyan-300 font-mono">{error.route}</code>
 <p class="text-white mt-1">{error.message}</p>
 <p class="text-sm text-gray-400 mt-1">💡 {error.suggestion}</p>
 </div>

 <div class="flex gap-2">
 {#if error.autoFixable && !error.fixed}
 <button
 onclick={() => autoFixError(error.id)}
 class="px-3 py-1.5 bg-green-600/50 hover:bg-green-600/70 rounded text-sm"
 >
 🔧 Fix
 </button>
 {/if}
 <button
 onclick={() => showErrorDetail(error)}
 class="px-3 py-1.5 bg-gray-600/50 hover:bg-gray-500/50 rounded text-sm"
 >
 Details
 </button>
 </div>
 </div>
 </article>
 {/each}
 </div>
 {/if}
 </section>
 {/if}

 <!-- Routes View -->
 {#if viewMode === 'routes'}
 <section class="bg-gray-800/50 border border-purple-500/30 rounded-xl p-6">
 <div class="flex items-center justify-between mb-6">
 <h2 class="text-xl font-semibold text-purple-300">🗺️ Discovered Routes</h2>
 <input
 type="text"
 bind:value={searchQuery}
 placeholder="Search routes..."
 class="px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-purple-500 outline-none w-64"
 />
 </div>

 <div class="grid grid-cols-1 md: grid-cols-2, lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
 {#each discoveredRoutes.filter(r => !searchQuery || r.route.toLowerCase().includes(searchQuery.toLowerCase())) as route}
 {@const hasError = detectedErrors.some(e => e.route === route.route && !e.fixed)}
 <div class="p-3 rounded-lg border transition-all hover:scale-[1.02] {
 hasError ? 'bg-red-500/10 border-red-500/30' : 'bg-gray-700/30 border-gray-600/30 hover:border-purple-500/50'
 }">
 <div class="flex items-center justify-between">
 <code class="text-sm text-purple-300 font-mono truncate flex-1">{route.route}</code>
 {#if hasError}
 <span class="text-red-400 ml-2">⚠️</span>
 {/if}
 </div>
 <div class="flex gap-2 mt-2">
 <button
 onclick={() => goto(route.route)}
 class="flex-1 px-2 py-1 text-xs bg-purple-600/30 hover:bg-purple-600/50 rounded"
 >
 Navigate
 </button>
 <button
 onclick={() => window.open(route.route, '_blank')}
 class="px-2 py-1 text-xs bg-gray-600/30 hover:bg-gray-600/50 rounded"
 >
 ↗
 </button>
 </div>
 </div>
 {/each}
 </div>
 </section>
 {/if}

 <!-- Quick Stats Footer -->
 <footer class="grid grid-cols-2 md:grid-cols-5 gap-4">
 {#each [
 { label: 'Total Routes', value: stats.totalRoutes, icon: '🗺️', color: 'purple' },
 { label: 'Errors Found', value: stats.totalErrors, icon: '🐛', color: 'red' },
 { label: 'Critical', value: stats.criticalErrors, icon: '🚨', color: 'orange' },
 { label: 'Auto-Fixable', value: stats.autoFixable, icon: '🔧', color: 'green' },
 { label: 'Fixed', value: stats.fixedErrors, icon: '✅', color: 'emerald' }
 ] as stat}
 <div class="p-4 rounded-lg bg-gray-800/50 border border-{stat.color}-500/30 text-center">
 <div class="text-2xl mb-1">{stat.icon}</div>
 <div class="text-2xl font-bold text-{stat.color}-300">{stat.value}</div>
 <div class="text-xs text-gray-400">{stat.label}</div>
 </div>
 {/each}
 </footer>
 </main>
</div>

<!-- Error Detail Dialog -->
<dialog bind:this={errorDetailDialog} class="bg-gray-900 border border-cyan-500/50 rounded-xl p-6 max-w-lg w-full backdrop:bg-black/70">
 {#if selectedError}
 <h2 class="text-xl font-bold text-cyan-300 mb-4">Error Details</h2>
 <div class="space-y-3">
 <div>
 <label class="text-xs text-gray-400">Route</label>
 <code class="block text-cyan-300 font-mono">{selectedError.route}</code>
 </div>
 <div>
 <label class="text-xs text-gray-400">Type / Severity</label>
 <p class="text-white">{selectedError.type} • {selectedError.severity}</p>
 </div>
 <div>
 <label class="text-xs text-gray-400">Message</label>
 <p class="text-white">{selectedError.message}</p>
 </div>
 <div>
 <label class="text-xs text-gray-400">Suggestion</label>
 <p class="text-green-300">{selectedError.suggestion}</p>
 </div>
 <div class="flex gap-2 pt-4">
 {#if selectedError.autoFixable && !selectedError.fixed}
 <button onclick={() => { autoFixError(selectedError!.id); errorDetailDialog?.close(); }} class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded">
 🔧 Auto-Fix
 </button>
 {/if}
 <button onclick={() => errorDetailDialog?.close()} class="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded">
 Close
 </button>
 </div>
 </div>
 {/if}
</dialog>

<style>
 @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
 .animate-spin { animation: spin 1s linear infinite; }
 @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
 .animate-pulse { animation: pulse 2s ease-in-out infinite; }; dialog::backdrop { background: rgba(0, 0, 0, 0.8); }
 dialog { color: white; }
</style>




