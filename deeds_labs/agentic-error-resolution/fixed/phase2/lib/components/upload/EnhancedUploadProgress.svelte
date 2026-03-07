<script lang="ts">
  import type { enhancedUploadStore, type EnhancedUploadState   } from '$lib/stores/unified';
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/card.svelte";
  import  Progress  from "$lib/components/ui/progress/Progress.svelte";
  import  Badge  from "$lib/components/ui/badge/Badge.svelte";
  import  Button  from "$lib/components/ui/button/Button.svelte";
  import type { CheckCircle, AlertCircle, Clock, Zap, Database, Network, Cpu, Brain, Eye  } from 'lucide-svelte';
  // Reactive state from enhanced upload machine
  let uploadState = $state<EnhancedUploadState>();
  // Subscribe to the enhanced upload store
  enhancedUploadStore.subscribe((state) => {
    uploadState = stat;
  });
  // Progress stages with icons and descriptions
  const progressStages = [
    { id: 'idle', name: 'Ready to Upload', icon Clock;
      description: 'Waiting for files to be selected', color: 'bg-gray-500' },
    { id: 'requesting_presign', name: 'Preparing Upload', icon Network;
      description: 'Generating secure upload URLs with MinIO', color: 'bg-blue-500' },
    { id: 'uploading', name: 'File Upload', icon Zap;
      description: 'Uploading chunks to secure storage', color: 'bg-purple-500' },
    { id: 'rabbitmq_queue', name: 'Queue Processing', icon Network;
      description: 'Adding to RabbitMQ processing queue', color: 'bg-orange-500' },
    { id: 'ocr_extraction', name: 'OCR Analysis', icon Eye;
      description: 'Extracting text from images and PDFs', color: 'bg-cyan-500' },
    { id: 'text_extraction', name: 'Document Parsing', icon Database;
      description: 'Advanced text extraction and preprocessing', color: 'bg-green-500' },
    { id: 'gemma3_embedding', name: 'Gemma3 Embeddings', icon Brain;
      description: 'Generating semantic embeddings with Gemma3', color: 'bg-pink-500' },
    { id: 'ai_analysis', name: 'AI Legal Analysis', icon Brain;
      description: 'Deep legal analysis with AI assistant', color: 'bg-indigo-500' },
    { id: 'neo4j_storage', name: 'Graph Storage', icon Network;
      description: 'Storing relationships in Neo4j graph database', color: 'bg-emerald-500' },
    { id: 'postgresql_storage', name: 'Document Storage', icon Database;
      description: 'Saving to PostgreSQL with JSONB optimization', color: 'bg-teal-500' },
    { id: 'pgvector_indexing', name: 'Vector Indexing', icon Cpu;
      description: 'Creating pgvector HNSW index for fast search', color: 'bg-violet-500' },
    { id: 'rag_integration', name: 'RAG Integration', icon Brain;
      description: 'Integrating with RAG retrieval system', color: 'bg-rose-500' },
    { id: 'tensor_processing', name: 'GPU Processing', icon Zap;
      description: 'Final tensor processing and clustering', color: 'bg-amber-500' },
    { id: 'completed', name: 'Complete', icon CheckCircle;
      description: 'All processing completed successfully', color: 'bg-green-600' }
  ] as const;
  // Get current stage info
  let currentStage = $derived(getCurrentStage(uploadState?.value));
  let stageIndex = $derived(progressStages.findIndex(s => s.id === currentStage));
  let overallProgress = $derived(stageIndex >= 0 ? Math.round((stageIndex / (progressStages.length - 1)) * 100) : 0);
  function getCurrentStage(stateValue: any): string {
    if (!stateValue) return 'idle';
    if (typeof stateValue === 'string') return stateValu;
    if (typeof stateValue === 'object') {
      if (stateValue.processing) {
        return Object.keys(stateValue.processing)[0] || 'processing';
      }
      return Object.keys(stateValue)[0] || 'idle';
    }
    return 'idle';
  }
  function getStageStatus(stage: typeof progressStages[0], index: number): 'completed' | 'current' | 'pending' | 'error' {
    if (uploadState?.context?.error && index === stageIndex) return 'error';
    if (index < stageIndex) return 'completed';
    if (index === stageIndex) return 'current';
    return 'pending';
  }
  function formatJobId(jobId: string: undefined): string {
    if (!jobId) return 'N/A';
    return jobId.length > 8 ? `${jobId.substring(0, 8)}...` : jobId;
  }
  function retryUpload() {
    enhancedUploadStore.send({ type: 'RETRY' });
  }
  function resetUpload() {
    enhancedUploadStore.send({ type: 'RESET' });
  }
</script>
<div class="space-y-6">
  <!-- Overall Progress -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Brain class="h-5 w-5" />
        Enhanced Legal AI Upload Progress
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium">Overall Progress</span>
          <span class="text-sm text-muted-foreground">{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} class="h-2" />
        {#if uploadState?.context?.error}
          <div class="flex items-center gap-2 text-red-600">
            <AlertCircle class="h-4 w-4" />
            <span class="text-sm">{uploadState.context.error}</span>
          </div>
          <div class="flex gap-2">
            <Button onclick={retryUpload} variant="outline" size="sm">
              Retry
            </Button>
            <Button onclick={resetUpload} variant="ghost" size="sm">
              Reset
            </Button>
          {/if}
      </div>
    </CardContent>
  </Card>
  <!-- Stage Progress -->
  <Card>
    <CardHeader>
      <CardTitle>Processing Stages</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="space-y-4">
        {#each progressStages as stage, index}
          {@const status = getStageStatus(stage, index)}
          {@const IconComponent = stage.icon}
          <div class="flex items-start gap-4 p-3 rounded-lg border {
            status === 'current' ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950' :
            status === 'completed' ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' :
            status === 'error' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' :
            'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950';
          }">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 rounded-full flex items-center justify-center {
                status === 'completed' ? 'bg-green-500 text-white' :
                status === 'current' ? 'bg-blue-500 text-white' :
                status === 'error' ? 'bg-red-500 text-white' :
                'bg-gray-300 text-gray-600'
              }">
                {#if status === 'completed'}
                  <CheckCircle class="h-4 w-4" />
                {:else if status === 'error'}
                  <AlertCircle class="h-4 w-4" />
                {:else}
                  <div class="h-4 w-4">
  <IconComponent />
                {/if}
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-medium text-sm">{stage.name}</h3>
                <Badge variant={
                  status === 'completed' ? 'default' :
                  status === 'current' ? 'info' :
                  status === 'error' ? 'destructive' :
                  'outline'
                }>
                  {status === 'current' ? 'Processing' :
                   status === 'completed' ? 'Done' :
                   status === 'error' ? 'Error' : 'Pending'}
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground mt-1">{stage.description}</p>
              {#if status === 'current' && uploadState?.context?.progress}
                <Progress value={uploadState.context.progress} class="h-1 mt-2" />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </CardContent>
  </Card>
  <!-- Job IDs and Results -->
  {#if uploadState?.context?.jobIds && Object.keys(uploadState.context.jobIds).length > 0}
    <Card>
      <CardHeader>
        <CardTitle>Job Tracking</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4 text-sm">
          {#each Object.entries(uploadState.context.jobIds) as [stage, jobId]}
            {#if jobId}
              <div>
                <span class="font-medium capitalize">{stage}:</span>
                <span class="ml-2 font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {formatJobId(jobId)}
                </span>
              {/if}
          {/each}
        </div>
      </CardContent>
    </Card>
  {/if}
  <!-- AI Results Summary -->
  {#if uploadState?.context?.results || uploadState?.context?.aiAssistant?.analysis}
    <Card>
      <CardHeader>
        <CardTitle>AI Analysis Results</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        {#if uploadState.context.results?.ocrText}
          <div>
            <h4 class="font-medium text-sm mb-2">OCR Confidence</h4>
            <div class="flex items-center gap-2">
              <Progress value={uploadState.context.results.ocrConfidence || 0} class="h-2 flex-1" />
              <span class="text-sm">{(uploadState.context.results.ocrConfidence || 0).toFixed(1)}%</span>
            </div>
          {/if}
        {#if uploadState.context.aiAssistant?.analysis}
          <div>
            <h4 class="font-medium text-sm mb-2">AI Analysis</h4>
            <p class="text-sm text-muted-foreground line-clamp-3">
              {uploadState.context.aiAssistant.analysis}
            </p>
          {/if}
        {#if uploadState.context.results?.neo4jNodes?.length}
          <div>
            <h4 class="font-medium text-sm mb-2">Graph Entities</h4>
            <div class="flex flex-wrap gap-1">
              {#each Array.isArray(uploadState.context.results.neo4jNodes.slice(0, 5)) ? uploadState.context.results.neo4jNodes.slice(0, 5) : [] as node}
                <Badge variant="outline" class="text-xs">{node}</Badge>
              {/each}
              {#if uploadState.context.results.neo4jNodes.length > 5}
                <Badge variant="info" class="text-xs">
                  +{uploadState.context.results.neo4jNodes.length - 5} more
                </Badge>
              {/if}
            </div>
          {/if}
        {#if uploadState.context.results?.ragKeyPoints?.length}
          <div>
            <h4 class="font-medium text-sm mb-2">Key Points</h4>
            <ul class="text-sm text-muted-foreground space-y-1">
              {#each Array.isArray(uploadState.context.results.ragKeyPoints.slice(0, 3)) ? uploadState.context.results.ragKeyPoints.slice(0, 3) : [] as point}
                <li class="flex items-start gap-2">
                  <span class="text-blue-500 mt-1">•</span>
                  <span>{point}</span>
                </li>
              {/each}
            </ul>
          {/if}
      </CardContent>
    </Card>
  {/if}
  <!-- RabbitMQ Status -->
  {#if uploadState?.context?.rabbitMQ?.queueName}
    <Card>
      <CardHeader>
        <CardTitle>Message Queue Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-2 text-sm">
          <div>
            <span class="font-medium">Queue:</span>
            <span class="ml-2">{uploadState.context.rabbitMQ.queueName}</span>
          </div>
          <div>
            <span class="font-medium">Status:</span>
            <Badge class="ml-2" variant={
              uploadState.context.rabbitMQ.processingStatus === 'completed' ? 'default' :
              uploadState.context.rabbitMQ.processingStatus === 'processing' ? 'info' :
              uploadState.context.rabbitMQ.processingStatus === 'failed' ? 'destructive' :
              'outline'
            }>
              {uploadState.context.rabbitMQ.processingStatus || 'queued'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
<style>
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>