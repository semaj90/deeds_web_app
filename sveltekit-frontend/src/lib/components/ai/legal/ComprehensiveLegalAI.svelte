<script lang="ts">
  import Card from "$lib/components/ui/Card/Card.svelte";
  import CardContent from "$lib/components/ui/Card/CardContent.svelte";
  import CardHeader from "$lib/components/ui/Card/CardHeader.svelte";
  import CardTitle from "$lib/components/ui/Card/CardTitle.svelte";
  import Badge from "$lib/components/ui/badge/Badge.svelte";
  import Progress from "$lib/components/ui/progress/Progress.svelte";
  import { recommendationStore } from '$lib/machines/recommendation-routing-machine';
  import { enhancedUploadStore } from '$lib/stores/unified';
  import { createSIMDJSONCache } from '$lib/utils/simd-json-cache';
  import { createWorkerPool } from '$lib/workers/legal-ai-worker-pool';
  import Activity from "lucide-svelte/icons/activity";
  import Brain from "lucide-svelte/icons/brain";
  import Database from "lucide-svelte/icons/database";
  import Eye from "lucide-svelte/icons/eye";
  import FileText from "lucide-svelte/icons/file-text";
  import MessageSquare from "lucide-svelte/icons/message-square";
  import Network from "lucide-svelte/icons/network";
  import Settings from "lucide-svelte/icons/settings";
  import Upload from "lucide-svelte/icons/upload";
  import Zap from "lucide-svelte/icons/zap";
  import { onMount } from 'svelte';

  // Component state
  let selectedFiles = $state<FileList | null>(null);
  let caseId = $state<string>('case_' + Date.now());
  let documentType = $state<'evidence' | 'contract' | 'brief' | 'deposition'>('evidence');
  let isProcessing = $state<boolean>(false);
  let systemStats = $state<any>({});
  let recommendations = $state<any[]>([]);
  let processedResults = $state<any>({});

  let workerPool: any = null;
  let simdCache: any = null;
  let EnhancedUploadProgress = $state<any>(null);

  // Performance metrics
  let performanceMetrics = $state({
    totalProcessingTime: 0,
    averageSpeed: 0,
    cacheHitRate: 0,
    workerUtilization: 0,
    simdPerformance: 0
  });

  let aiStats = $state({
    modelsActive: 0,
    inferencesPerHour: 0,
    gpuUtilization: 0,
    averageResponseTime: 0
  });

  let contextualPrompt = $state<string>('');
  let contextualResponse = $state<string | null>(null);
  let contextualLoading = $state<boolean>(false);
  let contextualError = $state<string | null>(null);

  // declare interval handle in outer scope so cleanup can synchronously access it
  let statsInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    (async () => {
      // Initialize worker pool
      const workerConfig = {
        maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 8),
        workerTimeout: 60000,
        queueLimit: 100,
        enableSIMD: true,
        redisCache: true,
        concurrencyLimit: 6
      };

      workerPool = createWorkerPool(workerConfig);
      simdCache = createSIMDJSONCache({
        defaultTTL: 3600,
        compressionEnabled: true,
        enableMetrics: true
      });

      try {
        const mod = await import('$lib/components/upload/EnhancedUploadProgress.svelte');
        EnhancedUploadProgress = (mod as any)?.default ?? (mod as any)?.EnhancedUploadProgress ?? (mod as any);
      } catch (err) {
        console.warn('Could not dynamically load EnhancedUploadProgress component:', err);
        EnhancedUploadProgress = null;
      }

      // Start recommendation session
      recommendationStore.send({
        type: 'START_SESSION',
        userId: 'user_' + Date.now(),
        caseId
      });

      statsInterval = setInterval(updateSystemStats, 2000);
    })();

    // synchronous cleanup function (no Promise returned)
    return () => {
      if (statsInterval) clearInterval(statsInterval);
      workerPool?.terminate();
    };
  });

  function updateSystemStats() {
    if (workerPool) {
      const workerStats = workerPool.getStats() || {};
      const cacheStats = simdCache?.getCacheStats() || {};
      const simdStatus = simdCache?.getSIMDStatus() || {};

      systemStats = {
        workers: workerStats, cache: cacheStats, cacheStats: cacheStats,
        simd: simdStatus
      };

      performanceMetrics.workerUtilization = workerStats.totalWorkers > 0
        ? (workerStats.activeWorkers / workerStats.totalWorkers) * 100
        : 0;
      performanceMetrics.cacheHitRate = (cacheStats.hitRate || 0) * 100;

      aiStats.modelsActive = workerStats.activeWorkers ?? aiStats.modelsActive;
      aiStats.inferencesPerHour = Math.max(
        Math.round((workerStats.activeWorkers ?? 0) * 120),
        aiStats.inferencesPerHour
      );
      aiStats.gpuUtilization = Math.round(performanceMetrics.workerUtilization);

      if (performanceMetrics.totalProcessingTime > 0) {
        aiStats.averageResponseTime = Number((performanceMetrics.totalProcessingTime / 1000).toFixed(2));
      }
    }
  }

  async function handleFileUpload(): Promise<void> {
    if (!selectedFiles || selectedFiles.length === 0) return;

    isProcessing = true;
    const startTime = performance.now();

    try {
      // Start enhanced upload machine
      enhancedUploadStore.send({
        type: 'UPLOAD_FILES',
        files: Array.from(selectedFiles),
        caseId,
        documentType
      });

      let unsubscribe: () => void;
      unsubscribe = enhancedUploadStore.subscribe(state => {
        const s = state as unknown as UploadStateLike;
        if (s.matches('completed')) {
          (async () => {
            const endTime = performance.now();
            performanceMetrics.totalProcessingTime = endTime - startTime;

            // Process results with workers and SIMD
            await processResults(s.context);
            isProcessing = false;
            unsubscribe();
          })();
        } else if (s.matches('error')) {
          console.error('Upload failed:', s.context?.error);
          isProcessing = false;
          unsubscribe();
        }
      });

      recommendationStore.send({
        type: 'ANALYZE_DOCUMENT',
        documentId: 'doc_' + Date.now(),
        documentType
      });
    } catch (error) {
      console.error('Processing failed:', error);
      isProcessing = false;
    }
  }

  async function processResults(context: any): Promise<void> {
    if (!workerPool || !simdCache) return;

    try {
      // Process OCR results with SIMD JSON
      if (context.results?.ocrText) {
        const ocrData = await simdCache.parse(
          JSON.stringify({
            text: context.results.ocrText,
            confidence: context.results.ocrConfidence
          })
        );

        // Enhance OCR with worker pool
        const enhancedOCR = await workerPool.processOCR(ocrData, {
          language: 'eng+fra',
          confidenceThreshold: 0.8
        });
        processedResults.enhancedOCR = enhancedOCR;
      }

      // Generate embeddings with Gemma3
      if (context.results?.extractedText) {
        const embeddings = await workerPool.generateEmbeddings(
          context.results.extractedText,
          'embeddinggemma:latest',
          {
            normalize: true,
            chunkSize: 512
          }
        );
        processedResults.embeddings = embeddings;
      }

      // Perform AI analysis
      if (context.results?.extractedText) {
        const analysis = await workerPool.analyzeDocument(
          context.results.extractedText,
          documentType,
          'gemma3:legal-latest'
        );
        processedResults.aiAnalysis = analysis;
        if (analysis?.summary) {
          contextualPrompt = analysis.summary;
        }
      }

      // Generate recommendations
      const recContext = {
        document: {
          text: context.results?.extractedText,
          type: documentType,
          caseId
        },
        user: {
          preferences: {
            priority: 'accuracy'
          }
        }
      };

      const recs = await workerPool.generateRecommendations(recContext);
      recommendations = recs.data?.recommendations || [];

      // Update performance metrics
      const simdMetrics = simdCache.getMetrics ? simdCache.getMetrics() : {};
      performanceMetrics.simdPerformance = simdMetrics.averageParseTime || 0;
      performanceMetrics.averageSpeed = (simdMetrics.totalDataProcessed || 0) / Math.max(simdMetrics.totalParse || 1, 1);
    } catch (error) {
      console.error('Result processing failed:', error);
    }
  }

  async function handleContextualChat(promptOverride?: string): Promise<void> {
    const question = (promptOverride ?? contextualPrompt)?.trim();
    if (!question) return;

    contextualLoading = true;
    contextualError = null;

    try {
      const response = await fetch('/api/ai/contextual-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: question, userId: caseId, caseId: caseId
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as { response?: string };
      contextualResponse = data?.response ?? 'No contextual response returned.';
    } catch (error) {
      contextualError = error instanceof Error ? error.message : String(error);
    } finally {
      contextualLoading = false;
    }
  }

  function useSummaryForContextualPrompt() {
    const summary = processedResults.aiAnalysis?.summary;
    if (summary) {
      contextualPrompt = summary;
    }
  }

  function handleFileSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    selectedFiles = input.files;
  }

  async function testSIMDPerformance(): Promise<void> {
    if (!simdCache) return;

    const testData = {
      legal: {
        case: 'Test vs Example',
        parties: ['Plaintiff', 'Defendant'],
        evidence: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          type: 'document',
          description: `Evidence item ${i} with detailed legal content and metadata`
        }))
      }
    };

    const jsonString = JSON.stringify(testData);

    console.time('SIMD JSON Parse');
    await simdCache.parse(jsonString);
    console.timeEnd('SIMD JSON Parse');

    console.time('Native JSON Parse');
    JSON.parse(jsonString);
    console.timeEnd('Native JSON Parse');

    updateSystemStats();
  }

  // small inline type to satisfy the subscriber shape we rely on
  type UploadStateLike = {
    matches: (s: string) => boolean;
    context?: any;
  };
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="text-center">
    <h1 class="text-3xl font-bold flex items-center justify-center">
      <Brain class="h-8 w-8 mr-2" />
      Comprehensive Legal AI Platform
    </h1>
    <p class="text-muted-foreground">
      OCR • AI Assistant • Neo4j • PostgreSQL • pgvector • RAG • XState • RabbitMQ • SIMD • Redis Cache
    </p>
  </div>

  <!-- System Status Dashboard -->
  <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm flex items-center">
          <Activity class="h-4 w-4 mr-2" />
          Worker Pool
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <div class="flex justify-between">
            <span>Active:</span>
            <span>{systemStats.workers?.activeWorkers || 0}/{systemStats.workers?.totalWorkers || 0}</span>
          </div>
          <div class="enhanced-progress">
            <Progress value={performanceMetrics.workerUtilization} class="h-2" />
            <progress class="nes-progress is-primary" value={performanceMetrics.workerUtilization} max="100"></progress>
          </div>
          <div class="text-xs">
            Queue: {systemStats.workers?.queuedTasks || 0}
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm flex items-center">
          <Database class="h-4 w-4 mr-2" />
          Redis Cache
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <div class="flex justify-between">
            <span>Hit Rate:</span>
            <span>{performanceMetrics.cacheHitRate.toFixed(1)}%</span>
          </div>
          <div class="enhanced-progress">
            <Progress value={performanceMetrics.cacheHitRate} class="h-2" />
            <progress class="nes-progress is-success" value={performanceMetrics.cacheHitRate} max="100"></progress>
          </div>
          <div class="text-xs">
            Entries: {systemStats.cache?.memoryEntries || 0}
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm flex items-center">
          <Zap class="h-4 w-4 mr-2" />
          SIMD JSON
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <Badge variant={systemStats.simd?.loaded ? 'default' : 'outline'}>
            {systemStats.simd?.loaded ? 'Enabled' : 'Fallback'}
          </Badge>
          <div class="text-xs">
            {systemStats.simd?.performance || 'No data'}
          </div>
          <button type="button" onclick={testSIMDPerformance} class="w-full text-xs py-1 rounded mt-2 border bg-gray-100">
            Benchmark
          </button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm flex items-center">
          <Activity class="h-4 w-4 mr-2" />
          Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <div class="flex justify-between">
            <span>Avg Speed:</span>
            <span>{performanceMetrics.averageSpeed.toFixed(0)}B/op</span>
          </div>
          <div class="flex justify-between">
            <span>Total Time:</span>
            <span>{(performanceMetrics.totalProcessingTime / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm flex items-center">
          <Brain class="h-4 w-4 mr-2" />
          GPU Context
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <div class="flex justify-between">
            <span>Models Active:</span>
            <span>{aiStats.modelsActive}</span>
          </div>
          <div class="flex justify-between">
            <span>Inferences/hr:</span>
            <span>{aiStats.inferencesPerHour}</span>
          </div>
          <div class="flex justify-between">
            <span>GPU Utilisation:</span>
            <span>{aiStats.gpuUtilization}%</span>
          </div>
          <div class="flex justify-between">
            <span>Avg Response:</span>
            <span>{aiStats.averageResponseTime.toFixed(2)}s</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>

  <!-- Upload Interface -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center">
        <Upload class="h-5 w-5 mr-2" />
        Document Upload & Processing
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label for="caseIdInput" class="block text-sm font-medium">Case ID</label>
          <input
            id="caseIdInput"
            type="text"
            bind:value={caseId}
            class="w-full p-2 border rounded"
            placeholder="Enter case ID"
          />
        </div>
        <div>
          <label for="documentTypeSelect" class="block text-sm font-medium">Document Type</label>
          <select id="documentTypeSelect" bind:value={documentType} class="w-full p-2 border rounded">
            <option value="evidence">Evidence</option>
            <option value="contract">Contract</option>
            <option value="brief">Legal Brief</option>
            <option value="deposition">Deposition</option>
          </select>
        </div>
        <div>
          <label for="fileInput" class="block text-sm font-medium">Select Files</label>
          <input
            id="fileInput"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.png,.tiff"
            onchange={handleFileSelect}
            class="w-full p-2 border rounded"
          />
        </div>
      </div>
      <div class="w-full">
        <button
          type="button"
          onclick={handleFileUpload}
          disabled={!selectedFiles || selectedFiles.length === 0 || isProcessing}
          class="w-full p-2 rounded flex items-center justify-center gap-2 bg-blue-600 text-white disabled:opacity-50"
        >
          {#if isProcessing}
            <Activity class="h-4 w-4 mr-2 animate-spin" /> Processing...
          {:else}
            <Brain class="h-4 w-4" /> Start Legal AI Processing
          {/if}
        </button>
      </div>
    </CardContent>
  </Card>

  <!-- Processing Progress -->
  {#if isProcessing}
    {#if EnhancedUploadProgress}
      <EnhancedUploadProgress />
    {:else}
      <div class="p-3 border rounded">Processing... (progress component loading)</div>
    {/if}
  {/if}

  <!-- Results Dashboard -->
  {#if Object.keys(processedResults).length > 0}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- OCR Results -->
      {#if processedResults.enhancedOCR}
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center">
              <Eye class="h-5 w-5 mr-2" />
              OCR Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span class="font-medium">Confidence:</span>
                <Badge variant={processedResults.enhancedOCR.confidence > 0.8 ? 'default' : 'outline'}>
                  {(processedResults.enhancedOCR.confidence * 100).toFixed(1)}%
                </Badge>
              </div>
              <div>
                <h4 class="font-medium">Extracted Text:</h4>
                <p class="text-sm text-muted-foreground max-h-32 overflow-y-auto">
                  {processedResults.enhancedOCR.text?.substring(0, 500)}...
                </p>
              </div>
              <div>
                <span class="font-medium">Bounding Boxes:</span>
                <span class="ml-2 text-sm">{processedResults.enhancedOCR.boundingBoxes?.length || 0} words</span>
              </div>
            </div>
          </CardContent>
        </Card>
      {/if}

      <!-- AI Analysis -->
      {#if processedResults.aiAnalysis}
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center">
              <Brain class="h-5 w-5 mr-2" />
              AI Legal Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <span class="font-medium">Confidence:</span>
                <Badge variant={processedResults.aiAnalysis.confidence > 0.7 ? 'default' : 'outline'}>
                  {(processedResults.aiAnalysis.confidence * 100).toFixed(1)}%
                </Badge>
              </div>
              <div>
                <h4 class="font-medium">Summary:</h4>
                <p class="text-sm">
                  {processedResults.aiAnalysis.summary || 'Analysis in progress...'}
                </p>
              </div>
              {#if processedResults.aiAnalysis.keyPoints?.length > 0}
                <div>
                  <h4 class="font-medium">Key Points:</h4>
                  <ul class="text-sm space-y-1">
                    {#each (Array.isArray(processedResults.aiAnalysis.keyPoints) ? processedResults.aiAnalysis.keyPoints.slice(0, 3) : []) as point}
                      <li class="flex items-start">
                        <span class="text-blue-500 mr-2">•</span>
                        <span>{point}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          </CardContent>
        </Card>
      {/if}
    </div>
  {/if}

  <!-- Recommendations -->
  {#if recommendations.length > 0}
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center">
          <MessageSquare class="h-5 w-5 mr-2" />
          AI Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          {#each (Array.isArray(recommendations) ? recommendations.slice(0, 5) : []) as rec}
            <div class="border rounded p-3">
              <div class="flex justify-between items-start mb-2">
                <h4 class="font-medium">{rec.title || rec.type}</h4>
                <Badge variant={rec.priority === 'high' ? 'destructive' : rec.priority === 'medium' ? 'default' : 'outline'}>
                  {rec.priority || 'normal'}
                </Badge>
              </div>
              <p class="text-sm mb-2">
                {rec.description || rec.summary}
              </p>
              {#if rec.confidence}
                <div class="mt-2">
                  <div class="enhanced-progress mb-1">
                    <Progress value={rec.confidence * 100} class="h-1" />
                  </div>
                  <span class="text-xs text-muted-foreground">
                    Confidence: {(rec.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- Contextual Chat -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center">
        <MessageSquare class="h-5 w-5 mr-2" />
        Contextual GPU Chat
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <textarea
        bind:value={contextualPrompt}
        rows="4"
        class="w-full p-3 border rounded text-sm"
        placeholder="Ask a question or paste a summary to retrieve contextual insights..."
      ></textarea>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          onclick={() => handleContextualChat()}
          class="px-4 py-2 rounded bg-purple-600 text-white text-sm disabled:opacity-60 flex items-center"
          disabled={contextualLoading || !contextualPrompt.trim()}
        >
          {#if contextualLoading}
            <Activity class="h-4 w-4 mr-2 animate-spin" /> Thinking...
          {:else}
            Send to Contextual Chain
          {/if}
        </button>
        <button
          type="button"
          onclick={useSummaryForContextualPrompt}
          class="px-4 py-2 rounded border text-sm"
          disabled={!processedResults.aiAnalysis?.summary}
        >
          Use AI Analysis Summary
        </button>
      </div>
      {#if contextualError}
        <div class="text-sm text-red-600">
          {contextualError}
        </div>
      {/if}
      {#if contextualResponse}
        <div class="p-3 border rounded bg-muted/30 text-sm whitespace-pre-wrap">
          {contextualResponse}
        </div>
      {/if}
    </CardContent>
  </Card>

  <!-- Feature Overview -->
  <Card>
    <CardHeader>
      <CardTitle>Integrated Technologies</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="flex items-center">
          <Eye class="h-4 w-4 mr-2" />
          <span>OCR Processing</span>
        </div>
        <div class="flex items-center">
          <Brain class="h-4 w-4 mr-2" />
          <span>Gemma3 AI Models</span>
        </div>
        <div class="flex items-center">
          <Database class="h-4 w-4 mr-2" />
          <span>Neo4j + PostgreSQL</span>
        </div>
        <div class="flex items-center">
          <Network class="h-4 w-4 mr-2" />
          <span>RabbitMQ Queues</span>
        </div>
        <div class="flex items-center">
          <Zap class="h-4 w-4 mr-2" />
          <span>SIMD JSON</span>
        </div>
        <div class="flex items-center">
          <Settings class="h-4 w-4 mr-2" />
          <span>XState Machines</span>
        </div>
        <div class="flex items-center">
          <Activity class="h-4 w-4 mr-2" />
          <span>Web Workers</span>
        </div>
        <div class="flex items-center">
          <FileText class="h-4 w-4 mr-2" />
          <span>RAG + pgvector</span>
        </div>
      </div>
    </CardContent>
  </Card>
</div>

<style>
  /* Minimal layout glue for the dual progress presentation */
  .enhanced-progress {
    display: grid;
    gap: 0.25rem;
  }

  .enhanced-progress :global(progress.nes-progress) {
    height: 0.6rem;
    width: 100%;
    border-radius: 4px;
    overflow: hidden;
    box-sizing: border-box;
  }
</style>
