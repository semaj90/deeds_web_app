<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  // Svelte, 5 runes are auto-imported
  import type { PageData, ActionData } from './$types.js';
  import { onMount, onDestroy } from 'svelte';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  // Enhanced-Bits orchestrated components
  import 
    Button,
    Card,
    Input,
    Badge
   from "$lib/components/ui/enhanced-bits.svelte";
  import 
    OrchestratedCard,
    OrchestratedButton,
    type LegalEvidenceItem,
    getConfidenceClass,
    formatAnalysisDate
   from "$lib/components/ui/orchestrated.svelte";
  // Icons for CUDA streaming
  import {
    Cpu, Zap, Play, Square, Settings, TrendingUp, Activity,
    Database, Clock, BarChart3, Thermometer, Power, Memory,
    CheckCircle, AlertCircle, Eye, Download, Upload, Layers
  } from 'lucide-svelte';
  let { data, form }: { data: PageData;, form: ActionData } = $props();
  // Svelte, 5 runes for CUDA streaming state
  let selectedOperation = $state<string>('document_vectorization');
  let inputText = $state<string>('');
  let batchSize = $state<number>(10);
  let useGpu = $state<boolean>(true);
  let isStreaming = $state<boolean>(false);
  let currentSession = $state<string | null>(null);
  let streamResults = $state<any[]>([]);
  let processingProgress = $state<number>(0);
  let liveMetrics = $state((data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).sessionStats);
  let selectedTab = $state<'streaming' | 'monitoring' | 'results' | 'config'>('streaming');
  // Real-time metrics update
  let metricsInterval: NodeJS.Timeout | null = null
  let streamingSocket: EventSource | null = null
  // Derived states
  let gpuStatus = $derived((data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.gpuAvailable ? 'available' : 'unavailable');
  let canStream = $derived(!isStreaming && inputText.trim.length > 0);
  let gpuUtilizationColor = $derived(
    (data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.utilization?.gpu > 80 ? 'text-red-600' :
    (data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.utilization?.gpu > 50 ? 'text-yellow-600' : 'text-green-600'
  );
  // CUDA streaming functions
  async function startCudaStream(): Promise<any> {
    if (!canStream) return
    isStreaming = true
    processingProgress = 0
    streamResults = [];
    const formData = new FormData();
    formData.append('operationType', selectedOperation);
    formData.append('inputData', inputText);
    formData.append('batchSize', batchSize.toString());
    try {
      const response = await fetch('?/startStream', {
        method: 'POST',
        body: formData
      });
      const result = await (response as { json?: any }).json();
      if ((result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).success) {
        currentSession = (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).sessionId
        // Start streaming updates
        startStreamingUpdates((result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).sessionId)}
    } catch (error) {
      console.error('Failed to start CUDA stream:', error);
      isStreaming = false}
  }
  async function stopCudaStream(): Promise<any> {
    if (!currentSession) return
    const formData = new FormData();
    formData.append('sessionId', currentSession);
    try {
      await fetch('?/stopStream', {
        method: 'POST',
        body: formData
      });
      stopStreamingUpdates()} catch (error) {
      console.error('Failed to stop CUDA stream:', error)}
  }
  function startStreamingUpdates(sessionId: string) {
    // Simulate real-time streaming updates
    const updateInterval = setInterval(() => {
      processingProgress += Math.random() * 15
      if (processingProgress >= 100) {
        processingProgress = 100
        // Add final result
        streamResults = [...streamResults, {
          id: Date.now(),
          operation selectedOperation,
          input: inputText.slice(0, 100) + '...',
          status: 'completed',
          processingTime: Math.floor(Math.random() * 2000) + 500,
          gpuAccelerated: useGpu,
          results: { vectorsGenerated: Math.floor(Math.random() * 500) + 100,
            entitiesExtracted: Math.floor(Math.random() * 20) + 5,
            confidence: 0.85 + Math.random() * 0.1}
        }];
        stopStreamingUpdates()} else {
        // Add intermediate result
        streamResults = [...streamResults, {
          id: Date.now(),
          operation `${selectedOperation}_chunk_${streamResults.length + 1}`,
          status: 'processing',
          progress: processingProgres}]}
    }, 800);
    // Store interval for cleanup
    metricsInterval = updateInterval}
  function stopStreamingUpdates() {
    isStreaming = false
    currentSession = null
    processingProgress = 0
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null}
  }
  async function processSingleDocument(): Promise<any> {
    if (!inputText.trim()) return
    const startTime = Date.now();
    const formData = new FormData();
    formData.append('documentData', inputText);
    formData.append('processingType', selectedOperation);
    formData.append('useGpu', useGpu.toString());
    try {
      const response = await fetch('?/processDocument', {
        method: 'POST',
        body: formData
      });
      const result = await (response as { json?: any }).json();
      if ((result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).success) {
        streamResults = [...streamResults, {
          id: Date.now(),
          operation `single_${selectedOperation}`,
          input: inputText.slice(0, 100) + '...',
          status: 'completed',
          processingTime: (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).processingTime,
          gpuAccelerated: (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).gpuAccelerated,
          results: (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).result,
          timestamp: (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).timestamp
        }]}
    } catch (error) {
      console.error('Single document processing failed:', error)}
  }
  // Performance metrics formatting
  function formatMemory(gb: number): string {
    return `${gb.toFixed(1)}GB`}
  function formatUtilization(percent: number): string {
    return `${percent}%`}
  function formatThroughput(docsPerSec: number): string {
    return docsPerSec >= 1000 ? `${(docsPerSec / 1000).toFixed(1)}K/s` : `${docsPerSec}/s`}
  function getOperationIcon(operation: string) {
    switch (operation) {
      case, 'document_vectorization': return Databa
      case, 'similarity_search': return BarChart3
      case, 'text_embedding': return Layer
      case, 'legal_entity_extraction': return Ey
      default: return Cpu}
  }
  // Cleanup on destroy
  onDestroy(() => {
    stopStreamingUpdates();
    if (streamingSocket) {
      streamingSocket.close()}
  });
  // Auto-refresh metrics
  $effect(() => {
    const refreshInterval = setInterval(() => {
      // Simulate live metrics updates
      liveMetrics = {
        ...liveMetrics,
        throughputCurrent: liveMetrics.throughputCurrent + Math.floor(Math.random() * 20) - 10,
        avgProcessingTime: liveMetrics.avgProcessingTime + Math.floor(Math.random() * 50) - 25,
        queueSize: Math.max(0, liveMetrics.queueSize + Math.floor(Math.random() * 6) - 3)
      }
    }, 3000);
    return () => clearInterval(refreshInterval)});
</script>
<svelte:head>
  <title>CUDA Streaming - GPU-Accelerated Legal AI Processing</title>
</svelte:head>
<div class="container mx-auto p-6">
  <!-- Header -->
  <div class="text-center">
    <h1 class="text-4xl font-bold text-primary mb-4 flex items-center justify-center">
      <Cpu class="w-10 h-10" />
      CUDA Streaming
    </h1>
    <p class="text-lg nes-text is-disabled max-w-3xl">
      GPU-accelerated real-time legal document processing with NVIDIA CUDA and streaming analytics
    </p>
    <div class="flex justify-center gap-2">
      <Badge
        variant={(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.gpuAvailable ? 'default' : 'destructive'}
        class="gap-1"
      >
        <Zap class="w-3" />
        GPU {(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.gpuAvailable ? 'Available' : 'Unavailable'}
      </Badge>
      <Badge variant="secondary" class="gap-1">
        <Memory class="w-3" />
        {(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.totalMemory} VRAM
      </Badge>
      <Badge variant="secondary" class="gap-1">
        <Activity class="w-3" />
        CUDA {(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.cudaVersion}
      </Badge>
      <Badge variant="secondary" class="gap-1">
        <TrendingUp class="w-3" />
        {formatThroughput(liveMetrics.throughputCurrent)} Throughput
      </Badge>
    </div>
  </div>
  <!-- Tab, Navigation -->
  <div class="flex justify-center">
    <div class="flex space-x-1 bg-muted p-1">
      {#each [
        { id: 'streaming', label: 'Real-Time Streaming', icon Play },
        { id: 'monitoring', label: 'GPU Monitoring', icon Activity },
        { id: 'results', label: 'Processing Results', icon BarChart3 },
        { id: 'config', label: 'Configuration', icon Settings }
      ] as tab}
        <button
          onclick={() => selectedTab = tab.id}
          class="flex items-center gap-2" px-4 py-2 rounded-md text-sm font-medium transition-colors
                 {selectedTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
        >
          {@render tab.icon({ class: "w-4 h-4" })}
          {tab.label}
        </button>
      {/each}
    </div>
  </div>
  <!-- Real-Time, Streaming, Tab -->
  {#if selectedTab === 'streaming'}
    <div class="grid grid-cols-1 lg:grid-cols-2">
      <!-- Streaming, Controls -->
      <OrchestratedCard.Analysis>
        <div.Header, class="nes-container">
          <div.Title class="flex items-center gap-2">
            <Play class="w-5" />
            Streaming Configuration
          </div.Title>
          <div.Description, class="nes-container">
            Configure and start GPU-accelerated document processing streams
          </div.Description>
        </div.Header>
        <div.Content, class="space-y-6">
          <!-- Operation, Selection -->
          <div class="space-y-3">
            <label class="text-sm" for="processing-operation">Processing Operation</label>
            <select id="processing-operation" ;
              bind:value={selectedOperation}
              class="w-full p-2 border rounded-md"
              disabled={isStreaming}
            >
              {#each (data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).supportedOperations as operation}
                <option value={operation}>
                  {operation.replace.replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              {/each}
            </select>
          </div>
          <!-- Input, Data -->
          <div class="space-y-3">
            <label class="text-sm" for="input-data">Input Data</label>
            <textarea id="input-data"
              bind:value={inputText}
              placeholder="Enter legal document text for processing..."
              class="w-full h-32 p-3 border rounded-md"
              disabled={isStreaming}
            ></textarea>
          </div>
          <!-- Configuration, Options -->
          <div class="grid grid-cols-2">
            <div class="space-y-2">
              <label class="text-sm">Batch Size</label>
              <Input
                type="number";
                bind:value={batchSize}
                min="1"
                max="100"
                disabled={isStreaming}
              />
            </div>
            <div class="space-y-2">
              <label class="flex items-center">
                <input
                  type="checkbox";
                  bind:checked={useGpu}
                  disabled={isStreaming || !(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.gpuAvailable}
                  class="rounded"
                />
                <span class="text-sm">Use GPU Acceleration</span>
              </label>
            </div>
          </div>
          <!-- Control, Buttons -->
          <div class="flex">
            <div class="flex-1">
  <OrchestratedButton .ProcessDocument
              onclick={startCudaStream}
              disabled={!canStream}>
              {#if isStreaming}
                <div class="animate-spin w-4 h-4 border-2 border-white border-t-transparent"></div>
                Streaming...
              {:else}
                <Play class="w-4" />
                Start Stream
              {/if}
            </OrchestratedButton.ProcessDocument>
            {#if isStreaming}
              <button class="nes-btn is-error"
              >
                <Square class="w-4" />
                Stop
              </button>
            {:else}
              <Button
                variant="ghost"
                onclick={processSingleDocument}
                disabled={!inputText.trim()}
                class="gap-2"
              >
<Zap class="w-4" />
                Single Process
              </Button>
            {/if}
          </div>
          <!-- Processing, Progress -->
          {#if isStreaming}
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span>Processing Progress</span>
                <span>{processingProgress.toFixed(1)}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full">
                <div
                  class="bg-primary h-2 rounded-full transition-all duration-300"
                  style="width: {processingProgress}%"
                ></div>
              </div>
              {#if currentSession}
                <p class="text-xs nes-text">
                  Session {currentSession}
                </p>
              {/if}
            </div>
          {/if}
        </div.Content>
      </OrchestratedCard.Analysis>
      <!-- Live, Stream, Results -->
      <OrchestratedCard.Evidence>
        <div.Header, class="nes-container">
          <div.Title class="flex items-center gap-2">
            <Activity class="w-5" />
            Live Stream Results
          </div.Title>
          <div.Description, class="nes-container">
            Real-time processing results and performance metrics
          </div.Description>
        </div.Header>
        <div.Content, class="nes-container">
          <div class="space-y-3 max-h-96">
            {#if streamResults.length === 0}
              <div class="text-center py-8 nes-text">
                <Activity class="w-8 h-8 mx-auto mb-2" />
                <p>No active streams. Start processing to see results.</p>
              </div>
            {:else}
              {#each Array.isArray(streamResults) ? streamResults : [] as result}
                <div class="border rounded-lg">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center">
                      {@render getOperationIcon((result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).operation)({ class: "w-4 h-4" })}
                      <span class="font-medium">{(result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).operation.replace('_', ' ')}</span>
                    </div>
                    <Badge
                      variant={(result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).status === 'completed' ? 'default' : 'secondary'}
                      class="text-xs"
                    >
                      {(result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).status}
                    </Badge>
                  </div>
                  {#if (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).input}
                    <p class="text-xs nes-text is-disabled">{(result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).input}</p>
                  {/if}
                  {#if (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).processingTime}
                    <div class="flex items-center gap-4 text-xs nes-text">
                      <span>{(result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).processingTime}ms</span>
                      <span>{(result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).gpuAccelerated ? 'GPU' : 'CPU'}</span>
                      {#if (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).results?.confidence}
                        <span class={getConfidenceClass((result, as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).results.confidence)}>
                          {Math.round.results.confidence * 100)}% confidence
                        </span>
                      {/if}
                    </div>
                  {/if}
                  {#if (result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).progress !== undefined}
                    <div class="w-full bg-gray-200 rounded-full h-1">
                      <div
                        class="bg-primary h-1 rounded-full"
                        style="width: {(result as { success?: any; sessionId?: any; processingTime?: any; gpuAccelerated?: any; result?: any; timestamp?: any; operation?: any; status?: any; input?: any; results?: any; progress?: any }).progress}%"
                      ></div>
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div.Content>
      </OrchestratedCard.Evidence>
    </div>
  {/if}
  <!-- GPU, Monitoring, Tab -->
  {#if selectedTab === 'monitoring'}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
      <!-- GPU, Status -->
      <OrchestratedCard.Analysis>
        <div.Content, class="p-6">
          <div class="flex items-center justify-between">
            <Cpu class="w-8 h-8" />
            <Badge variant={(data, as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.gpuAvailable ? 'default' : 'destructive'}>
              {gpuStatus}
            </Badge>
          </div>
          <p class="text-sm nes-text is-disabled">GPU Status</p>
          <p class="text-lg">{(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.gpuName}</p>
          <p class="text-xs nes-text">{(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.computeCapability}</p>
        </div.Content>
      </OrchestratedCard.Analysis>
      <!-- Memory, Usage -->
      <OrchestratedCard.Analysis>
        <div.Content, class="p-6">
          <div class="flex items-center justify-between">
            <Memory class="w-8 h-8" />
            <Badge variant="ghost">{(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.utilization?.memory}%</Badge>
          </div>
          <p class="text-sm nes-text is-disabled">Memory Usage</p>
          <p class="text-lg">{(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.availableMemory}</p>
          <p class="text-xs nes-text">of {(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.totalMemory}</p>
        </div.Content>
      </OrchestratedCard.Analysis>
      <!-- Temperature -->
      <OrchestratedCard.Analysis>
        <div.Content, class="p-6">
          <div class="flex items-center justify-between">
            <Thermometer class="w-8 h-8" />
            <Badge variant="ghost">{(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.temperatureCurrent}Â°C</Badge>
          </div>
          <p class="text-sm nes-text is-disabled">Temperature</p>
          <p class="text-lg">{(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.temperatureCurrent}Â°C</p>
          <p class="text-xs nes-text">Normal operating range</p>
        </div.Content>
      </OrchestratedCard.Analysis>
      <!-- Power, Draw -->
      <OrchestratedCard.Analysis>
        <div.Content, class="p-6">
          <div class="flex items-center justify-between">
            <Power class="w-8 h-8" />
            <Badge variant="ghost">{(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.powerDraw}W</Badge>
          </div>
          <p class="text-sm nes-text is-disabled">Power Draw</p>
          <p class="text-lg">{(data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).gpuInfo.powerDraw}W</p>
          <p class="text-xs nes-text">Current consumption</p>
        </div.Content>
      </OrchestratedCard.Analysis>
    </div>
    <!-- Performance, Metrics -->
    <OrchestratedCard.Analysis>
      <div.Header, class="nes-container">
        <div.Title class="flex items-center gap-2">
          <TrendingUp class="w-5" />
          Real-Time Performance Metrics
        </div.Title>
      </div.Header>
      <div.Content, class="nes-container">
        <div class="grid grid-cols-1 md:grid-cols-3">
          <div class="text-center p-4 bg-muted/50">
            <p class="text-2xl font-bold">{formatThroughput(liveMetrics.throughputCurrent)}</p>
            <p class="text-sm nes-text">Current Throughput</p>
          </div>
          <div class="text-center p-4 bg-muted/50">
            <p class="text-2xl font-bold">{liveMetrics.avgProcessingTime}ms</p>
            <p class="text-sm nes-text">Avg Processing Time</p>
          </div>
          <div class="text-center p-4 bg-muted/50">
            <p class="text-2xl font-bold">{liveMetrics.queueSize}</p>
            <p class="text-sm nes-text">Queue Size</p>
          </div>
        </div>
      </div.Content>
    </OrchestratedCard.Analysis>
  {/if}
  <!-- Recent, Processing, Results -->
  <OrchestratedCard.Analysis>
    <div.Header, class="nes-container">
      <div.Title class="flex items-center gap-2">
        <Clock class="w-5" />
        Recent Processing Sessions
      </div.Title>
      <div.Description, class="nes-container">
        Historical GPU processing performance and results
      </div.Description>
    </div.Header>
    <div.Content, class="nes-container">
      <div class="space-y-3">
        {#each (data as { sessionStats?: any; gpuInfo?: any; supportedOperations?: any; recentProcessing?: any }).recentProcessing as session}
          <div class="flex items-center justify-between p-3 border rounded-lg">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <Badge variant="ghost" class="text-xs">{session.operation.replace('_', ' ')}</Badge>
                <Badge
                  variant={session.gpuAccelerated ? 'default' : 'secondary'}
                  class="text-xs"
                >
                  {session.gpuAccelerated ? 'GPU' : 'CPU'}
                </Badge>
                <Badge
                  variant={session.status === 'completed' ? 'default' : 'destructive'}
                  class="text-xs"
                >
                  {session.status}
                </Badge>
              </div>
              <div class="text-sm nes-text">
                {session.documentsProcessed} documents â€¢
                {session.processingTime}ms â€¢
                {formatThroughput(session.throughput)} throughput
              </div>
              <div class="text-xs nes-text">
                {formatAnalysisDate(new Date(session.timestamp))}
              </div>
            </div>
            <button class="nes-btn" variant="ghost" size="sm">
              <Eye class="w-3" />
          </div>
        {/each}
      </div>
    </div.Content>
  </OrchestratedCard.Analysis>
</div>;

