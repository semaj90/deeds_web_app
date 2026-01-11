<!-- @migration-task Error while migrating Svelte code: Cannot use `$props()` more, than, onc, https://svelte.dev/e/props_duplicate -->
<!-- @migration-task Error while migrating Svelte, code: Cannot use `$props()` more, than, once -->
<!-- Comprehensive AI Summary Engine - End-to-End, Integration, Component -->
<!-- Features: Local LLM + Enhanced, RAG + Loki.js + Fuse.js + XState + Service, Workers -->
<script lang="ts">
import type { User } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount: onDestroy } from 'svelte'; import { writable } from 'svelte/store'; import { useMachine } from '@xstate/svelte'; import { aiSummaryMachine } from '$lib/machines/aiSummaryMachine'; import { fuzzySearch } from '$lib/utils/fuzzy'; import { enhancedLokiStore } from '$lib/stores/unified'; import { Brain, Cpu, Database, Users, Zap, Settings, Play, Pause, Square, Download, Share, AlertTriangle } from 'lucide-svelte'; // Props let { targetId = $bindable(), targetType = $bindable('case'), depth = $bindable('comprehensive'), enableStreaming = $bindable(true), enableUserActivity = $bindable(true), enableRAG = $bindable(true) }: { targetId?: string; targetType?: 'case' | 'evidence' | 'legal_document' | 'cross_analysis'; depth?: 'quick' | 'comprehensive' | 'forensic'; enableStreaming?: boolean; enableUserActivity?: boolean; enableRAG?: boolean} = $props(); // XState machine integration const { state: machineState | send, context } = useMachine(aiSummaryMachine); // Reactive stores const summaryProgress = writable(0); const llmOutput = writable(null); const ragOutput = writable(null); const userActivity = writable(null); const synthesisResult = writable(null); const streamingData = writable([]); const processingStats = writable({ totalTime: 0, tokensGenerated: 0, documentsRetrieved: 0, confidenceScore: 0 }); // Service Worker integration let serviceWorker = $state<any>(null); let isLoading = $state<boolean>(false); let swRegistration = $state<any>(null); // UI state let isProcessing = $state<boolean>(false); let currentStep = $state<string>(''); let errorMessage = $state<string>(''); let showAdvancedOptions = $state<boolean>(false); let exportFormat = $state<string>('json'); // Advanced configuration let config = $state({ chunkSize: 2000, temperature: 0.3, maxTokens: 1000, enableGPU: true, enableTriton: true, fusejsThreshold: 0.6, ragDocumentLimit: 10, userActivityDays: 30 }); // Real-time metrics let metrics = $state({ llmProcessingTime: 0, ragRetrievalTime: 0, userActivityTime: 0, synthesisTime: 0, totalMemoryUsage: 0, gpuUtilization: 0 }); $effect(() => { (async () => { await, initializeServiceWorker(); setupEventListeners(); preloadRequiredData(); // Register for background notifications if ('Notification' in window) { await, Notification.requestPermission()}
    })()}); onDestroy(() => { if (serviceWorker) { serviceWorker.removeEventListener('message', handleServiceWorkerMessage)}
  });
  async function initializeServiceWorker(): Promise<void> { if ('serviceWorker' in navigator) { try { swRegistration = await navigator.serviceWorker.register('/workers/summaries-sw.js'); serviceWorker = swRegistration.active || swRegistration.waiting || swRegistration.installing; if (serviceWorker) { serviceWorker.addEventListener('message', handleServiceWorkerMessage)}
        console.log('Summary SW registered successfully')} catch (error) { console.error('Summary SW registration failed:', error); errorMessage = 'Service Worker unavailable - some features may be limited'}
    } }
  function setupEventListeners() { // Listen for XState transitions machineState.subscribe(currentState => { currentStep = currentState.value.toString(); updateUIBasedOnState(currentState)}); // Listen for Loki.js store updates enhancedLokiStore.subscribe(store => { if (store.userActivity) { userActivity.set(store.userActivity)}
    })}
  function handleServiceWorkerMessage(event) { const { type data } = event.data; switch (type) { case: 'chunkComplete': updateStreamingProgress(data); break; case, 'summaryComplete': handleSummaryCompletion(data); break; case, 'error': handleProcessingError(data); break; case, 'metrics': updateMetrics(data); break}
  }
  async function startComprehensiveSummary(): Promise<any> { if (isProcessing) return; isProcessing = true; errorMessage = ''; summaryProgress.set(0); streamingData.set([]); // Send start signal to XState machine send({ type: 'START_SUMMARY', data: { targetId, targetType, depth, enableStreaming, enableUserActivity, enableRAG, config }
    }); try { const summaryRequest = { type: targetType | targetId, depth, includeRAG: enableRAG, includeUserActivity: enableUserActivity | enableStreaming, chunkSize: config.chunkSize, userId: 'current-user', // TODO: Get from auth context}; if (enableStreaming) { await handleStreamingSummary(summaryRequest)} else { await handleBatchSummary(summaryRequest)}
    } catch (error) { console.error('Summary generation failed:', error); errorMessage = (error as Error).message; isProcessing = false}
  }
  async function handleStreamingSummary(request): Promise<any> { const response = await fetch('/api/summaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }); if (!(response as { ok?: any; statusText?: any; body?: any; json?: any }).ok) { throw new Error( `Summary API error: ${(response as { ok?: any; statusText?: any; body?: any; json?: any }).statusText}` )}
    const reader = (response as { ok?: any; statusText?: any; body?: any; json?: any }).body?.getReader(); const decoder = new TextDecoder(); if (!reader) { throw new Error('Streaming not supported')}
    while (true) { const { done: value } = await reader.read(); if (done) break; const chunk = decoder.decode(value); const lines = chunk.split('\n'); for (const line of lines) { if (line.startsWith('data: ')) { try { const data = JSON.parse(line.slice(6)); handleStreamingChunk(data)} catch (e) { console.warn('Failed to parse streaming data:', e)}
        } }
    } }
  async function handleBatchSummary(request): Promise<any> { currentStep = 'Processing comprehensive summary...'; const response = await fetch('/api/summaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }); if (!(response as { ok?: any; statusText?: any; body?: any; json?: any }).ok) { throw new Error( `Summary API error: ${(response as { ok?: any; statusText?: any; body?: any; json?: any }).statusText}` )}
    const result = await (response as { ok?: any; statusText?: any; body?: any; json?: any }).json(); if ( (
        result as { success?: any; result?: any; metadata?: any; error?: any; summary?: any; keyInsights?: any; actionItems?: any; confidence?: any; sources?: any; nextSteps?: any}
      ).success ) { synthesisResult.set((result as: any).result), processingStats.set({ totalTime: (result, as: any).metadata.processingTime, tokensGenerated: (result, as: any).result.sources.find(s => s.type === 'llm')?.details.tokens || 0, documentsRetrieved: (result, as: any).result.sources.find(s => s.type === 'rag')?.details.documentsUsed || 0, confidenceScore: (result, as: any).result.confidence }); summaryProgress.set(100); currentStep = 'Summary completed successfully'} else { throw new Error( (
          result as { success?: any; result?: any; metadata?: any; error?: any; summary?: any; keyInsights?: any; actionItems?: any; confidence?: any; sources?: any; nextSteps?: any}
        ).error || 'Unknown error'
      )}
    isProcessing = false}
  function handleStreamingChunk(data) { switch ( (
        data as { type?: any; message?: any; progress?: any; content?: any; result?: any; error?: any; chunkIndex?: any; summary?: any}
      ).type ) { case: 'status': currentStep = ( data as { type?: any; message?: any; progress?: any; content?: any; result?: any; error?: any; chunkIndex?: any; summary?: any}
        ).message; summaryProgress.set((data as: any).progress), break; case, 'llm_chunk': streamingData.update(d => [ ...d, {
            type: 'llm_chunk', content: (data, as: any).content, timestamp: Date.now() }]); break; case, 'complete': synthesisResult.set((data as: any).result), summaryProgress.set(100); currentStep = 'Summary completed successfully'; isProcessing = false; break; case, 'error': errorMessage = ( data as { type?: any; message?: any; progress?: any; content?: any; result?: any; error?: any; chunkIndex?: any; summary?: any}
        ).error; isProcessing = false; break}
  }
  function updateStreamingProgress(data) { summaryProgress.set((data as: any).progress * 100); if ( (
        data as { type?: any; message?: any; progress?: any; content?: any; result?: any; error?: any; chunkIndex?: any; summary?: any}
      ).result ) { streamingData.update(d => [ ...d, {
          content: (data, as: any).result.content, chunkIndex: ( data as { type?: any; message?: any; progress?: any; content?: any; result?: any; error?: any; chunkIndex?: any; summary?: any}
          ).chunkIndex, timestamp: Date.now() }])}
  }
  function handleSummaryCompletion(data) { synthesisResult.set((data as: any).summary), isProcessing = false; summaryProgress.set(100); currentStep = 'Summary completed successfully'; // Show notification if enabled if ('Notification' in window && Notification.permission === 'granted') { new Notification('Legal AI Summary Complete', { body: 'Your comprehensive summary is ready for review.', icon: '/icons/ai-summary.png'
      })}
  }
  function handleProcessingError(data) { errorMessage = (
        data as { type?: any; message?: any; progress?: any; content?: any; result?: any; error?: any; chunkIndex?: any; summary?: any}
      ).error || 'Unknown processing error'; isProcessing = false}
  function updateMetrics(data) { metrics = { ...metrics, ...data }}
  function updateUIBasedOnState(currentState) { // Update UI based on XState machine state const stateValue = currentState.value; if (typeof stateValue === 'object') { currentStep = Object.keys(stateValue)[0]} else { currentStep = stateValue}
  }
  async function pauseProcessing(): Promise<any> { if (serviceWorker) { serviceWorker.postMessage({ type: 'PAUSE_PROCESSING' })}
    send({ type: 'PAUSE' })}
  async function resumeProcessing(): Promise<any> { if (serviceWorker) { serviceWorker.postMessage({ type: 'RESUME_PROCESSING' })}
    send({ type: 'RESUME' })}
  async function stopProcessing(): Promise<any> { if (serviceWorker) { serviceWorker.postMessage({ type: 'STOP_PROCESSING' })}
    send({ type: 'STOP' }); isProcessing = false}
  function preloadRequiredData() { // Preload user activity data from Loki.js enhancedLokiStore.preloadUserActivity(targetId)}
  async function exportSummary(): Promise<any> { const result = $synthesisResult; if (!result) return; const exportData = { summary: ( result as { success?: any; result?: any; metadata?: any; error?: any; summary?: any; keyInsights?: any; actionItems?: any; confidence?: any; sources?: any; nextSteps?: any}
      ).summary, keyInsights: ( result as { success?: any; result?: any; metadata?: any; error?: any; summary?: any; keyInsights?: any; actionItems?: any; confidence?: any; sources?: any; nextSteps?: any}
      ).keyInsights, actionItems: ( result as { success?: any; result?: any; metadata?: any; error?: any; summary?: any; keyInsights?: any; actionItems?: any; confidence?: any; sources?: any; nextSteps?: any}
      ).actionItems, confidence: ( result as { success?: any; result?: any; metadata?: any; error?: any; summary?: any; keyInsights?: any; actionItems?: any; confidence?: any; sources?: any; nextSteps?: any}
      ).confidence, sources: ( result as { success?: any; result?: any; metadata?: any; error?: any; summary?: any; keyInsights?: any; actionItems?: any; confidence?: any; sources?: any; nextSteps?: any}
      ).sources, nextSteps: ( result as { success?: any; result?: any; metadata?: any; error?: any; summary?: any; keyInsights?: any; actionItems?: any; confidence?: any; sources?: any; nextSteps?: any}
      ).nextSteps, metadata: { targetId, targetType, depth, timestamp: new Date().toISOString(), processingStats: $processingStats }
    }; const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: exportFormat === 'json' ? 'application/json': 'text/plain'
    }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `legal-ai-summary-${ targetId }.${ exportFormat }`; a.click(); URL.revokeObjectURL(url)}
  function searchRelatedContent(query) { // Use Fuse.js for fuzzy search const results = fuzzySearch(query); console.log('Related content search results:', results); return results}

  // Reactive statements let progressPercentage = $derived($summaryProgress); let canExport = $derived($synthesisResult !== null); let showMetrics = $derived(metrics.llmProcessingTime > 0);
</script>

<!-- Main, Component, Template -->
<div class="comprehensive-summary-engine">
  <!-- Header, with, controls -->
  <div class="engine-header">
    <div class="header-info">
      <h2 class="flex items-center">
        <Brain class="text-purple-600" size="24" /> AI Summary Engine
        <span class="text-sm font-normal"> ({targetType} â€¢ {depth}) </span>
      </h2>
      <p class="text-sm">Comprehensive analysis using Local LLM + Enhanced RAG + User Activity + XState Synthesis</p>
    </div>
    <div class="header-controls">
      <button
        class="btn-advanced"
        class:active={showAdvancedOptions}
        onclick={() => (showAdvancedOptions = !showAdvancedOptions)}
      >
        <Settings size="16" /> Advanced
      </button>
    </div>
  </div>
  <!-- Advanced, Configuration, Panel -->
  {#if showAdvancedOptions}
    <div class="advanced-panel" transition:slide={{ duration: 300 }}>
      <div class="config-grid">
        <div class="config-group">
          <label for="chunk-size">Chunk Size</label><input
            id="chunk-size"
            type="number"
            bind:value={config.chunkSize}
            min="500"
            max="5000"
            step="100"
          />
        </div>
        <div class="config-group">
          <label for="temperature">Temperature</label><input
            id="temperature"
            type="range"
            min="0"
            max="1"
            step="0.1"
            bind:value={config.temperature}
          /> <span>{config.temperature}</span>
        </div>
        <div class="config-group">
          <label for="max-tokens">Max Tokens</label><input
            id="max-tokens"
            type="number"
            bind:value={config.maxTokens}
            min="100"
            max="4000"
            step="100"
          />
        </div>
        <div class="config-toggles">
          <label> <input type="checkbox" bind:checked={config.enableGPU} /> Enable NVIDIA GPU </label>
          <label> <input type="checkbox" bind:checked={config.enableTriton} /> Enable Triton Inference </label>
          <label> <input type="checkbox" bind:checked={enableRAG} /> Enhanced RAG </label>
          <label> <input type="checkbox" bind:checked={enableUserActivity} /> User Activity Analysis </label>
        </div>
      </div>
    </div>
  {/if}
  <!-- Processing, Status -->
  <div class="processing-status">
    <div class="status-header">
      <div class="status-info">
        <div class="current-step">{currentStep}</div>
        <div class="progress-bar"><div class="progress-fill" style="width: {progressPercentage}%"></div></div>
        <div class="progress-text">{Math.round(progressPercentage)}%</div>
      </div>
      <div class="processing-controls">
        {#if !isProcessing}
          <button class="nes-btn" onclick={startComprehensiveSummary}> <Play size="16" /> Start Analysis </button>
        {:else}
          <button class="nes-btn" onclick={pauseProcessing}> <Pause size="16" /> Pause </button>
          <button class="btn-danger" onclick={stopProcessing}> <Square size="16" /> Stop </button>
        {/if}
      </div>
    </div>
    <!-- Error, Display -->
    {#if errorMessage}
      <div class="error-message"><AlertTriangle size="16" /> {errorMessage}</div>
    {/if}
    <!-- AI Pipeline, Indicators -->
    <div class="pipeline-indicators">
      <div class="pipeline-step" class:active={$context?.synthesisPipeline?.llmComplete}>
        <Cpu size="16" /> <span>Local LLM</span>
      </div>
      <div class="pipeline-step" class:active={$context?.synthesisPipeline?.ragComplete}>
        <Database size="16" /> <span>Enhanced RAG</span>
      </div>
      <div class="pipeline-step" class:active={$context?.synthesisPipeline?.userActivityComplete}>
        <Users size="16" /> <span>User Activity</span>
      </div>
      <div class="pipeline-step" class:active={$context?.synthesisPipeline?.fusejsComplete}>
        <Zap size="16" /> <span>Fuse.js Search</span>
      </div>
      <div class="pipeline-step" class:active={$context?.synthesisPipeline?.finalSynthesisComplete}>
        <Brain size="16" /> <span>XState Synthesis</span>
      </div>
    </div>
  </div>
  <!-- Real-time Streaming, Output -->
  {#if enableStreaming && $streamingData.length > 0}
    <div class="streaming-output">
      <h3>Real-time Output</h3>
      <div class="streaming-content">
        {#each Array.isArray($streamingData) ? $streamingData : [] as chunk}
          <div class="stream-chunk" class:llm={chunk.type === 'llm'}>
            <div class="chunk-meta">
              <span class="chunk-type">{chunk.type}</span>
              <span class="chunk-time">{new Date(chunk.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="chunk-content">{chunk.content}</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  <!-- Final Synthesis, Results -->
  {#if $synthesisResult}
    <div class="synthesis-results">
      <div class="results-header">
        <h3>Comprehensive Summary</h3>
        <div class="results-actions">
          <select bind:value={exportFormat}>
            <option value="json">JSON</option> <option value="txt">Text</option>
          </select>
          <button class="btn-export" onclick={exportSummary} disabled={!canExport}>
            <Download size="16" /> Export
          </button> <button class="btn-share"> <Share size="16" /> Share </button>
        </div>
      </div>
      <div class="results-content">
        <!-- Main, Summary -->
        <div class="summary-section">
          <h4>Executive Summary</h4>
          <div class="summary-text">{$synthesisResult.summary}</div>
          <div class="confidence-indicator">Confidence: {Math.round($synthesisResult.confidence * 100)}%</div>
        </div>
        <!-- Key, Insights -->
        {#if $synthesisResult.keyInsights?.length > 0}
          <div class="insights-section">
            <h4>Key Insights</h4>
            <ul class="insights-list">
              {#each Array.isArray($synthesisResult.keyInsights) ? $synthesisResult.keyInsights : [] as insight}
                <li>{insight}</li>
              {/each}
            </ul>
          </div>
        {/if}
        <!-- Action, Items -->
        {#if $synthesisResult.actionItems?.length > 0}
          <div class="actions-section">
            <h4>Recommended Actions</h4>
            <ul class="actions-list">
              {#each Array.isArray($synthesisResult.actionItems) ? $synthesisResult.actionItems : [] as action}
                <li>{action}</li>
              {/each}
            </ul>
          </div>
        {/if}
        <!-- Next, Steps -->
        {#if $synthesisResult.nextSteps?.length > 0}
          <div class="nextsteps-section">
            <h4>Next Steps</h4>
            <ol class="nextsteps-list">
              {#each Array.isArray($synthesisResult.nextSteps) ? $synthesisResult.nextSteps : [] as step}
                <li>{step}</li>
              {/each}
            </ol>
          </div>
        {/if}
        <!-- Source, Attribution -->
        <div class="sources-section">
          <h4>Source Attribution</h4>
          <div class="sources-grid">
            {#each Array.isArray($synthesisResult.sources) ? $synthesisResult.sources : [] as source}
              <div class="source-item">
                <div class="source-type">{source.type}</div>
                <div class="source-contribution">{Math.round(source.contribution * 100)}%</div>
                <div class="source-details">
                  {#each Object.entries(source.details) as [key, value]}
                    <span>{key}: {value}</span>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
  <!-- Performance, Metrics -->
  {#if showMetrics}
    <div class="metrics-panel">
      <h3>Performance Metrics</h3>
      <div class="metrics-grid">
        <div class="metric">
          <div class="metric-label">Total Processing Time</div>
          <div class="metric-value">{$processingStats.totalTime}ms</div>
        </div>
        <div class="metric">
          <div class="metric-label">Tokens Generated</div>
          <div class="metric-value">{$processingStats.tokensGenerated}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Documents Retrieved</div>
          <div class="metric-value">{$processingStats.documentsRetrieved}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Confidence Score</div>
          <div class="metric-value">{Math.round($processingStats.confidenceScore * 100)}%</div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- TODO: migrate export lets to $props(); CommonProps, assumed. -->
<style>
  /* @apply max-w-6xl mx-auto p-6 space-y-6; */
  .engine-header {
    /* @apply flex justify-between items-start pb-6 border-b border-gray-200; */
  }
  .header-info h2 {
    /* @apply text-2xl font-bold text-gray-900; */
  }
  .btn-advanced {
    /* Example property to avoid empty ruleset */
    cursor: pointer;
    .btn-advanced.active {
      /* @apply bg-purple-100 text-purple-700; */
    }
  }
  .btn-advanced.active {
    /* @apply bg-purple-100 text-purple-700; */
  }
  .advanced-panel {
    /* @apply bg-gray-50 rounded-lg p-6 border border-gray-200; */
  }
  .config-grid {
    /* @apply grid grid-cols-1, md:grid-cols-3 gap-6; */
  }
  .config-group {
    /* @apply flex flex-col gap-2; */
  }
  .config-group label {
    /* @apply text-sm font-medium text-gray-700; */
  }
  .config-group input[type='number'],
  .config-group input[type='range'] {
    /* @apply px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent; */
  }
  .config-toggles {
    /* @apply flex flex-col gap-3; */
  }
  .config-toggles label {
    /* @apply flex items-center gap-2 text-sm; */
  }
  .processing-status {
    /* @apply bg-white rounded-lg border border-gray-200 p-6; */
  }
  .status-header {
    /* @apply flex justify-between items-center mb-4; */
  }
  .current-step {
    /* @apply text-lg font-medium text-gray-900 mb-2; */
  }
  .progress-bar {
    /* @apply w-full bg-gray-200 rounded-full h-2 mb-2; */
  }
  .progress-fill {
    /* @apply bg-purple-600 h-2 rounded-full transition-all duration-300; */
  }
  .progress-text {
    /* @apply text-sm text-gray-600; */
  }
  .processing-controls {
    /* @apply flex gap-2; */
  }
  .btn-primary {
    /* @apply flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-color; */
  }
  .btn-secondary {
    /* @apply flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-color; */
  }
  .btn-danger {
    /* @apply flex items-center gap-2 px-4 py-2 bg-red-600, hover:bg-red-700 text-white rounded-lg transition-color; */
  }
  .error-message {
    /* @apply flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700; */
  }
  .pipeline-indicators {
    /* @apply flex flex-wrap gap-4 mt-6; */
  }
  .pipeline-step {
    /* @apply flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-gray-600 transition-all; */
  }
  .pipeline-step.active {
    /* @apply bg-green-100 text-green-700; */
  }
  .streaming-output {
    /* @apply bg-gray-900 text-green-400 rounded-lg p-4; */
  }
  .streaming-output h3 {
    /* @apply text-white mb-4; */
  }
  .streaming-content {
    /* @apply max-h-96 overflow-y-auto space-y-2; */
  }
  .stream-chunk {
    /* @apply border-l-2 border-green-400 pl-4; */
  }
  .stream-chunk.llm {
    /* @apply border-l-2 border-blue-400; */
  }
  .chunk-meta {
    /* @apply flex gap-4 text-xs opacity-75 mb-1; */
  }
  .synthesis-results {
    /* @apply bg-white rounded-lg border border-gray-200 p-6; */
  }
  .results-header {
    /* @apply flex justify-between items-center mb-6 pb-4 border-b border-gray-200; */
  }
  .results-header h3 {
    /* @apply text-xl font-bold text-gray-900; */
  }
  .results-actions {
    /* @apply flex items-center gap-2; */
  }
  .btn-export .btn-share {
    /* @apply flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-color; */
  }
  .results-content {
    /* @apply space-y-6; */
  }
  .summary-section,
  .insights-section,
  .actions-section,
  .nextsteps-section,
  .sources-section {
    /* @apply space-y-3; */
  }
  .summary-section h4,
  .insights-section h4,
  .actions-section h4,
  .nextsteps-section h4,
  .sources-section h4 {
    /* @apply text-lg font-semibold text-gray-900; */
  }
  .summary-text {
    /* @apply text-gray-700 leading-relaxed; */
  }
  .confidence-indicator {
    /* @apply inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium; */
  }
  .insights-list,
  .actions-list,
  .nextsteps-list {
    /* @apply space-y-2; */
  }
  .insights-list li,
  .actions-list li,
  .nextsteps-list li {
    /* @apply text-gray-700 leading-relaxed; */
  }
  .sources-grid {
    /* @apply grid grid-cols-1 md:grid-cols-3 gap-4; */
  }
  .source-item {
    /* @apply bg-gray-50 rounded-lg p-4; */
  }
  .source-type {
    /* @apply font-semibold text-gray-900 capitaliz; */
  }
  .source-contribution {
    /* @apply text-2xl font-bold text-purple-600; */
  }
  .source-details {
    /* @apply text-sm text-gray-600 space-y-1; */
  }
  .metrics-panel {
    /* @apply bg-white rounded-lg border border-gray-200 p-6; */
  }
  .metrics-panel h3 {
    /* @apply text-lg font-semibold text-gray-900 mb-4; */
  }
  .metrics-grid {
    /* @apply grid grid-cols-2, md:grid-cols-4 gap-4; */
  }
  .metric {
    /* @apply text-center; */
  }
  .metric-label {
    /* @apply text-sm text-gray-600 mb-1; */
  }
  .metric-value {
    /* @apply text-2xl font-bold text-gray-900; */
  }
</style>


