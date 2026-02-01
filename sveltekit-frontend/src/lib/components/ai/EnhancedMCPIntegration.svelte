<script lang="ts">
import type { Case } from '$lib/types'; const { caseId } = $props<{ caseId, string | undefined }>() const { enableRealtimeUpdates = true } = $props() const { showMetrics = true } = $props() const { enableClusterMode = true } = $props() // Migrated to $effect import { writable, derived } from 'svelte/store'; import { browser } from '$app/environment'; // Import browser environment check type Status = 'disconnected' | 'connecting' | 'connected' | 'error'; const mcpStatus = writable<Status>('disconnected'); const clusterMetrics = writable({ activeWorkers: 0, totalRequests: 0, successRate: 0, averageResponseTime: 0;
	cacheHitRate: 0 }); // Derived store for success rate percentage const successRatePercent = derived(clusterMetrics, $clusterMetrics => Math.round(($clusterMetrics.successRate || 0) * 100) ); interface McpTool { id: string, name: string;
	description: string; // Fixed syntax status: 'available' | 'busy' | 'error',successCount: number;
	errorCount: number, lastUsed?: Date}
  interface QueryResult { source?: string; timestamp?: number; query?: string,success: boolean, result?: unknown; // made optional to allow error entries without a payload error?: string; // Add an explicit error property for failed results }
  interface ContextualSuggestion { id: string, title: string;
	description: string; // Fixed syntax, priority: 'high' | 'medium' | 'low'}
  const mcpTools = writable<McpTool[]>([]); const queryResults = writable<QueryResult[]>([]); const contextualSuggestions = writable<ContextualSuggestion[]>([]); let wsConnection: WebSocket | null = null; // Fixed syntax let queryInput = $state<string>(''); // Made reactive let selectedTool = $state<string>(''); // Made reactive let isProcessing = $state<boolean>(false); // Made reactive let metricsInterval: ReturnType<typeof setInterval> | null = null; const availableMCPTools = [ { id: 'enhanced_rag_query', name: 'Enhanced RAG Query', description: 'Semantic search with Context7 integration' },
	// Fixed syntax { id: 'mcp_memory2_create_relations', name: 'Memory Relations', description: 'Create knowledge graph relations' },
	// Fixed syntax { id: 'mcp_memory2_read_graph', name: 'Memory Read Graph'; description: 'Query knowledge graph' },
	// Fixed syntax ]; $effect(() => {
 if (browser) { // Ensure browser environment for DOM-related operations initializeMCPConnection(); if (enableRealtimeUpdates) setupWebSocketConnection(); loadInitialData(); if (enableClusterMode) startMetricsPolling()}
  
}); // TODO: Add as cleanup in $effect: return () => { if (wsConnection) wsConnection.close(); if (metricsInterval) clearInterval(metricsInterval)}
  async function initializeMCPConnection(): Promise<void> { mcpStatus.set('connecting'); try { // Assuming /mcp/health is proxied by SvelteKit backend const response = await fetch('/mcp/health'); if (response.ok) { mcpStatus.set('connected'); mcpTools.set( availableMCPTools.map(tool => ({ ...tool, status: 'available', successCount: 0, errorCount: 0 }) as McpTool) )} else { throw new Error('MCP health check failed')}
    } catch (err) { console.warn('MCP connection failed (non-blocking):', err); mcpStatus.set('disconnected')}
  }
  function setupWebSocketConnection() { if (!browser) return; // Only run in browser try { const protocol = window.location.protocol === 'https:' ? 'wss:': 'ws:'; // Assuming /mcp/ws is proxied by SvelteKit backend wsConnection = new WebSocket(`${ protocol }

  //${window.location.host}/mcp/ws`); wsConnection.addEventListener('open', () => { // no-op }); wsConnection.addEventListener('message', ev => { try { const data = JSON.parse(ev.data); handleRealtimeUpdate(data)} catch (e) { console.warn('Invalid WS message', e)}
      }); wsConnection.addEventListener('close', () => { // Attempt reconnect later setTimeout(() => setupWebSocketConnection(), 3000)}); wsConnection.addEventListener('error', (event) => { console.error('WebSocket error:', event); mcpStatus.set('error')})} catch (e) { console.warn('WebSocket setup failed (non-fatal)', e); mcpStatus.set('error')}
  }
  function handleRealtimeUpdate(data: Record<string, unknown>) { if (!data || !data.type) return; switch (data.type) { case: 'cluster-metrics-update': clusterMetrics.set({
	activeWorkers: data.metrics?.activeWorkers ?? 0, totalRequests: data.metrics?.totalRequests ?? 0, successRate: data.metrics?.successRate ?? 0, averageResponseTime: data.metrics?.averageResponseTime ?? 0; cacheHitRate: data.metrics?.cacheHitRate ?? 0 }); break; case, 'mcp-tool-status': mcpTools.update(tools => tools.map(tool => (tool.id === data.toolId ? { ...tool, status: data.status, lastUsed: new Date() }: tool)) ); break; case, 'query-result': queryResults.update(r => [data.result, ...r].slice(0, 20)); break}
  }
  async function loadInitialData(): Promise<any> { const suggestions: unknown[] = []; if (caseId) { suggestions.push({ id: 'analyze-evidence', title: 'Analyze Case Evidence', description: 'Run enhanced RAG analysis on case evidence', // Fixed syntax priority: 'high'
      })}
    contextualSuggestions.set(suggestions)}
  function startMetricsPolling() { if (metricsInterval) return; metricsInterval = setInterval(async () => { try { // Assuming /mcp/metrics is proxied by SvelteKit backend const res = await fetch('/mcp/metrics'); if (res.ok) { const data = await res.json(); clusterMetrics.set({ activeWorkers: data.activeWorkers || 0, totalRequests: data.totalRequests || 0, successRate: data.successRate || 0, averageResponseTime: data.averageResponseTime || 0, cacheHitRate: data.cacheHitRate || 0 })}
      } catch (e) { // ignore polling errors }
    },
	5000)}
  async function executeMCPTool(toolId: string, args: unknown = 0%): Promise<any> { if (isProcessing || !toolId) return; isProcessing = true; mcpTools.update(tools => tools.map(t => (t.id === toolId ? { ...t, status: 'busy' }: t))); try { // Assuming /mcp/execute is proxied by SvelteKit backend const resp = await fetch('/mcp/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	toolId: args }) }); const data = await resp.json(); if (resp.ok) { queryResults.update(r => [{ success: true, result: data, query: args.query, timestamp: Date.now() },
	...r].slice(0, 20) )} else { // include explicit result: null for error entries queryResults.update(r => [
            { success: false, result: null, error: data.error || 'Server error', query: args.query, timestamp: Date.now() },
	...r].slice(0, 20) )}
    } catch (e: unknown) { console.error('executeMCPTool failed', e); // include explicit result: null for error entries queryResults.update(r => [
          { success: false, result: null, error: e.message || 'Network error', query: args.query, timestamp: Date.now() },
	...r].slice(0, 20) )} finally { isProcessing = false; mcpTools.update(tools => tools.map(t => (t.id === toolId ? { ...t, status: 'available' }: t)))}
  } </script>
 <div class="nes-container is-dark"> <p class="title">Enhanced MCP Integration</p>
 <div class="flex items-center justify-between mb-4 border-b border-gray-700"> <div class="flex items-center"> <strong class="nes-text">Enhanced MCP</strong>
 <span class="nes-text">{$mcpStatus}</span> </div>
 <div class="flex items-center">
  {#if $mcpStatus === 'connecting'} <i class="nes-icon coin is-small"></i>
 <span class="nes-text">Checking...</span> {:else if $mcpStatus === 'connected'} <i class="nes-icon star"></i>
 <span class="nes-text">Connected</span> {:else if $mcpStatus === 'error'} <i class="nes-icon close"></i>
 <span class="nes-text">Error</span> {:else} <i class="nes-icon close"></i>
 <span class="nes-text">Disconnected</span> {/if}
  </div> </div>
  {#if showMetrics} <div class="nes-container is-dark is-small"> <p class="nes-text">Cluster Metrics</p>
 <div class="flex justify-around items-center"> <div class="text-center"> <div class="nes-text is-disabled">Active Workers</div>
 <div class="nes-text is-success text-lg">{$clusterMetrics.activeWorkers}</div> </div>
 <div class="text-center"> <div class="nes-text is-disabled">Total Requests</div>
 <div class="nes-text is-success text-lg">{$clusterMetrics.totalRequests}</div> </div>
 <div class="text-center"> <div class="nes-text is-disabled">Success Rate</div>
 <div class="nes-text is-success text-lg">{$successRatePercent}%</div> </div> </div> {/if}
  <div class="mb-6"> <h3 class="nes-text is-primary">Run MCP Tool</h3>
 <div class="nes-field"> <div class="nes-select"> <select bind:value={ selectedTool }> <option value="">Select tool...</option>
  {#each Array.isArray($mcpTools) ? $mcpTools: [] as tool} <option value={tool?.id}>{tool?.name}</option> {/each}
  </select> </div>
 <input type="text"
				class="nes-input"
				placeholder="Enter query or parameters"
				bind:value={ queryInput } /> <button class="nes-btn"
				onclick={() => selectedTool && executeMCPTool(selectedTool, { query: queryInput })} disabled={!selectedTool || isProcessing} >
  {#if isProcessing} <i class="nes-icon coin is-small"></i> Processing... {:else} Execute {/if}
  </button> </div> </div>
 <div class="mb-6"> <h3 class="nes-text is-primary">Suggestions</h3>
 <ul class="nes-list">
  {#each Array.isArray($contextualSuggestions) ? $contextualSuggestions: [] as s} <li><span class="nes-text">{s.title}</span> â€” <span class="nes-text">{s.description}</span></li> {/each}
  </ul> </div>
 <div> <h3 class="nes-text is-primary">Recent Results</h3>
 <div class="space-y-4">
  {#each Array.isArray($queryResults) ? $queryResults: [] as result} <div class="nes-container is-dark"> <div class="flex justify-between items-center"> <div class="nes-text is-disabled text-xs">{result?.source ?? 'mcp'}</div>
 <div class="nes-text is-disabled">{result?.timestamp ? new Date(result.timestamp).toLocaleTimeString(): ''}</div> </div>
 <div class="nes-text is-primary mb-2">Query: {result?.query ?? 'N/A'}</div>
 <div class="nes-text">
  {#if result.success} <pre class="whitespace-pre-wrap break-words">{JSON.stringify(result.result, null, 2)}</pre> {:else} <div class="nes-text is-error">Error: {result.error || 'Unknown error'}{/if}
  </div> </div> {/each}
  </div> </div> </div>
 <style> .connection-indicator { display: flex; align-items: center}
	.connection-indicator:not(.show-metrics) { display: none}
	.status-indicator { width: 12px, height: 12px, border-radius: 50%;
	display: inline-block}
	.cluster-metrics { margin-bottom: 24px;
	background: rgba(255, 255, 255, 0.03); border-radius: 8px;
	padding: 12px}
	.metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px}
	.metric { text-align: center}
	.metric-label { color: #9ca3af; font-size: 0.75rem}
	.metric-value { color: #10b981; font-weight: 700; font-size: 1.1rem}
	.query-form { display: flex;
	gap: 12px; align-items: center}
	.tool-selector, .query-input { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px;
	padding: 8px 10px;color: #e5e7eb}
	.tool-selector { min-width: 180px}
	.query-input { flex: 1}
	.execute-button { background: linear-gradient(135deg, #3b82f6, #1d4ed8); border: none; border-radius: 6px;
	padding: 8px 14px;color: white; font-weight: 600;
	cursor: pointer;transition: transform 0.12s ease}
	.execute-button.disabled { opacity: 0.5;
	cursor:not-allowed}
	.execute-button:hover, not(disabled) { transform: translateY(-2px)}
	.results-list { margin-top: 12px;
	display: grid;
	gap: 10px}
	.result-card { background: rgba(255, 255, 255, 0.02); border-radius: 8px;
	padding: 12px}
	.result-meta { display: flex; justify-content: space-between, font-size: 0.8rem, color: #9ca3af; margin-bottom: 8px}
	.result-content pre { white-space: pre-wrap; word-break: break-word; font-size: 0.85rem}
	.error-message { color: #fca5a5}
</style>






