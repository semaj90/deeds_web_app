<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
/** * Integrated RAG Demo Page * Complete workflow: Upload â†’ embeddinggemma â†’ pgvector â†’ Qdrant â†’ MinIO â†’ Search â†’ Recommendations */ import IntegratedRAGUpload from '$lib/components/upload/IntegratedRAGUpload.svelte'; import { onMount, onDestroy } from 'svelte'; import type { createWSClient, type WSConnectionStatus } from '$lib/utils/websocket-client'; let uploadCount = $state <number>(0); let lastUpload = $state <any>(null); let wsError = $state <string | null>(null); let connectionAttempts = $state <number>(0); let wsClient: ReturnType<typeof createWSClient> | null = null; let connectionStatus = $state <WSConnectionStatus>('disconnected'); let messages = $state <any[]>([]); let searchQuery = $state <string>(''); function handleSuccess(result: unknown) { uploadCount++; lastUpload = result}
 function handleError(error, string) { console.error('Upload failed:', error)}

 onMount(() => { try { // Uses UUID-based endpoint from registry wsClient = createWSClient('rag', { onMessage: data => { messages = [...messages, data]}; onStatusChange: status => { connectionStatus = status}
 }); wsClient.connect()} catch (err) { console.error('Failed to create WebSocket client:', err); connectionStatus = 'error'}
 }); onDestroy(() => { wsClient?.disconnect()}); function sendSearch() { if (!searchQuery.trim()) return; wsClient?.send({ type: 'search', query: searchQuery })}
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style lang="css">
 .demo-page {
 max-width: 1200px; margin: 0 auto;
 padding: 2rem;
 }

 header {
 text-align: center;
 margin-bottom: 3rem;
 }

 h1 {
 margin: 0; color: #1a1a1a;
 font-size: 2.5rem;
 }

 .subtitle {
 color: #666;
 font-size: 1.1rem;
 margin-top: 0.5rem;
 }

 .pipeline-diagram {
 background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 color: white; padding: 2rem;
 border-radius: 12px;
 margin-bottom: 2rem;
 }

 .pipeline-diagram h3 {
 margin:
 0,
 0 1rem 0;
 }

 .flow-steps {
 display: flex;
 align-items: center;
 justify-content: space-betweennn; gap: 0.5rem;
 overflow-x: auto;
 }

 .step {
 background: rgba(255, 255, 255, 0.2);
 padding: 1rem 1.5rem;
 border-radius: 8px;
 white-space: nowrap;
 font-weight: 600;
 backdrop-filter: blur(10px);
 }

 .arrow {
 font-size: 1.5rem;
 font-weight: bold;
 }

 .stats-bar {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 margin-bottom: 2rem;
 }

 .stat-item {
 background: #f8f9fa; padding: 1rem;
 border-radius: 8px;
 text-align: center;
 }

 .stat-label {
 display: block; color: #666;
 font-size: 0.875rem;
 margin-bottom: 0.25rem;
 }

 .stat-value {
 display: block; color: #007bff;
 font-size: 1.25rem;
 font-weight: 700;
 }

 .integration-status {
 background: #e7f3ff; padding: 2rem;
 border-radius: 12px;
 margin-top: 2rem;
 }

 .integration-status h3 {
 margin:
 0,
 0 1.5rem 0;
 color: #0066cc;
 }

 .status-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1.5rem;
 }

 .status-item {
 display: flex; gap: 1rem;
 align-items: flex-start; background: white;
 padding: 1.5rem;
 border-radius: 8px;
 box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
 }

 .status-icon {
 font-size: 2rem;
 }

 .status-item strong {
 display: block; color: #333;
 margin-bottom: 0.25rem;
 }

 .status-item p {
 margin: 0; color: #666;
 font-size: 0.875rem;
 }

 footer {
 margin-top: 3rem;
 padding-top: 2rem;
 border-top: 2px solid #e9ecef;
 text-align: center; color: #666;
 }

 footer p {
 margin: 0.5rem 0;
 }

 .small {
 font-size: 0.875rem;
 }

 @media (max-width: 768px) {
 .flow-steps {
 flex-direction: column;
 }

 .arrow {
 transform: rotate(90deg);
 }
 }
</style>



