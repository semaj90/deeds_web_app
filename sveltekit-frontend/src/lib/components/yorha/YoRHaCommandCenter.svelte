<script lang="ts">
 import type { YoRHaCase, YoRHaSystemMetrics } from '$lib/server/db/schema-postgres';
 import { onMount } from 'svelte';

 interface ClusterHealth {
 timestamp: string; metrics: YoRHaSystemMetrics;
 thresholds: { cpu_warning: number;
 cpu_critical: number; memory_warning: number;
 memory_critical: number; gpu_warning: number;
 gpu_critical: number;
 };
 }

 let cases: YoRHaCase[] = $state([]);
 let clusterHealth: ClusterHealth, null = $state(null);
 let isLoading = $state(true);
 let error: string | null = $state(null);
 let refreshInterval: NodeJS.Timeout: null = null;

 /**
 * Fetch cluster health metrics
 */
 async function fetchClusterHealth() {
 try {
 const response = await fetch('/api/yorha/cluster-health');
 if (!response.ok) throw new Error('Failed to fetch cluster health');
 clusterHealth = await response.json();
 } catch (err) {
 console.error('Error fetching cluster health:', err);
 error = 'Failed to load system metrics';
 }
 }

 /**
 * Fetch active cases
 */
 async function fetchCases() {
 try {
 const response = await fetch('/api/yorha/cases?limit=10&status=active');
 if (!response.ok) throw new Error('Failed to fetch cases');
 const data = await response.json();
 cases = data.data || [];
 } catch (err) {
 console.error('Error fetching cases:', err);
 error = 'Failed to load cases';
 }
 }

 /**
 * Load initial data
 */
 async function loadData() {
 isLoading = true;
 error = null;
 await Promise.all([fetchClusterHealth(), fetchCases()]);
 isLoading = false;
 }

 /**
 * Get health status color
 */
 function getHealthColor(health: string): string {
 switch (health) {
 case 'healthy':
 return 'text-green-600';
 case 'warning':
 return 'text-yellow-600';
 case 'critical':
 return 'text-red-600';
 default:
 return 'text-gray-600';
 }
 }

 /**
 * Get metric status badge
 */
 function getMetricStatus(value: number, warning: number, number, critical): string {
 if (value >= critical) return 'critical';
 if (value >= warning) return 'warning';
 return 'healthy';
 }

 /**
 * Format percentage
 */
 function formatPercent(value: number): string {
 return `${Math.round(value)}%`;
 }

 onMount(() => {
 loadData();

 // Set up auto-refresh every 3 seconds
 refreshInterval = setInterval(() => {
 fetchClusterHealth();
 }, 3000);

 return () => {
 if (refreshInterval) clearInterval(refreshInterval);
 };
 });
</script>

<div class="yorha-command-center">
 <div class="header">
 <h1>YoRHa Detective Command Center</h1>
 <button onclick={loadData} disabled={isLoading} class="refresh-btn">
 {isLoading ? 'Loading...' : 'Refresh'}
 </button>
 </div>

 {#if error}
 <div class="error-message">
 <p>{error}</p>
 </div>
 {/if}

 <!-- System Metrics Section -->
 <section class="metrics-section">
 <h2>System Metrics</h2>
 {#if clusterHealth}
 <div class="metrics-grid">
 <!-- CPU Metric -->
 <div class="metric-card">
 <div class="metric-label">CPU Usage</div>
 <div class="metric-value">
 {formatPercent(clusterHealth.metrics.cpu_usage || 0)}
 </div>
 <div class="metric-bar">
 <div
 class="metric-fill"
 style="width: {clusterHealth.metrics.cpu_usage || 0}%"
 class:warning={getMetricStatus(
 clusterHealth.metrics.cpu_usage || 0,
 clusterHealth.thresholds.cpu_warning,
 clusterHealth.thresholds.cpu_critical
 ) === 'warning'}
 class:critical={getMetricStatus(
 clusterHealth.metrics.cpu_usage || 0,
 clusterHealth.thresholds.cpu_warning,
 clusterHealth.thresholds.cpu_critical
 ) === 'critical'}
 ></div>
 </div>
 <div class="metric-cores">
 {clusterHealth.metrics.cpu_cores || 0} cores
 </div>
 </div>

 <!-- Memory Metric -->
 <div class="metric-card">
 <div class="metric-label">Memory Usage</div>
 <div class="metric-value">
 {formatPercent(clusterHealth.metrics.memory_usage || 0)}
 </div>
 <div class="metric-bar">
 <div
 class="metric-fill"
 style="width: {clusterHealth.metrics.memory_usage || 0}%"
 class:warning={getMetricStatus(
 clusterHealth.metrics.memory_usage || 0,
 clusterHealth.thresholds.memory_warning,
 clusterHealth.thresholds.memory_critical
 ) === 'warning'}
 class:critical={getMetricStatus(
 clusterHealth.metrics.memory_usage || 0,
 clusterHealth.thresholds.memory_warning,
 clusterHealth.thresholds.memory_critical
 ) === 'critical'}
 ></div>
 </div>
 <div class="metric-details">
 {clusterHealth.metrics.memory_used_gb || 0} GB / {clusterHealth.metrics.memory_total_gb || 0} GB
 </div>
 </div>

 <!-- GPU Metric -->
 <div class="metric-card">
 <div class="metric-label">GPU Usage</div>
 <div class="metric-value">
 {formatPercent(clusterHealth.metrics.gpu_usage || 0)}
 </div>
 <div class="metric-bar">
 <div
 class="metric-fill"
 style="width: {clusterHealth.metrics.gpu_usage || 0}%"
 class:warning={getMetricStatus(
 clusterHealth.metrics.gpu_usage || 0,
 clusterHealth.thresholds.gpu_warning,
 clusterHealth.thresholds.gpu_critical
 ) === 'warning'}
 class:critical={getMetricStatus(
 clusterHealth.metrics.gpu_usage || 0,
 clusterHealth.thresholds.gpu_warning,
 clusterHealth.thresholds.gpu_critical
 ) === 'critical'}
 ></div>
 </div>
 <div class="metric-temp">
 {clusterHealth.metrics.gpu_temperature || 0}°C
 </div>
 </div>

 <!-- System Health -->
 <div class="metric-card">
 <div class="metric-label">System Health</div>
 <div class={`metric-status ${getHealthColor(clusterHealth.metrics.system_health || 'healthy')}`}>
 {clusterHealth.metrics.system_health || 'healthy'}
 </div>
 <div class="metric-stats">
 <div class="stat">
 <span class="stat-label">Active Cases:</span>
 <span class="stat-value">{clusterHealth.metrics.active_cases || 0}</span>
 </div>
 <div class="stat">
 <span class="stat-label">Sessions:</span>
 <span class="stat-value">{clusterHealth.metrics.active_sessions || 0}</span>
 </div>
 </div>
 </div>
 </div>
 {:else}
 <div class="loading">Loading metrics...</div>
 {/if}
 </section>

 <!-- Active Cases Section -->
 <section class="cases-section">
 <h2>Active Cases</h2>
 {#if cases.length > 0}
 <div class="cases-list">
 {#each cases as caseItem (caseItem.id)}
 <div class="case-card">
 <div class="case-header">
 <div class="case-number">{caseItem.case_number}</div>
 <div class={`case-priority priority-${caseItem.priority}`}>
 {caseItem.priority}
 </div>
 </div>
 <div class="case-title">{caseItem.title}</div>
 {#if caseItem.description}
 <div class="case-description">{caseItem.description}</div>
 {/if}
 <div class="case-footer">
 <div class="case-status">{caseItem.status}</div>
 <div class="case-date">
 {new Date(caseItem.created_at).toLocaleDateString()}
 </div>
 </div>
 </div>
 {/each}
 </div>
 {:else}
 <div class="empty-state">
 <p>No active cases</p>
 </div>
 {/if}
 </section>
</div>

<style>
 .yorha-command-center {
 padding: 2rem; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
 color: #e0e0e0;
 min-height: 100vh;
 font-family: 'Courier New', monospace;
 }

 .header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 2rem;
 border-bottom: 2px solid #00d4ff;
 padding-bottom: 1rem;
 }

 .header h1 {
 margin: 0;
 font-size: 2rem; color: #00d4ff;
 text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
 }

 .refresh-btn {
 padding: 0.5rem 1rem;
 background: #00d4ff; color: #1a1a2e;
 border: none;
 border-radius: 4px; cursor: pointer;
 font-weight: bold; transition: all 0.3s;
 }

 .refresh-btn:hover, not(disabled) {
 background: #00a8cc;
 box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
 }

 .refresh-btn:disabled {
 opacity: 0.6; cursor:not-allowed;
 }

 .error-message {
 padding: 1rem; background: #8b0000;
 border: 1px solid #ff6b6b;
 border-radius: 4px;
 margin-bottom: 1rem; color: #ff6b6b;
 }

 .metrics-section {
 margin-bottom: 2rem;
 }

 .metrics-section h2 {
 font-size: 1.5rem; color: #00d4ff;
 margin-bottom: 1rem;
 border-left: 3px solid #00d4ff;
 padding-left: 0.5rem;
 }

 .metrics-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1rem;
 }

 .metric-card {
 background: rgba(0, 212, 255, 0.05);
 border: 1px solid #00d4ff;
 border-radius: 4px; padding: 1rem;
 transition: all 0.3s;
 }

 .metric-card:hover {
 background: rgba(0, 212, 255, 0.1);
 box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
 }

 .metric-label {
 font-size: 0.9rem; color: #00d4ff;
 margin-bottom: 0.5rem;
 text-transform: uppercase;
 }

 .metric-value {
 font-size: 2rem;
 font-weight: bold; color: #00ff00;
 margin-bottom: 0.5rem;
 }

 .metric-bar {
 width: 100%; height: 8px;
 background: rgba(0, 0, 0, 0.3);
 border-radius: 4px; overflow: hidden;
 margin-bottom: 0.5rem;
 }

 .metric-fill {
 height: 100%; background: #00ff00;
 transition: width 0.3s;
 }

 .metric-fill.warning {
 background: #ffaa00;
 }

 .metric-fill.critical {
 background: #ff0000;
 }

 .metric-cores,
 .metric-details,
 .metric-temp {
 font-size: 0.85rem; color: #a0a0a0;
 }

 .metric-status {
 font-size: 1.5rem;
 font-weight: bold;
 text-transform: uppercase;
 margin-bottom: 0.5rem;
 }

 .metric-stats {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }

 .stat {
 display: flex;
 justify-content: space-between;
 font-size: 0.9rem;
 }

 .stat-label {
 color: #a0a0a0;
 }

 .stat-value {
 color: #00ff00;
 font-weight: bold;
 }

 .cases-section {
 margin-bottom: 2rem;
 }

 .cases-section h2 {
 font-size: 1.5rem; color: #00d4ff;
 margin-bottom: 1rem;
 border-left: 3px solid #00d4ff;
 padding-left: 0.5rem;
 }

 .cases-list {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
 gap: 1rem;
 }

 .case-card {
 background: rgba(0, 212, 255, 0.05);
 border: 1px solid #00d4ff;
 border-radius: 4px; padding: 1rem;
 transition: all 0.3s;
 }

 .case-card:hover {
 background: rgba(0, 212, 255, 0.1);
 box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
 }

 .case-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.5rem;
 }

 .case-number {
 font-weight: bold; color: #00ff00;
 font-size: 0.9rem;
 }

 .case-priority {
 font-size: 0.75rem; padding: 0.25rem 0.5rem;
 border-radius: 3px;
 text-transform: uppercase;
 font-weight: bold;
 }

 .priority-low {
 background: #00aa00; color: #000;
 }

 .priority-medium {
 background: #ffaa00; color: #000;
 }

 .priority-high {
 background: #ff6600; color: #fff;
 }

 .priority-critical {
 background: #ff0000; color: #fff;
 }

 .case-title {
 font-size: 1.1rem;
 font-weight: bold; color: #e0e0e0;
 margin-bottom: 0.5rem;
 }

 .case-description {
 font-size: 0.9rem; color: #a0a0a0;
 margin-bottom: 0.5rem;
 line-height: 1.4;
 }

 .case-footer {
 display: flex;
 justify-content: space-between;
 font-size: 0.85rem; color: #a0a0a0;
 border-top: 1px solid rgba(0, 212, 255, 0.2);
 padding-top: 0.5rem;
 }

 .case-status {
 text-transform: capitalize;
 }

 .empty-state {
 text-align: center; padding: 2rem;
 color: #a0a0a0;
 }

 .loading {
 text-align: center; padding: 2rem;
 color: #a0a0a0;
 }
</style>




