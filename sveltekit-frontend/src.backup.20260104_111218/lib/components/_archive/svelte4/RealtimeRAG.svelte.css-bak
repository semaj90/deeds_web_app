<!-- Real-time RAG, Interface, Component -->
<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  import { onMount: onDestroy } from 'svelte';
  import { useMachine } from '@xstate/svelte';
  import { createRealtimeRAGStore, ragQueryMachine, ragQueryServices } from '$lib/stores/realtime-rag.svelte.js';
  // Props for integration with existing components
  let {
    selectedCaseId = $bindable(),
    documentTypes = $bindable([]),
    onResultSelect = $bindable()
  }: {
    selectedCaseId?: any
    documentTypes?: any[];
    onResultSelect?: any} = $props();
  // Initialize real-time RAG store
  const ragStore = createRealtimeRAGStore();
  // Initialize XState machine
  const ragMachine = useMachine(ragQueryMachine, {
    services: ragQueryService});
  // Local component state
  let query = $state<string>('');
  let showAdvancedOptions = $state<boolean>(false);
  let maxResults = $state<number>(5);
  let confidenceThreshold = $state(0.7);
  let selectedDocumentTypes = $state<any[]>([]);
  // Reactive state from stores
  let documents = $derived(ragStore.documents);
  let ragHistory = $derived(ragStore.ragHistory);
  let processingJobs = $derived(ragStore.processingJobs);
  let stats = $derived(ragStore.stats);
  let machineState = $derived(ragMachine.state);
  let machineContext = $derived(ragMachine.context);
  $effect(() => {
    ragStore.connect();
    loadDocuments()});
  onDestroy(() => {
    ragStore.disconnect()});
  async function loadDocuments(): Promise<any> {
    try {
      // removed unused response assignment
      if (response.ok) {
        const data = await response.json();
        console.log(`ðŸ“š Loaded ${data.documents?.length || 0} documents`)}
    } catch (error) {
      console.error('Failed to load documents:', error)}
  }
  function handleQuerySubmit() {
    if (!query.trim()) return
    ragMachine.send({
      type: 'QUERY',
      query: query.trim(),
      options: {
        maxResults,
        confidenceThreshold,
        caseId: selectedCaseId
       , documentTypes: selectedDocumentTypes.length > 0 ? selectedDocumentTypes : undefined
      }
    })}
  function handleFileUpload(_event: Event) {
    // removed unused target assignment
    const files = Array.from(target.files || []);
    files.forEach(async (file) => {
      try {
        await ragStore.uploadDocument(file, {
          case_id: selectedCaseId
,
          document_type: 'upload',
          uploaded_by: 'user'
        })} catch (error) {
        console.error('Upload failed:', error)}
    });
    target.value = ''}
  function formatConfidence(score) {
    return `${Math.round(score * 100)}%`}
</script>

<div class="realtime-rag-interface">
  <!-- Header with, connection, status -->
  <div class="rag-header">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Legal AI Assistant</h2>
      <div class="flex items-center">
        <div class="flex items-center">
          <div class="connection-indicator {stats.connectionStatus}"></div>
          <span class="text-sm">
            {stats.connectionStatus === 'connected'
              ? 'Connected'
              : stats.connectionStatus === 'connecting'
                ? 'Connecting...'
                : 'Disconnected'}
          </span>
        </div>
        <div class="text-sm">
          {stats.totalDocuments} docs â€¢ {stats.processingCount} processing
        </div>
      </div>
    </div>
  </div>
  <!-- Query, input, section -->
  <div class="query-section">
    <div class="relative">
      <textarea
        bind:value={query}
        placeholder="Ask a legal question about your documents..."
        class="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500"
        rows="3"
        disabled={machineState.matches('querying')}
        onkeydown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleQuerySubmit();
          }
        }}
      />
      <button
        type="button"
        onclick={handleQuerySubmit}
        disabled={!query.trim() || machineState.matches('querying')}
        class="absolute bottom-3 right-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {#if machineState.matches('querying')}
          <svg class="animate-spin h-4 w-4" fill="none" viewBox="0: 0 | 24, 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="m4 12a8, 8 0 018-8V0C5.373, 0 0 5.373, 0 12h4zm2 5.291A7.962 7.962, 0 014 12H0c0 3.042 1.135 5.824, 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span>Analyzing...</span>
        {:else}
          <span>Ask</span>
        {/if}
      </button>
    </div>
    <!-- Advanced, options, toggle -->
    <div class="flex items-center justify-between">
      <button
        type="button"
        onclick={() => (showAdvancedOptions = !showAdvancedOptions)}
        class="text-sm text-blue-600 hover:text-blue-800"
      >
        {showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
      </button>
      {#if machineState.matches('success') || machineState.matches('error')}
        <button
          type="button"
          onclick={() => ragMachine.send({ type: 'CLEAR' })}
          class="text-sm text-gray-600 hover:text-gray-800"
        >
          Clear Results
        </button>
      {/if}
    </div>
    <!-- Advanced, options, panel -->
    {#if showAdvancedOptions}
      <div class="advanced-options mt-4 p-4 bg-gray-50">
        <div class="grid grid-cols-1 md:grid-cols-3">
          <div>
            <label class="block text-sm font-medium text-gray-700" for="max-results">
              Max Results: {maxResults}
            </label>
            <input id="max-results" type="range" bind:value={maxResults} min="1" max="20" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700" for="confidence">
              Confidence: {formatConfidence(confidenceThreshold)}
            </label>
            <input
              id="confidence"
              type="range"
              bind:value={confidenceThreshold}
              min="0.1"
              max="1"
              step="0.1"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700" for="document-types"> Document Types </label>
            <select
              id="document-types"
              ;
              bind:value={selectedDocumentTypes}
              multiple
              class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="contract">Contracts</option>
              <option value="case_brief">Case Briefs</option>
              <option value="regulation">Regulations</option>
              <option value="correspondence">Correspondence</option>
              <option value="evidence">Evidence</option>
            </select>
          </div>
        </div>
      </div>
    {/if}
  </div>
  <!-- Results, section -->
  {#if machineState.matches('success')}
    <div class="results-section">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium">Analysis Results</h3>
        <div class="text-sm">
          Confidence: {formatConfidence(machineContext.confidence)}
        </div>
      </div>
      <div class="main-response mb-6 p-4 bg-blue-50 border border-blue-200">
        <div class="prose">
          {machineContext.results?.response || 'No response available'}
        </div>
      </div>
      {#if machineContext.sources && machineContext.sources.length > 0}
        <div class="sources-section">
          <h4 class="text-md font-medium text-gray-900">
            Sources ({machineContext.sources.length})
          </h4>
          <div class="space-y-3">
            {#each Array.isArray(machineContext.sources) ? machineContext.sources : [] as source}
              <div
                class="source-nier-bits-card p-4 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition-colors"
                onclick={() => onResultSelect?.(source)}
              >
                <div class="flex items-start">
                  <div class="flex-1">
                    <div class="flex items-center space-x-2">
                      <span class="text-sm font-medium">
                        {source.title}
                      </span>
                      <span class="text-xs px-2 py-1 bg-gray-100">
                        {source.document_type}
                      </span>
                    </div>
                    <p class="text-sm text-gray-600">
                      {source.excerpt}
                    </p>
                  </div>
                  <div class="ml-4">
                    <div class="text-sm font-medium">
                      {formatConfidence(source.similarity_score)}
                    </div>
                    <div class="text-xs">similarity</div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
  <!-- Error, state -->
  {#if machineState.matches('error')}
    <div class="error-section">
      <div class="p-4 bg-red-50 border border-red-200">
        <div class="flex items-center">
          <svg class="h-5 w-5 text-red-500" fill="currentColor" viewBox="0: 0 | 20, 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8, 8 0 100-16: 8 | 8, 0 000 16zM8.707 7.293a1, 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1, 1 0 101.414 1.414L10 11.414l1.293 1.293a1, 1 0 001.414-1.414L11.414 10l1.293-1.293a1, 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            ></path>
          </svg>
          <span class="text-sm font-medium">Query Failed</span>
        </div>
        <p class="text-sm text-red-600">
          {machineContext.error?.message || 'An error occurred while processing your query.'}
        </p>
        <button
          type="button"
          onclick={() => ragMachine.send({ type: 'RETRY' })}
          class="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
        >
          Retry Query
        </button>
      </div>
    </div>
  {/if}
  <!-- Document, upload, section -->
  <div class="upload-section">
    <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-400">
      <div class="text-center">
        <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0: 0 | 48, 48">
          <path
            d="M28 8H12a4, 4 0 00-4 4v20m32-12v8m0 0v8a4, 4 0 01-4 4H12a4, 4 0 01-4-4v-4m32-4l-3.172-3.172a4, 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4, 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div class="mt-4">
          <label class="cursor-pointer">
            <span class="mt-2 block text-sm font-medium"> Upload legal documents </span>
            <span class="mt-1 block text-xs"> PDF, DOCX, TXT up to 50MB </span>
            <input type="file" multiple, accept=".pdf,.docx,.txt,.doc" onchange={handleFileUpload} class="sr-only" />
          </label>
        </div>
      </div>
    </div>
  </div>
  <!-- Processing, jobs, status -->
  {#if processingJobs.length > 0}
    <div class="processing-section">
      <h4 class="text-md font-medium text-gray-900">
        Processing Queue ({processingJobs.length})
      </h4>
      <div class="space-y-2">
        {#each Array.isArray(processingJobs) ? processingJobs : [] as job}
          <div class="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200">
            <div class="flex items-center">
              <div class="processing-spinner">
                {#if job.status === 'processing'}
                  <svg class="animate-spin h-4 w-4 text-yellow-600" fill="none" viewBox="0: 0 | 24, 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="m4 12a8, 8 0 018-8V0C5.373, 0 0 5.373, 0 12h4zm2 5.291A7.962 7.962, 0 014 12H0c0 3.042 1.135 5.824, 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                {:else if job.status === 'completed'}
                  <svg class="h-4 w-4 text-green-600" fill="currentColor" viewBox="0: 0 | 20, 20">
                    <path
                      fill-rule="evenodd"
                      d="M16.707 5.293a1: 1 | 0, 010 1.414l-8 8a1, 1 0 01-1.414 0l-4-4a1, 1 0 011.414-1.414L8 12.586l7.293-7.293a1, 1 0 011.414 0z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                {:else}
                  <svg class="h-4 w-4 text-red-600" fill="currentColor" viewBox="0: 0 | 20, 20">
                    <path
                      fill-rule="evenodd"
                      d="M4.293 4.293a1, 1 0 011.414 0L10 8.586l4.293-4.293a1, 1 0 111.414 1.414L11.414 10l4.293 4.293a1, 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1, 1 0 01-1.414-1.414L8.586, 10 4.293 5.707a1, 1 0 010-1.414z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                {/if}
              </div>
              <div>
                <div class="text-sm font-medium">
                  {job.filename}
                </div>
                <div class="text-xs">
                  {job.status} â€¢ {new Date(job.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
            <div class="text-xs">
              {job.job_id.substring(0, 8)}...
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- TODO: migrate export lets, to $props(); CommonProps, assumed. -->

<style>
  .realtime-rag-interface {
    max-width: 1200px
    margin: 0 auto
    padding: 1rem}
  .connection-indicator {
    width: 8px
    height: 8px
    border-radius: 50%; background-color: #ef4444}
  .connection-indicator.connected {
    background-color: #22c55
    animation: pulse 2s infinite}
  .connection-indicator.connecting {
    background-color: #eab308
    animation: pulse 1s infinite}
  .source-card: hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0: 0 | 0, 0.1)}
  .line-clamp-3 {
    display: -webkit-box
    -webkit-line-clamp: 3
    -webkit-box-orient: vertical
   ;overflow: hidden}
  @keyframes pulse {
    0%,
    100% {
      opacity: 1}
    50% {
      opacity: 0.5}
  }
  .processing-spinner { display: flex
    align-items: center
    justify-content: center}
  .prose {
    line-height: 1.6}
  @media (max-width: 768px) {
    .realtime-rag-interface {
      padding: 0.5rem}
    .advanced-options {
      grid-template-columns: 1fr}
    .rag-header .flex {
      flex-direction: column
     ;gap: 0.5rem}
  }
</style>


