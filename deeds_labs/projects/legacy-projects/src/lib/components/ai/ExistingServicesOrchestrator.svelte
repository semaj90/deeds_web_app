<!-- Legal AI Orchestrator - Using Existing Ollama Models -->
<!-- Nintendo-Style UI with Memory Bank Visualization -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';

  // Svelte 5 Runes
  let query = $state('');
  let isProcessing = $state(false);
  let result = $state(null);
  let serviceHealth = $state({});
  let memoryBanks = $state({
    L1_GEMMA3_LEGAL: { used: 0, total: 100, status: 'idle' },
    L1_EMBEDDINGGEMMA: { used: 0, total: 100, status: 'idle' },
    L3_EXISTING_REDIS: { used: 0, total: 100, status: 'idle' }
  });
  let queryHistory = $state([]);
  let selectedExample = $state('');

  const exampleQueries = [
    {
      category: 'Legal Analysis (gemma3-legal)',
      queries: [
        'What are the elements of a valid contract?',
        'Analyze liability in medical malpractice cases',
        'Explain the doctrine of consideration in contract law'
      ]
    },
    {
      category: 'Embedding Generation (embeddinggemma)',
      queries: [
        'Generate embedding for contract similarity analysis',
        'Create semantic vector for this legal document',
        'Find similar cases using embedding search'
      ]
    },
    {
      category: 'General Queries (gemma3-legal)',
      queries: [
        'What is artificial intelligence?',
        'Explain machine learning basics',
        'How does natural language processing work?'
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
      const response = await fetch('/api/orchestrator/existing');
      if (response.ok) {
        const healthData = await response.json();
        serviceHealth = healthData.existing_infrastructure || {};
      }
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
    // Simulate Nintendo memory bank usage for existing services
    memoryBanks.L1_GEMMA3_LEGAL.used = Math.min(memoryBanks.L1_GEMMA3_LEGAL.used + Math.random() * 3, 75);
    memoryBanks.L1_EMBEDDINGGEMMA.used = Math.min(memoryBanks.L1_EMBEDDINGGEMMA.used + Math.random() * 2, 45);
    memoryBanks.L3_EXISTING_REDIS.used = Math.min(memoryBanks.L3_EXISTING_REDIS.used + Math.random() * 1, 60);
  }

  async function processQuery() {
    if (!query.trim()) return;
    
    isProcessing = true;
    result = null;
    
    try {
      const response = await fetch('/api/orchestrator/existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (response.ok) {
        result = await response.json();
        
        // Add to history
        queryHistory = [{
          query,
          result,
          timestamp: new Date().toLocaleTimeString()
        }, ...queryHistory.slice(0, 9)]; // Keep last 10
      } else {
        const errorData = await response.json();
        result = {
          answer: `Error: ${errorData.error}`,
          model_used: 'error',
          cache_hit: false,
          memory_bank_used: 'none',
          response_time_ms: 0,
          cost_saved: 0
        };
      }
    } catch (error) {
      result = {
        answer: `Network Error: ${error.message}`,
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

  function useExampleQuery(exampleQuery) {
    query = exampleQuery;
    selectedExample = exampleQuery;
  }

  function clearQuery() {
    query = '';
    result = null;
    selectedExample = '';
  }

  function getServiceStatusIcon(serviceName) {
    return serviceHealth[serviceName] ? '🟢' : '🔴';
  }

  function getMemoryBankColor(usage) {
    if (usage < 30) return 'bg-green-500';
    if (usage < 70) return 'bg-yellow-500'; 
    return 'bg-red-500';
  }

  function getModelDisplayName(modelUsed) {
    const modelMap = {
      'gemma3-legal:latest': '⚖️ Gemma3 Legal (11.8B)',
      'embeddinggemma:latest': '🔍 EmbeddingGemma (307M)',
      'nomic-embed-text:latest': '📄 Nomic Embed (137M)',
      'cache_hit': '💾 Cache Hit',
      'error': '❌ Error'
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

<div class="existing-orchestrator p-6 max-w-6xl mx-auto">
  <!-- Header -->
  <div class="mb-8 text-center">
    <h1 class="text-3xl font-bold mb-2 text-gray-900">🎮 Legal AI Orchestrator</h1>
    <p class="text-gray-600 mb-2">Using Your Existing Ollama Models</p>
    <div class="text-sm text-blue-600 bg-blue-50 px-4 py-2 rounded-lg inline-block">
      ✅ No Downloads Required • Using: gemma3-legal, embeddinggemma, nomic-embed-text
    </div>
  </div>

  <!-- Service Health Dashboard -->
  <Card class="mb-6">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        🏥 Existing Services Status
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div class="flex items-center gap-2 p-3 rounded bg-gray-50">
          <span class="text-lg">{getServiceStatusIcon('redis')}</span>
          <span class="text-sm font-medium">Redis Cache (Port 6379)</span>
        </div>
        <div class="flex items-center gap-2 p-3 rounded bg-gray-50">
          <span class="text-lg">{getServiceStatusIcon('postgres')}</span>
          <span class="text-sm font-medium">PostgreSQL (Port 5433)</span>
        </div>
        <div class="flex items-center gap-2 p-3 rounded bg-gray-50">
          <span class="text-lg">{getServiceStatusIcon('ollama')}</span>
          <span class="text-sm font-medium">Ollama (Port 11434)</span>
        </div>
      </div>
      
      <!-- Nintendo Memory Banks -->
      <div class="nintendo-memory-banks">
        <h4 class="font-semibold mb-3 text-gray-800">🎮 Nintendo Memory Banks (Existing Services)</h4>
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
        <!-- Available Models Info -->
        <div class="models-info p-3 bg-green-50 border border-green-200 rounded-lg">
          <h4 class="font-semibold text-green-800 mb-2">🚀 Available Models:</h4>
          <div class="text-sm text-green-700 space-y-1">
            <div>⚖️ <strong>gemma3-legal:latest</strong> (11.8B) - Legal analysis & general queries</div>
            <div>🔍 <strong>embeddinggemma:latest</strong> (307M) - Semantic embeddings</div>
            <div>📄 <strong>nomic-embed-text:latest</strong> (137M) - Alternative embeddings</div>
          </div>
        </div>

        <!-- Example Queries -->
        <div class="example-queries">
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
            placeholder="Enter your query to test the existing models..."
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
            {isProcessing ? '🔄 Processing...' : '🚀 Process with Existing Models'}
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
            <p class="text-gray-600">Processing with existing Ollama models...</p>
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
              <div class="classification">
                <span class="font-medium">Query Type:</span>
                <span class="ml-2">{result.classification?.type || 'unknown'}</span>
              </div>
            </div>

            {#if result.nintendo_diagnostics}
              <div class="nintendo-diagnostics p-3 bg-purple-50 border border-purple-200 rounded">
                <h5 class="font-semibold text-purple-800 mb-2">🎮 Nintendo Diagnostics:</h5>
                <div class="text-sm text-purple-700 space-y-1">
                  <div>Bank Switches: {result.nintendo_diagnostics.bank_switches}</div>
                  <div>Memory Pressure: {result.nintendo_diagnostics.memory_pressure}</div>
                  <div>Cache Efficiency: {result.nintendo_diagnostics.cache_efficiency}%</div>
                  {#if result.nintendo_diagnostics.available_models}
                    <div>Available Models: {result.nintendo_diagnostics.available_models.length}</div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {:else}
          <div class="no-results text-center py-8 text-gray-500">
            <div class="text-4xl mb-4">🎮</div>
            <p>Select an example or enter your query to test existing models</p>
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
  .existing-orchestrator {
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

  .models-info {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.95; }
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


