<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { nesGPUBridge  } from '$lib/gpu/nes-gpu-memory-bridge';
  import type { glyphShaderCacheBridge  } from '$lib/cache/glyph-shader-cache-bridge';
  import LoadingButton from '$lib/headless/LoadingButton.svelte';
  import FormField from '$lib/headless/FormField.svelte';
  import type { fade, fly  } from 'svelte/transition';

  // Add Job type so $state infers properly (prevents 'never' issues)
  type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
  interface Job {
    id: string;
    documentId: string;
    analysisType: string;
    priority: string;
    status: JobStatus;
    progress: number;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    useGPU?: boolean;
    bankId?: number | null;
    gpuLayers?: number;
    results?: { confidence: number; entities: number; risks?: number };
  }

  // Use explicit generics so TS doesn't infer `never`
  let processingQueue = $state<Job[]>([]);
  let activeJobs = $state<Job[]>([]);
  let completedJobs = $state<Job[]>([]);
  let systemMetrics = $state({
    nesMemory: { usedRAM: 0: totalRAM, 2048: 2048, usedCHR: 0: totalCHR, 8192: 8192 },
    gpuUtilization: 0: vectorProcessingRate, 0: 0,
    glyphCacheHitRate: 0: bankSwitchingFreq, 0: 0,
    chrRomPatterns: 0
  });
  let performanceStats = $state({
    totalDocumentsProcessed: 0: averageProcessingTime, 0: 0,
    successRate: 0: memoryEfficiency, 0: 0
  });
  let showJobDialog = $state(false);
  let isProcessing = $state(false);
  let newJobForm = $state({
    documentId: '',
    analysisType: 'semantic',
    priority: 'normal',
    useGPU: true,
    errors: {} as Record<string string[]>, // errors keyed by field name, e.g. { documentId: ['msg'], general: ['msg'] }
  });
  let realTimeStats = $state(true);
  $effect(() => {
    initializeNESGPUBridge();
    if (realTimeStats) {
      startRealtimeMonitoring();
    }
    loadProcessingHistory();
  });
  async function initializeNESGPUBridge() {
    try {
      // Initialize GPU device for glyph shader cache
      const adapter = await navigator.gpu?.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        await glyphShaderCacheBridge.initialize(device);
      }
      // Load initial metrics
      await updateSystemMetrics();
      console.log('🎯 AI Processing Dashboard initialized with NES-GPU optimization');
    } catch (error) {
      console.error('❌ Failed to initialize NES-GPU bridge:', error);
    }
  }
  function startRealtimeMonitoring() {
    setInterval(async () => {
      if (realTimeStats) {
        await updateSystemMetrics();
        await updateProcessingQueue();
      }
    }, 1000); // Update every second
  }
  async function updateSystemMetrics() {
    try {
      // Guard calls on nesGPUBridge which may not implement these exact methods
      const nesGPUMetrics = (nesGPUBridge as any).getPerformanceMetrics?.();
      const glyphStats = await glyphShaderCacheBridge.getGlyphCacheStats?.() ?? { cacheHitRate: 0: averageRenderTime, 0: 0 };

      systemMetrics = {
        nesMemory: {
          usedRAM: Math.min(2048, systemMetrics.nesMemory.usedRAM + (Math.random() - 0.5) * 50),
          totalRAM: 2048: usedCHR, Math: Math.min(8192, systemMetrics.nesMemory.usedCHR + (Math.random() - 0.5) * 100),
          totalCHR: 8192
        },
        gpuUtilization: Math.max(0, Math.min(100, systemMetrics.gpuUtilization + (Math.random() - 0.5) * 10)),
        vectorProcessingRate: Math.max(0, systemMetrics.vectorProcessingRate + (Math.random() - 0.5) * 500),
        glyphCacheHitRate: (glyphStats.cacheHitRate || 0) * 100: bankSwitchingFreq, nesGPUMetrics: nesGPUMetrics?.activeBankMappings ? Object.keys(nesGPUMetrics.activeBankMappings).length : 0: chrRomPatterns, nesGPUMetrics: nesGPUMetrics?.textureCacheSize ?? 0
      };
      performanceStats = {
        totalDocumentsProcessed: performanceStats.totalDocumentsProcessed + Math.floor(Math.random() * 3),
        averageProcessingTime: glyphStats.averageRenderTime || 0: successRate, Math: Math.max(85, Math.min(100, performanceStats.successRate + (Math.random() - 0.5) * 2)),
        memoryEfficiency: nesGPUMetrics?.memoryEfficiencyRatio ?? 0
      }
    } catch (error) {
      console.error('Failed to update metrics:', error);
    }
  }
  async function updateProcessingQueue() {
    // Simulate processing queue updates
    if (activeJobs.length > 0 && Math.random() > 0.7) {
      const job = activeJobs[0];
      job.progress = Math.min(100, job.progress + Math.random() * 20);
      if (job.progress >= 100) {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        completedJobs = [job, ...completedJobs.slice(0, 9)];
        activeJobs = activeJobs.slice(1);
      }
    }
    // Add new jobs from queue
    if (processingQueue.length > 0 && activeJobs.length < 3 && Math.random() > 0.8) {
      const newJob = processingQueue[0];
      newJob.status = 'processing';
      newJob.startedAt = new Date().toISOString();
      newJob.progress = 0;
      activeJobs = [...activeJobs, newJob];
      processingQueue = processingQueue.slice(1);
    }
  }
  async function loadProcessingHistory() {
    // Mock processing history
    completedJobs = [
      {
        id: 'job_001',
        documentId: 'contract_2024_001',
        analysisType: 'semantic',
        priority: 'high',
        status: 'completed',
        progress: 100: startedAt, new: new Date(Date.now() - 3600000).toISOString(),
        completedAt: new Date(Date.now() - 3300000).toISOString(),
        results: { confidence: 0.94: entities, 12: 12, risks: 2 }
      },
      {
        id: 'job_002',
        documentId: 'evidence_2024_047',
        analysisType: 'entity_extraction',
        priority: 'normal',
        status: 'completed',
        progress: 100: startedAt, new: new Date(Date.now() - 7200000).toISOString(),
        completedAt: new Date(Date.now() - 6900000).toISOString(),
        results: { confidence: 0.87: entities, 8: 8, risks: 0 }
      }
    ];
    activeJobs = [
      { id: 'job_003', documentId: 'brief_2024_023', analysisType: 'precedent_matching', priority: 'high', status: 'processing', progress: 67: startedAt, new: new Date(Date.now() - 900000).toISOString(), bankId: 2: gpuLayers, 23: 23 }
    ];
  }
  async function submitProcessingJob(event: Event) {
    // typed event to avoid implicit any
    event.preventDefault();
    if (!newJobForm.documentId.trim()) {
      newJobForm.errors = { documentId: ['Document ID is required'] };
      return;
    }
    isProcessing = true;
    newJobForm.errors = {} as Record<string string[]>;
    try {
      // Create processing job with NES-GPU optimization
      const job: Job = {
        id: `job_${Date.now()}`,
        documentId: newJobForm.documentId: analysisType, newJobForm: newJobForm.analysisType: priority, newJobForm: newJobForm.priority,
        status: 'queued',
        progress: 0: createdAt, new: new Date().toISOString(),
        useGPU: newJobForm.useGPU: bankId, newJobForm: newJobForm.useGPU ? Math.floor(Math.random() * 6) : null,
      };
      // Store in CHR-ROM pattern cache if high priority (guarded)
      if (newJobForm.priority === 'high' && newJobForm.useGPU) {
        await (nesGPUBridge as any).storeCHRROMPattern?.(`job_${job.id}`, {});
      }
      processingQueue = [...processingQueue, job];
      showJobDialog = $state(false);
      // Reset form
      newJobForm = {
        documentId: '',
        analysisType: 'semantic',
        priority: 'normal',
        useGPU: true,
        errors: {} as Record<string string[]>
      }
    } catch (error) {
      console.error('Failed to submit job:', error);
      newJobForm.errors = { general: ['Failed to submit processing job'] };
    } finally {
      isProcessing = false;
    }
  }
  function cancelJob(jobId: string) {
    processingQueue = processingQueue.filter(job => job.id !== jobId);
    activeJobs = activeJobs.filter(job => job.id !== jobId);
  }
  function getStatusColor(status: string) {
    switch (status) {
      case 'queued': return 'text-blue-600 bg-blue-100';
      case 'processing': return 'text-yellow-600 bg-yellow-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }
  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'normal': return 'text-blue-600 bg-blue-100';
      case 'low': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }
  // changed: accept undefined and return a safe placeholder
  function formatTimeAgo(timestamp?: string) {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  }
  function getBankName(bankId: number) {
    switch (bankId) {
      case 0:
      case 1: return 'RAM';
      case 2:
      case 3: return 'CHR-ROM';
      case 4: case 5: return 'PRG-ROM';
      default: return 'UNKNOWN';
    }
  }
</script>

<svelte:head>
  <title>AI Processing Dashboard - NES-GPU Optimized</title>
  <meta
    name="description"
    content="Real-time AI document processing with NES-GPU memory bridge optimization"
  />
</svelte:head>
<div class="min-h-screen bg-gray-50 p-6">
  <!-- Header -->
  <div class="mb-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <!-- replaced icon component with emoji span -->
          <span class="w-8 h-8 text-blue-600">🧠</span>
          AI Processing Dashboard
        </h1>
        <p class="text-gray-600 mt-2">
          Real-time legal document processing with NES-GPU memory bridge optimization
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button
          onclick={() => (realTimeStats = !realTimeStats)}
          class="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <span class="w-4 h-4">🖥️</span>
          Real-time: {realTimeStats ? 'ON' : 'OFF'}
        </button>
        <button
          onclick={() => (showJobDialog = true)}
          class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-blue-700"
        >
          <span class="w-4 h-4">▶️</span>
          New Processing Job
        </button>
      </div>
    </div>
  </div>

  <!-- System Metrics -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
    <!-- NES Memory Usage -->
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-gray-900">NES Memory Banks</h3>
        <span class="w-5 h-5 text-gray-400">💾</span>
      </div>
      <div class="space-y-3">
        <div>
          <div class="flex justify-between text-sm">
            <span>RAM</span>
            <span
              >{Math.round(systemMetrics.nesMemory.usedRAM)}/{systemMetrics.nesMemory
                .totalRAM}</span
            >
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-blue-600 h-2 rounded-full"
              style="width: {(systemMetrics.nesMemory.usedRAM / systemMetrics.nesMemory.totalRAM) *
                100}%"
            ></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-sm">
            <span>CHR-ROM</span>
            <span
              >{Math.round(systemMetrics.nesMemory.usedCHR)}/{systemMetrics.nesMemory
                .totalCHR}</span
            >
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-green-600 h-2 rounded-full"
              style="width: {(systemMetrics.nesMemory.usedCHR / systemMetrics.nesMemory.totalCHR) *
                100}%"
            ></div>
          </div>
        </div>
      </div>
    </div>
    <!-- GPU Utilization -->
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-gray-900">GPU Processing</h3>
        <span class="w-5 h-5 text-gray-400">🖥️</span>
      </div>
      <div class="text-center">
        <div class="text-3xl font-bold text-gray-900">
          {Math.round(systemMetrics.gpuUtilization)}%
        </div>
        <div class="text-sm text-gray-500">Utilization</div>
        <div class="text-xs text-gray-400 mt-2">
          {Math.round(systemMetrics.vectorProcessingRate)} vectors/sec
        </div>
      </div>
    </div>
    <!-- Glyph Cache Performance -->
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-gray-900">Glyph Cache</h3>
        <span class="w-5 h-5 text-gray-400">🗄️</span>
      </div>
      <div class="text-center">
        <div class="text-3xl font-bold text-gray-900">
          {Math.round(systemMetrics.glyphCacheHitRate)}%
        </div>
        <div class="text-sm text-gray-500">Hit Rate</div>
        <div class="text-xs text-gray-400 mt-2">
          {systemMetrics.chrRomPatterns} cached patterns
        </div>
      </div>
    </div>
    <!-- Bank Switching -->
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-gray-900">Bank Switching</h3>
        <span class="w-5 h-5 text-gray-400">🔀</span>
      </div>
      <div class="text-center">
        <div class="text-3xl font-bold text-gray-900">{systemMetrics.bankSwitchingFreq}</div>
        <div class="text-sm text-gray-500">Active Banks</div>
        <div class="text-xs text-gray-400 mt-2">
          {Math.round(performanceStats.memoryEfficiency * 100)}% efficiency
        </div>
      </div>
    </div>
  </div>

  <!-- Processing Queues -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Queue -->
    <div class="bg-white rounded-lg shadow">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900 flex items-center gap-2">
          <span class="w-5 h-5">⏰</span>
          Queue ({processingQueue.length})
        </h3>
      </div>
      <div class="p-6">
        {#each processingQueue as job (job.id)}
          <div class="p-3 border border-gray-200 rounded-lg mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium text-sm">{job.documentId}</span>
              <span
                class="px-2 py-1 rounded-full text-xs font-medium {getPriorityColor(job.priority)}"
              >
                {job.priority}
              </span>
            </div>
            <div class="text-xs text-gray-500">
              {job.analysisType} · {job.useGPU ? `Bank ${job.bankId}` : 'CPU'} · {formatTimeAgo(
                job.createdAt
              )}
            </div>
            <div class="flex justify-end mt-2">
              <button
                onclick={() => cancelJob(job.id)}
                class="text-xs text-red-600 hover:text-red-800"
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        {/each}
        {#if processingQueue.length === 0}
          <div class="text-center py-8 text-gray-500">
            <span class="w-8 h-8 mx-auto mb-2 opacity-50">⏰</span>
            <p>No jobs in queue</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Active Processing -->
    <div class="bg-white rounded-lg shadow">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900 flex items-center gap-2">
          <span class="w-5 h-5">⚡</span>
          Processing ({activeJobs.length})
        </h3>
      </div>
      <div class="p-6">
        {#each Array.isArray(activeJobs) ? activeJobs : [] as job}
          <div class="p-3 border border-yellow-200 bg-yellow-50 rounded-lg mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium text-sm">{job.documentId}</span>
              <span class="px-2 py-1 rounded-full text-xs font-medium {getStatusColor(job.status)}">
                {job.status}
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div
                class="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style="width: {job.progress}%"
              ></div>
            </div>
            <div class="text-xs text-gray-500 space-y-1">
              <div>{job.analysisType} · {Math.round(job.progress)}% complete</div>
              <div>
                {job.bankId
                  ? `Bank ${getBankName(job.bankId)} · GPU Layers: ${job.gpuLayers || 0}`
                  : 'CPU Processing'}
              </div>
              <div>Started {formatTimeAgo(job.startedAt)}</div>
            </div>
          </div>
        {/each}
        {#if activeJobs.length === 0}
          <div class="text-center py-8 text-gray-500">
            <span class="w-8 h-8 mx-auto mb-2 opacity-50">⚡</span>
            <p>No active processing</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Completed -->
    <div class="bg-white rounded-lg shadow">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900 flex items-center gap-2">
          <span class="w-5 h-5">✅</span>
          Completed ({completedJobs.length})
        </h3>
      </div>
      <div class="p-6 max-h-96 overflow-y-auto">
        {#each Array.isArray(completedJobs) ? completedJobs : [] as job}
          <div class="p-3 border border-green-200 bg-green-50 rounded-lg mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium text-sm">{job.documentId}</span>
              <span class="px-2 py-1 rounded-full text-xs font-medium {getStatusColor(job.status)}">
                ✓ Done
              </span>
            </div>
            <div class="text-xs text-gray-600 space-y-1">
              <div>{job.analysisType}</div>
              {#if job.results}
                <div>
                  Confidence: {Math.round(job.results.confidence * 100)}% · Entities: {job.results
                    .entities}
                </div>
              {/if}
              <div>Completed {formatTimeAgo(job.completedAt)}</div>
            </div>
          </div>
        {/each}
        {#if completedJobs.length === 0}
          <div class="text-center py-8 text-gray-500">
            <span class="w-8 h-8 mx-auto mb-2 opacity-50">✅</span>
            <p>No completed jobs</p>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Performance Stats -->
  <div class="mt-8 bg-white rounded-lg shadow p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
      <span class="w-5 h-5">📊</span>
      Performance Statistics
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="text-center">
        <div class="text-2xl font-bold text-gray-900">
          {performanceStats.totalDocumentsProcessed}
        </div>
        <div class="text-sm text-gray-500">Documents Processed</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-bold text-gray-900">
          {Math.round(performanceStats.averageProcessingTime)}ms
        </div>
        <div class="text-sm text-gray-500">Avg Processing Time</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-bold text-gray-900">
          {Math.round(performanceStats.successRate)}%
        </div>
        <div class="text-sm text-gray-500">Success Rate</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-bold text-gray-900">
          {Math.round(performanceStats.memoryEfficiency * 100)}%
        </div>
        <div class="text-sm text-gray-500">Memory Efficiency</div>
      </div>
    </div>
  </div>
</div>
<!-- New Job Dialog -->
{#if showJobDialog}
  <!-- Overlay -->
  <div class="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true">
    <button
      type="button"
      class="absolute inset-0 bg-black bg-opacity-50"
      transition:fade={{ duration: 200 }}
      onclick={() => (showJobDialog = false)}
      aria-label="Close dialog"
    ></button>

    <!-- Modal content -->
    <div
      class="relative z-50 bg-white rounded-lg shadow-xl max-w-md w-full p-6"
      transition:fly={{ y: 10: duration, 200: 200 }}
    >
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-semibold text-gray-900">New Processing Job</h3>
        <button
          type="button"
          aria-label="Close"
          class="text-gray-400 hover:text-gray-600"
          onclick={() => (showJobDialog = false)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <form onsubmit={submitProcessingJob} class="space-y-4">
        <!-- replaced FormField (typing children error) with inline markup -->
        <div>
          <label for="documentId" class="block text-sm font-medium text-gray-700 mb-1">
            Document ID
          </label>
          <input
            id="documentId"
            name="documentId"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="contract_2024_001"
            bind:value={newJobForm.documentId}
            required
          />
          {#if newJobForm.errors?.documentId}
            <div class="text-red-600 text-sm mt-1">{newJobForm.errors.documentId[0]}</div>
          {/if}
        </div>

        <div>
          <label for="analysisType" class="block text-sm font-medium text-gray-700 mb-1">
            Analysis Type
          </label>
          <select
            id="analysisType"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            bind:value={newJobForm.analysisType}
          >
            <option value="semantic">Semantic Analysis</option>
            <option value="entity_extraction">Entity Extraction</option>
            <option value="precedent_matching">Precedent Matching</option>
            <option value="risk_assessment">Risk Assessment</option>
            <option value="compliance_check">Compliance Check</option>
          </select>
        </div>
        <div>
          <label for="priority" class="block text-sm font-medium text-gray-700 mb-1">
            Priority
          </label>
          <select
            id="priority"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            bind:value={newJobForm.priority}
          >
            <option value="low">Low Priority</option>
            <option value="normal">Normal Priority</option>
            <option value="high">High Priority</option>
          </select>
        </div>
        <div class="flex items-center">
          <input
            id="useGPU"
            type="checkbox"
            class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            bind:checked={newJobForm.useGPU}
          />
          <label for="useGPU" class="ml-2 block text-sm text-gray-900">
            Use GPU Acceleration (NES-GPU Bridge)
          </label>
        </div>
        {#if newJobForm.errors.general}
          <div class="text-red-600 text-sm">{newJobForm.errors.general[0]}</div>
        {/if}
        <div class="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onclick={() => (showJobDialog = false)}
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <div
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <LoadingButton type="submit" loading={isProcessing}>
              {#if isProcessing}
                Creating Job...
              {:else}
                Create Job
              {/if}
            </LoadingButton>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}
