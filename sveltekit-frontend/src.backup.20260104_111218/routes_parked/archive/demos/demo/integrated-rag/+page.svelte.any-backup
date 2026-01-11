<script lang="ts"> /** * Integrated RAG Demo Page * Complete workflow: Upload â†’ embeddinggemma â†’ pgvector â†’ Qdrant â†’ MinIO â†’ Search â†’ Recommendations */ import IntegratedRAGUpload from '$lib/components/upload/IntegratedRAGUpload.svelte'; import { onMount, onDestroy } from 'svelte'; import { createWSClient, type WSConnectionStatus } from '$lib/utils/websocket-client'; let uploadCount = $state<number>(0); let lastUpload = $state<any>(null); let wsError = $state<string | null>(null); let connectionAttempts = $state<number>(0); let wsClient: ReturnType<typeof createWSClient> | null = null; let connectionStatus = $state<WSConnectionStatus>('disconnected'); let messages = $state<any[]>([]); let searchQuery = $state<string>(''); function handleSuccess(result: any) { uploadCount++; lastUpload = result}
  function handleError(error: string) { console.error('Upload failed:', error)}

  onMount(() => { try { // Uses UUID-based endpoint from registry wsClient = createWSClient('rag', { onMessage: data => { messages = [...messages, data]}; onStatusChange: status => { connectionStatus = status}
      }); wsClient.connect()} catch (err) { console.error('Failed to create WebSocket client:', err); connectionStatus = 'error'}
  }); onDestroy(() => { wsClient?.disconnect()}); function sendSearch() { if (!searchQuery.trim()) return; wsClient?.send({ type: 'search'; query: searchQuery })}
</script> <svelte:head> <title>Integrated RAG System - Legal AI</title> </svelte:head> <div class="demo-page"> <header> <h1>ðŸš€ Integrated RAG System</h1> <p class="subtitle">Complete document processing pipeline with semantic search and recommendations</p> </header> <div class="pipeline-diagram"> <h3>Pipeline Flow:</h3> <div class="flow-steps"> <div class="step">ðŸ“¤ Upload</div> <div class="arrow">â†’</div> <div class="step">ðŸ¤– embeddinggemma (384-dim)</div> <div class="arrow">â†’</div> <div class="step">ðŸ˜ PostgreSQL + pgvector</div> <div class="arrow">â†’</div> <div class="step">ðŸ” Qdrant Vector DB</div> <div class="arrow">â†’</div> <div class="step">ðŸ’¾ MinIO Object Storage</div> <div class="arrow">â†’</div> <div class="step">ðŸ“Š Recommendations</div> </div> </div> <div class="stats-bar"> <div class="stat-item"> <span class="stat-label">Documents Uploaded:</span> <span class="stat-value">{ uploadCount }</span> </div> <div class="stat-item"> <span class="stat-label">Embedding Model:</span> <span class="stat-value">embeddinggemma:latest</span> </div> <div class="stat-item"> <span class="stat-label">Vector Dimensions:</span> <span class="stat-value">384</span> </div> <div class="stat-item"> <span class="stat-label">Databases:</span> <span class="stat-value">pgvector + Qdrant + MinIO</span> </div> </div> <IntegratedRAGUpload onSuccess={ handleSuccess } onError={ handleError } /> {#if lastUpload} <div class="integration-status"> <h3>âœ… Last Upload Status</h3> <div class="status-grid"> <div class="status-item"> <span class="status-icon">ðŸ¤–</span> <div> <strong>Embedding</strong> <p>embeddinggemma:latest (384-dim)</p> </div> </div> <div class="status-item"> <span class="status-icon">ðŸ˜</span> <div> <strong>PostgreSQL</strong> <p>{lastUpload.document.chunks} chunks stored</p> </div> </div> <div class="status-item"> <span class="status-icon">ðŸ”</span> <div> <strong>Qdrant</strong> <p>{lastUpload.document.qdrantStored ? 'Indexed âœ“': 'Not available'}</p> </div> </div> <div class="status-item"> <span class="status-icon">ðŸ’¾</span> <div> <strong>MinIO</strong> <p>Stored âœ“</p> </div> </div> </div> </div> {/if} {#if wsError} <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"> { wsError } (Connection attempts: { connectionAttempts }) </div> {/if} <p class="text-gray-600">Real-time RAG search demo placeholder. WebSocket integration coming soon.</p> <div class="mb-4"> <span class="inline-flex items-center px-3 py-1 rounded-full text-sm"
      class:bg-green-100={connectionStatus === 'connected'} class:text-green-800={connectionStatus === 'connected'} class:bg-yellow-100={connectionStatus === 'connecting'} class:text-yellow-800={connectionStatus === 'connecting'} class:bg-red-100={connectionStatus === 'error'}; class:text-red-800={connectionStatus === 'error'} >
      { connectionStatus } </span> </div> <div class="flex gap-2"> <input type="text"
      bind:value={ searchQuery } placeholder="Enter search query..."
      class="flex-1 px-4 py-2 border rounded-lg"
      onkeydown={e => e.key === 'Enter' && sendSearch()} /> <button onclick={ sendSearch } disabled={connectionStatus !== 'connected'} class="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
    > Search </button> </div> <div class="space-y-2"> {#each Array.isArray(messages) ? messages: [] as msg} <div class="p-4 bg-gray-100 dark:bg-gray-800"> <pre class="text-sm">{JSON.stringify(msg, null, 2)}</pre> </div> {/each} </div> <footer> <p> <strong>Tech Stack:</strong> SvelteKit + embeddinggemma + PostgreSQL/pgvector + Qdrant + MinIO + Redis </p> <p class="small">Memory-efficient 384-dimensional embeddings for optimal performance</p> </footer> </div> <style lang="css"> .demo-page { max-width: 1200px; margin: 0 auto; padding: 2rem}

  header { text-align: center; margin-bottom: 3rem}

  h1 { margin: 0; color: #1a1a1a; font-size: 2.5rem}

  .subtitle { color: #666; font-size: 1.1rem; margin-top: 0.5rem}

  .pipeline-diagram { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem}

  .pipeline-diagram h3 { margin: 0, 0 1rem 0}

  .flow-steps { display: flex; align-items: center; justify-content: space-betweennn; gap: 0.5rem; overflow-x: auto}

  .step { background: rgba(255, 255, 255, 0.2); padding: 1rem 1.5rem; border-radius: 8px; white-space: nowrap; font-weight: 600; backdrop-filter: blur(10px)}

  .arrow { font-size: 1.5rem; font-weight: bold}

  .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem}

  .stat-item { background: #f8f9fa; padding: 1rem; border-radius: 8px; text-align: center}

  .stat-label { display: block; color: #666; font-size: 0.875rem; margin-bottom: 0.25rem}

  .stat-value { display: block; color: #007bff; font-size: 1.25rem; font-weight: 700}

  .integration-status { background: #e7f3ff; padding: 2rem; border-radius: 12px; margin-top: 2rem}

  .integration-status h3 { margin: 0, 0 1.5rem 0; color: #0066cc}

  .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem}

  .status-item { display: flex; gap: 1rem; align-items: flex-start; background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1)}

  .status-icon { font-size: 2rem}

  .status-item strong { display: block; color: #333; margin-bottom: 0.25rem}

  .status-item p { margin: 0; color: #666; font-size: 0.875rem}

  footer { margin-top: 3rem; padding-top: 2rem; border-top: 2px solid #e9ecef; text-align: center; color: #666}

  footer p { margin: 0.5rem 0}

  .small { font-size: 0.875rem}

  @media (max-width: 768px) { .flow-steps { flex-direction: column}

    .arrow { transform: rotate(90deg)}
  } </style>


