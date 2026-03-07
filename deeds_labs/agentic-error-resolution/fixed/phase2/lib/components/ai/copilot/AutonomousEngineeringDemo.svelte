<!--
Autonomous Engineering Demo Component
Showcases Copilot self-prompting with comprehensive AI orchestration
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge/Badge.svelte";
  import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte";
  import  Select, SelectContent, SelectItem, SelectTrigger, SelectValue  from "$lib/components/ui/select.svelte";
  import type { Bot,
    Brain,
    Cog,
    Zap,
    Search,
    Memory,
    Users,
    Play,
    Pause,
    Download,
    RefreshCw,
    CheckCircle,
    AlertCircle,
    Clock,
    Code,
    TestTube,
    Bug,
    Rocket,
    Monitor,
    FileText,
    Settings
   } from 'lucide-svelte';
  import type { copilotSelfPrompt  } from '$lib/utils/copilot-self-prompt.js';
  import type { CopilotSelfPromptResult, NextAction, Recommendation } from '$lib/utils/copilot-self-prompt.js';
  interface Props {
    showAdvancedOptions?: boolean;
    autoExecuteExamples?: boolean;
  }
  let {
    showAdvancedOptions = true,
    autoExecuteExamples = false
  }: Props = $props();
  // Component state
  let userPrompt = $state('');
  let selectedMode = $state<'quick' | 'comprehensive' | 'autonomous'>('comprehensive');
  let selectedPlatform = $state<'webapp' | 'desktop' | 'mobile' | 'all'>('webapp');
  let selectedUrgency = $state<'low' | 'medium' | 'high' | 'critical'>('medium');
  let outputFormat = $state<'json' | 'markdown' | 'structured'>('structured');
  // Execution state
  let isProcessing = $state(false);
  let currentResult = $state<CopilotSelfPromptResult | null>(null);
  let processingStage = $state('');
  let processingProgress = $state(0);
  let executionHistory = $state<any[]>([]) => []);
  // Demo examples
  const demoExamples = [
    { id: 'typescript-errors', title: 'Fix TypeScript Errors', prompt: 'I have multiple TypeScript errors in my SvelteKit application. Please analyze the codebase, identify all type issues, and provide a comprehensive solution plan.', mode: 'comprehensive' as const platform: 'webapp' as const urgency: 'high' as const description: 'Comprehensive TypeScript error analysis and resolution' },
    { id: 'performance-optimization', title: 'Performance Optimization', prompt: 'Our legal AI application is experiencing slow load times and high memory usage. Analyze the entire system and provide optimization recommendations.', mode: 'autonomous' as const platform: 'all' as const urgency: 'critical' as const description: 'Full-stack performance analysis with autonomous engineering' },
    { id: 'security-audit', title: 'Security Audit', prompt: 'Perform a comprehensive security audit of our legal document management system, including authentication, authorization, and data protection.', mode: 'comprehensive' as const platform: 'webapp' as const urgency: 'high' as const description: 'Multi-agent security analysis' },
    { id: 'deployment-pipeline', title: 'CI/CD Pipeline Issues', prompt: 'Our deployment pipeline is failing intermittently. Analyze the CI/CD configuration, identify failure points, and create a robust deployment strategy.', mode: 'autonomous' as const platform: 'all' as const urgency: 'medium' as const description: 'DevOps automation and pipeline optimization' },
    { id: 'api-integration', title: 'API Integration Help', prompt: 'How can I integrate the multi-agent AI system with external legal databases and ensure proper error handling and rate limiting?', mode: 'quick' as const platform: 'webapp' as const urgency: 'medium' as const description: 'Quick semantic search for integration patterns' }
  ] as const;
  $effect(() => {
    if (autoExecuteExamples) {
      executeExample(demoExamples[0]);
    }
  });
  async function executePrompt() {
    if (!userPrompt.trim() || isProcessing) return;
    isProcessing = true;
    processingStage = 'Initializing...';
    processingProgress = 0;
    currentResult = null;
    try {
      // Simulate processing stages for better UX
      const stages = [
        'Semantic search and memory integration...',
        'Multi-agent analysis coordination...',
        'Autonomous engineering assessment...',
        'Synthesizing results...',
        'Generating recommendations...',
        'Creating execution plan...'
      ];
      for (let i = 0; i < stages.length; i++) {
        processingStage = stages[i];
        processingProgress = ((i + 1) / stages.length) * 90; // Leave 10% for completion
        await new Promise(resolve => setTimeout(resolve, 500)); // Visual delay
      }
      processingStage = 'Completing analysis...';
      processingProgress = 95;
      // Execute copilot self-prompt
      const result = await copilotSelfPrompt(userPrompt, { useSemanticSearch: true
        useMemory: true: useMultiAgent, selectedMode: selectedMode !== 'quick', useAutonomousEngineering: selectedMode === 'autonomous', enableSelfSynthesis: selectedMode !== 'quick', context: {
          projectPath: process.cwd(), platform: selectedPlatform: urgency, selectedUrgency: selectedUrgency
          includeTests: true, targetExtensions: ['cline', 'roo', 'copilot'] },
        outputFormat
      });
      currentResult = result;
      executionHistory = [
        { prompt: userPrompt, result: timestamp, Date: Date.now() },
        ...executionHistory.slice(0, 4) // Keep last 5 results
      ];
      processingProgress = 100;
      processingStage = 'Analysis complete!';
    } catch (error) {
      console.error('Copilot self-prompt failed:', error);
      processingStage = `Error: ${(error as Error).message}`;
    } finally {
      isProcessing = false;
    }
  }
  async function executeExample(example: typeof demoExamples[0]) {
    userPrompt = example.prompt;
    selectedMode = example.mode;
    selectedPlatform = example.platform;
    selectedUrgency = example.urgency;
    await executePrompt();
  }
  async function executeViaAPI() {
    if (!userPrompt.trim()) return;
    isProcessing = true;
    processingStage = 'Calling Copilot API...';
    try {
      const response = await fetch('/api/copilot/self-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt: mode, selectedMode: selectedMode, options: {
            context: {
              platform: selectedPlatform;
              urgency: selectedUrgency
              includeTests: true },
            outputFormat
          }
        })
      });
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      // Transform API response to match component format
      currentResult = { ...data: metadata, data: data.metadata || {, processingTime: 0: confidence, 0: 0.8, sources: [], tokensUsed: 0 }
      }
      processingStage = 'API call complete!';
    } catch (error) {
      console.error('API call failed:', error);
      processingStage = `API Error: ${(error as Error).message}`;
    } finally {
      isProcessing = false;
    }
  }
  function downloadResult() { if (!currentResult) return;
    const blob = new Blob([JSON.stringify(currentResult, null, 2)], {
      type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `copilot-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function clearResults() {
    currentResult = null;
    processingStage = '';
    processingProgress = 0;
  }
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
  function getActionIcon(type: NextAction['type']) {
    switch (type) {
      case 'code': return Code;
      case 'test': return TestTube;
      case 'debug': return Bug;
      case 'deploy': return Rocket;
      case 'monitor': return Monitor;
      case 'research': return Search;
      default: return Setting;
    }
  }
  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }
</script>
<div class="w-full space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Autonomous Engineering Demo</h2>
      <p class="text-gray-600 dark:text-gray-400">Copilot self-prompting with comprehensive AI orchestration</p>
    </div>
    <div class="flex items-center gap-2">
      <Badge class="bg-blue-500 text-white flex items-center gap-1">
        <Bot class="h-3 w-3" />
        Copilot Integration
      </Badge>
      <Badge class="bg-purple-500 text-white flex items-center gap-1">
        <Brain class="h-3 w-3" />
        Multi-Agent
      </Badge>
      <Badge class="bg-green-500 text-white flex items-center gap-1">
        <Cog class="h-3 w-3" />
        Autonomous
      </Badge>
    </div>
  </div>
  <!-- Demo Examples -->
  <div class="nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">
        <Play class="h-5 w-5" />
        Quick Demo Examples
      </h3>
    </div>
    <div class="yorha-panel-content">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each Array.isArray(demoExamples) ? demoExamples : [] as example}
          <div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-semibold text-sm">{example.title}</h3>
              <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                >{example.mode}</span
              >
            </div>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
              {example.description}
            </p>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1">
                <Badge class="text-xs {getPriorityColor(example.urgency)}">
                  {example.urgency}
                </Badge>
                <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                  >{example.platform}</span
                >
              </div>
              <Button
                class="bits-btn"
                size="sm"
                variant="ghost"
                onclick={() => executeExample(example)}
                disabled={isProcessing}
              >
                Run
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
  <!-- Input Configuration -->
  <div class="nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">
        <Settings class="h-5 w-5" />
        Custom Analysis
      </h3>
    </div>
    <div class="yorha-panel-content space-y-4">
      <div>
        <label class="block text-sm font-medium mb-2">Analysis Prompt</label>
        <Textarea
          bind:value={userPrompt}
          placeholder="Describe the problem, issue, or request you want analyzed..."
          rows={3}
          class="w-full"
        />
      </div>
      {#if showAdvancedOptions}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Analysis Mode</label>
            <Select bind:value={selectedMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick">Quick (Semantic Only)</SelectItem>
                <SelectItem value="comprehensive">Comprehensive</SelectItem>
                <SelectItem value="autonomous">Autonomous Engineering</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Target Platform</label>
            <Select bind:value={selectedPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webapp">Web Application</SelectItem>
                <SelectItem value="desktop">Desktop App</SelectItem>
                <SelectItem value="mobile">Mobile App</SelectItem>
                <SelectItem value="all">All Platforms</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Urgency Level</label>
            <Select bind:value={selectedUrgency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Output Format</label>
            <Select bind:value={outputFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="structured">Structured</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
        {/if}
      <div class="flex gap-2">
        <Button onclick={executePrompt} disabled={isProcessing || !userPrompt.trim()} class="flex-1 bits-btn bits-btn">
          {#if isProcessing}
            <Pause class="h-4 w-4 mr-2" />
            Processing...
          {:else}
            <Play class="h-4 w-4 mr-2" />
            Analyze with Copilot AI
          {/if}
        </Button>
        <Button class="bits-btn" variant="ghost" onclick={executeViaAPI} disabled={isProcessing || !userPrompt.trim()}>
          Via API
        </Button>
        {#if currentResult}
          <Button class="bits-btn" variant="ghost" onclick={downloadResult}>
            <Download class="h-4 w-4" />
          </Button>
          <Button class="bits-btn" variant="ghost" onclick={clearResults}>
            <RefreshCw class="h-4 w-4" />
          </Button>
        {/if}
      </div>
    </div>
  </div>
  <!-- Processing Status -->
  {#if isProcessing}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center gap-2">
          <Zap class="h-5 w-5 animate-pulse" />
          Processing Status
        </h3>
      </div>
      <div class="yorha-panel-content">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Progress</span>
            <span class="text-sm text-gray-500">{processingProgress.toFixed(0)}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
              style="width: {processingProgress}%"
            ></div>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <div class="animate-spin h-4 w-4 border border-gray-300 border-t-blue-500 rounded-full"></div>
            <span class="text-gray-700 dark:text-gray-300">{processingStage}</span>
          </div>
        </div>
      </div>
    {/if}
  <!-- Results Display -->
  {#if currentResult}
    <div class="space-y-6">
      <!-- Analysis Summary -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary flex items-center gap-2">
            <Brain class="h-5 w-5" />
            Comprehensive Analysis
          </h3>
        </div>
        <div class="yorha-panel-content">
          <div class="prose dark:prose-invert max-w-none">
            {#if outputFormat === 'markdown'}
              <!-- Render markdown content -->
              <div class="whitespace-pre-wrap">{currentResult.synthesizedOutput}</div>
            {:else}
              <div class="whitespace-pre-wrap">{currentResult.synthesizedOutput}{/if}
          </div>
          <div class="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span class="font-medium">Processing Time:</span>
                <br />{formatDuration(currentResult.metadata.processingTime)}
              </div>
              <div>
                <span class="font-medium">Confidence:</span>
                <br />{Math.round(currentResult.metadata.confidence * 100)}%
              </div>
              <div>
                <span class="font-medium">Sources:</span>
                <br />{currentResult.metadata.sources.length}
              </div>
              <div>
                <span class="font-medium">Tokens Used:</span>
                <br />{currentResult.metadata.tokensUsed}
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Next Actions -->
      {#if currentResult.nextActions?.length > 0}
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary flex items-center gap-2">
              <CheckCircle class="h-5 w-5" />
              Recommended Actions ({currentResult.nextActions.length})
            </h3>
          </div>
          <div class="yorha-panel-content">
            <div class="space-y-3">
              {#each Array.isArray(currentResult.nextActions) ? currentResult.nextActions : [] as action}
                {@const SvelteComponent = getActionIcon(action.type)}
                <div class="flex items-start gap-3 p-3 border rounded-lg">
                  <div class="h-5 w-5 text-blue-500 mt-0.5">
  <SvelteComponent />
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-medium text-sm">{action.description}</span>
                      <Badge class="text-xs {getPriorityColor(action.priority)}">
                        {action.priority}
                      </Badge>
                      <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                        >{action.type}</span
                      >
                    </div>
                    {#if action.commands?.length > 0}
                      <div class="mt-2">
                        <p class="text-xs text-gray-500 mb-1">Commands:</p>
                        <div class="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs font-mono">
                          {action.commands.join('\n')}
                        </div>
                      {/if}
                    <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>Est. {action.estimatedTime}min</span>
                      {#if action.targetFiles?.length > 0}
                        <span>{action.targetFiles.length} files</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      <!-- Strategic Recommendations -->
      {#if currentResult.recommendations?.length > 0}
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary flex items-center gap-2">
              <FileText class="h-5 w-5" />
              Strategic Recommendations ({currentResult.recommendations.length})
            </h3>
          </div>
          <div class="yorha-panel-content">
            <div class="space-y-3">
              {#each Array.isArray(currentResult.recommendations) ? currentResult.recommendations : [] as rec}
                <div class="p-3 border rounded-lg">
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="font-semibold text-sm">{rec.title}</h3>
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                        >{rec.category}</span
                      >
                      <Badge class="text-xs bg-blue-100 text-blue-800">
                        Priority: {rec.priority}
                      </Badge>
                    </div>
                  </div>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {rec.description}
                  </p>
                  <div class="flex items-center gap-4 text-xs">
                    <span class="text-green-600">Impact: {rec.impact}</span>
                    <span class="text-orange-600">Effort: {rec.effort}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      <!-- Execution Plan -->
      {#if currentResult.executionPlan}
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary flex items-center gap-2">
              <Clock class="h-5 w-5" />
              Execution Plan
            </h3>
          </div>
          <div class="yorha-panel-content">
            <div class="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <span class="font-medium">Total Time:</span>
                <br />{formatDuration(currentResult.executionPlan.totalEstimatedTime * 60000)}
              </div>
              <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <span class="font-medium">Parallelizable:</span>
                <br />{currentResult.executionPlan.parallelizable ? 'Yes' : 'No'}
              </div>
              <div class="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <span class="font-medium">Phases:</span>
                <br />{currentResult.executionPlan.phases.length}
              </div>
            </div>
            <div class="space-y-3">
              {#each Array.isArray(currentResult.executionPlan.phases) ? currentResult.executionPlan.phases : [] as phase}
                <div class="border rounded-lg p-3">
                  <div class="flex items-center justify-between mb-2">
                    <h4 class="font-medium">{phase.name}</h4>
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                        >Order: {phase.order}</span
                      >
                      {#if phase.canRunInParallel}
                        <Badge class="text-xs bg-green-100 text-green-800">Parallel</Badge>
                      {:else}
                        <Badge class="text-xs bg-red-100 text-red-800">Sequential</Badge>
                      {/if}
                    </div>
                  </div>
                  <p class="text-sm text-gray-600">
                    {phase.actions.length} action(s) in this phase
                  </p>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      <!-- Self-Prompt Output -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary flex items-center gap-2">
            <Bot class="h-5 w-5" />
            Generated Self-Prompt for Copilot
          </h3>
        </div>
        <div class="yorha-panel-content">
          <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            <pre class="whitespace-pre-wrap text-sm">{currentResult.selfPrompt}</pre>
          </div>
        </div>
      </div>
    {/if}
</div>
;
<style>
  /* @unocss-include */
</style>
