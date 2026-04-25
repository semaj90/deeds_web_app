<!--
  Hybrid Legal AI Chat Component
  Uses client-side WebAssembly for fast responses + server TensorRT for complex analysis
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { clientAI } from '$lib/ai/client-wasm-llama';
  import Button from '$lib/components/ui/Button.svelte';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';

  // State management - Svelte 5 runes
  let query = $state('');
  let response = $state('');
  let loading = $state(false);
  let modelStatus = $state(clientAI.getModelStatus());
  let lastResponse = $state<any>(null);

  // Chat history - Svelte 5 runes
  let chatHistory = $state<Array<{
    query: string;
    response: string;
    source: 'client' | 'server';
    reasoning: string;
    timestamp: Date;
    metadata: any;
  }>>([]);

  // Performance metrics - Svelte 5 runes
  let performanceMetrics = $state({
    clientResponses: 0,
    serverResponses: 0,
    avgClientTime: 0,
    avgServerTime: 0,
    totalQueries: 0
  });

  onMount(() => {
    // Update model status periodically
    const interval = setInterval(() => {
      modelStatus = clientAI.getModelStatus();
    }, 2000);

    return () => clearInterval(interval);
  });

  /**
   * Handle chat submission with hybrid AI
   */
  async function handleSubmit() {
    if (!query.trim() || loading) return;

    loading = true;
    const startTime = Date.now();
    const currentQuery = query;
    query = '';

    try {
      // Use hybrid AI with automatic context switching
      const result = await clientAI.generateResponse(currentQuery, {
        temperature: 0.2,
        maxTokens: 1024,
        stream: false
      });

      const duration = Date.now() - startTime;

      // Add to chat history
      chatHistory = [...chatHistory, {
        query: currentQuery,
        response: result.response,
        source: result.source,
        reasoning: result.reasoning,
        timestamp: new Date(),
        metadata: result.metadata
      }];

      // Update performance metrics
      performanceMetrics.totalQueries++;
      if (result.source === 'client') {
        performanceMetrics.clientResponses++;
        performanceMetrics.avgClientTime =
          (performanceMetrics.avgClientTime * (performanceMetrics.clientResponses - 1) + duration) /
          performanceMetrics.clientResponses;
      } else {
        performanceMetrics.serverResponses++;
        performanceMetrics.avgServerTime =
          (performanceMetrics.avgServerTime * (performanceMetrics.serverResponses - 1) + duration) /
          performanceMetrics.serverResponses;
      }

      lastResponse = result;

    } catch (error) {
      console.error('Chat error:', error);

      // Add error to chat history
      chatHistory = [...chatHistory, {
        query: currentQuery,
        response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        source: 'server',
        reasoning: 'Error occurred',
        timestamp: new Date(),
        metadata: { error: true }
      }];
    } finally {
      loading = false;
    }
  }

  /**
   * Clear chat history
   */
  function clearChat() {
    chatHistory = [];
    lastResponse = null;
  }

  /**
   * Get status color based on model status
   */
  function getStatusColor(status: any): string {
    if (status.loaded) return 'text-green-600';
    if (status.loading) return 'text-yellow-600';
    if (status.error) return 'text-red-600';
    return 'text-gray-600';
  }

  /**
   * Format file size
   */
  function formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * Handle keyboard shortcuts
   */
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      handleSubmit();
    }
  }
</script>

<div class="hybrid-legal-chat">
  <!-- Model Status Header -->
  <Card class="mb-4">
    <CardHeader class="pb-2">
      <CardTitle class="text-sm font-medium">🤖 Hybrid AI Status</CardTitle>
    </CardHeader>
    <CardContent class="pt-0">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <!-- Client Model Status -->
        <div>
          <div class="font-medium mb-1">Client-side (WebAssembly)</div>
          <div class={getStatusColor(modelStatus)}>
            {#if modelStatus.loaded}
              ✅ gemma3:270m ({formatBytes(modelStatus.modelSize)})
            {:else if modelStatus.loading}
              ⏳ Loading model...
            {:else if modelStatus.error}
              ❌ Error: {modelStatus.error}
            {:else}
              ⚪ Not loaded
            {/if}
          </div>
        </div>

        <!-- Server Status -->
        <div>
          <div class="font-medium mb-1">Server-side (TensorRT)</div>
          <div class="text-blue-600">
            ⚡ gemma3-legal:latest (GPU)
          </div>
        </div>
      </div>

      <!-- Performance Metrics -->
      <div class="mt-3 pt-3 border-t text-xs text-gray-600">
        <div class="grid grid-cols-4 gap-2">
          <div>Total: {performanceMetrics.totalQueries}</div>
          <div>Client: {performanceMetrics.clientResponses}</div>
          <div>Server: {performanceMetrics.serverResponses}</div>
          <div>
            Avg: {performanceMetrics.avgClientTime > 0 ?
              `${performanceMetrics.avgClientTime.toFixed(0)}ms` : '--'}
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Chat Interface -->
  <Card>
    <CardHeader>
      <div class="flex justify-between items-center">
        <CardTitle>Legal AI Assistant</CardTitle>
        <Button variant="outline" size="sm" onclick={clearChat}>
          Clear Chat
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <!-- Chat History -->
      <div class="chat-history space-y-4 mb-4 max-h-96 overflow-y-auto">
        {#each chatHistory as chat (chat.timestamp)}
          <div class="chat-message">
            <!-- User Query -->
            <div class="bg-gray-50 p-3 rounded-lg">
              <div class="font-medium text-gray-700 mb-1">You:</div>
              <div>{chat.query}</div>
            </div>

            <!-- AI Response -->
            <div class="bg-blue-50 p-3 rounded-lg mt-2">
              <div class="flex justify-between items-start mb-1">
                <div class="font-medium text-blue-700">
                  AI Assistant
                  {#if chat.source === 'client'}
                    <span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      Client
                    </span>
                  {:else}
                    <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      Server
                    </span>
                  {/if}
                </div>
                <div class="text-xs text-gray-500">
                  {chat.timestamp.toLocaleTimeString()}
                </div>
              </div>
              <div class="whitespace-pre-wrap">{chat.response}</div>

              <!-- Metadata -->
              <div class="mt-2 text-xs text-gray-500 border-t pt-1">
                <div>{chat.reasoning}</div>
                {#if chat.metadata}
                  <div>
                    Model: {chat.metadata.model || 'unknown'} |
                    Duration: {chat.metadata.duration || 0}ms |
                    Tokens: {chat.metadata.tokenCount || 0}
                    {#if chat.metadata.privacy}
                      | Privacy: {chat.metadata.privacy}
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Input Form -->
      <div class="chat-input">
        <div class="flex gap-2">
          <textarea
            bind:value={query}
            onkeydown={handleKeydown}
            placeholder="Ask a legal question... (Ctrl/Cmd + Enter to send)"
            class="flex-1 min-h-20 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          ></textarea>
          <Button
            onclick={handleSubmit}
            disabled={loading || !query.trim()}
            class="px-6"
          >
            {#if loading}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            {:else}
              Send
            {/if}
          </Button>
        </div>

        <!-- Context Switching Info -->
        <div class="mt-2 text-xs text-gray-500">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <strong>Client (Fast):</strong> Simple queries, privacy-first, instant response
            </div>
            <div>
              <strong>Server (Accurate):</strong> Complex legal analysis, specialized model
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Last Response Debug (Development) -->
  {#if lastResponse && process.env.NODE_ENV === 'development'}
    <Card class="mt-4">
      <CardHeader>
        <CardTitle class="text-sm">🔍 Debug Info</CardTitle>
      </CardHeader>
      <CardContent>
        <pre class="text-xs bg-gray-100 p-2 rounded overflow-auto">
{JSON.stringify(lastResponse, null, 2)}
        </pre>
      </CardContent>
    </Card>
  {/if}
</div>

<style>
  .chat-history::-webkit-scrollbar {
    width: 6px;
  }

  .chat-history::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .chat-history::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 3px;
  }

  .chat-history::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
</style>


