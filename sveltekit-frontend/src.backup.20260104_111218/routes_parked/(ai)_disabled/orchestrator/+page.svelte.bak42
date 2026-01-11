<!--
Multi-LLM Orchestrator Demo Page
Showcases the service worker-based AI orchestration system
-->
<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  import { onMount } from 'svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge.svelte";
  import  Textarea  from "$lib/components/ui/textarea.svelte";
  import {
    Cpu,
    Brain,
    Zap,
    Database,
    Play,
    Pause,
    RotateCcw,
    Settings,
    Activity,
    Users,
    Workflow
  } from 'lucide-svelte';
  import LLMSelector from '$lib/components/ai/LLMSelector.svelte';
  import { aiWorkerManager, createGenerationTask, createAnalysisTask } from '$lib/services/ai-worker-manager.js';
  import type { AITask, LLMModel } from '$lib/types/ai-worker.js';
  // dynamic orchestrator component (workaround for modules without a typed default export)
  let OrchestratorComponent: any = null
  onMount(async () => {
    try {
      const mod = await import('$lib/components/ai/MultiLLMOrchestrator.svelte');
      OrchestratorComponent = (mod && (mod as: any).default) ?? (mod as: any).MultiLLMOrchestrator ?? mod} catch (err) {
      console.warn('Failed to load orchestrator component dynamically:', err)}
  });

  interface DemoResult {
    task: AITask
    response?: any
    error?: string}

  // Local demo state (avoid runtime $state magic here for compile stability)
  let selectedModel: LLMModel | undefined
  let userPrompt = 'Analyze the following legal document for key terms, potential issues, and recommendations...';
  let isProcessing = $state<boolean>(false);
  let demoResults: DemoResult[] = [];

  // Demo scenarios
  const demoScenarios = [ {
      name: 'Legal Document Analysis',
      description: 'Parallel analysis across multiple AI models',
      prompt: 'Analyze this contract for potential legal issues, key terms, and compliance requirements.',
      tasks: [
        { provider: 'ollama', model: 'gemma3-legal', focus: 'Legal compliance analysis' },
        { provider: 'vllm', model: 'vllm-gemma3-legal', focus: 'Risk assessment' },
        { provider: 'autogen', model: 'autogen-agents', focus: 'Multi-agent legal review' }
      ]
    }, {
      name: 'Evidence Processing',
      description: 'Multi-stage evidence analysis pipeline',
      prompt: 'Process and categorize evidence files for case preparation.',
      tasks: [
        { provider: 'ollama', model: 'nomic-embed-text', focus: 'Text embedding generation' },
        { provider: 'ollama', model: 'gemma3-legal', focus: 'Content classification' },
        { provider: 'crewai', model: 'crewai-agents', focus: 'Evidence correlation' }
      ]
    }, {
      name: 'Case Research',
      description: 'Comprehensive legal research workflow',
      prompt: 'Research relevant case law and statutes for this legal matter.',
      tasks: [
        { provider: 'autogen', model: 'autogen-agents', focus: 'Legal research coordination' },
        { provider: 'crewai', model: 'crewai-agents', focus: 'Case law analysis' },
        { provider: 'ollama', model: 'gemma3-legal', focus: 'Statute interpretation' }
      ]
    }
  ];

  // Run a demo scenario by creating analysis tasks and submitting them to the aiWorkerManager.
  async function runDemoScenario(scenario: any): Promise<any> {
    if (!selectedModel) return
    isProcessing = true
    demoResults = [];
    try {
      const tasks: AITask[] = (scenario.tasks || []).map((taskConfig: any) =>
        createAnalysisTask(
          `${scenario.prompt}\n\nFocus: ${taskConfig.focus}`,
          taskConfig.focus,
          taskConfig.model,
          taskConfig.provider,
          ({
            priority: 'high',
            maxTokens: 512,
            params: { temperature: 0.1 }
          }, as: any)
        )
      );

      demoResults = tasks.map((task) => ({ task }));

      const taskPromises = tasks.map(async (task) => {
        try {
          const taskId = await aiWorkerManager.submitTask(task as: any),
          const result = await aiWorkerManager.waitForTask(taskId);
          demoResults = demoResults.map((r) =>
            r.task === task ? { ...r, response: result } : r
          );
          return result} catch (error) {
          console.error('Task failed:', error);
          demoResults = demoResults.map((r) =>
            r.task === task ? { ...r, error: (error as Error).message ?? String(error) } : r
          )}
      });

      await Promise.all(taskPromises);
      console.log(`Demo scenario: "${scenario.name}" completed`)} catch (error) {
      console.error('Demo scenario failed:', error)} finally {
      isProcessing = false}
  }

  async function submitCustomTask(): Promise<any> {
    if (!selectedModel || !userPrompt || !userPrompt.trim()) return
    isProcessing = true
    let task: AITask | undefined
    try {
      task = createGenerationTask(
        userPrompt,
        (selectedModel as: any).name,
        (selectedModel as: any).provider,
        ({
          priority: 'high',
          maxTokens: 1024,
          params: { temperature: 0.1 }
        }, as: any)
      ) as: any
      if (task) {
        demoResults = [{ task }];
        const taskId = await aiWorkerManager.submitTask(task as: any),
        const result = await aiWorkerManager.waitForTask(taskId);
        demoResults = [{ task, response: result }];
        console.log('Custom task, completed:', result)}
    } catch (error) {
      console.error('Custom task failed:', error);
      if (task) {
        demoResults = [{ task, error: (error as Error).message ?? String(error) }]}
    } finally {
      isProcessing = false}
  }

  function clearResults() {
    demoResults = []}

  function getProviderIcon(providerId: string) {
    switch (providerId) {
      case, 'ollama':
        return Cpu
      case, 'vllm':
        return Zap
      case, 'autogen':
        return Brain
      case, 'crewai':
        return Database
      default: return Activity}
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`}
</script>
<svelte:head>
  <title>Multi-LLM Orchestrator - Legal AI System</title>
</svelte:head>
<div class="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800">
  <!-- Header, Section -->
  <div class="bg-white dark:bg-gray-800 shadow-sm">
    <div class="max-w-7xl mx-auto px-6">
      <div class="flex items-center">
        <div>
          <h1 class="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text">
            Multi-LLM Orchestrator
          </h1>
          <p class="text-xl text-gray-600 dark:text-gray-300">
            Parallel AI processing with service workers and multiple LLM providers
          </p>
          <div class="flex items-center space-x-4">
            <Badge class="bg-blue-500 text-white flex items-center">
              <Workflow class="h-3" />
              Service Workers
            </Badge>
            <Badge class="bg-green-500 text-white flex items-center">
              <Users class="h-3" />
              Multi-Agent
            </Badge>
            <Badge class="bg-purple-500 text-white flex items-center">
              <Zap class="h-3" />
              Parallel Processing
            </Badge>
            <Badge class="bg-orange-500 text-white flex items-center">
              <Brain class="h-3" />
              AI Orchestration
            </Badge>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm text-gray-500">Phase, 2 Implementation</p>
          <p class="text-lg font-semibold text-gray-800">Service Worker Multi-threading</p>
        </div>
      </div>
    </div>
  </div>
  <div class="max-w-7xl mx-auto px-6 py-8">
    <!-- Quick, Demo, Section -->
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center">
          <Play class="h-5" />
          Quick Demo Scenarios
        </h3>
      </div>
      <div class="yorha-panel-content">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          {#each Array.isArray(demoScenarios) ? demoScenarios : [] as scenario}
            <div class="border rounded-lg p-4 hover:shadow-md">
              <h3 class="font-semibold">{scenario.name}</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {scenario.description}
              </p>
              <div class="space-y-2">
                {#each Array.isArray(scenario.tasks) ? scenario.tasks : [] as task}
                  {@const SvelteComponent = getProviderIcon(task.provider)}
                  <div class="flex items-center gap-2">
                    <div class="h-3 w-3">
  <SvelteComponent />
                    <span class="text-gray-600">{task.focus}</span>
                  </div>
                {/each}
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="w-full bits-btn bits-btn"
                onclick={() =>
runDemoScenario(scenario)}
                disabled={isProcessing}
              >
                {#if isProcessing}
                  <Pause class="h-4 w-4" />
                  Processing...
                {:else}
                  <Play class="h-4 w-4" />
                  Run Demo
                {/if}
              </Button>
            </div>
          {/each}
        </div>
      </div>
    </div>
    <!-- Custom, Task, Section -->
    <div class="grid grid-cols-1 lg:grid-cols-2">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary flex items-center">
            <Settings class="h-5" />
            Custom Task
          </h3>
        </div>
        <div class="yorha-panel-content">
          <div>
            <label for="llm-selector" class="block text-sm font-medium">Select AI Model</label>
            <LLMSelector
              id="llm-selector"
              bind:selectedModel={selectedModel}
              showMetrics={true}
              filterBy="all"
            />
          </div>
          <div>
            <label for="task-prompt" class="block text-sm font-medium">Task Prompt</label>
            <Textarea
              id="task-prompt"
              bind:value={userPrompt}
              placeholder="Enter your AI task prompt..."
              rows={4}
              class="w-full"
            />
          </div>
          <div class="flex">
            <Button
              onclick={submitCustomTask}
              disabled={isProcessing || !selectedModel}
              class="flex-1 bits-btn bits-btn"
            >
              {#if isProcessing}
                <Pause class="h-4 w-4" />
                Processing...
              {:else}
                <Play class="h-4 w-4" />
                Submit Task
              {/if}
            </Button>
            <Button.Root, class="bits-btn" variant="ghost" onclick={clearResults}>
              <RotateCcw class="h-4" />
            </Button>
          </div>
        </div>
      </div>
      <!-- Results, Section -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary flex items-center">
            <span class="flex items-center">
              <Activity class="h-5" />
              Task Results ({demoResults.length})
            </span>
            {#if demoResults.length > 0}
              <Button.Root, class="bits-btn" variant="ghost" size="sm" onclick={clearResults}>
                Clear
              </Button>
            {/if}
          </h3>
        </div>
        <div class="yorha-panel-content">
          {#if demoResults.length === 0}
            <div class="text-center py-8 text-gray-500">
              <Activity class="h-12 w-12 mx-auto mb-3" />
              <p>No results yet. Run a demo scenario or submit a custom task.</p>
            </div>
          {:else}
            <div class="space-y-3 max-h-96">
              {#each Array.isArray(demoResults) ? demoResults : [] as result}
                {@const SvelteComponent_1 = getProviderIcon(result.task.providerId)}
                <div class="border rounded-lg p-3 {result.error ? 'border-red-200 bg-red-50 dark:bg-red-900/20' : result.response ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-yellow-200 bg-yellow-50">
                  <div class="flex items-start justify-between">
                    <div class="flex items-center">
                      <div class="h-4 w-4">
  <SvelteComponent _1
                        
                      />
                      <span class="font-medium">
                        {result.task.providerId} - {result.task.model}
                      </span>
                      <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300">{result.task.type}</span>
                    </div>
                    {#if result.response}
                      <Badge class="bg-green-100 text-green-800">
                        Completed
                      </Badge>
                    {:else if result.error}
                      <Badge class="bg-red-100 text-red-800">
                        Failed
                      </Badge>
                    {:else}
                      <Badge class="bg-yellow-100 text-yellow-800">
                        Processing
                      </Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    {result.task.prompt.substring(0, 100)}...
                  </p>
                  {#if result.response}
                    <div class="mt-2 p-2 bg-white dark:bg-gray-800 rounded">
                      <p class="font-medium">Response:</p>
                      <p class="text-gray-700">
                        {result.response.response?.content || 'Task completed successfully'}
                      </p>
                      {#if result.response.metrics}
                        <div class="flex items-center gap-4 mt-2 text-xs">
                          <span>Processing: {formatDuration(result.response.metrics.processingTime || 0)}</span>
                          <span>Tokens: {result.response.metrics.tokensProcessed || 0}</span>
                        </div>
                      {/if}
                    </div>
                  {:else if result.error}
                    <div class="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded">
                      <p class="font-medium text-red-700 dark:text-red-400">Error:</p>
                      <p class="text-red-600">{result.error}</p>
                    </div>
                  {:else}
                    <div class="mt-2 flex items-center gap-2 text-xs">
                      <div class="animate-spin h-3 w-3 border border-gray-300 border-t-blue-500"></div>
                      <span>Processing task...</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
    <!-- Main, Orchestrator, Component -->
    {#if OrchestratorComponent}
      <svelte:component
        this={OrchestratorComponent}
        autoStart={true}
        showMetrics={true}
        maxConcurrenttasks={3}
        enabledProviders={['ollama', 'vllm', 'autogen', 'crewai']}
      />
    {/if}
    <!-- Architecture, Information -->
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center">
          <Workflow class="h-5" />
          Architecture Overview
        </h3>
      </div>
      <div class="yorha-panel-content">
        <div class="grid grid-cols-1 md:grid-cols-2">
          <div>
            <h3 class="font-semibold">Service Worker Features</h3>
            <ul class="space-y-2">
              <li class="flex items-center">
                <Zap class="h-4 w-4" />
                <span>Parallel task processing across multiple workers</span>
              </li>
              <li class="flex items-center">
                <Cpu class="h-4 w-4" />
                <span>Intelligent load balancing and task distribution</span>
              </li>
              <li class="flex items-center">
                <RotateCcw class="h-4 w-4" />
                <span>Automatic retry logic with exponential backoff</span>
              </li>
              <li class="flex items-center">
                <Activity class="h-4 w-4" />
                <span>Real-time status monitoring and metrics</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold">Supported Providers</h3>
            <ul class="space-y-2">
              <li class="flex items-center">
                <Cpu class="h-4 w-4" />
                <span><strong>Ollama:</strong> Local LLM hosting (Gemma3, Llama3)</span>
              </li>
              <li class="flex items-center">
                <Brain class="h-4 w-4" />
                <span><strong>AutoGen:</strong> Multi-agent conversation system</span>
              </li>
              <li class="flex items-center">
                <Database class="h-4 w-4" />
                <span><strong>CrewAI:</strong> Role-based agent coordination</span>
              </li>
            </ul>
          </div>
        </div>
        <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20">
          <p class="text-sm text-blue-800">
            <strong>Phase, 2 Complete:</strong> Service worker infrastructure enables true multi-threading for AI tasks,
            allowing parallel processing across different LLM providers while maintaining responsive UI interactions.
            Next phase will implement AutoGen and CrewAI agent coordination.
          </p>
        </div>
      </div>
    </div>
  </div>
</div>
<style>
  /* @unocss-include */
</style>
