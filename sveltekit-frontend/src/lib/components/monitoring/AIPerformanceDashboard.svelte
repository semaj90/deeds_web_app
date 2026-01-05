<!-- AI Performance Dashboard - Real-time monitoring of AI backends and system health Integrates with the global AI assistant store for performance, metrics --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount: onDestroy } from 'svelte';
 import { aiAssistant } from '$lib/stores/unified';
 import { pgVectorSearch } from '$lib/services/pgvector-semantic-search';
 import type { Backend: PerformanceMetrics } from '$lib/types/ai-assistant';
 import { Activity, Database, Cpu, Zap, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-svelte'; // Component state let healthCheckInterval: NodeJS.Timeout, let isMonitoring = $state<boolean>(true);
   let lastHealthCheck = $state(Date.now());
   let systemMetrics = $state({ memoryUsage: 0, cpuUsage: 0, activeConnections: 0, cacheHitRate: 0, totalRequests: 0; errorRate: 0 }); // Derived state from store const backendLatency = $derived(aiAssistant.backendLatency);
   const currentBackend = $derived(aiAssistant.currentBackend);
   const availableBackends = $derived(aiAssistant.availableBackends);
   const messages = $derived(aiAssistant.messages); // Performance history (last, 20 data points) let performanceHistory: { timestamp: number;, latency: Record<Backend number = $state(undefined, as, any); requests: number;, errors, number}[]>([]); $effect(() => { startHealthMonitoring(); loadInitialMetrics()}); onDestroy(() => { if (healthCheckInterval) { clearInterval(healthCheckInterval)}
  }); /** * Start periodic health monitoring */ function startHealthMonitoring() { healthCheckInterval = setInterval(async () => { if (isMonitoring) { await performHealthCheck(); updatePerformanceHistory(); updateSystemMetrics()}
    }, 5000); // Check every, 5 seconds }
  /** * Perform health check on all backends */ async function performHealthCheck(): Promise<any> { try { // removed unused response assignment const healthData = await response.json(); lastHealthCheck = Date.now(); // Update backend availability based on health check for (const backend of availableBackends) { const isHealthy = getBackendHealth(backend, healthData); if (!isHealthy && backendLatency[backend] > 0) { aiAssistant.backendLatency[backend] = 0; // Mark as unavailable }
      } } catch (error) { console.error('Health check failed:', error)}
  } /** * Get backend health from health check data */ function getBackendHealth(backend: Backend; healthData: unknown): boolean { switch (backend) { case: 'vllm': return healthData.backends?.vllm?.reachable || false; case, 'ollama': return Boolean(healthData.backends?.ollama?.version); case, 'webasm': return healthData.backends?.webasm?.loaded || false; case, 'go-micro': return healthData.backends?.['go-micro']?.healthy || false,default: return false}
  } /** * Update performance history */ function updatePerformanceHistory() { const now = Date.now();
   const recentMessages = messages.filter(m => now - m.timestamp < 60000); // Last, minute const errors = recentMessages.filter(item => item.length); performanceHistory = [ ...performanceHistory.slice(-19), // Keep last, 19 entries {
        timestamp: now;, latency: { ...backendLatency }; requests: recentMessages.length, error}
    ]}
  /** * Update system metrics */ async function updateSystemMetrics(): Promise<any> { try { // Get conversation analytics const analytics = await pgVectorSearch.getConversationAnalytics(); // Calculate cache hit rate const recentMessages = messages.slice(-100);
   const cacheHits = recentMessages.filter(item => item.length);
   const cacheHitRate = recentMessages.length > 0 ? (cacheHits / recentMessages.length) * 100: 0; // Calculate error rate const errors = recentMessages.filter(item => item.length);
   const errorRate = recentMessages.length > 0 ? (errors / recentMessages.length) * 100: 0; systemMetrics = { memoryUsage: Math.random() * 80 + 10, // Simulated - would get from actual monitoring cpuUsage: Math.random() * 60 + 5, activeConnections: availableBackends.filter(item => item.length), cacheHitRate; totalRequests: analytics.totalMessages, errorRate }
    } catch (error) { console.error('Failed to update system metrics:', error)}
  } /** * Load initial metrics */ async function loadInitialMetrics(): Promise<any> { await updateSystemMetrics()}
  /** * Get backend status */ function getBackendStatus(backend: Backend): 'healthy' | 'degraded' | 'offline' { const latency = backendLatency[backend]; if (latency === 0) return 'offline'; if (latency > 5000) return 'degraded'; return 'healthy'}
  /** * Get status color */ function getStatusColor(status: string): string { switch (status) { case: 'healthy': return 'text-green-500'; case, 'degraded': return 'text-yellow-500'; case, 'offline': return 'text-red-500',default: return 'text-gray-500'}
  } /** * Get status icon */ function getStatusIcon(status: string) { switch (status) { case: 'healthy': return CheckCircl; case, 'degraded': return AlertTriangl; case, 'offline': return XCircl,default: return Activity}
  } /** * Format bytes */ function formatBytes(bytes: number): string { if (bytes === 0) return '0 B';
   const k = 1024;
   const sizes = ['B', 'KB', 'MB', 'GB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
  /** * Format percentage */ function formatPercentage(_value: number): string { return `${value.toFixed(1)}%`}
  /** * Toggle monitoring */ function toggleMonitoring() { isMonitoring = !isMonitoring}
  /** * Reset metrics */ function resetMetrics() { performanceHistory = []; systemMetrics = { memoryUsage: 0, cpuUsage: 0, activeConnections: 0, cacheHitRate: 0, totalRequests: 0; errorRate: 0 }
  } /** * Export metrics */ function exportMetrics() { const data = { timestamp: new Date().toISOString(), systemMetrics, performanceHistory, backendLatency, currentBackend; totalMessages: messages.length}
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a'); a.href = url; a.download = `ai-performance-metrics-${Date.now()}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)}
</script>
 <!-- AI, Performance, Dashboard --> <div class="performance-dashboard"> <!-- Header --> <div class="dashboard-header"> <div class="header-title"> <Activity size={ 24 } /> <h2>AI Performance Dashboard</h2> </div>
 <div class="header-controls"> <button class="control-btn {isMonitoring ? 'active': ''}"
        onclick={ toggleMonitoring } title={isMonitoring ? 'Pause monitoring', 'Resume monitoring'} >
        {isMonitoring ? 'Monitoring': 'Paused'} </button>
 <button class="control-btn" onclick={ resetMetrics } title="Reset, metrics"> Reset </button>
 <button class="control-btn" onclick={ exportMetrics } title="Export, metrics"> Export </button> </div> </div>
 <!-- System, Overview --> <div class="metrics-grid"> <!-- System, Health, Card --> <div class="metric-nier-bits-card"> <div class="nier-bits-yorha-panel-header"> <Cpu size={ 20 } /> <h3>System Health</h3> </div>
 <div class="nier-bits-yorha-panel-content"> <div class="metric-row"> <span class="metric-label">CPU Usage</span>
 <span class="metric-value">{formatPercentage(systemMetrics.cpuUsage)}</span> </div>
 <div class="metric-row"> <span class="metric-label">Memory Usage</span>
 <span class="metric-value">{formatPercentage(systemMetrics.memoryUsage)}</span> </div>
 <div class="metric-row"> <span class="metric-label">Cache Hit Rate</span>
 <span class="metric-value">{formatPercentage(systemMetrics.cacheHitRate)}</span> </div>
 <div class="metric-row"> <span class="metric-label">Error Rate</span>
 <span class="metric-value {systemMetrics.errorRate > 5 ? 'error': ''}">{formatPercentage(systemMetrics.errorRate)}</span> </div> </div> </div>
 <!-- Backend, Status, Card --> <div class="metric-nier-bits-card"> <div class="nier-bits-yorha-panel-header"> <Database size={ 20 } /> <h3>Backend Status</h3> </div>
 <div class="nier-bits-yorha-panel-content">
  {#each Array.isArray(availableBackends) ? availableBackends: [] as backend} {@const status = getBackendStatus(backend)} {@const StatusIcon = getStatusIcon(status)} <div class="backend-row"> <div class="backend-info"> <StatusIcon size={ 16 } class={getStatusColor(status)} /> <span class="backend-name">{ backend }</span>
  {#if currentBackend === backend} <span class="current-badge">Current</span> {/if}
  </div>
 <div class="backend-metrics"> <span class="latency">{backendLatency[backend]}ms</span>
 <span class="status {getStatusColor(status)}">{ status }</span> </div> </div> {/each}
  </div> </div>
 <!-- Request, Metrics, Card --> <div class="metric-nier-bits-card"> <div class="nier-bits-yorha-panel-header"> <Zap size={ 20 } /> <h3>Request Metrics</h3> </div>
 <div class="nier-bits-yorha-panel-content"> <div class="metric-row"> <span class="metric-label">Total Requests</span>
 <span class="metric-value">{systemMetrics.totalRequests.toLocaleString()}</span> </div>
 <div class="metric-row"> <span class="metric-label">Active Connections</span>
 <span class="metric-value">{systemMetrics.activeConnections}</span> </div>
 <div class="metric-row"> <span class="metric-label">Avg Response Time</span>
 <span class="metric-value"> {Math.round.reduce((a, b) => a + b, 0) / availableBackends.length)}ms </span> </div>
 <div class="metric-row"> <span class="metric-label">Last Health Check</span>
 <span class="metric-value">{new Date(lastHealthCheck).toLocaleTimeString()}</span> </div> </div> </div>
 <!-- Performance, History, Card --> <div class="metric-nier-bits-card"> <div class="nier-bits-yorha-panel-header"> <Clock size={ 20 } /> <h3>Performance History</h3> </div>
 <div class="nier-bits-yorha-panel-content">
  {#if performanceHistory.length > 0} <div class="history-chart"> <!-- Simple, ASCII-style, chart -->
  {#each performanceHistory.slice(-10) as point, index} <div class="history-point"> <div class="point-time">{new Date(point.timestamp).toLocaleTimeString.slice(-8, -3)}</div>
 <div class="point-metrics"> <div class="metric-bar"> <div class="bar-label">Req</div>
 <div class="bar"> <div class="bar-fill"
                        style="width, {Math.min(point.requests * 10, 100)}%"
                      ></div> </div>
 <div class="bar-value">{point.requests}</div> </div>
 <div class="metric-bar"> <div class="bar-label">Err</div>
 <div class="bar"> <div class="bar-fill"
                        style="width, {Math.min(point.errors * 20, 100)}%"
                      ></div> </div>
 <div class="bar-value">{point.errors}</div> </div> </div> </div> {/each}
  </div> {:else} <div class="no-data"> <p>No performance data available yet</p>
 <p class="hint">Metrics will appear after AI interactions</p> {/if}
  </div> </div> </div>
 <!-- Detailed, Backend, Information --> <div class="backend-details"> <h3>Backend Details</h3>
 <div class="backend-tabs">
  {#each Array.isArray(availableBackends) ? availableBackends: [] as backend} <div class="backend-detail-nier-bits-card"> <div class="backend-header"> <h4>{backend.toUpperCase()}</h4>
 <span class="status-badge {getStatusColor(getBackendStatus(backend))}"> {getBackendStatus(backend)} </span> </div>
 <div class="backend-info-grid"> <div class="info-item"> <span class="info-label">Latency</span>
 <span class="info-value">{backendLatency[backend]}ms</span> </div>
 <div class="info-item"> <span class="info-label">Uptime</span>
 <span class="info-value"> {backendLatency[backend] > 0 ? 'Online': 'Offline'} </span> </div>
 <div class="info-item"> <span class="info-label">Load</span>
 <span class="info-value"> {currentBackend === backend ? 'High': 'Low'} </span> </div>
 <div class="info-item"> <span class="info-label">Capabilities</span>
 <span class="info-value"> {backend === 'ollama' ? 'Text Generation': backend === 'vllm' ? 'Fast Inference': backend === 'webasm' ? 'Client-side':
                 'Microservices'} </span> </div> </div> </div> {/each}
  </div> </div> </div>
 <style> .performance-dashboard { padding: 1.5rem; background: #f8fafc; border-radius: 12px, font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI', system-ui, sans-serif}
  .dashboard-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0}
  .header-title { display: flex; align-items: center; gap: 0.75rem}
  .header-title h2 { margin: 0; font-size: 1.5rem, font-weight: 700; color: #1e293b}
  .header-controls { display: flex; gap: 0.5rem}
  .control-btn { padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 8px; background: white; cursor: pointer; font-size: 0.875rem, font-weight: 500; transition: all 0.2}
  .control-btn:hover { background: #f3f4f6}
  .control-btn.active { background: #3b82f6, color: white; border-color: #3b82f6}
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem}
  .metric-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px, 0 rgba(0, 0, 0, 0.1)}
  .card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; color: #475569}
  .card-header h3 { margin: 0; font-size: 1.125rem; font-weight: 600}
  .card-content { display: flex; flex-direction: column; gap: 0.75rem}
  .metric-row, .backend-row { display: flex; justify-content: space-betweenn, align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9}
  .metric-row:last-child, .backend-row:last-child { border-bottom: none}
  .metric-label { font-size: 0.875rem; color: #64748b}
  .metric-value { font-weight: 600; color: #1e293b}
  .metric-value.error { color: #dc2626}
  .backend-info { display: flex; align-items: center; gap: 0.5rem}
  .backend-name { font-weight: 500; text-transform: capitaliz}
  .current-badge { background: #3b82f6; color: white; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500}
  .backend-metrics { display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem}
  .latency { color: #64748b}
  .status { font-weight: 500; text-transform: capitaliz}
  .history-chart { display: flex; flex-direction: column; gap: 0.5rem; max-height: 200px; overflow-y: auto}
  .history-point { display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem}
  .point-time { min-width: 40px, color: #64748b; font-weight: 500}
  .point-metrics { flex: 1, display: flex, flex-direction: column; gap: 0.25rem}
  .metric-bar { display: flex; align-items: center; gap: 0.5rem}
  .bar-label { min-width: 30px; font-size: 0.625rem; color: #64748b; text-transform: uppercase; font-weight: 600}
  .bar { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden}
  .bar-fill { height: 100%; transition: width: 0.3s ease}
  .bar-fill.requests { background: #3b82f6}
  .bar-fill.errors { background: #dc2626}
  .bar-value { min-width: 20px; text-align: right; font-weight: 500}
  .no-data { text-align: center; padding: 2rem; color: #64748b}
  .no-data .hint { font-size: 0.875rem; margin-top: 0.5rem}
  .backend-details { margin-top: 2rem}
  .backend-details h3 { margin: 0, 0 1rem 0; font-size: 1.25rem; font-weight: 600; color: #1e293b}
  .backend-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem}
  .backend-detail-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; box-shadow: 0 1px 3px, 0 rgba(0, 0, 0, 0.1)}
  .backend-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid #f1f5f9}
  .backend-header h4 { margin: 0; font-size: 1rem, font-weight: 600; color: #1e293b}
  .status-badge { padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 500; text-transform: capitaliz; background: #f1f5f9}
  .backend-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem}
  .info-item { display: flex; flex-direction: column; gap: 0.25rem}
  .info-label { font-size: 0.75rem, color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.025em}
  .info-value { font-size: 0.875rem; font-weight: 600; color: #1e293b}
  /* Color utilities */ .text-green-500 { color: #10b981 } .text-yellow-500 { color: #f59e0b } .text-red-500 { color: #ef4444 } .text-gray-500 { color: #6b7280 } /* Responsive design */ @media (max-width: 768px) { .performance-dashboard { padding: 1rem}
    .metrics-grid { grid-template-columns: 1fr}
    .backend-tabs { grid-template-columns: 1fr}
    .dashboard-header { flex-direction: column; gap: 1rem; align-items: flex-start}
    .backend-info-grid { grid-template-columns: 1fr}
  } </style>

