<!-- Legal ai orchestrator nintendo-Style UI with Memory Bank Visualization -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  // use relative imports to avoid IDE / tsserver resolution issues with $lib aliases
  import { legalAIOrchestrator } from '../../services/legal-ai-orchestrator';
  import Button from '../ui/Button.svelte';
  import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

  // Types
  type ServiceHealth = Record<string, boolean>;
  type MemoryBank = { used: number; total: number; status: string };
  type MemoryBanks = Record<string, MemoryBank>;
  type OrchestrationResult = {
    answer: string;
    model_used: string;
    cache_hit: boolean;
    memory_bank_used: string;
    response_time_ms: number;
    cost_saved: number;
  } | null;

  // Svelte 5 Runes
  let query = $state('');
  let isProcessing = $state(false);
  let result = $state<OrchestrationResult>(null);
  let serviceHealth = $state<ServiceHealth>({});
  let memoryBanks = $state<MemoryBanks>({
    L1_GPU_VRAM: { used: 0, total: 100, status: 'idle' },
    L2_SYSTEM_RAM: { used: 0, total: 100, status: 'idle' },
    L3_REDIS_CACHE: { used: 0, total: 100, status: 'idle' }
  });
  let queryHistory = $state([]);
  let selectedExample = $state('');

  const exampleQueries = [
    {
      category: 'Simple',
      queries: [
        'What is contract consideration?',
        'Define tort law',
        'What is the statute of limitations?'
      ]
    },
    {
      category: 'Complex Legal',
      queries: [
        'Analyze the enforceability of a non-compete clause in California',
        'What are the elements of negligence in medical malpractice cases?',
        'How does the UCC apply to contracts for the sale of goods?'
      ]
    },
    {
      category: 'Document Analysis',
      queries: [
        'Generate embeddings for contract similarity analysis',
        'Find cases similar to breach of fiduciary duty',
        'Semantic search for employment law precedents'
      ]
    }
  ];

  let healthInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    await checkServiceHealth();
    startHealthMonitoring();
  });

  async function checkServiceHealth() {
    try {
      serviceHealth = await legalAIOrchestrator.checkServiceHealth();
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  function startHealthMonitoring() {
    healthInterval = setInterval(async () => {
      await checkServiceHealth();
      updateMemoryBanks();
    }, 10000); // Check every 10 seconds
  }

  function updateMemoryBanks() {
    // Simulate Nintendo memory bank usage
    memoryBanks.L1_GPU_VRAM.used = Math.min(memoryBanks.L1_GPU_VRAM.used + Math.random() * 5, 85);
    memoryBanks.L2_SYSTEM_RAM.used = Math.min(memoryBanks.L2_SYSTEM_RAM.used + Math.random() * 3, 70);
    memoryBanks.L3_REDIS_CACHE.used = Math.min(memoryBanks.L3_REDIS_CACHE.used + Math.random() * 2, 90);
  }

  async function processQuery() {
    if (!query.trim()) return;

    isProcessing = true;
    result = null;

    try {
      const orchestrationResult = await legalAIOrchestrator.processQuery(query);
      result = orchestrationResult;

      // Add to history
      queryHistory = [{
        query,
        result: orchestrationResult,
        timestamp: new Date().toLocaleTimeString()
      }, ...queryHistory.slice(0, 9)]; // Keep last 10

    } catch (error) {
      result = {
        answer: `Error: ${error.message}`,
        model_used: 'error',
        cache_hit: false,
        memory_bank_used: 'none',
        response_time_ms: 0,
        cost_saved: 0
      };
    } finally {
      isProcessing = false;
    }
  }

  function useExampleQuery(exampleQuery: string) {
    query = exampleQuery;
    selectedExample = exampleQuery;
  }

  function clearQuery() {
    query = '';
    result = null;
    selectedExample = '';
  }

  function getServiceStatusIcon(serviceName: string): string {
    return serviceHealth[serviceName] ? '🟢' : '🔴';
  }

  function getMemoryBankColor(usage: number): string {
    if (usage < 30) return 'bg-green-500';
    if (usage < 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function getModelDisplayName(modelUsed: string) {
    const modelMap = {
      'gemma-3-270m': '🚀 Fast Router (270M)',
      'gemma-3-legal-2b': '⚖️ Legal Expert (2B)',
      'embeddinggemma': '🔍 Embedding Service',
      'cache_hit': '💾 Cache Hit',
      'L2_cache': '🎮 L2 Cache',
      'error_fallback': '❌ Error'
    };
    return modelMap[modelUsed] || modelUsed;
  }

  onDestroy(() => {
    if (healthInterval) {
      clearInterval(healthInterval);
      healthInterval = null;
    }
  });
</script>

<div class="legal-ai-orchestrator p-6 max-w-6xl mx-auto">
  <!-- Header -->
  <div class="mb-8 text-center">
    <h1 class="text-3xl font-bold mb-2 text-gray-900">🎮 Legal AI Orchestrator</h1>
    <p class="text-gray-600">Nintendo-Style Multi-Model AI System</p>
  </div>

  <!-- Service Health Dashboard -->
  <Card class="mb-6">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        🏥 Service Health Monitor
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        {#each Object.entries(serviceHealth) as [service, healthy]}
          <div class="flex items-center gap-2 p-2 rounded bg-gray-50">
            <span class="text-lg">{getServiceStatusIcon(service)}</span>
            <span class="text-sm font-medium">
              {service.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          </div>
        {/each}
      </div>

      <!-- Nintendo Memory Banks -->
      <div class="nintendo-memory-banks">
        <h4 class="font-semibold mb-3 text-gray-800">🎮 Nintendo Memory Banks</h4>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          {#each Object.entries(memoryBanks) as [bankName, bank]}
            <div class="memory-bank p-3 border rounded-lg bg-gray-50">
              <div class="flex justify-between items-center mb-2">
                <span class="font-medium text-sm">{bankName.replace(/_/g, ' ')}</span>
                <span class="text-xs text-gray-600">{bank.used.toFixed(1)}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  class="h-2 rounded-full transition-all duration-500 {getMemoryBankColor(bank.used)}"
                  style="width: {bank.used}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </CardContent>
  </Card>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Query Interface -->
    <Card>
      <CardHeader>
        <CardTitle>💬 Query Interface</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Example Queries -->
        <div class="example-queries mb-4">
          <h4 class="font-semibold mb-2">Example Queries:</h4>
          {#each exampleQueries as category}
            <div class="mb-3">
              <span class="text-sm font-medium text-gray-700">{category.category}:</span>
              <div class="flex flex-wrap gap-2 mt-1">
                {#each category.queries as example}
                  <button
                    class="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded transition-colors
                           {selectedExample === example ? 'bg-blue-300' : ''}"
                    onclick={() => useExampleQuery(example)}
                  >
                    {example}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>

        <!-- Query Input -->
        <div class="query-input">
          <textarea
            bind:value={query}
            placeholder="Enter your legal question or request..."
            class="w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows="4"
            disabled={isProcessing}
          ></textarea>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-2">
          <Button
            onclick={processQuery}
            disabled={isProcessing || !query.trim()}
            class="flex-1"
          >
            {isProcessing ? '🔄 Processing...' : '🚀 Process Query'}
          </Button>
          <Button
            onclick={clearQuery}
            variant="outline"
            disabled={isProcessing}
          >
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Results Display -->
    <Card>
      <CardHeader>
        <CardTitle>📋 Query Results</CardTitle>
      </CardHeader>
      <CardContent>
        {#if isProcessing}
          <div class="processing-indicator text-center py-8">
            <div class="animate-spin text-4xl mb-4">🎮</div>
            <p class="text-gray-600">Nintendo AI Banks processing...</p>
          </div>
        {:else if result}
          <div class="result-display space-y-4">
            <!-- Answer -->
            <div class="answer p-4 bg-gray-50 rounded-lg">
              <h4 class="font-semibold mb-2">Answer:</h4>
              <p class="text-gray-800 whitespace-pre-wrap">{result.answer}</p>
            </div>

            <!-- Metadata -->
            <div class="metadata grid grid-cols-2 gap-4 text-sm">
              <div class="model-used">
                <span class="font-medium">Model:</span>
                <span class="ml-2">{getModelDisplayName(result.model_used)}</span>
              </div>
              <div class="response-time">
                <span class="font-medium">Response Time:</span>
                <span class="ml-2">{result.response_time_ms}ms</span>
              </div>
              <div class="memory-bank">
                <span class="font-medium">Memory Bank:</span>
                <span class="ml-2">🎮 {result.memory_bank_used}</span>
              </div>
              <div class="cache-status">
                <span class="font-medium">Cache:</span>
                <span class="ml-2">
                  {result.cache_hit ? '🟢 Hit' : '🔴 Miss'}
                  {result.cost_saved > 0 ? `(Saved $${result.cost_saved.toFixed(3)})` : ''}
                </span>
              </div>
            </div>
          </div>
        {:else}
          <div class="no-results text-center py-8 text-gray-500">
            <div class="text-4xl mb-4">🎮</div>
            <p>Select an example or enter your query to begin</p>
          </div>
        {/if}
      </CardContent>
    </Card>
  </div>

  <!-- Query History -->
  {#if queryHistory.length > 0}
    <Card class="mt-6">
      <CardHeader>
        <CardTitle>📚 Query History</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="history-list space-y-2 max-h-64 overflow-y-auto">
          {#each queryHistory as item, index}
            <div class="history-item p-3 bg-gray-50 rounded border-l-4 border-blue-500">
              <div class="flex justify-between items-start mb-2">
                <span class="font-medium text-sm">Query {queryHistory.length - index}:</span>
                <span class="text-xs text-gray-500">{item.timestamp}</span>
              </div>
              <p class="text-sm text-gray-700 mb-2 truncate">{item.query}</p>
              <div class="flex gap-4 text-xs text-gray-600">
                <span>{getModelDisplayName(item.result.model_used)}</span>
                <span>{item.result.response_time_ms}ms</span>
                <span>{item.result.cache_hit ? '💾 Cached' : '🚀 Fresh'}</span>
              </div>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {/if}
</div>

<style>
  .legal-ai-orchestrator {
    font-family: 'Inter', system-ui, sans-serif;
  }

  .nintendo-memory-banks {
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border-radius: 8px;
    padding: 16px;
    border: 2px solid #dee2e6;
  }

  .memory-bank {
    transition: all 0.3s ease;
  }

  .memory-bank:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .processing-indicator {
    background: linear-gradient(135deg, #f8f9fa 0%, #e3f2fd 100%);
    border-radius: 12px;
    border: 2px dashed #90caf9;
  }

  .example-queries button:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .history-item:hover {
    background-color: #f1f5f9;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .animate-spin {
    animation: spin 2s linear infinite;
  }
</style>


