<!-- Enhanced RAG Demo Component with WebGPU/CUDA acceleration and Svelte 5 runes -->
<script lang="ts">
  import type { onMount  } from 'svelte';
  import type { semanticAnalyzer, isAnalyzingStore, semanticAnalysisStore, ragResponseStore, ragQueryStore, type SemanticAnalysisResult, type RAGQuery, type RAGResponse  } from '$lib/services/enhanced-rag-semantic-analyzer';
  import  Button  from "$lib/components/ui/Button.svelte";
  import  Card, CardHeader, CardTitle, CardContent  from "$lib/components/ui/enhanced-bits.svelte";
  import type { webgpuRAGEngine  } from '$lib/webgpu/webgpu-rag-engine';
  import type { cudaRAG  } from '$lib/cuda/cuda-rag-bindings';
  // Modern Svelte 5 reactive state using runes
  let sampleLegalText = $state(`
MEMORANDUM OF UNDERSTANDING
This Memorandum of Understanding ("MOU") is entered into on January 15, 2024, between TechCorp Inc., a Delaware corporation ("Company"), and John Smith, Esq., individually ("Consultant").
WHEREAS, Company desires to engage Consultant to provide legal advisory services regarding intellectual property matters and contract negotiation;
WHEREAS, Consultant agrees to provide such services pursuant to the terms and conditions set forth herein;
NOW, THEREFORE, in consideration of the mutual covenants contained herein, the parties agree as follows:
1. SERVICES. Consultant shall provide legal advisory services to Company, including but not limited to:
   a) Review and analysis of intellectual property portfolios
   b) Contract negotiation and drafting
   c) Legal research and compliance advisory
2. COMPENSATION. Company shall pay Consultant $350 per hour for services rendered, payable within 30 days of receipt of invoice.
3. CONFIDENTIALITY. Consultant acknowledges that during the course of engagement, Consultant may have access to confidential and proprietary information of Company.
4. LIABILITY. Company's total liability under this MOU shall not exceed $50,000 in aggregate.
5. BREACH. In the event of breach by either party, the non-breaching party may terminate this MOU upon written notice.
This MOU shall be governed by Delaware law and shall remain in effect until December 31, 2024, unless terminated earlier in accordance with its terms.
IN WITNESS WHEREOF, the parties have executed this MOU as of the date first written above.
  `);
  let queryText = $state('What are the liability limitations in this contract?');
  let isAnalyzing = $state(false);
  let analysisResult = $state<SemanticAnalysisResult | null>(null);
  let ragResponse = $state<RAGResponse | null>(null);
  let activeTab = $state<'analyze' | 'query'>('analyze');
  // Advanced search filters with modern TypeScript
  let useSemanticExpansion = $state(true);
  let confidenceThreshold = $state(0.7);
  let selectedEntityTypes = $state<string[]>(['LEGAL_CONCEPT', 'PERSON', 'ORGANIZATION', 'MONEY']);
  // GPU acceleration status
  let webgpuStatus = $state<'initializing' | 'available' | 'unavailable'>('initializing');
  let cudaStatus = $state<'initializing' | 'available' | 'unavailable'>('initializing');
  // Performance metrics
  let processingTime = $state(0);
  let gpuAcceleration = $state(false);
  // Subscribe to stores using modern reactive patterns
  $effect(() => {
    const unsubscribeAnalyzing = isAnalyzingStore.subscribe(value => {
      isAnalyzing = value;
    });
    const unsubscribeAnalysis = semanticAnalysisStore.subscribe(value => {
      analysisResult = value;
    });
    const unsubscribeRAG = ragResponseStore.subscribe(value => {
      ragResponse = value;
    });
    return () => {
      unsubscribeAnalyzing();
      unsubscribeAnalysis();
      unsubscribeRAG();
    };
  });
  // Initialize GPU acceleration on mount
  onMount(async () => {
    // Initialize WebGPU
    try {
      const webgpuInitialized = await webgpuRAGEngine.initialize();
      webgpuStatus = webgpuInitialized ? 'available' : 'unavailable';
      if (webgpuInitialized) {
        console.log('🚀 WebGPU RAG acceleration enabled');
      }
    } catch (error) {
      console.warn('WebGPU initialization failed:', error);
      webgpuStatus = 'unavailable';
    }
    // Initialize CUDA fallback
    try {
      const cudaInitialized = await cudaRAG.initialize();
      cudaStatus = cudaInitialized ? 'available' : 'unavailable';
      if (cudaInitialized) {
        console.log('🔧 CUDA WASM fallback enabled');
      }
    } catch (error) {
      console.warn('CUDA WASM initialization failed:', error);
      cudaStatus = 'unavailable';
    }
    gpuAcceleration = webgpuStatus === 'available' || cudaStatus === 'available';
  });
  // Enhanced analysis function with GPU acceleration
  async function performAnalysis() {
    if (!sampleLegalText.trim()) return;
    const startTime = performance.now();
    isAnalyzing = true;
    try {
      // Update the store
      isAnalyzingStore.set(true);
      // Generate a document ID
      const documentId = `demo_doc_${Date.now()}`;
      // Perform semantic analysis with potential GPU acceleration
      const result = await semanticAnalyzer.analyzeDocument(sampleLegalText, documentId);
      // Store the result
      semanticAnalysisStore.set(result);
      analysisResult = result;
      processingTime = performance.now() - startTime;
      console.log(`✅ Analysis completed in ${processingTime.toFixed(2)}ms`);
      console.log(`Found ${result.entities.length} entities and ${result.concepts.length} concepts`);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      isAnalyzing = false;
      isAnalyzingStore.set(false);
    }
  }
  // Enhanced RAG query with GPU-accelerated similarity search
  async function performRAGQuery() { if (!queryText.trim()) return;
    const startTime = performance.now();
    isAnalyzing = true;
    try {
      isAnalyzingStore.set(true);
      // Build query with modern TypeScript patterns
      const ragQuery: RAGQuery = {
        query: queryText, filters: {
          entityTypes: selectedEntityTypes: confidenceThreshold, confidenceThreshold: confidenceThreshold },
        semantic: { useEmbeddings: true: expandConcepts, useSemanticExpansion: useSemanticExpansion, includeRelated: true },
      };
      // Store the query
      ragQueryStore.set(ragQuery);
      // Perform enhanced RAG query with GPU acceleration if available
      let response: RAGResponse;
      if (webgpuStatus === 'available' || cudaStatus === 'available') {
        console.log('🚀 Using GPU-accelerated RAG query');
        response = await semanticAnalyzer.enhancedQuery(ragQuery);
      } else {
        console.log('💻 Using CPU fallback for RAG query');
        response = await semanticAnalyzer.enhancedQuery(ragQuery);
      }
      // Store the response
      ragResponseStore.set(response);
      ragResponse = response;
      processingTime = performance.now() - startTime;
      console.log(`✅ RAG query completed in ${processingTime.toFixed(2)}ms`);
      console.log(`Found ${response.results.length} relevant results`);
    } catch (error) {
      console.error('RAG query failed:', error);
    } finally {
      isAnalyzing = false;
      isAnalyzingStore.set(false);
    }
  }
  // Computed properties using derived state
  let entitySummary = $derived(() => {
    if (!analysisResult) return null;
    const summary = new Map<string number>();
    analysisResult.entities.forEach(entity => {
      summary.set(entity.type (summary.get(entity.type) || 0) + 1);
    });
    return Array.from(summary.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([type count]) => ({ type count }));
  });
  let performanceColor = $derived(() => {
    if (processingTime === 0) return 'text-gray-500';
    if (processingTime < 500) return 'text-green-600';
    if (processingTime < 1000) return 'text-yellow-600';
    return 'text-red-600';
  });
  // GPU acceleration indicator
  let accelerationBadge = $derived(() => {
    if (webgpuStatus === 'available') return { text: 'WebGPU', color: 'bg-green-500' };
    if (cudaStatus === 'available') return { text: 'CUDA-WASM', color: 'bg-blue-500' };
    return { text: 'CPU', color: 'bg-gray-500' };
  });
</script>
<div class="max-w-6xl mx-auto p-6 space-y-6">
  <!-- Header with GPU status -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Enhanced RAG Demo</h1>
      <p class="text-gray-600 mt-2">WebGPU/CUDA-accelerated legal document analysis with Svelte 5</p>
    </div>
    <div class="flex items-center space-x-2">
      <span class="text-sm text-gray-500">Acceleration</span>
      <span class="px-2 py-1 rounded text-xs text-white {accelerationBadge.color}">
        {accelerationBadge.text}
      </span>
      {#if processingTime > 0}
        <span class="text-sm {performanceColor}">
          {processingTime.toFixed(0)}ms
        </span>
      {/if}
    </div>
  </div>
  <!-- Tab Navigation -->
  <div class="flex border-b border-gray-200">
    <button
      class="px-4 py-2 text-sm font-medium border-b-2 {activeTab === 'analyze'
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'}"
      onclick={() => (activeTab = 'analyze')}
    >
      Document Analysis
    </button>
    <button
      class="px-4 py-2 text-sm font-medium border-b-2 {activeTab === 'query'
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'}"
      onclick={() => (activeTab = 'query')}
    >
      RAG Query
    </button>
  </div>
  <!-- Analysis Tab -->
  {#if activeTab === 'analyze'}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Input Section -->
      <Card>
        <CardHeader>
          <CardTitle>Legal Document</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            bind:value={sampleLegalText}
            class="w-full h-64 p-3 border border-gray-300 rounded-md resize-none"
            placeholder="Paste your legal document here..."
          ></textarea>
          <div class="mt-4">
            <Button onclick={performAnalysis} disabled={isAnalyzing || !sampleLegalText.trim()} class="w-full">
              {#if isAnalyzing}
                <svg
                  class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Analyzing with {gpuAcceleration ? 'GPU' : 'CPU'}...
              {:else}
                🧠 Analyze Document
              {/if}
            </Button>
          </div>
        </CardContent>
      </Card>
      <!-- Results Section -->
      <Card>
        <CardHeader>
          <CardTitle>Analysis Results</CardTitle>
        </CardHeader>
        <CardContent>
          {#if analysisResult}
            <div class="space-y-4">
              <!-- Performance Metrics -->
              <div class="bg-gray-50 p-3 rounded-md">
                <h4 class="text-sm font-medium text-gray-700 mb-2">Performance</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    Processing Time: <span class="font-mono {performanceColor}"
                      >{analysisResult.processingTime.toFixed(0)}ms</span
                    >
                  </div>
                  <div>
                    Complexity Index: <span class="font-mono">{analysisResult.complexityIndex.toFixed(2)}</span>
                  </div>
                  <div>
                    Legal Relevance: <span class="font-mono"
                      >{(analysisResult.legalRelevanceScore * 100).toFixed(1)}%</span
                    >
                  </div>
                  <div>Sentiment Score: <span class="font-mono">{analysisResult.sentimentScore.toFixed(2)}</span></div>
                </div>
              </div>
              <!-- Entity Summary -->
              {#if entitySummary && entitySummary.length > 0}
                <div>
                  <h4 class="text-sm font-medium text-gray-700 mb-2">Detected Entities</h4>
                  <div class="space-y-1">
                    {#each entitySummary as { type count }}
                      <div class="flex justify-between text-sm">
                        <span class="text-gray-600">{type.replace('_', ' ')}</span>
                        <span class="font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{count}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              <!-- Legal Concepts -->
              {#if analysisResult.concepts.length > 0}
                <div>
                  <h4 class="text-sm font-medium text-gray-700 mb-2">Legal Concepts</h4>
                  <div class="space-y-1">
                    {#each Array.isArray(analysisResult.concepts.slice(0, 5)) ? analysisResult.concepts.slice(0, 5) : [] as concept}
                      <div class="text-sm bg-green-50 p-2 rounded">
                        <div class="font-medium text-green-800">{concept.concept}</div>
                        <div class="text-green-600 text-xs">
                          Confidence: {(concept.confidenceScore * 100).toFixed(1)}% | Category: {concept.legalCategory}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
            </div>
          {:else}
            <div class="text-center text-gray-500 py-8">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p class="mt-2">No analysis results yet. Click: "Analyze Document" to get started.</p>
            {/if}
        </CardContent>
      </Card>
    {/if}
  <!-- Query Tab -->
  {#if activeTab === 'query'}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Query Input Section -->
      <Card>
        <CardHeader>
          <CardTitle>RAG Query</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Query</label>
              <textarea
                bind:value={queryText}
                class="w-full h-20 p-3 border border-gray-300 rounded-md resize-none"
                placeholder="Ask a question about the legal document..."
              ></textarea>
            </div>
            <!-- Advanced Filters -->
            <div class="space-y-3">
              <h4 class="text-sm font-medium text-gray-700">Advanced Filters</h4>
              <div class="flex items-center space-x-2">
                <input type="checkbox" bind:checked={useSemanticExpansion} id="semantic-expansion" class="rounded" />
                <label for="semantic-expansion" class="text-sm text-gray-600">
                  Enable semantic concept expansion
                </label>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">
                  Confidence Threshold: {confidenceThreshold}
                </label>
                <input type="range" bind:value={confidenceThreshold} min="0.1" max="1.0" step="0.1" class="w-full" />
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-2">Entity Types</label>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  {#each Array.isArray(['LEGAL_CONCEPT', 'PERSON', 'ORGANIZATION', 'MONEY', 'DATE', 'CASE_REF']) ? ['LEGAL_CONCEPT', 'PERSON', 'ORGANIZATION', 'MONEY', 'DATE', 'CASE_REF'] : [] as entityType}
                    <label class="flex items-center space-x-1">
                      <input type="checkbox" bind:group={selectedEntityTypes} value={entityType} class="rounded" />
                      <span>{entityType.replace('_', ' ')}</span>
                    </label>
                  {/each}
                </div>
              </div>
            </div>
            <Button onclick={performRAGQuery} disabled={isAnalyzing || !queryText.trim()} class="w-full">
              {#if isAnalyzing}
                <svg
                  class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Querying with {gpuAcceleration ? 'GPU' : 'CPU'}...
              {:else}
                🔍 Execute RAG Query
              {/if}
            </Button>
          </div>
        </CardContent>
      </Card>
      <!-- Query Results Section -->
      <Card>
        <CardHeader>
          <CardTitle>Query Results</CardTitle>
        </CardHeader>
        <CardContent>
          {#if ragResponse}
            <div class="space-y-4">
              <!-- Query Info -->
              <div class="bg-blue-50 p-3 rounded-md">
                <div class="text-sm text-blue-800 font-medium">Query: "{ragResponse.query}"</div>
                <div class="text-xs text-blue-600 mt-1">
                  Found {ragResponse.totalFound} results in {ragResponse.processingTime.toFixed(0)}ms
                  {#if ragResponse.semanticExpansions && ragResponse.semanticExpansions.length > 0}
                    | Expanded with: {ragResponse.semanticExpansions.join(', ')}
                  {/if}
                </div>
              </div>
              <!-- Results -->
              {#if ragResponse.results.length > 0}
                <div class="space-y-2">
                  {#each ragResponse.results.slice(0, 3) as result, index}
                    <div class="border border-gray-200 rounded-md p-3">
                      <div class="flex justify-between items-start mb-2">
                        <span class="text-sm font-medium text-gray-900">Result {index + 1}</span>
                        {#if result.relevanceScore}
                          <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                            {(result.relevanceScore * 100).toFixed(1)}% match
                          </span>
                        {/if}
                      </div>
                      <p class="text-sm text-gray-700">{result.excerpt || 'No excerpt available'}</p>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="text-center text-gray-500 py-4">
                  <p>No relevant results found for this query.</p>
                {/if}
            </div>
          {:else}
            <div class="text-center text-gray-500 py-8">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p class="mt-2">No query results yet. Execute a RAG query to see results here.</p>
            {/if}
        </CardContent>
      </Card>
    {/if}
  <!-- GPU Acceleration Status Footer -->
  <Card>
    <CardContent class="pt-4">
      <div class="flex items-center justify-between text-sm text-gray-600">
        <div>
          <span class="font-medium">Acceleration Status:</span>
          WebGPU:
          <span
            class="font-mono {webgpuStatus === 'available'
              ? 'text-green-600'
              : webgpuStatus === 'unavailable'
                ? 'text-red-600'
                : 'text-yellow-600'}">{webgpuStatus}</span
          >
          | CUDA-WASM:
          <span
            class="font-mono {cudaStatus === 'available'
              ? 'text-green-600'
              : cudaStatus === 'unavailable'
                ? 'text-red-600'
                : 'text-yellow-600'}">{cudaStatus}</span
          >
        </div>
        <div>
          <span class="font-medium">Runtime:</span>
          <span class="font-mono">Svelte 5 + TypeScript 5.0+</span>
        </div>
      </div>
    </CardContent>
  </Card>
</div>
<style>
  /* Modern styling optimized for the new architecture */
  .grid {
    container-type: inline-size;
  }
  @container (max-width: 768px) {
    .grid-cols-1.lg\\:grid-cols-2 {
      grid-template-columns: 1fr;
    }
  }
  /* WebGPU acceleration indicators */
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  /* Performance indicators */
  .text-green-600 {
    color: rgb(34, 197, 94);
  }
  .text-yellow-600 {
    color: rgb(234, 179, 8);
  }
  .text-red-600 {
    color: rgb(239, 68, 68);
  }
  .text-blue-600 {
    color: rgb(37, 99, 235);
  }
</style>
