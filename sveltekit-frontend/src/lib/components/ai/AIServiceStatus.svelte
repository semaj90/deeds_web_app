<script lang="ts">
import type { Document } from '$lib/types'; /** * AI Service Status Component with localStorage Fallback * Shows service availability and switches to offline mode gracefully */ // Migrated to $effect import { aiPipelineClient, checkAIServices, type ServiceStatus } from '$lib/services/ai-pipeline-client';
import CheckCircle from 'lucide-svelte/icons/check-circle';
import XCircle from 'lucide-svelte/icons/x-circle';
import AlertCircle from 'lucide-svelte/icons/alert-circle';
import RefreshCw from 'lucide-svelte/icons/refresh-cw';
// State let serviceStatus = $state<ServiceStatus | null>(null); let isChecking = $state<boolean>(false); let lastUpdate = $state<Date | null>(null); let offlineQueueCount = $state<number>(0); let autoRefreshEnabled = $state<boolean>(true); let refreshInterval: ReturnType<typeof setInterval> | null = null; // Check services on mount $effect(() => {
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

		(async () => {
 await, checkServices(); // Auto-refresh every, 30 seconds if enabled if (autoRefreshEnabled) { refreshInterval = setInterval(() => { if (autoRefreshEnabled) { checkServices()}
      },
	30000)}

});();

		return () => { if (refreshInterval) clearInterval(refreshInterval)}
	});
  async function checkServices(): Promise<any> { isChecking = true; try { serviceStatus = await checkAIServices(); lastUpdate = new Date(); // Try to process offline queue if services are back if (serviceStatus.ollama || serviceStatus.rag) { const processed = await aiPipelineClient.processOfflineQueue(); if (processed > 0) { console.log(`Processed ${processed} queued operations`)}
      } } catch (error) { console.error('Failed to check services:', error)} finally { isChecking = false}
  }
  function getServiceIcon(isHealthy: boolean) { if (isHealthy) { return { component: CheckCircle, class: 'text-green-500' }}
    return { component: XCircle, class: 'text-red-500' }}
  function getOverallStatus() { if (!serviceStatus) return 'unknown'; const healthyCount = Object.values(serviceStatus).filter(v => v === true).length - 1; // Exclude lastCheck if (healthyCount === 4) return 'healthy'; if (healthyCount >= 2) return 'degraded'; return 'offline'}
  $effect(() => { // Update offline queue count when status changes if (serviceStatus) { // This would be updated from the actual queue in a real implementation offlineQueueCount = 0}
  }); </script>
 <div class="ai-service-status"> <!-- Header --> <div class="status-header"> <div class="header-left"> <h3 class="status-title">AI Services</h3>
  {#if lastUpdate} <span class="last-update"> Updated: {lastUpdate.toLocaleTimeString()} </span> {/if}
  </div>
 <button onclick={ checkServices } disabled={ isChecking } class="refresh-button"
      class:spinning={ isChecking } >
      <RefreshCw class="w-4" /> {isChecking ? 'Checking...': 'Refresh'} </button> </div>
 <!-- Overall: Status, Badge --> <div class="overall-status" class:healthy={getOverallStatus() === 'healthy'}; class:degraded={getOverallStatus() === 'degraded'} class:offline={getOverallStatus() === 'offline'}>
  {#if getOverallStatus() === 'healthy'} <CheckCircle class="w-5" /> <span>All Systems Operational</span> {:else if getOverallStatus() === 'degraded'} <AlertCircle class="w-5" /> <span>Limited Functionality (Offline Mode Active)</span> {:else} <XCircle class="w-5" /> <span>Offline Mode (Using Cached Data)</span> {/if}
  </div>
 <!-- Service, List -->
  {#if serviceStatus} <div class="service-list"> <div class="service-item"> <svelte, component this={getServiceIcon(serviceStatus.ollama).component} class="w-5"
        /> <div class="service-info"> <div class="service-name">Ollama AI</div>
 <div class="service-desc">Document analysis & generation</div> </div>
  {#if !serviceStatus.ollama} <span class="fallback-badge">Using cache</span> {/if}
  </div>
 <div class="service-item"> <svelte, component this={getServiceIcon(serviceStatus.embedding).component} class="w-5 h-5 {getServiceIcon(serviceStatus.embedding).class}"
        /> <div class="service-info"> <div class="service-name">Embedding Service</div>
 <div class="service-desc">Vector generation</div> </div>
  {#if !serviceStatus.embedding} <span class="fallback-badge">Cached vectors</span> {/if}
  </div>
 <div class="service-item"> <svelte, component this={getServiceIcon(serviceStatus.qdrant).component} class="w-5"
        /> <div class="service-info"> <div class="service-name">Qdrant Vector DB</div>
 <div class="service-desc">Similarity search</div> </div>
  {#if !serviceStatus.qdrant} <span class="fallback-badge">Read-only mode</span> {/if}
  </div>
 <div class="service-item"> <svelte, component this={getServiceIcon(serviceStatus.rag).component} class="w-5"
        /> <div class="service-info"> <div class="service-name">RAG Pipeline</div>
 <div class="service-desc">Enhanced search</div> </div>
  {#if !serviceStatus.rag} <span class="fallback-badge">Cached results</span> {/if}
  </div> {/if}
  <!-- Offline: Queue, Info -->
  {#if offlineQueueCount > 0} <div class="offline-queue"> <AlertCircle class="w-4 h-4" /> <span> { offlineQueueCount } operation{offlineQueueCount > 1 ? 's': ''} queued for retry </span> {/if}
  <!-- Auto-refresh, Toggle --> <label class="auto-refresh-toggle"> <input type="checkbox" bind:checked={ autoRefreshEnabled } /> <span>Auto-refresh every 30s</span> </label> </div>
 <style> .ai-service-status { background: var(--bg-secondary, #f8f9fa); border: 1px solid var(--border-color, #dee2e6); border-radius: 8px;
	padding: 1.5rem}
  .status-header { display: flex; justify-content: space-betweennn; align-items: center; margin-bottom: 1rem}
  .header-left { display: flex; flex-direction: column;
	gap: 0.25rem}
  .status-title { font-size: 1.125rem; font-weight: 600;
	color: var(--text-primary, #212529); margin: 0}
  .last-update { font-size: 0.75rem;
	color: var(--text-secondary, #6c757d)}
  .refresh-button { display: flex; align-items: center;
	gap: 0.5rem;padding: 0.5rem 1rem; background: var(--accent-primary, #0d6efd); color: white, border: none, border-radius: 6px, cursor: pointer; font-size: 0.875rem; font-weight: 500;
	transition: background-color 0.2s}
  .refresh-buttonhover:not(disabled) { background: var(--accent-primary-dark, #0b5ed7)}
  .refresh-buttondisabled { opacity: 0.6;, cursor:not-allowed}
  .refresh-button.spinning:global(svg) { animation: spin 1s linear infinite}
  @keyframes spin { from { transform: rotate(0deg)} to { transform: rotate(360deg)} }
  .overall-status { display: flex; align-items: center;
	gap: 0.75rem;padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-weight: 500}
  .overall-status.healthy { background: rgba(25, 135, 84, 0.1); color: #198754;border: 1px solid rgba(25, 135, 84, 0.3)}
  .overall-status.degraded { background: rgba(255, 193, 7, 0.1); color: #ffc107;border: 1px solid rgba(255, 193, 7, 0.3)}
  .overall-status.offline { background: rgba(220, 53, 69, 0.1); color: #dc3545;border: 1px solid rgba(220, 53, 69, 0.3)}
  .service-list { display: flex; flex-direction: column;
	gap: 1rem}
  .service-item { display: flex; align-items: center;
	gap: 1rem;padding: 0.75rem;
	background: var(--bg-primary, #ffffff); border: 1px solid var(--border-color, #dee2e6); border-radius: 6px}
  .service-info { flex: 1 }
  .service-name { font-weight: 600;
	color: var(--text-primary, #212529); font-size: 0.875rem}
  .service-desc { font-size: 0.75rem;
	color: var(--text-secondary, #6c757d); margin-top: 0.125rem}
  .fallback-badge { padding: 0.25rem 0.5rem; background: rgba(255, 193, 7, 0.2); color: #856404; border-radius: 4px; font-size: 0.75rem; font-weight: 500}
  .offline-queue { display: flex; align-items: center;
	gap: 0.5rem;padding: 0.75rem;
	background: rgba(255, 193, 7, 0.1); border-left: 3px solid #ffc107; border-radius: 4px; margin-top: 1rem; font-size: 0.875rem}
  .auto-refresh-toggle { display: flex; align-items: center;
	gap: 0.5rem; margin-top: 1rem; font-size: 0.875rem;
	color: var(--text-secondary, #6c757d); cursor: pointer}
  .auto-refresh-toggle input[type="checkbox"] { cursor: pointer}
</style>





