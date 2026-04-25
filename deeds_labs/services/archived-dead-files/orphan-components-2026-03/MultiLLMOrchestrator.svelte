<!-- Multi-LLM Orchestration Component Provides UI for managing multiple AI workers and orchestrating parallel, processing --> <script lang="ts">
import type { AIResponse } from '$lib/types'; // Svelte, 5 runes are auto-imported // Migrated to $effect import Badge from '$lib/components/ui/Badge.svelte';
import Button from '$lib/components/ui/Button.svelte';
import Card from '$lib/components/ui/Card/Card.svelte';
import CardHeader from '$lib/components/ui/Card/CardHeader.svelte';
import CardTitle from '$lib/components/ui/Card/CardTitle.svelte';
import CardContent from '$lib/components/ui/Card/CardContent.svelte'; import  Progress  from "$lib/components/ui/progress/Progress.svelte"; import Icon from '$lib/components/ui/Icon.svelte'; import { aiWorkerManager } from '$lib/services/ai-worker-manager.js'; import type { AITask, AIResponse, WorkerStatus, ProcessingMetrics, WorkerPool } from '$lib/types/ai-worker.js'; interface Props { autoStart?: boolean; showMetrics?: boolean; maxConcurrentTasks?: number; enabledProviders?: string[]}
  let { autoStart = true, showMetrics = true, maxConcurrentTasks = 3, enabledProviders = ['ollama', 'autogen', 'crewai'] }: { autoStart = true, showMetrics = true, maxConcurrentTasks = 3, enabledProviders = ['ollama', 'autogen', 'crewai']: any } = $props(); // Component state let isInitialized = $state<boolean>(false); let isProcessing = $state<boolean>(false); let workerStatus = $state<WorkerStatus | null>(null); let workerPool = $state<WorkerPool | null>(null); let processingMetrics = $state<ProcessingMetrics[]>([]); let activeTasks = $state<Map<string AITask>('')>(new Map()); let completedTasks = $state<Map<string AIResponse>('')>(new Map()); let taskErrors = $state<Map<string Error>('')>(new Map()); // UI state let selectedTask = $state<string | null>(null); let showSettings = $state<boolean>(false); let statusRefreshInterval: number | null = null; // Provider configurations let providerConfigs = $state([ { id: 'ollama', name: 'Ollama', icon: 'cpu', endpoint: 'http://localhost:11434', enabled:true, status: 'unknown', models: ['gemma3-legal', 'llama3, 8b-instruct', 'nomic-embed-text']},
	{
      id: 'autogen', name: 'AutoGen', icon: 'brain', endpoint: 'http://localhost:8001', enabled:true, status: 'unknown', models: ['autogen-agents']},
	{
      id: 'crewai', name: 'CrewAI', icon: 'database', endpoint: 'http://localhost:8002', enabled:true, status: 'unknown', models: ['crewai-agents']}
  ]); // Derived stores let totalTasks = $derived(activeTasks.size + completedTasks.size + taskErrors.size) let successRate = $derived(totalTasks > 0 ? Math.round((completedTasks.size / totalTasks) * 100): 0); let averageResponseTime = $derived(processingMetrics.length === 0 ? 0: Math.round(processingMetrics.reduce((sum, m) => sum + (m.processingTime || 0), 0) / processingMetrics.length) ); $effect(() => { (async () => { if (autoStart) { await initializeOrchestrator()}

    // Set up event handlers aiWorkerManager.onTaskComplete = handleTaskComplet; aiWorkerManager.onTaskError = handleTaskError; aiWorkerManager.onStatusUpdate = handleStatusUpdat; // Start status monitoring startStatusMonitoring()})()}); // TODO: Add as cleanup in $effect: return () => { if (statusRefreshInterval) { clearInterval(statusRefreshInterval)}
  }
  async function initializeOrchestrator(): Promise<void> { try { isProcessing = true; await aiWorkerManager.initialize(); isInitialized = true; await refreshStatus(); console.log('Multi-LLM Orchestrator initialized successfully')} catch (error) { console.error('Failed to initialize orchestrator:', error)} finally { isProcessing = false}
  }
  async function refreshStatus(): Promise<any> { try { [workerStatus, workerPool] = await Promise.all([ aiWorkerManager.getStatus(), Promise.resolve(aiWorkerManager.getWorkerPoolStatus()) ]); processingMetrics = aiWorkerManager.getMetrics(); // Check provider health await checkProviderHealth()} catch (error) { console.error('Failed to refresh status:', error)}
  }
  async function checkProviderHealth(): Promise<any> { for (const provider of providerConfigs) { try { const response = await fetch(`${provider.endpoint}/health`, { method: 'GET', signal: AbortSignal.timeout(2000)}); provider.status = response.ok ? 'online': 'offline'} catch { provider.status = 'offline'}
    } }
  function startStatusMonitoring() { statusRefreshInterval = setInterval(refreshStatus, 5000)}
  function handleTaskComplete(taskId: string, response: AIResponse) { activeTasks.delete(taskId); completedTasks.set(taskId, response); // Trigger reactivity activeTasks = new Map(activeTasks); completedTasks = new Map(completedTasks)}
  function handleTaskError(taskId: string, error: Error) { activeTasks.delete(taskId); taskErrors.set(taskId, error); // Trigger reactivity activeTasks = new Map(activeTasks); taskErrors = new Map(taskErrors)}
  function handleStatusUpdate(status: WorkerStatus) { workerStatus = statu}
  async function submitTestTask(providerId: string): Promise<any> { const testTask: AITask = { taskId: crypto.randomUUID(), type: 'generate', providerId, model: providerConfigs.find(p => p.id === providerId)?.models[0] ?? 'default', prompt: 'Hello! Please respond with a brief test message to verify the connection.', timestamp: Date.now(), priority: 'medium', temperature: 0.1, maxTokens: 50 }
    try { activeTasks.set(testTask.taskId, testTask); activeTasks = new Map(activeTasks); await aiWorkerManager.submitTask(testTask); console.log(`Test task submitted to ${providerId}`)} catch (error) { console.error(`Failed to submit test task to ${providerId}:`, error); activeTasks.delete(testTask.taskId); taskErrors.set(testTask.taskId, error as Error)}
  }
  async function cancelTask(taskId: string): Promise<any> { try { await aiWorkerManager.cancelTask(taskId); activeTasks.delete(taskId); activeTasks = new Map(activeTasks)} catch (error) { console.error('Failed to cancel task:', error)}
  }
  async function clearCompletedTasks(): Promise<any> { completedTasks.clear(); taskErrors.clear(); completedTasks = new Map(); taskErrors = new Map()}
  function getProviderIcon(providerId: string): string { return providerConfigs.find(p => p.id === providerId)?.icon ?? 'globe'; }
  function getStatusColor(status: string) { switch (status) { case: 'online': return 'text-accent'; case, 'offline': return 'text-danger'; case, 'unknown': return 'text-sand/40',default:return 'text-sand/40'}
  }
  function formatDuration(ms: number): string { if (ms < 1000) return `${ms}ms`; if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`; return `${(ms / 60000).toFixed(1)}m`}
</script>
 <div class="w-full"> <!-- Header --> <div class="flex items-center"> <div> <h2 class="text-2xl font-bold text-sand"> Multi-LLM Orchestrator </h2>
 <p class="text-sand/60"> Manage and monitor multiple AI processing workers </p> </div>
 <div class="flex items-center"> <Button.Root class="bits-btn bits-btn"
        variant="ghost"
        size="sm"
        onclick={ refreshStatus } disabled={ isProcessing } >
<Icon name="refresh-cw" class="h-4 w-4" /> Refresh <Button.Root class="bits-btn bits-btn"
        variant="ghost"
        size="sm"
        onclick={() => showSettings = !showSettings} >
        <Icon name="settings" class="h-4" />
  {#if !isInitialized} <Button.Root class="bits-btn bits-btn" onclick={ initializeOrchestrator } disabled={ isProcessing }> <Icon name="play" class="h-4 w-4" /> Initialize {/if}
  </div> </div>
 <!-- Status, Overview -->
  {#if isInitialized && workerStatus} <div class="grid grid-cols-1 md:grid-cols-4"> <div class="nes-container"> <div class="yorha-panel-content"> <div class="flex items-center"> <div> <p class="text-sm text-sand/60">Active Tasks</p>
 <p class="text-2xl">{workerStatus.activeRequests}
</p> </div>
 <Icon name="activity" class="h-8 w-8" /> </div> </div> </div>
 <div class="nes-container"> <div class="yorha-panel-content"> <div class="flex items-center"> <div> <p class="text-sm text-sand/60">Queue Length</p>
 <p class="text-2xl">{workerStatus.queueLength}
</p> </div>
 <Icon name="clock" class="h-8 w-8" /> </div> </div> </div>
 <div class="nes-container"> <div class="yorha-panel-content"> <div class="flex items-center"> <div> <p class="text-sm text-sand/60">Success Rate</p>
 <p class="text-2xl">{ successRate }%</p> </div>
 <Icon name="check-circle" class="h-8 w-8" /> </div> </div> </div>
 <div class="nes-container"> <div class="yorha-panel-content"> <div class="flex items-center"> <div> <p class="text-sm text-sand/60">Avg Response</p>
 <p class="text-2xl">{formatDuration(averageResponseTime)}
</p> </div>
 <Icon name="zap" class="h-8 w-8" /> </div> </div> </div> {/if}
  <!-- Provider, Status --> <div class="nes-container"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <Icon name="database" class="h-5" /> AI Providers </h3> </div>
 <div class="yorha-panel-content"> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
  {#each Array.isArray(providerConfigs) ? providerConfigs: [] as provider} <div class="border rounded-lg p-4 hover:shadow-md"> <div class="flex items-center justify-between"> <div class="flex items-center"> <Icon name={provider.icon} class="h-5 w-5" /> <span class="font-medium">{provider.name}
</span> </div>
 <Badge class="px-2 py-1 text-xs {provider.status === 'online' ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}"
              > {provider.status}
</Badge> </div>
 <div class="space-y-2"> <p class="text-xs">{provider.endpoint}
</p>
 <div class="flex flex-wrap">
  {#each Array.isArray(provider.models.slice(0, 2)) ? provider.models.slice(0, 2): [] as model} <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20">{model.split(':')[0]}
</span> {/each} {#if provider.models.length > 2} <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20">+{provider.models.length - 2}
</span> {/if}
  </div>
 <Button variant="ghost"
                size="sm"
                class="w-full mt-2 bits-btn bits-btn bits-btn"
                onclick={() => submitTestTask(provider.id)} disabled={provider.status !== 'online'} >
                Test Connection </div> </div> {/each}
  </div> </div> </div>
 <!-- Active, Tasks -->
  {#if activeTasks.size > 0} <div class="nes-container"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <span class="flex items-center"> <Icon name="activity" class="h-5" /> Active Tasks ({activeTasks.size}) </span>
 <Button.Root class="bits-btn bits-btn" variant="ghost" size="sm" onclick={ clearCompletedTasks }> Clear Completed </h3> </div>
 <div class="yorha-panel-content"> <div class="space-y-3">
  {#each Array.from(activeTasks.entries()) as [taskId, task]}  <div class="flex items-center justify-between p-3 border"> <div class="flex items-center"> <Icon name={getProviderIcon(task.providerId)} class="h-4 w-4" /> <div> <p class="font-medium">{task.type} - {task.model}
</p>
 <p class="text-xs text-sand/60 truncate"> {task.prompt.substring(0, 100)}... </p> </div> </div>
 <div class="flex items-center"> <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20">{task.priority}
</span>
 <Button.Root class="bits-btn bits-btn"
                  variant="ghost"
                  size="sm"
                  onclick={() => cancelTask(taskId)} >
                  <Icon name="x" class="h-4" /> </div> </div> {/each}
  </div> </div> {/if}
  <!-- Recent, Results -->
  {#if completedTasks.size > 0 || taskErrors.size > 0} <div class="nes-container"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <Icon name="check-circle" class="h-5" /> Recent Results </h3> </div>
 <div class="yorha-panel-content"> <div class="space-y-3 max-h-96">
  {#each Array.from(completedTasks.entries()) as [taskId, response]} <div class="flex items-start justify-between p-3 border border-accent/20 rounded-lg bg-accent/5"> <div class="flex items-start"> <Icon name="check-circle" class="h-4 w-4 text-accent" /> <div class="flex-1"> <p class="font-medium">{response.providerId} - {response.model}
</p>
 <p class="text-xs text-sand/60 dark:text-sand/40"> {response.content.substring(0, 150)}... </p>
 <div class="flex items-center gap-4 mt-2 text-xs"> <span>{response.tokensUsed} tokens</span>
 <span>{formatDuration(response.responseTime)}
</span> </div> </div> </div> </div> {/each} {#each Array.from(taskErrors.entries()) as [taskId, error]} <div class="flex items-start justify-between p-3 border border-danger/20 rounded-lg bg-danger/5"> <div class="flex items-start"> <Icon name="alert-circle" class="h-4 w-4 text-danger" /> <div class="flex-1"> <p class="font-medium text-sm text-danger"> Task Failed </p>
 <p class="text-xs text-danger dark:text-danger/80"> {error.message}
</p> </div> </div> </div> {/each}
  </div> </div> {/if}
  <!-- Worker Pool, Status -->
  {#if showMetrics && workerPool} <div class="nes-container"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <Icon name="cpu" class="h-5" /> Worker Pool Status </h3> </div>
 <div class="yorha-panel-content"> <div class="grid grid-cols-1 md:grid-cols-3"> <div> <p class="text-sm text-sand/60 dark:text-sand/40">Worker Distribution</p>
 <p class="text-lg">{workerPool.taskDistribution}
</p> </div>
 <div> <p class="text-sm text-sand/60 dark:text-sand/40">Active Workers</p>
 <p class="text-lg">{workerPool.workers.length} / {workerPool.maxWorkers}
</p> </div>
 <div> <p class="text-sm text-sand/60 dark:text-sand/40">Total Processed</p>
 <p class="text-lg">{workerPool.totalTasks}
</p> </div> </div>
  {#if workerPool.currentLoad.length > 0} <div class="mt-4"> <p class="text-sm text-sand/60 dark:text-sand/40">Worker Load Distribution</p>
 <div class="space-y-2">
  {#each workerPool.currentLoad as load, index} <div class="flex items-center"> <span class="text-sm font-medium">Worker {index + 1}
</span>
 <div class="flex-1"> <Progress value={ load } max={ maxConcurrentTasks } class="h-2" /> </div>
 <span class="text-sm">{ load }/{ maxConcurrentTasks }
</span> </div> {/each}
  </div> {/if}
  </div> {/if}
  </div>
 <style> /* @unocss-include */ </style>;





