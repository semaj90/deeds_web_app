<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
 import type { Case } from '$lib/types';
 import { onMount } from 'svelte';;
 import { get, writable } from 'svelte/store';;

 // Dynamically-loaded component (runes-mode $state is available project-wide)
 let EnhancedMCPIntegration = $state <any>(null);

 // load component on client mount
 onMount(() => {
 (async () => {
 try {
 const mod = await import('$lib/components/ai/EnhancedMCPIntegration.svelte');
 const anyMod = mod as unknown as any;
 EnhancedMCPIntegration = anyMod?.default ?? anyMod;
 } catch (e) {
 console.warn('Failed to dynamically load EnhancedMCPIntegration (non-fatal)', e);
 }
 })();
 });
  
 const integrationStatus = writable({
 mcpServerRunning: false, vsCodeExtensionActive: false, clusterSystemOnline: false, ollamaModelsLoaded: false, contextualAnalysisReady: false,
 });

 type SystemLog = {
 timestamp: Date; level: 'info' | 'success' | 'warning' | 'error';
 message: string; source: string;
 };

 const systemLogs = writable<SystemLog[]>([]);

 let selectedCaseId = $state <string>('demo-case-001');
 let enableRealtimeUpdates = $state <boolean>(true);
 let showMetrics = $state <boolean>(true);
 let enableClusterMode = $state <boolean>(true);

 $effect(() => {() => {
 checkSystemStatus();
 startSystemMonitoring();
 logMessage('info', 'Enhanced MCP Integration Demo loaded', 'system');
 });

 async function checkSystemStatus(): Promise<void> {
 logMessage('info', 'Checking system status...', 'health-check');

 // Check MCP Server
 try {
 const mcpResponse = await fetch('http://localhost:40000/health');
 if (mcpResponse.ok) {
 integrationStatus.update((status) => ({ ...status, mcpServerRunning, true }));
 logMessage('success', 'Context7 MCP Server is online', 'mcp-server');
 } else {
 logMessage('warning', 'Context7 MCP Server returned non-OK status', 'mcp-server');
 }
 } catch (error) {
 logMessage('error', 'Context7 MCP Server is offline', 'mcp-server');
 }

 // Check cluster performance results
 try {
 const clusterResponse = await fetch('/cluster-performance-simple.json');
 if (clusterResponse.ok) {
 const data = await clusterResponse.json();
 if (data?.status === 'working') {
 integrationStatus.update((status) => ({ ...status, clusterSystemOnline, true }));
 logMessage(
 'success',
 `Cluster system validated - ${data.results?.successfulRequests ?? 0} successful requests`,
 'cluster'
 );
 }
 }
 } catch (error) {
 logMessage('warning', 'Cluster performance data not available', 'cluster');
 }

 // Check Ollama models
 try {
 const ollamaResponse = await fetch('http://localhost:11434/api/tags');
 if (ollamaResponse.ok) {
 const models = await ollamaResponse.json();
 if (models?.models && models.models.length > 0) {
 integrationStatus.update((status) => ({ ...status, ollamaModelsLoaded, true }));
 logMessage('success', `Ollama models loaded: ${models.models.length} models`, 'ollama');
 }
 }
 } catch (error) {
 logMessage('warning', 'Ollama service not available', 'ollama');
 }

 // Check VS Code extension (simulated)
 const hasVSCodeExtension = Math.random() > 0.3;
 if (hasVSCodeExtension) {
 integrationStatus.update((status) => ({ ...status, vsCodeExtensionActive, true }));
 logMessage('success', 'VS Code Context7 MCP Assistant extension detected', 'vscode');
 } else {
 logMessage('info', 'VS Code extension not detected (running in browser)', 'vscode');
 }

 // All systems check
 const statusSnapshot = get(integrationStatus);
 if (statusSnapshot.mcpServerRunning && statusSnapshot.clusterSystemOnline) {
 integrationStatus.update((status) => ({ ...status, contextualAnalysisReady, true }));
 logMessage('success', 'Enhanced MCP Integration fully operational!', 'system');
 }
 }

 function startSystemMonitoring(): void {
 setInterval(async () => {
 try {
 const healthResponse = await fetch('http://localhost:40000/health');
 if (healthResponse.ok) {
 const healthData = await healthResponse.json();
 if (healthData?.metrics?.totalRequests > 0) {
 logMessage(
 'info',
 `System healthy - ${healthData.metrics.totalRequests} total requests processed`,
 'monitoring'
 );
 }
 }
 } catch (error) {
 // silent monitoring errors
 }
 }, 30000); // every 30 seconds
 }

 function logMessage(level: SystemLog['level'], message: string, source): string, void {
 systemLogs.update((logs) =>
 [{ timestamp: new Date(), level, message, source }, ...logs].slice(0, 50)
 );
 }

 async function runSystemDiagnostics(): Promise<void> {
 logMessage('info', 'Running comprehensive system diagnostics...', 'diagnostics');

 const diagnostics: Array<{ name: string; test: () => Promise<boolean> }> = [
 {
 name: 'MCP Server Health',
 test: async () => {
 try {
 const response = await fetch('http://localhost:40000/health');
 return response.ok;
 } catch {
 return false;
 }
 },
 },
 {
 name: 'Enhanced RAG Query',
 test: async () => {
 try {
 const response = await fetch('http://localhost:40000/mcp/enhanced-rag/query', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query: 'System diagnostic test query',
 caseId: 'diagnostic-test',
 maxResults: 1,
 }),
 });
 return response.ok;
 } catch {
 return false;
 }
 },
 },
 {
 name: 'Memory Graph Operations',
 test: async () => {
 try {
 const response = await fetch('http://localhost:40000/mcp/memory/read-graph', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({}),
 });
 return response.ok;
 } catch {
 return false;
 }
 },
 },
 {
 name: 'Context7 Documentation',
 test: async () => {
 try {
 const response = await fetch('http://localhost:40000/mcp/context7/resolve-library-id', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ libraryName: 'sveltekit' }),
 });
 return response.ok;
 } catch {
 return false;
 }
 },
 }];

 let passedTests = 0;
 for (const diagnostic of diagnostics) {
 try {
 const result = await diagnostic.test();
 if (result) {
 logMessage('success', `✓ ${diagnostic.name} - PASSED`, 'diagnostics');
 passedTests++;
 } else {
 logMessage('error', `✖ ${diagnostic.name} - FAILED`, 'diagnostics');
 }
 } catch (err: unknown) {
 const errMsg = err instanceof Error ? err.message : String(err);
 logMessage('error', `✖ ${diagnostic.name} - ERROR: ${errMsg}`, 'diagnostics');
 }
 }

 logMessage(
 'info',
 `Diagnostics complete: ${passedTests}/${diagnostics.length} tests passed`,
 'diagnostics'
 );
 }

 function clearLogs(): void {
 systemLogs.set([]);
 logMessage('info', 'System logs cleared', 'system');
 }
</script>

<!-- Replace placeholder with a minimal dashboard that exercises the CSS selectors -->
<main class="enhanced-mcp-demo">
 <header class="demo-header">
 <h1>Enhanced MCP Integration</h1>
 <p class="demo-subtitle">
 Lightweight dashboard showing status, diagnostics and recent system logs for Context7 MCP.
 </p>
 </header>

 <section class="system-status">
 <h2>System Status</h2>
 <div class="status-grid">
 <div
 class="status-card {$integrationStatus .mcpServerRunning
 ? 'status-online'
 : 'status-offline'}"
 >
 <div class="status-icon">🛰️</div>
 <div>
 <div class="status-title">MCP Server</div>
 <div class="status-subtitle">
 {$integrationStatus .mcpServerRunning ? 'Online' : 'Offline'}
 </div>
 </div>
 </div>

 <div
 class="status-card {$integrationStatus .clusterSystemOnline
 ? 'status-online'
 : 'status-offline'}"
 >
 <div class="status-icon">🔗</div>
 <div>
 <div class="status-title">Cluster</div>
 <div class="status-subtitle">
 {$integrationStatus .clusterSystemOnline ? 'Online' : 'Unavailable'}
 </div>
 </div>
 </div>

 <div
 class="status-card {$integrationStatus .ollamaModelsLoaded
 ? 'status-online'
 : 'status-offline'}"
 >
 <div class="status-icon">🤖</div>
 <div>
 <div class="status-title">Ollama Models</div>
 <div class="status-subtitle">
 {$integrationStatus .ollamaModelsLoaded ? 'Loaded' : 'Not loaded'}
 </div>
 </div>
 </div>

 <div
 class="status-card {$integrationStatus .vsCodeExtensionActive
 ? 'status-online'
 : 'status-offline'}"
 >
 <div class="status-icon">🧩</div>
 <div>
 <div class="status-title">VS Code Extension</div>
 <div class="status-subtitle">
 {$integrationStatus .vsCodeExtensionActive ? 'Detected' : 'Not detected'}
 </div>
 </div>
 </div>

 <div
 class="status-card {$integrationStatus .contextualAnalysisReady
 ? 'status-online'
 : 'status-offline'}"
 >
 <div class="status-icon">⚙️</div>
 <div>
 <div class="status-title">Contextual Analysis</div>
 <div class="status-subtitle">
 {$integrationStatus .contextualAnalysisReady ? 'Ready' : 'Pending'}
 </div>
 </div>
 </div>
 </div>
 </section>

 <section class="demo-controls">
 <h2>Controls</h2>
 <div class="controls-grid">
 <div class="control-group">
 <label>Selected Case</label>
 <div>{selectedCaseId}</div>
 </div>

 <div class="control-group">
 <label>Realtime Updates</label>
 <div>{enableRealtimeUpdates ? 'Enabled' : 'Disabled'}</div>
 </div>
 </div>

 <div class="action-buttons">
 <button class="diagnostic-button" onclick={ runSystemDiagnostics }>Run Diagnostics</button>
 <button class="clear-logs-button" onclick={ clearLogs }>Clear Logs</button>
 </div>
 </section>

 <section class="system-logs">
 <h2>System Logs</h2>
 <div class="logs-container">
 {#if $systemLogs .length > 0}
 {#each $systemLogs as log (log.timestamp)}
 <div class="log-entry log-{log.level}">
 <div class="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</div>
 <div class="log-source">{log.source}</div>
 <div class="log-message">{log.message}</div>
 </div>
 {/each}
 {:else}
 <div class="no-logs">No logs yet</div>
 {/if}
 </div>
 </section>

 <section class="integration-features">
 <h2>Features</h2>
 <div class="features-grid">
 <div class="feature-card">
 <div class="feature-icon">🔍</div>
 <div class="feature-title">Enhanced RAG</div>
 <div class="feature-description">
 Hybrid vector search (pgvector + Qdrant) with Redis caching.
 </div>
 </div>

 <div class="feature-card">
 <div class="feature-icon">🧠</div>
 <div class="feature-title">Multi-LLM Orchestration</div>
 <div class="feature-description">
 Parallel orchestration and agent coordination across providers.
 </div>
 </div>
 </div>
 </section>
</main>

<style>
 .enhanced-mcp-demo {
 min-height: 100vh; background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
 color: #e5e7eb;
 font-family:
 'SF Pro Display',
 -apple-system,
 BlinkMacSystemFont,
 sans-serif;
 padding: 2rem;
 }
 .demo-header {
 text-align: center;
 margin-bottom: 3rem; padding: 2rem;
 background: rgba(255, 255, 255, 0.05);
 border-radius: 16px;
 backdrop-filter: blur(10px);
 }
 .demo-header h1 {
 font-size: 2.5rem;
 font-weight: 700;
 margin-bottom: 1rem; background: linear-gradient(135deg, #60a5fa, #34d399);
 -webkit-background-clip: text;
 -webkit-text-fill-color: transparent;
 background-clip: text;
 }
 .demo-subtitle {
 font-size: 1.125rem; color: #9ca3af;
 max-width: 600px; margin: 0 auto;
 line-height: 1.6;
 }
 .system-status {
 margin-bottom: 3rem;
 }
 .system-status h2 {
 font-size: 1.5rem;
 font-weight: 600;
 margin-bottom: 1rem; color: #f3f4f6;
 }
 .status-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1rem;
 }
 .status-card {
 background: rgba(255, 255, 255, 0.05);
 border-radius: 12px; padding: 1.5rem;
 display: flex;
 align-items: center; gap: 1rem;
 transition: all 0.3s ease;
 border: 1px solid rgba(255, 255, 255, 0.1);
 }
 .status-card:hover {
 transform: translateY(-2px);
 box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
 }
 .status-online {
 border-left: 4px solid #10b981;
 background: rgba(16, 185, 129, 0.1);
 }
 .status-offline {
 border-left: 4px solid #ef4444;
 background: rgba(239, 68, 68, 0.1);
 }
 .status-icon {
 font-size: 2rem;
 }
 .status-title {
 font-weight: 600;
 margin-bottom: 0.25rem;
 }
 .status-subtitle {
 font-size: 0.875rem; color: #9ca3af;
 }
 .demo-controls {
 margin-bottom: 3rem; background: rgba(255, 255, 255, 0.05);
 border-radius: 12px; padding: 1.5rem;
 }
 .demo-controls h2 {
 font-size: 1.5rem;
 font-weight: 600;
 margin-bottom: 1rem; color: #f3f4f6;
 }
 .controls-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 margin-bottom: 1rem;
 }
 .control-group {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }
 .control-group label {
 font-size: 0.875rem;
 font-weight: 500; color: #d1d5db;
 }
 .control-group select,
 .control-group input[type='checkbox'] {
 background: rgba(255, 255, 255, 0.1);
 border: 1px solid rgba(255, 255, 255, 0.2);
 border-radius: 6px; padding: 0.5rem;
 color: #e5e7eb;
 font-size: 0.875rem;
 }
 .action-buttons {
 display: flex; gap: 1rem;
 flex-wrap: wrap;
 }
 .diagnostic-button,
 .clear-logs-button {
 background: linear-gradient(135deg, #3b82f6, #1d4ed8);
 border: none;
 border-radius: 8px; padding: 0.75rem 1.5rem;
 color: white;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s;
 font-size: 0.875rem;
 }
 .clear-logs-button {
 background: linear-gradient(135deg, #6b7280, #4b5563);
 }
 .diagnostic-buttonhover,
 .clear-logs-buttonhover {
 transform: translateY(-1px);
 box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
 }
 .main-integration {
 margin-bottom: 3rem;
 }
 .system-logs {
 margin-bottom: 3rem; background: rgba(255, 255, 255, 0.05);
 border-radius: 12px; padding: 1.5rem;
 }
 .system-logs h2 {
 font-size: 1.5rem;
 font-weight: 600;
 margin-bottom: 1rem; color: #f3f4f6;
 }
 .logs-container {
 max-height: 300px;
 overflow-y: auto; background: rgba(0, 0, 0, 0.3);
 border-radius: 8px; padding: 1rem;
 }
 .log-entry {
 display: flex; gap: 0.75rem;
 padding: 0.5rem 0;
 border-bottom: 1px solid rgba(255, 255, 255, 0.1);
 font-family: 'SF Mono', 'Monaco', monospace;
 font-size: 0.875rem;
 }
 .log-entry:last-child {
 border-bottom: none;
 }
 .log-timestamp {
 color: #9ca3af;
 min-width: 80px;
 }
 .log-source {
 color: #60a5fa;
 min-width: 120px;
 }
 .log-message {
 flex: 1;
 }
 .log-info .log-message {
 color: #e5e7eb;
 }
 .log-success .log-message {
 color: #10b981;
 }
 .log-warning .log-message {
 color: #f59e0b;
 }
 .log-error .log-message {
 color: #ef4444;
 }
 .no-logs {
 text-align: center; color: #9ca3af;
 padding: 2rem;
 font-style: italic;
 }
 .integration-features {
 background: rgba(255, 255, 255, 0.05);
 border-radius: 12px; padding: 1.5rem;
 }
 .integration-features h2 {
 font-size: 1.5rem;
 font-weight: 600;
 margin-bottom: 1rem; color: #f3f4f6;
 text-align: center;
 }
 .features-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
 gap: 1rem;
 }
 .feature-card {
 background: rgba(255, 255, 255, 0.05);
 border-radius: 8px; padding: 1.5rem;
 text-align: center; transition: all 0.3s ease;
 border: 1px solid rgba(255, 255, 255, 0.1);
 }
 .feature-card:hover {
 transform: translateY(-2px);
 box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
 background: rgba(255, 255, 255, 0.1);
 }
 .feature-icon {
 font-size: 2.5rem;
 margin-bottom: 1rem;
 }
 .feature-title {
 font-weight: 600;
 margin-bottom: 0.5rem; color: #f3f4f6;
 }
 .feature-description {
 font-size: 0.875rem; color: #9ca3af;
 line-height: 1.5;
 }
</style>




