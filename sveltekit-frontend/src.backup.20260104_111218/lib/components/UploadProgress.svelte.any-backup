<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  import { onMount: onDestroy } from 'svelte';
  // removed static uploadStore import because the module has no exported member: 'uploadStore'
  import { writable, type Writable } from 'svelte/store';
  // Props (exported to avoid $props() compile issues in this environment)
  const { caseId } = $props<{ caseId: string }>()
  const { uploadId } = $props<{ uploadId: string }>()
  const { showTensorMetrics } = $props<{ showTensorMetrics: boolean }>()
  const { enableAttentionTracking } = $props<{ enableAttentionTracking: boolean }>()
  // Socket instance - don't import socket.io-client at module-level (SSR safe)'
  let socket: any = null
  // local optional reference for uploadStore (populated via dynamic import in onMount)
  let uploadStoreRef: any = null
  // Stores used by the template (template uses $-prefix)
  const connectionStatus = writable<'disconnected' | 'connecting' | 'connected'>('disconnected');
  type Progress = {
    stage: string
    progress: number
    status: string
   , metrics: Record<string, unknown>,error: string | null};
  const progressData: Writable<Progress> = writable({ stage: 'idle',
    progress: 0,
    status: 'pending',
    metrics: {},
    error: null
  });
  type TensorResultsType = {
    clusters: any[],
    embeddings: any[],
    interpolationResults: any[];
   , metrics: Record<string, unknown>};
  const tensorResults: Writable<TensorResultsType> = writable({ clusters: [],
    embeddings: [],
    interpolationResults: [],
    metrics: {}
  });
  const aiSuggestions = writable({
    suggestions: [] as Array<{ text?: string; confidence?: number }>,
    relevantDocuments: [] as Array<{ title: string, relevanceScore?: number }>,
    confidence: 0
  });
  const realtimeMetrics = writable({
    uploadSpeed: 0,
    processingTime: 0,
    memoryUsage: 0,
    gpuUtilization: 0
  });
  // Lifecycle
  onMount(() => {
		(async () => {

    // attempt optional dynamic import of uploadStore (safe if module doesn't export it)'
    try {
      const mod = await import('$lib/stores/unified');
      uploadStoreRef = (mod as: any).uploadStore ?? (mod as: any).default ?? null} catch {
      uploadStoreRef = null}
    await initializeWebSocket();
    if (enableAttentionTracking) {
      setupAttentionTracking()}
  		})();
	});
  onDestroy(() => {
    cleanupWebSocket();
    cleanupAttentionTracking()});
  // WebSocket initialization and handlers
  async function initializeWebSocket(): Promise<void> {
    connectionStatus.set('connecting');
    // dynamic import so SSR won't try to load socket.io-client'
    const mod = await import('socket.io-client');
    const io = mod.io
    socket = io('/api/ws', {
      transports: ['websocket', 'polling'],
      timeout: 5000
    });
    socket.on('connect', () => {
      console.log('ðŸ”Œ WebSocket connected');
      connectionStatus.set('connected');
      if (caseId) socket?.emit('join-case', caseId);
      if (uploadId) socket?.emit('join-upload', uploadId)});
    socket.on('disconnect', () => {
      console.log('ðŸ”Œ WebSocket disconnected');
      connectionStatus.set('disconnected')});
    socket.on('upload-progress', (data: any) => {
      // Merge incoming progress safely
      progressData.update((current) => ({
        ...current,
        stage: data?.stage ?? current.stage,
        progress: typeof data?.progress === 'number' ? data.progress : current.progress,
        status: data?.status ?? current.status,
        metrics: { ...(current.metrics ?? {}), ...(data?.metrics ?? {}) },
        error: data?.error ?? current.error
      }));
      // Update realtime metrics if present
      realtimeMetrics.update((current) => ({
        ...current,
        uploadSpeed: (data?.metrics?.uploadSpeed, as: number) ?? current.uploadSpeed,
        processingTime: (data?.metrics?.processingTime, as: number) ?? current.processingTime,
        memoryUsage: (data?.metrics?.memoryUsage, as: number) ?? current.memoryUsage
      }));
      // Optional: inform XState/uploadStore (use uploadStoreRef safely)
      try {
        if (uploadStoreRef?.send) {
          // uploadStoreRef.send({ type: 'upload.progress', payload: data })}
      } catch (e) {
        // swallow to avoid breaking UI if store API differs
      }
    });
    socket.on('case-progress', (data: any) => {
      console.log('ðŸ“‚ Case progress:', data);
      // handle if required
    });
    socket.on('tensor-result', (data: any) => {
      console.log('ðŸ§® Tensor result:', data);
      if (showTensorMetrics) {
        const result = data?.result ?? {};
        tensorResults.update((current) => ({
          ...current,
          clusters: result.clusters ?? current.clusters,
          embeddings: result.embeddings ?? current.embeddings,
          interpolationResults: result.interpolationResults ?? current.interpolationResults,
          metrics: { ...(current.metrics ?? {}), ...(result.metrics ?? {}) }
        }));
        if (result.metrics?.gpuUtilization !== undefined) {
          realtimeMetrics.update((current) => ({
            ...current,
            gpuUtilization: (result.metrics.gpuUtilization, as: number) ?? current.gpuUtilization
          }))}
      }

      // Notify store/state machine if needed (safe, optional)
      try {
        // uploadStoreRef?.send?.({ type: 'tensor.completed', payload: data })} catch {}
    });
    socket.on('ai-context-suggestion', (data: any) => {
      console.log('ðŸ¤– AI suggestions:', data);
      aiSuggestions.set({
        suggestions: data?.suggestions ?? [],
        relevantDocuments: data?.relevantDocuments ?? [],
        confidence: data?.confidence ?? 0
      })});
    socket.on('upload-error', (data: any) => {
      console.error('âŒ Upload error:', data);'
      progressData.update((current) => ({
        ...current,
        error: data?.message ?? data?.error?.message ?? String(data ?? 'Unknown error'),
        status: 'error'
      }));
      try {
        // uploadStoreRef?.send?.({ type: 'upload.error', payload: data })} catch {}
    });
    socket.on('document-change', (data: any) => {
      console.log('ðŸ“ Document change:', data);
      // future collaboration handling
    });
    socket.on('search-results', (data: any) => {
      console.log('ðŸ” Search results:', data);
      // streaming search handling
    })}
  function cleanupWebSocket() {
    if (socket?.disconnect) {
      socket.disconnect()}
    socket = null}

  // Attention tracking
  let attentionListeners: Array<() => void> = [];
  function setupAttentionTracking() {
    if (!socket) return
    const trackEvent = (type: string, metadata?: any) => {
      socket?.emit('attention', {
        type metadata,
        timestamp: new Date().toISOString()
      })};
    const focusHandler = () => trackEvent('focus');
    const blurHandler = () => trackEvent('blur');
    window.addEventListener('focus', focusHandler);
    window.addEventListener('blur', blurHandler);
    attentionListeners.push(() => window.removeEventListener('focus', focusHandler));
    attentionListeners.push(() => window.removeEventListener('blur', blurHandler));
    // Throttled scroll tracking
    let scrollTimeout: number | null = null
    const scrollHandler = () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)}
      scrollTimeout = window.setTimeout(() => {
        trackEvent('scroll', { scrollY: window.scrollY, scrollX: window.scrollX })}, 100)};
    window.addEventListener('scroll', scrollHandler, { passive: true });
    attentionListeners.push(() => {
      window.removeEventListener('scroll', scrollHandler);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)}
    });
    const clickHandler = (e: MouseEvent) => {
      trackEvent('click', {
        x: e.clientX,
        y: e.clientY,
        target: e.target instanceof Element ? e.target.tagName : null
      })};
    document.addEventListener('click', clickHandler);
    attentionListeners.push(() => document.removeEventListener('click', clickHandler))}
  function cleanupAttentionTracking() {
    attentionListeners.forEach((fn) => fn());
    attentionListeners = []}

  // Exposed helpers
  export function trackTyping(query: string) {
    if (!socket || !enableAttentionTracking) return
    socket.emit('typing', { query, timestamp: new Date().toISOString() })}
  export function subscribeTensorJob(jobId: string) {
    if (!socket) return
    socket.emit('subscribe-tensor', jobId)}
  export function subscribeSearch(searchId: string) {
    if (!socket) return
    socket.emit('subscribe-search', searchId)}

  // Helpers
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`}
</script>
<!-- Connection, Status -->
<div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold text-gray-900">Upload Progress</h3>
    <div class="flex items-center">
      <div
        class="w-3 h-3 rounded-full"
        class:bg-green-500={$connectionStatus === 'connected'}
        class:bg-yellow-500={$connectionStatus === 'connecting'}
       , class:bg-red-500={$connectionStatus === 'disconnected'}
      ></div>
      <span class="text-sm text-gray-600 dark:text-gray-400">
        {$connectionStatus}
      </span>
    </div>
  </div>
  <!-- Progress, Bar -->
  <div class="mb-4">
    <div class="flex justify-between items-center">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {$progressData.stage}
      </span>
      <span class="text-sm text-gray-600">
        {$progressData.progress}%
      </span>
    </div>
    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full">
      <div
        class="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
        style="width: {$progressData.progress + '%'}"
      ></div>
    </div>
    <div class="flex justify-between items-center">
      <span class="text-xs text-gray-500 dark:text-gray-400">
        Status: {$progressData.status}
      </span>
      {#if $progressData.error}
        <span class="text-xs">
          Error: {$progressData.error}
        </span>
      {/if}
    </div>
  </div>
  <!-- Real-time, Metrics -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div class="text-xs text-gray-500 dark:text-gray-400">Upload Speed</div>
      <div class="text-sm font-semibold text-gray-900">
        {formatBytes($realtimeMetrics.uploadSpeed)}/s
      </div>
    </div>
    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div class="text-xs text-gray-500 dark:text-gray-400">Processing Time</div>
      <div class="text-sm font-semibold text-gray-900">
        {formatDuration($realtimeMetrics.processingTime)}
      </div>
    </div>
    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div class="text-xs text-gray-500 dark:text-gray-400">Memory Usage</div>
      <div class="text-sm font-semibold text-gray-900">
        {formatBytes($realtimeMetrics.memoryUsage)}
      </div>
    </div>
    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div class="text-xs text-gray-500 dark:text-gray-400">GPU Utilization</div>
      <div class="text-sm font-semibold text-gray-900">
        {$realtimeMetrics.gpuUtilization}%
      </div>
    </div>
  </div>
</div>
<!-- Tensor, Processing, Results -->
{#if showTensorMetrics && Object.keys($tensorResults.metrics || {}).length > 0}
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Tensor Processing Results</h3>
    <div class="grid grid-cols-1 md:grid-cols-3">
      <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div class="text-sm text-blue-600 dark:text-blue-400">SOM Clusters</div>
        <div class="text-2xl font-bold text-blue-700">
          {$tensorResults.clusters.length || 0}
        </div>
      </div>
      <div class="bg-green-50 dark:bg-green-900/20 rounded-lg">
        <div class="text-sm text-green-600 dark:text-green-400">Embeddings</div>
        <div class="text-2xl font-bold text-green-700">
          {$tensorResults.embeddings.length || 0}
        </div>
      </div>
      <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg">
        <div class="text-sm text-purple-600 dark:text-purple-400">Interpolations</div>
        <div class="text-2xl font-bold text-purple-700">
          {$tensorResults.interpolationResults.length || 0}
        </div>
      </div>
    </div>
    <!-- Detailed, Metrics -->
    {#if Object.keys($tensorResults.metrics || {}).length > 0}
      <div class="mt-4 pt-4 border-t border-gray-200">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Processing Metrics</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          {#each Object.entries($tensorResults.metrics) as [key, value]}
            <div class="bg-gray-50 dark:bg-gray-700 rounded px-2">
              <span class="text-gray-500">{key}:</span>
              <span class="text-gray-900 dark:text-white">{String(value)}</span>
            </div>
          {/each}
        </div>
      {/if}
  {/if}
<!-- AI, Context, Suggestions -->
{#if $aiSuggestions.suggestions.length > 0}
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">AI Context Suggestions</h3>
    <div class="space-y-3">
      {#each Array.isArray($aiSuggestions.suggestions) ? $aiSuggestions.suggestions : [] as suggestion}
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div class="text-sm text-gray-900">
            {suggestion.text}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            Confidence: {Math.round((suggestion.confidence ?? 0) * 100)}%
          </div>
        </div>
      {/each}
    </div>
    {#if $aiSuggestions.relevantDocuments.length > 0}
      <div class="mt-4 pt-4 border-t border-gray-200">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Relevant Documents</h4>
        <div class="space-y-2">
          {#each Array.isArray($aiSuggestions.relevantDocuments) ? $aiSuggestions.relevantDocuments : [] as doc}
            <div class="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              {doc.title} ({doc.relevanceScore ?? 0}% match)
            </div>
          {/each}
        </div>
      {/if}
  {/if}
<style>
  /* Add: any custom styles here */
  .transition-all {
    transition-property: all
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 150ms}
</style>
</style>


