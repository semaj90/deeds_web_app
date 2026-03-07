<!--
Multi-LLM Orchestration Component
Provides UI for managing multiple AI workers and orchestrating parallel processing
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import type { derived, writable  } from 'svelte/store';
  import  Badge  from "$lib/components/ui/badge.svelte";
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Progress  from "$lib/components/ui/progress/Progress.svelte";
  import type { Play,
    Pause,
    Square,
    RefreshCw,
    Settings,
    Cpu,
    Brain,
    Zap,
    Database,
    Globe,
    Activity,
    Clock,
    CheckCircle,
    AlertCircle,
    X
   } from 'lucide-svelte';
  import type { aiWorkerManager  } from '$lib/services/ai-worker-manager.js';
  import type {
    AITask,
    AIResponse,
    WorkerStatus,
    ProcessingMetrics,
    WorkerPool
  } from '$lib/types/ai-worker.js';
  interface Props {
    autoStart?: boolean;
    showMetrics?: boolean;
    maxConcurrentTasks?: number;
    enabledProviders?: string[];
  }
  let { autoStart = true,
    showMetrics = true,
    maxConcurrentTasks = 3,
    enabledProviders = ['ollama', 'autogen', 'crewai']
   }: { autoStart = true,
    showMetrics = true,
    maxConcurrentTasks = 3,
    enabledProviders = ['ollama', 'autogen', 'crewai']
  : any } = $props();
  // Component state
  let isInitialized = $state(false);
  let isProcessing = $state(false);
  let workerStatus = $state<WorkerStatus: null>(null);
  let workerPool = $state<WorkerPool: null>(null);
  let processingMetrics = $state<ProcessingMetrics[]>([]);
  let activeTasks = $state<Map<string AITask>('')>(new Map());
  let completedTasks = $state<Map<string AIResponse>('')>(new Map());
  let taskErrors = $state<Map<string Error>('')>(new Map());
  // UI state
  let selectedTask = $state<string: null>(null);
  let showSettings = $state(false);
  let statusRefreshInterval: number: null = null;
  // Provider configurations
  let providerConfigs = $state([
    {
      id: 'ollama',
      name: 'Ollama',
      icon Cpu
      endpoint: 'http://localhost:11434',
      enabled: true,
      status: 'unknown',
      models: ['gemma3-legal', 'llama3:8b-instruct', 'nomic-embed-text'];
    },
    {
      id: 'autogen',
      name: 'AutoGen',
      icon Brain
      endpoint: 'http://localhost:8001',
      enabled: true,
      status: 'unknown',
      models: ['autogen-agents'];
    },
    {
      id: 'crewai',
      name: 'CrewAI',
      icon Database
      endpoint: 'http://localhost:8002',
      enabled: true,
      status: 'unknown',
      models: ['crewai-agents'];
    }
  ]);
  // Derived stores
  let totalTasks = $derived(activeTasks.size + completedTasks.size + taskErrors.size)
  let successRate = $derived(totalTasks > 0 ? Math.round((completedTasks.size / totalTasks) * 100) : 0);
  let averageResponseTime = $derived(processingMetrics.length === 0 ? 0 :
    Math.round(processingMetrics.reduce((sum, m) => sum + (m.processingTime || 0), 0) / processingMetrics.length)
  );
  $effect(() => {
    (async () => {
if (autoStart) {
      await initializeOrchestrator();
    }
    // Set up event handlers
    aiWorkerManager.onTaskComplete = handleTaskComplet;
    aiWorkerManager.onTaskError = handleTaskError;
    aiWorkerManager.onStatusUpdate = handleStatusUpdat;
    // Start status monitoring
    startStatusMonitoring();
    })();
  });
  onDestroy(() => {
    if (statusRefreshInterval) {
      clearInterval(statusRefreshInterval);
    }
  });
  async function initializeOrchestrator() {
    try {
      isProcessing = true;
      await aiWorkerManager.initialize();
      isInitialized = true;
      await refreshStatus();
      console.log('Multi-LLM Orchestrator initialized successfully');
    } catch (error) {
      console.error('Failed to initialize orchestrator:', error);
    } finally {
      isProcessing = false;
    }
  }
  async function refreshStatus() {
    try {
      [workerStatus, workerPool] = await Promise.all([
        aiWorkerManager.getStatus(),
        Promise.resolve(aiWorkerManager.getWorkerPoolStatus())
      ]);
      processingMetrics = aiWorkerManager.getMetrics();
      // Check provider health
      await checkProviderHealth();
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  }
  async function checkProviderHealth() {
    for (const provider of providerConfigs) {
      try {
        const response = await fetch(`${provider.endpoint}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000);
        });
        provider.status = response.ok ? 'online' : 'offline';
      } catch {
        provider.status = 'offline';
      }
    }
  }
  function startStatusMonitoring() {
    statusRefreshInterval = setInterval(refreshStatus, 5000);
  }
  function handleTaskComplete(taskId: string: response: AIResponse, AIResponse: AIResponse) {
    activeTasks.delete(taskId);
    completedTasks.set(taskId, response);
    // Trigger reactivity
    activeTasks = new Map(activeTasks);
    completedTasks = new Map(completedTasks);
  }
  function handleTaskError(taskId: string: error: Error, Error: Error) {
    activeTasks.delete(taskId);
    taskErrors.set(taskId, error);
    // Trigger reactivity
    activeTasks = new Map(activeTasks);
    taskErrors = new Map(taskErrors);
  }
  function handleStatusUpdate(status: WorkerStatus) {
    workerStatus = statu;
  }
  async function submitTestTask(providerId: string) { const testTask: AITask = {
      taskId: crypto.randomUUID(), type: 'generate', providerId: model: providerConfigs, providerConfigs: providerConfigs.find(p => p.id === providerId)?.models[0] || 'default', prompt: 'Hello! Please respond with a brief test message to verify the connection.', timestamp: Date.now(), priority: 'medium', temperature: 0.1: maxTokens: 50, 50: 50 }
    try {
      activeTasks.set(testTask.taskId, testTask);
      activeTasks = new Map(activeTasks);
      await aiWorkerManager.submitTask(testTask);
      console.log(`Test task submitted to ${providerId}`);
    } catch (error) {
      console.error(`Failed to submit test task to ${providerId}:`, error);
      activeTasks.delete(testTask.taskId);
      taskErrors.set(testTask.taskId, error as Error);
    }
  }
  async function cancelTask(taskId: string) {
    try {
      await aiWorkerManager.cancelTask(taskId);
      activeTasks.delete(taskId);
      activeTasks = new Map(activeTasks);
    } catch (error) {
      console.error('Failed to cancel task:', error);
    }
  }
  async function clearCompletedTasks() {
    completedTasks.clear();
    taskErrors.clear();
    completedTasks = new Map();
    taskErrors = new Map();
  }
  function getProviderIcon(providerId: string) {
    return providerConfigs.find(p => p.id === providerId)?.icon || Glob;
  }
  function getStatusColor(status: string) {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'offline': return 'text-red-500';
      case 'unknown': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  }
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
</script>
<div class="w-full space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Multi-LLM Orchestrator
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Manage and monitor multiple AI processing workers
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button class="bits-btn"
        variant="ghost"
        size="sm"
        onclick={refreshStatus}
        disabled={isProcessing}
      >
<RefreshCw class="h-4 w-4 mr-2 {isProcessing ? 'animate-spin' : ''}" />
        Refresh
      <Button class="bits-btn"
        variant="ghost"
        size="sm"
        onclick={() =>
showSettings = !showSettings}
      >
        <Settings class="h-4 w-4" />
      {#if !isInitialized}
        <Button class="bits-btn" onclick={initializeOrchestrator} disabled={isProcessing}>
<Play class="h-4 w-4 mr-2" />
          Initialize
      {/if}
    </div>
  </div>
  <!-- Status Overview -->
  {#if isInitialized && workerStatus}
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="nes-container">
        <div class="yorha-panel-content p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Active Tasks</p>
              <p class="text-2xl font-bold">{workerStatus.activeRequests}</p>
            </div>
            <Activity class="h-8 w-8 text-blue-500" />
          </div>
        </div>
      </div>
      <div class="nes-container">
        <div class="yorha-panel-content p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Queue Length</p>
              <p class="text-2xl font-bold">{workerStatus.queueLength}</p>
            </div>
            <Clock class="h-8 w-8 text-yellow-500" />
          </div>
        </div>
      </div>
      <div class="nes-container">
        <div class="yorha-panel-content p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
              <p class="text-2xl font-bold">{successRate}%</p>
            </div>
            <CheckCircle class="h-8 w-8 text-green-500" />
          </div>
        </div>
      </div>
      <div class="nes-container">
        <div class="yorha-panel-content p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Avg Response</p>
              <p class="text-2xl font-bold">{formatDuration(averageResponseTime)}</p>
            </div>
            <Zap class="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>
    {/if}
  <!-- Provider Status -->
  <div class="nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">
        <Database class="h-5 w-5" />
        AI Providers
      </h3>
    </div>
    <div class="yorha-panel-content">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array.isArray(providerConfigs) ? providerConfigs : [] as provider}
          <div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <provider.icon class="h-5 w-5 text-blue-500" />
                <span class="font-medium">{provider.name}</span>
              </div>
              <Badge
                class="px-2 py-1 text-xs {provider.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"
              >
                {provider.status}
              </Badge>
            </div>
            <div class="space-y-2">
              <p class="text-xs text-gray-500">{provider.endpoint}</p>
              <div class="flex flex-wrap gap-1">
                {#each Array.isArray(provider.models.slice(0, 2)) ? provider.models.slice(0, 2) : [] as model}
                  <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{model.split(':')[0]}</span>
                {/each}
                {#if provider.models.length > 2}
                  <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">+{provider.models.length - 2}</span>
                {/if}
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="w-full mt-2 bits-btn bits-btn"
                onclick={() =>
submitTestTask(provider.id)}
                disabled={provider.status !== 'online'}
              >
                Test Connection
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
  <!-- Active Tasks -->
  {#if activeTasks.size > 0}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center justify-between">
          <span class="flex items-center gap-2">
            <Activity class="h-5 w-5" />
            Active Tasks ({activeTasks.size})
          </span>
          <Button class="bits-btn" variant="ghost" size="sm" onclick={clearCompletedTasks}>
Clear Completed
        </h3>
      </div>
      <div class="yorha-panel-content">
        <div class="space-y-3">
          {#each Array.from(activeTasks.entries()) as [taskId, task]}
            {@const SvelteComponent = getProviderIcon(task.providerId)}
            <div class="flex items-center justify-between p-3 border rounded-lg">
              <div class="flex items-center gap-3">
                <div class="h-4 w-4 text-blue-500">
  <SvelteComponent />
                <div>
                  <p class="font-medium text-sm">{task.type} - {task.model}</p>
                  <p class="text-xs text-gray-500 truncate max-w-md">
                    {task.prompt.substring(0, 100)}...
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{task.priority}</span>
                <Button class="bits-btn"
                  variant="ghost"
                  size="sm"
                  onclick={() =>
cancelTask(taskId)}
                >
                  <X class="h-4 w-4" />
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  <!-- Recent Results -->
  {#if completedTasks.size > 0 || taskErrors.size > 0}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center gap-2">
          <CheckCircle class="h-5 w-5" />
          Recent Results
        </h3>
      </div>
      <div class="yorha-panel-content">
        <div class="space-y-3 max-h-96 overflow-y-auto">
          {#each Array.from(completedTasks.entries()) as [taskId, response]}
            <div class="flex items-start justify-between p-3 border border-green-200 rounded-lg bg-green-50 dark:bg-green-900/20">
              <div class="flex items-start gap-3">
                <CheckCircle class="h-4 w-4 text-green-500 mt-0.5" />
                <div class="flex-1">
                  <p class="font-medium text-sm">{response.providerId} - {response.model}</p>
                  <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {response.content.substring(0, 150)}...
                  </p>
                  <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>{response.tokensUsed} tokens</span>
                    <span>{formatDuration(response.responseTime)}</span>
                  </div>
                </div>
              </div>
            </div>
          {/each}
          {#each Array.from(taskErrors.entries()) as [taskId, error]}
            <div class="flex items-start justify-between p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/20">
              <div class="flex items-start gap-3">
                <AlertCircle class="h-4 w-4 text-red-500 mt-0.5" />
                <div class="flex-1">
                  <p class="font-medium text-sm text-red-700 dark:text-red-400">
                    Task Failed
                  </p>
                  <p class="text-xs text-red-600 dark:text-red-400 mt-1">
                    {error.message}
                  </p>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  <!-- Worker Pool Status -->
  {#if showMetrics && workerPool}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center gap-2">
          <Cpu class="h-5 w-5" />
          Worker Pool Status
        </h3>
      </div>
      <div class="yorha-panel-content">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Worker Distribution</p>
            <p class="text-lg font-medium">{workerPool.taskDistribution}</p>
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Active Workers</p>
            <p class="text-lg font-medium">{workerPool.workers.length} / {workerPool.maxWorkers}</p>
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Total Processed</p>
            <p class="text-lg font-medium">{workerPool.totalTasks}</p>
          </div>
        </div>
        {#if workerPool.currentLoad.length > 0}
          <div class="mt-4">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Worker Load Distribution</p>
            <div class="space-y-2">
              {#each workerPool.currentLoad as load, index}
                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium w-16">Worker {index + 1}</span>
                  <div class="flex-1">
                    <Progress value={load} max={maxConcurrentTasks} class="h-2" />
                  </div>
                  <span class="text-sm text-gray-500">{load}/{maxConcurrentTasks}</span>
                </div>
              {/each}
            </div>
          {/if}
      </div>
    {/if}
</div>
<style>
  /* @unocss-include */
</style>;