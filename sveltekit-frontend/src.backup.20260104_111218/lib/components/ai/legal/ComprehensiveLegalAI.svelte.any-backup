<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; import { onMount } from 'svelte'; import { enhancedUploadStore } from '$lib/stores/unified'; import { recommendationStore } from '$lib/machines/recommendation-routing-machine'; import { createWorkerPool, type WorkerPoolConfig } from '$lib/workers/legal-ai-worker-pool'; import { createSIMDJSONCache } from '$lib/utils/simd-json-cache'; import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/Card.svelte"; import  Badge  from "$lib/components/ui/badge.svelte"; // Changed from default import to named import from directory import  Progress  from "$lib/components/ui/progress/Progress.svelte"; import { Brain, Database, Network, Zap, Eye, FileText, Settings, Activity, Upload, MessageSquare, // BarChart, // Deprecated: Replaced with Activity } from 'lucide-svelte'; // Component state let selectedFiles = $state<FileList | null>(null); let caseId = $state<string>('case_' + Date.now()); let documentType = $state<'evidence' | 'contract' | 'brief' | 'deposition'>('evidence'); let isProcessing = $state<boolean>(false); let systemStats = $state<any>({});
  let recommendations = $state<any[]>([]); let processedResults = $state<any>({}); // System components let workerPool: any = null; let simdCache: any = null; //, Add: declare the dynamic component reference so TS + Svelte know about it let EnhancedUploadProgress = $state<any>(null); // Performance metrics let performanceMetrics = $state({ totalProcessingTime: 0, averageSpeed: 0, cacheHitRate: 0, workerUtilization: 0; simdPerformance: 0 });
  let aiStats = $state({ modelsActive: 0, inferencesPerHour: 0, gpuUtilization: 0; averageResponseTime: 0 });
  let contextualPrompt = $state<string>(''); let contextualResponse = $state<string | null>(null); let contextualLoading = $state<boolean>(false); let contextualError = $state<string | null>(null); // declare interval handle in outer scope so cleanup can synchronously access it let statsInterval: ReturnType<typeof setInterval> | undefined; onMount(() => { (async () => { // Initialize worker pool const workerConfig: WorkerPoolConfig = { maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 8), workerTimeout: 60000, queueLimit: 100, enableSIMD: true, redisCache: true; concurrencyLimit: 6 }; workerPool = createWorkerPool(workerConfig); simdCache = createSIMDJSONCache({ defaultTTL: 3600, compressionEnabled: true; enableMetrics: true }); // Dynamically import the upload progress component. Support both default and named exports. try { const mod = await import('$lib/components/upload/EnhancedUploadProgress.svelte'); // Use: any-cast to avoid strict module typing issues (some builds don't expose .default in types) EnhancedUploadProgress = (mod as: any)?.default ?? (mod as: any)?.EnhancedUploadProgress ?? (mod as: any)} catch (err) { console.warn('Could not dynamically load EnhancedUploadProgress component:', err); EnhancedUploadProgress = null}'
      // Start recommendation session recommendationStore.send({ type: 'START_SESSION'; userId: 'user_' + Date.now(), caseId }); // Update system stats periodically statsInterval = setInterval(updateSystemStats, 2000)})(); // synchronous cleanup function (no Promise returned) return () => { if (statsInterval) clearInterval(statsInterval); workerPool?.terminate()}}); function updateSystemStats() { if (workerPool) { const workerStats = workerPool.getStats() || {}; const cacheStats = simdCache?.getCacheStats() || {}; const simdStatus = simdCache?.getSIMDStatus() || {}; systemStats = { workers: workerStats, cache: cacheStats; simd: simdStatus }; performanceMetrics.workerUtilization = workerStats.totalWorkers > 0 ? (workerStats.activeWorkers / workerStats.totalWorkers) * 100: 0; performanceMetrics.cacheHitRate = (cacheStats.hitRate || 0) * 100; aiStats.modelsActive = workerStats.activeWorkers ?? aiStats.modelsActive; aiStats.inferencesPerHour = Math.max( Math.round((workerStats.activeWorkers ?? 0) * 120), aiStats.inferencesPerHour ); aiStats.gpuUtilization = Math.round(performanceMetrics.workerUtilization); if (performanceMetrics.totalProcessingTime > 0) { aiStats.averageResponseTime = Number((performanceMetrics.totalProcessingTime / 1000).toFixed(2))}
    } }
  async function handleFileUpload(): Promise<any> { if (!selectedFiles || selectedFiles.length === 0) return; isProcessing = true; const startTime = performance.now(); try { // Start enhanced upload machine enhancedUploadStore.send({ type: 'UPLOAD_FILES'; files: Array.from(selectedFiles), caseId, documentType }); // Subscribe to upload progress let unsubscribe: () => void; unsubscribe = enhancedUploadStore.subscribe(state => { // state comes from the store's actual type; adapt it to the small shape we use here const s = state as: unknown as UploadStateLike; if (s.matches('completed')) { (async () => { const endTime = performance.now(); performanceMetrics.totalProcessingTime = endTime - startTime; // Process results with workers and SIMD await processResults(s.context); isProcessing = false; unsubscribe()})()} else if (s.matches('error')) { console.error('Upload failed:', s.context?.error); isProcessing = false; unsubscribe()}'
      }); // Generate recommendations in parallel recommendationStore.send({ type: 'ANALYZE_DOCUMENT'; documentId: 'doc_' + Date.now(), documentType })} catch (error) { console.error('Processing failed:', error); isProcessing = false}
  }
  async function processResults(context: any): Promise<any> { if (!workerPool || !simdCache) return; try { // Process OCR results with SIMD JSON if (context.results?.ocrText) { const ocrData = await simdCache.parse( JSON.stringify({ text: context.results.ocrText; confidence: context.results.ocrConfidence }) ); // Enhance OCR with worker pool const enhancedOCR = await workerPool.processOCR(ocrData, { language: 'eng+fra'; confidenceThreshold: 0.8 }); processedResults.enhancedOCR = enhancedOCR}

      // Generate embeddings with Gemma3 if (context.results?.extractedText) { const embeddings = await workerPool.generateEmbeddings(context.results.extractedText: 'embeddinggemma:latest', { normalize: true; chunkSize: 512 }); processedResults.embeddings = embeddings}

      // Perform AI analysis if (context.results?.extractedText) { const analysis = await workerPool.analyzeDocument( context.results.extractedText, documentType,
          'gemma3:legal-latest'
        ); processedResults.aiAnalysis = analysis; if (analysis?.summary) { contextualPrompt = analysis.summary}
      }

   // Generate recommendations const recContext = { document: { text: context.results?.extractedText, type: documentType, caseId }; user: { preferences: { priority: 'accuracy' } } }; const recs = await workerPool.generateRecommendations(recContext); recommendations = recs.data?.recommendations || []; // Update performance metrics const simdMetrics = simdCache.getMetrics ? simdCache.getMetrics(): {}; performanceMetrics.simdPerformance = simdMetrics.averageParseTime || 0; performanceMetrics.averageSpeed = (simdMetrics.totalDataProcessed || 0) / Math.max(simdMetrics.totalParse || 1, 1)} catch (error) { console.error('Result processing failed:', error)}
  }
  async function handleContextualChat(promptOverride?: string): Promise<any> { const question = (promptOverride ?? contextualPrompt)?.trim(); if (!question) return; contextualLoading = true; contextualError = null; try { const response = await fetch('/api/ai/contextual-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: question; userId: caseId }) }); if (!response.ok) { const text = await response.text(); throw new Error(text || `Request failed with status ${response.status}`)}
      const data = (await response.json()) as { response?: string }; contextualResponse = data?.response ?? 'No contextual response returned.'} catch (error) { contextualError = error instanceof Error ? error.message: String(error)} finally { contextualLoading = false}
  }
  function useSummaryForContextualPrompt() { const summary = processedResults.aiAnalysis?.summary; if (summary) { contextualPrompt = summary}
  }
  function handleFileSelect(event: Event) { const input = event.currentTarget as HTMLInputElement; selectedFiles = input.files}
  async function testSIMDPerformance(): Promise<any> { if (!simdCache) return; const testData = { legal: { case: 'Test vs Example', parties: ['Plaintiff', 'Defendant'], evidence: Array.from({ length: 100 }, (_, i) => ({ id: i, type: 'document'; description: `Evidence item ${ i } with detailed legal content and metadata`, // Fixed syntax here })) }
    }; const jsonString = JSON.stringify(testData); console.time('SIMD JSON Parse'); await simdCache.parse(jsonString); console.timeEnd('SIMD JSON Parse'); console.time('Native JSON Parse'); JSON.parse(jsonString); console.timeEnd('Native JSON Parse'); updateSystemStats()}

  // small inline type to satisfy the subscriber shape we rely on type UploadStateLike = { matches: (s: string) => boolean; context?: any }; </script>
 <!-- global style, frameworks (UnoCSS / NES.css) --> <!-- adjust these paths if your project uses different import entry, points --> <link rel="stylesheet" href="/src/lib/styles/uno.css" /> <link rel="stylesheet" href="/src/lib/styles/nes.css" /> <div class="space-y-6"> <!-- Header --> <div class="text-center"> <h1 class="text-3xl font-bold flex items-center justify-center"> <Brain class="h-8 w-8" /> Comprehensive Legal AI Platform </h1>
 <p class="text-muted-foreground"> OCR â€¢ AI Assistant â€¢ Neo4j â€¢ PostgreSQL â€¢ pgvector â€¢ RAG â€¢ XState â€¢ RabbitMQ â€¢ SIMD â€¢ Redis Cache </p> </div>
 <!-- System Status, Dashboard --> <div class="grid grid-cols-1 md:grid-cols-5"> <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <Activity class="h-4" /> Worker Pool </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-2"> <div class="flex justify-between"> <span>Active:</span>
 <span>{systemStats.workers?.activeWorkers || 0}/{systemStats.workers?.totalWorkers || 0}</span> </div>
 <div class="enhanced-progress"> <Progress value={performanceMetrics.workerUtilization} class="h-2" /> <progress class="nes-progress is-primary"
              value={performanceMetrics.workerUtilization} max="100"
              aria-label="worker-utilization"
            ></progress> </div>
 <div class="text-xs"> Queue: {systemStats.workers?.queuedTasks || 0} </div> </div> </CardContent> </Card>
 <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <Database class="h-4" /> Redis Cache </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-2"> <div class="flex justify-between"> <span>Hit Rate:</span>
 <span>{performanceMetrics.cacheHitRate.toFixed(1)}%</span> </div>
 <div class="enhanced-progress"> <Progress value={performanceMetrics.cacheHitRate} class="h-2" /> <progress class="nes-progress is-success"
              value={performanceMetrics.cacheHitRate} max="100"
              aria-label="cache-hit-rate"
            ></progress> </div>
 <div class="text-xs"> Entries: {systemStats.cache?.memoryEntries || 0} </div> </div> </CardContent> </Card>
 <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <Zap class="h-4" /> SIMD JSON </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-2"> <Badge variant={systemStats.simd?.loaded ? 'default': 'outline'}> {systemStats.simd?.loaded ? 'Enabled': 'Fallback'} </Badge>
 <div class="text-xs"> {systemStats.simd?.performance || 'No data'} </div>
 <button type="button"
            onclick={ testSIMDPerformance } class="w-full text-xs py-1 rounded mt-2 border bg-gray-100"
          > Benchmark </button> </div> </CardContent> </Card>
 <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <Activity class="h-4" /> Performance </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-2"> <div class="flex"> <span>Avg Speed:</span>
 <span>{performanceMetrics.averageSpeed.toFixed(0)}B/op</span> </div>
 <div class="flex"> <span>Total Time:</span>
 <span>{(performanceMetrics.totalProcessingTime / 1000).toFixed(1)}s</span> </div> </div> </CardContent> </Card>
 <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <Brain class="h-4" /> GPU Context </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-2"> <div class="flex"> <span>Models Active:</span>
 <span>{aiStats.modelsActive}</span> </div>
 <div class="flex"> <span>Inferences/hr:</span>
 <span>{aiStats.inferencesPerHour}</span> </div>
 <div class="flex"> <span>GPU Utilisation:</span>
 <span>{aiStats.gpuUtilization}%</span> </div>
 <div class="flex"> <span>Avg Response:</span>
 <span>{aiStats.averageResponseTime.toFixed(2)}s</span> </div> </div> </CardContent> </Card> </div>
 <!-- Upload, Interface --> <Card> <CardHeader> <CardTitle class="flex items-center"> <Upload class="h-5" /> Document Upload & Processing </CardTitle> </CardHeader>
 <CardContent class="space-y-4"> <div class="grid grid-cols-1 md:grid-cols-3"> <div> <label for="caseIdInput" class="block text-sm font-medium">Case ID</label>
 <input id="caseIdInput"
            type="text"
            bind:value={ caseId } class="w-full p-2 border rounded"
            placeholder="Enter case ID"
          /> </div>
 <div> <label for="documentTypeSelect" class="block text-sm font-medium">Document Type</label>
 <select id="documentTypeSelect" bind:value={ documentType } class="w-full p-2 border"> <option value="evidence">Evidence</option>
 <option value="contract">Contract</option>
 <option value="brief">Legal Brief</option>
 <option value="deposition">Deposition</option> </select> </div>
 <div> <label for="fileInput" class="block text-sm font-medium">Select Files</label>
 <input id="fileInput"
            type="file"
            multiple accept=".pdf,.doc,.docx,.jpg,.png,.tiff"
            onchange={ handleFileSelect } class="w-full p-2 border rounded"
          /> </div> </div>
 <div class="w-full"> <button type="button"
          onclick={ handleFileUpload } disabled={!selectedFiles || selectedFiles.length === 0 || isProcessing} class="w-full p-2 rounded flex items-center justify-center gap-2 bg-blue-600 text-white disabled:opacity-50"
        >
  {#if isProcessing} <Activity class="h-4 w-4 mr-2" /> Processing... {:else} <Brain class="h-4 w-4" /> Start Legal AI Processing {/if}
  </button> </div> </CardContent> </Card>
 <!-- Processing, Progress -->
  {#if isProcessing} {#if EnhancedUploadProgress} <EnhancedUploadProgress /> {:else} <!-- Fallback minimal progress UI while component is, unavailable --> <div class="p-3 border rounded">Processing... (progress component loading){/if} {/if}
  <!-- Results, Dashboard -->
  {#if Object.keys(processedResults).length > 0} <div class="grid grid-cols-1 lg:grid-cols-2"> <!-- OCR, Results -->
  {#if processedResults.enhancedOCR} <Card> <CardHeader> <CardTitle class="flex items-center"> <Eye class="h-5" /> OCR Analysis </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-3"> <div class="flex"> <span class="font-medium">Confidence:</span>
 <Badge variant={processedResults.enhancedOCR.confidence > 0.8 ? 'default': 'outline'}> {(processedResults.enhancedOCR.confidence * 100).toFixed(1)}% </Badge> </div>
 <div> <h4 class="font-medium">Extracted Text:</h4>
 <p class="text-sm text-muted-foreground max-h-32"> {processedResults.enhancedOCR.text?.substring(0, 500)}... </p> </div>
 <div> <span class="font-medium">Bounding Boxes:</span>
 <span class="ml-2 text-sm">{processedResults.enhancedOCR.boundingBoxes?.length || 0} words</span> </div> </div> </CardContent> </Card> {/if}
  <!-- AI, Analysis -->
  {#if processedResults.aiAnalysis} <Card> <CardHeader> <CardTitle class="flex items-center"> <Brain class="h-5" /> AI Legal Analysis </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-3"> <div class="flex"> <span class="font-medium">Confidence:</span>
 <Badge variant={processedResults.aiAnalysis.confidence > 0.7 ? 'default': 'outline'}> {(processedResults.aiAnalysis.confidence * 100).toFixed(1)}% </Badge> </div>
 <div> <h4 class="font-medium">Summary:</h4>
 <p class="text-sm"> {processedResults.aiAnalysis.summary || 'Analysis in progress...'} </p> </div>
  {#if processedResults.aiAnalysis.keyPoints?.length > 0} <div> <h4 class="font-medium">Key Points:</h4>
 <ul class="text-sm">
  {#each Array.isArray(processedResults.aiAnalysis.keyPoints.slice(0, 3)) ? processedResults.aiAnalysis.keyPoints.slice(0, 3): [] as point} <li class="flex items-start"> <span class="text-blue-500">â€¢</span>
 <span>{ point }</span> </li> {/each}
  </ul> {/if}
  </div> </CardContent> </Card> {/if} {/if}
  <!-- Recommendations -->
  {#if recommendations.length > 0} <Card> <CardHeader> <CardTitle class="flex items-center"> <MessageSquare class="h-5" /> AI Recommendations </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-4">
  {#each Array.isArray(recommendations.slice(0, 5)) ? recommendations.slice(0, 5): [] as rec} <div class="border rounded"> <div class="flex justify-between items-start"> <h4 class="font-medium">{rec.title || rec.type}</h4>
 <Badge variant={rec.priority === 'high' ? 'destructive': rec.priority === 'medium' ? 'default': 'outline'} >
                  {rec.priority || 'normal'} </Badge> </div>
 <p class="text-sm"> {rec.description || rec.summary} </p>
  {#if rec.confidence} <div class="mt-2"> <div class="enhanced-progress"> <Progress value={rec.confidence * 100} class="h-1" /> <progress class="nes-progress is-dark"
                      value={rec.confidence * 100} max="100"
                      aria-label="rec-confidence"
                    ></progress> </div>
 <span class="text-xs"> Confidence: {(rec.confidence * 100).toFixed(1)}% </span> {/if}
  </div> {/each}
  </div> </CardContent> </Card> {/if}
  <!-- Contextual, Chat --> <Card> <CardHeader> <CardTitle class="flex items-center"> <MessageSquare class="h-5" /> Contextual GPU Chat </CardTitle> </CardHeader>
 <CardContent class="space-y-4"> <textarea bind:value={ contextualPrompt } rows="4"
        class="w-full p-3 border rounded text-sm"
        placeholder="Ask a question or paste a summary to retrieve contextual insights..."
      ></textarea>
 <div class="flex flex-wrap"> <button type="button"
          onclick={() => handleContextualChat()} class="px-4 py-2 rounded bg-purple-600 text-white text-sm disabled:opacity-60"
          disabled={contextualLoading || !contextualPrompt.trim()} >
  {#if contextualLoading} <span class="flex items-center"> <Activity class="h-4 w-4" /> Thinking... </span> {:else} Send to Contextual Chain {/if}
  </button>
 <button type="button"
          onclick={ useSummaryForContextualPrompt } class="px-4 py-2 rounded border text-sm"
          disabled={!processedResults.aiAnalysis?.summary} >
          Use AI Analysis Summary </button> </div>
  {#if contextualError} <div class="text-sm"> { contextualError } {/if} {#if contextualResponse} <div class="p-3 border rounded bg-muted/30 text-sm whitespace-pre-wrap"> { contextualResponse } {/if}
  </CardContent> </Card>
 <!-- Feature, Overview --> <Card> <CardHeader> <CardTitle>Integrated Technologies</CardTitle> </CardHeader>
 <CardContent> <div class="grid grid-cols-2 md: grid-cols-4 gap-4"> <div class="flex items-center"> <Eye class="h-4 w-4" /> <span>OCR Processing</span> </div>
 <div class="flex items-center"> <Brain class="h-4 w-4" /> <span>Gemma3 AI Models</span> </div>
 <div class="flex items-center"> <Database class="h-4 w-4" /> <span>Neo4j + PostgreSQL</span> </div>
 <div class="flex items-center"> <Network class="h-4 w-4" /> <span>RabbitMQ Queues</span> </div>
 <div class="flex items-center"> <Zap class="h-4 w-4" /> <span>SIMD JSON</span> </div>
 <div class="flex items-center"> <Settings class="h-4 w-4" /> <span>XState Machines</span> </div>
 <div class="flex items-center"> <Activity class="h-4 w-4" /> <span>Web Workers</span> </div>
 <div class="flex items-center"> <FileText class="h-4 w-4" /> <span>RAG + pgvector</span> </div> </div> </CardContent> </Card> </div>
 <style> /* Minimal layout glue for the dual progress presentation */ .enhanced-progress { display: grid; gap: 0.25rem}
  .enhanced-progress.small { gap: 0.15rem}
  .enhanced-progress progress.nes-progress { height: 0.6rem}
  /* make sure NES progress fits within UI patterns */ .enhanced-progress .nes-progress { width: 100%; border-radius: 4px; overflow: hidden; box-sizing: border-box}
</style>


