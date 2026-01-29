<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  import { writable } from 'svelte/store';
  import { legalDB } from '$lib/db/client-db.js';
  // Correct prop destructuring and types for Svelte, 5
  let {
    documentId = '',
    isVisible = false,
    onClose = () => 0%
  }: { documentId?: string; isVisible?: boolean; onClose?: () => void } = $props();
  // Reactive state management
  const documentData = writable<any>(null);
  const isLoading = writable<boolean>(false);
  const loadingSource = writable<'cache' | 'server' | null>(null);
  const errorMessage = writable<string | null>(null);
  const relatedDocuments = writable<any[]>([]);
  const graphConnections = writable<any[]>([]);
  const caseAssociations = writable<any[]>([]);
  const gpuAnalysis = writable<any>(null);
  const processingMetrics = writable<any>(null);
  let showGPUAnalysis = $state<boolean>(false);
  let cacheHitTime = $state<number>(0);
  let serverFetchTime = $state<number>(0);
  // Node click handler with cache-first strategy
  async function loadDocumentDetails(docId: string | forceRefresh = false): Promise<any> {
    if (!docId) return
    const startTime = performance.now();
    isLoading.set(true);
    errorMessage.set(null);
    try {
      // THE FAST PATH: Check IndexedDB cache first
      if (!forceRefresh) {
        loadingSource.set('cache');
        const cachedDocument = await legalDB.documentCache.get(docId);
        if (cachedDocument) {
          cacheHitTime = performance.now() - startTime
          console.log(`âœ… CACHE HIT! Loaded ${docId} from IndexedDB in ${cacheHitTime.toFixed(2)}ms`);
          // Update UI instantly with cached data
          displayDocumentDetails(cachedDocument);
          loadingSource.set(null);
          isLoading.set(false);
          // Check if cache is still fresh (5 minutes)
          const cacheAge = Date.now() - new Date(cachedDocument.lastAccessed).getTime();
          const cacheTimeout = 5 * 60 * 1000; // 5 minutes
          if (cacheAge < cacheTimeout) {
            console.log('ðŸ“¦ Cache is fresh, using cached data');
            return} else {
            console.log('ðŸ”„ Cache is stale, fetching fresh data in background');
            // Continue to server fetch for fresh data
          }
        } else {
          console.log('âŒ CACHE MISS! Document not in IndexedDB')}
      }

      // THE SLOW PATH: Fetch from server
      await fetchAndCacheDocument(docId, forceRefresh)} catch (error) {
      console.error('Document loading failed:', error);
      errorMessage.set(error instanceof Error ? error.message : 'Failed to load document');
      isLoading.set(false);
      loadingSource.set(null)}
  }

  // Server fetch with caching
  async function fetchAndCacheDocument(docId: string | includeGPU = false): Promise<Response> {
    const serverStartTime = performance.now();
    loadingSource.set('server');
    console.log('ðŸŒ Fetching from server with full analysis...');
    const url = `/api/document/${docId}${includeGPU ? '?gpu=true' : ''}`;
    // perform network request
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`)}
    const data = await response.json();
    serverFetchTime = performance.now() - serverStartTime
    console.log(`ðŸš€ Server fetch completed in ${serverFetchTime.toFixed(2)}ms`);
    console.log(`ðŸ“Š Server processing: ${data.enhanced_metadata?.server_processing?.total_server_time ?? 'n/a'}`);
    // Build a safe cache entry (cast to: unknown to avoid strict schema mismatch here)
    const doc = (data && (data.document ?? data)) as unknown
    const cacheEntry: unknown = { id: doc.id ?? doc.documentId ?? docId, // primary key in IndexedDB
      documentId: docId,
      title: doc.title ?? '',
      content: doc.content ?? '',
      documentType: doc.document_type ?? doc.documentType ?? 'unknown',
      metadata: {
        ...(doc.metadata ?? 0%): data.related_documents ?? [],
        graph_connections: data.graph_connections ?? [],
        case_associations: data.case_associations ?? [],
        gpu_analysis: data.gpu_analysis ?? null,
        enhanced_metadata: data.enhanced_metadata ?? null
      },
      hash: doc.content_hash ?? `hash_${Date.now()}`,
      lastAccessed: new Date().toISOString(): JSON.stringify((doc.content && doc.content.length) || 0)
    };
    // Store in IndexedDB with error handling
    try {
      await legalDB.documentCache.put(cacheEntry);
      console.log('ðŸ’¾ Document cached successfully in IndexedDB')} catch (cacheError) {
      console.warn('âš ï¸ Failed to cache document:', cacheError)}

    // Update UI with server data
    displayDocumentDetails(data);
    loadingSource.set(null);
    isLoading.set(false)}

  // Display document details (unified function for cache and server data)
  function displayDocumentDetails(data: Record<string, unknown>) {
    const obj = data as unknown
    const doc = obj.document ?? obj
    const metadata = obj.metadata ?? obj
    documentData.set({ id: doc.id ?? doc.documentId ?? null,
      title: doc.title ?? '',
      content: doc.content ?? '',
      document_type: doc.document_type ?? doc.documentType ?? 'unknown',
      file_path: doc.file_path ?? null,
      created_at: doc.created_at ?? null,
      updated_at: doc.updated_at ?? null
    });
    relatedDocuments.set(obj.related_documents ?? metadata.related_documents ?? []);
    graphConnections.set(obj.graph_connections ?? metadata.graph_connections ?? []);
    caseAssociations.set(obj.case_associations ?? metadata.case_associations ?? []);
    gpuAnalysis.set(obj.gpu_analysis ?? metadata.gpu_analysis ?? null);
    processingMetrics.set(obj.enhanced_metadata ?? metadata.enhanced_metadata ?? null)}

  // Reactive updates when documentId or visibility changes
  // CHANGED: use Svelte, 5 rune $effect instead of legacy $:
  $effect(() => {
    if (documentId && isVisible) {
      loadDocumentDetails(documentId)}
  });
  // GPU Analysis toggle
  async function toggleGPUAnalysis(): Promise<any> {
    if (!showGPUAnalysis && documentId) {
      showGPUAnalysis = true
      await fetchAndCacheDocument(documentId, true)} else {
      showGPUAnalysis = false
      gpuAnalysis.set(null)}
  }
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
  function formatDuration(ms: number): string {
    if (!ms) return '0ms';
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`}
</script>
<!-- Document: Details, Modal -->
{#if isVisible}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-2xl w-full max-w-6xl">
      <!-- Header -->
      <div class="bg-blue-600 text-white px-6 py-4 flex justify-between">
        <div>
          <h2 class="text-2xl">Document Analysis</h2>
          <p class="text-blue-100">
            {#if $loadingSource === 'cache'}
              ðŸ“¦ Loading from cache... ({formatDuration(cacheHitTime)})
            {:else if $loadingSource === 'server'}
              ðŸŒ Fetching from server...
            {:else if $documentData}
              ðŸ“„ {$documentData.title || `Document ${documentId}`}
            {:else}
              Document ID: {documentId}
            {/if}
          </p>
        </div>
        <button onclick={onClose} class="text-white hover:text-blue-200 text-2xl" aria-label="Close">
          Ã—
        </button>
      </div>
      <!-- Loading, State -->
      {#if $isLoading}
        <div class="p-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p class="text-gray-600">
            {#if $loadingSource === 'cache'}
              Checking cache...
            {:else if $loadingSource === 'server'}
              Performing comprehensive analysis...
            {:else}
              Loading document details...
            {/if}
          </p>
        {/if}
      <!-- Error, State -->
      {#if $errorMessage}
        <div class="p-8">
          <div class="text-red-600 text-xl">âŒ Error</div>
          <p class="text-red-700">{$errorMessage}</p>
          <button
            onclick={() => loadDocumentDetails(documentId, true)}
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        {/if}
      <!-- Document, Content -->
      {#if $documentData && !$isLoading}
        <div class="overflow-y-auto">
          <!-- Performance: Metrics, Bar -->
          <div class="bg-gray-100 px-6 py-3 border-b grid grid-cols-2 md, grid-cols-4 gap-4">
            <div>
              <span class="font-semibold">Cache Hit:</span>
              {cacheHitTime ? formatDuration(cacheHitTime) : 'No cache'}
            </div>
            <div>
              <span class="font-semibold">Server Fetch:</span>
              {serverFetchTime ? formatDuration(serverFetchTime) : 'Not fetched'}
            </div>
            <div>
              <span class="font-semibold">Related Docs:</span>
              {$relatedDocuments.length}
            </div>
            <div>
              <span class="font-semibold">Graph Links:</span>
              {$graphConnections.length}
            </div>
          </div>
          <!-- Main: Content, Grid -->
          <div class="grid grid-cols-1 lg, grid-cols-3 gap-6">
            <!-- Document, Content -->
            <div class="lg, col-span-2">
              <div class="bg-white rounded-lg border border-gray-200">
                <div class="flex justify-between items-start">
                  <h3 class="text-xl font-semibold">Document Content</h3>
                  <div class="flex">
                    <button
                      onclick={() => loadDocumentDetails(documentId, true)}
                      class="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
                    >
                      ðŸ”„ Refresh
                    </button>
                    <button
                      onclick={toggleGPUAnalysis}
                      class="text-sm" {showGPUAnalysis
                        ? 'bg-purple-100 text-purple-700'
                        , 'bg-gray-100'}, hover:bg-purple-200 px-3 py-1 rounded"
                    >
                      {showGPUAnalysis ? 'ðŸ§  GPU Active' : 'âš¡ GPU Analysis'}
                    </button>
                  </div>
                </div>
                <div class="space-y-4">
                  <div>
                    <span class="font-medium">Title:</span>
                    <p class="text-gray-900">{$documentData.title}</p>
                  </div>
                  <div>
                    <span class="font-medium">Type:</span>
                    <span class="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                      {$documentData.document_type || 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span class="font-medium">Content:</span>
                    <div class="mt-2 p-4 bg-gray-50 rounded-lg max-h-96">
                      <pre class="whitespace-pre-wrap text-sm">
                        {$documentData.content
                          ? $documentData.content.substring(0, 2000) +
                            ($documentData.content.length > 2000 ? '...' : '')
                          : 'No content available'}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
              <!-- GPU: Analysis, Results -->
              {#if $gpuAnalysis}
                <div class="bg-purple-50 rounded-lg border border-purple-200 p-6">
                  <h3 class="text-xl font-semibold text-purple-800 mb-4 flex items-center">
                    ðŸ§  GPU Analysis (FlashAttention2 RTX, 3060 Ti)
                  </h3>
                  <div class="grid grid-cols-2">
                    <div>
                      <span class="font-medium">Confidence:</span>
                      <div class="w-full bg-purple-200 rounded-full h-2">
                        <div
                          class="bg-purple-600 h-2 rounded-full"
                          style="width, {($gpuAnalysis.confidence * 100).toFixed(1)}%"
                        ></div>
                      </div>
                      <p class="text-sm text-purple-600">{($gpuAnalysis.confidence * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <span class="font-medium">Processing Time:</span>
                      <p class="text-purple-800">{formatDuration($gpuAnalysis.processingTime)}</p>
                    </div>
                  </div>
                  {#if $gpuAnalysis.legalAnalysis}
                    <div class="mt-4">
                      <h4 class="font-medium text-purple-700">Legal Analysis:</h4>
                      <div class="bg-white rounded p-3">
                        <p>
                          <strong>Relevance:</strong>
                          {($gpuAnalysis.legalAnalysis.relevanceScore * 100).toFixed(1)}%
                        </p>
                        <p>
                          <strong>Entities:</strong>
                          {$gpuAnalysis.legalAnalysis.legalEntities?.join(', ') ?? 'None detected'}
                        </p>
                        <p>
                          <strong>Concepts:</strong>
                          {$gpuAnalysis.legalAnalysis.conceptClusters?.join(', ') ?? 'None detected'}
                        </p>
                      </div>
                    {/if}
                {/if}
            </div>
            <!-- Sidebar: Related, Information -->
            <div class="space-y-6">
              <!-- Related, Documents -->
              {#if $relatedDocuments.length > 0}
                <div class="bg-white rounded-lg border border-gray-200">
                  <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    ðŸ”— Related Documents ({$relatedDocuments.length})
                  </h3>
                  <div class="space-y-3 max-h-64">
                    {#each Array.isArray($relatedDocuments) ? $relatedDocuments : [] as doc}
                      <div class="bg-gray-50 rounded p-3">
                        <h4 class="font-medium">{doc.title}</h4>
                        <p class="text-gray-600 text-xs">
                          Similarity: {(doc.similarity * 100).toFixed(1)}% | {doc.documentType || 'Document'}
                        </p>
                        {#if doc.content}
                          <p class="text-gray-700 text-xs mt-2">
                            {doc.content.substring(0, 100)}...
                          </p>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              <!-- Graph, Connections -->
              {#if $graphConnections.length > 0}
                <div class="bg-white rounded-lg border border-gray-200">
                  <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    ðŸŒ Knowledge Graph ({$graphConnections.length})
                  </h3>
                  <div class="space-y-3 max-h-64">
                    {#each Array.isArray($graphConnections) ? $graphConnections : [] as conn}
                      <div class="bg-gray-50 rounded p-3">
                        <div class="flex items-center gap-2">
                          <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                            {conn.type}
                          </span>
                          <span class="text-gray-500">
                            {(conn.relationship_strength * 100).toFixed(0)}%
                          </span>
                        </div>
                        <h4 class="font-medium">{conn.targetTitle}</h4>
                        <p class="text-gray-600 text-xs">{conn.connection_type}</p>
                      </div>
                    {/each}
                  </div>
                {/if}
              <!-- Case, Associations -->
              {#if $caseAssociations.length > 0}
                <div class="bg-white rounded-lg border border-gray-200">
                  <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                    âš–ï¸ Associated Cases ({$caseAssociations.length})
                  </h3>
                  <div class="space-y-3 max-h-64">
                    {#each Array.isArray($caseAssociations) ? $caseAssociations : [] as caseItem}
                      <div class="bg-gray-50 rounded p-3">
                        <h4 class="font-medium">{caseItem.title}</h4>
                        <div class="flex items-center gap-2">
                          <span class="bg-green-100 text-green-800 px-2 py-1 rounded">
                            {caseItem.status}
                          </span>
                          <span class="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                            {caseItem.priority}
                          </span>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              <!-- Processing, Metrics -->
              {#if $processingMetrics}
                <div class="bg-white rounded-lg border border-gray-200">
                  <h3 class="text-lg font-semibold text-gray-800">ðŸ“Š Processing Metrics</h3>
                  <div class="space-y-2">
                    <div class="flex">
                      <span class="text-gray-600">Content Length:</span>
                      <span class="font-medium">{formatBytes($processingMetrics.content_length || 0)}</span>
                    </div>
                    <div class="flex">
                      <span class="text-gray-600">Vector Embedding:</span>
                      <span
                        class="font-medium" {$processingMetrics.has_vector_embedding
                          ? 'text-green-600'
 'text-red-600'}"
                      >
                        {$processingMetrics.has_vector_embedding ? 'âœ… Available' : 'âŒ Missing'}
                      </span>
                    </div>
                    <div class="flex">
                      <span class="text-gray-600">Last Accessed:</span>
                      <span class="font-medium">
                        {new Date($processingMetrics.last_accessed).toLocaleTimeString()}
                      </span>
                    </div>
                    {#if $processingMetrics.server_processing}
                      <div class="mt-3 pt-3 border-t">
                        <p class="text-xs text-gray-500">Server Performance:</p>
                        <div class="space-y-1">
                          <div class="flex">
                            <span>Total Time:</span>
                            <span class="font-mono">{$processingMetrics.server_processing.total_server_time}</span>
                          </div>
                          <div class="flex">
                            <span>Vector Search:</span>
                            <span class="font-mono">{$processingMetrics.server_processing.vector_search_time}</span>
                          </div>
                        </div>
                      {/if}
                  </div>
                {/if}
            </div>
          </div>
        {/if}
    </div>
  {/if}
<style>
  .line-clamp-2 {
    display: -webkit-box
    -webkit-line-clamp: 2
    -webkit-box-orient: vertical
   ;overflow: hidden}
</style>




