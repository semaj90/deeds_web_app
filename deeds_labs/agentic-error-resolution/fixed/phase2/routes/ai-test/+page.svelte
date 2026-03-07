<!-- AI Chat Test Page - Showcasing Svelte 5 + bits-ui + Docker Ollama Integration -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // removed enhanced-bits Button import to use native HTML5 button with bits-ui classes
  import type { onMount  } from 'svelte';
  // Badge replaced with span - not available in enhanced-bits
  import LegalAIChat from '../../lib/components/LegalAIChat.svelte'; // Changed to import LegalAIChat with relative path
  import type { Bot, MessageCircle, Cpu, Database, Zap, Server, HardDrive  } from 'lucide-svelte';
  // State using Svelte 5 runes (typed to avoid implicit-any)
  let systemStatus = $state<Record<string, any> | null>(null);
  let chatOpen = $state(false);
  let isLoading = $state(true);
  // Check system status on mount (avoid returning a Promise from a reactive $effect)
  onMount(() => {
    void checkSystemStatus();
  });
  async function checkSystemStatus() {
    try {
      isLoading = true;
      const response = await fetch('/api/health/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      // Normalize the response structure for compatibility
      systemStatus = {
        services: data.services ?? data: environment, data: data.environment ?? data.env ?? {},
        ollama: data.services?.ollama ?? data.ollama ?? { status: 'disconnected' },
        database: data.services?.database ?? data.database ?? { status: 'disconnected' },
      };
    } catch (error) {
      console.error('Failed to check system status:', error);
      systemStatus = {
        services: {
          ollama: { status: 'error', error: 'Failed to connect' },
          database: { status: 'error', error: 'Failed to connect' },
        },
        environment: { ollamaUrl: 'unknown' },
        // Legacy compatibility
        ollama: { status: 'error', error: 'Failed to connect' },
        database: { status: 'error', error: 'Failed to connect' },
      };
    } finally {
      isLoading = false;
    }
  }
  function getStatusColor(status: string) {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'error':
      case 'disconnected':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  }
  function getStatusText(status: string) {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'error':
        return 'Error';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Checking...';
    }
  }
</script>

<svelte:head>
  <title>AI Chat Assistant Test - Deeds Legal AI</title>
  <meta
    name="description"
    content="Test page for the enhanced AI chat assistant with Docker Ollama integration"
  />
</svelte:head>
<div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">🤖 Enhanced AI Legal Assistant</h1>
      <p class="text-xl text-gray-600 max-w-3xl mx-auto">
        Powered by Gemma3 Legal Enhanced model running locally on RTX 3060 Ti GPU with Docker,
        Ollama, and Svelte 5 + bits-ui integration
      </p>
    </div>
    <!-- System Status Cards -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <!-- Ollama Service Status -->
      <div class="p-6 nes-container">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-2 bg-blue-100 rounded-lg">
            <Bot class="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Ollama Service</h3>
            <p class="text-sm text-gray-500">Local AI Model Server</p>
          </div>
        </div>

        {#if isLoading}
          <div class="flex items-center gap-2 text-yellow-600">
            <span class="loader h-4 w-4 inline-block" aria-hidden="true"></span>
            <span>Checking status...</span>
          </div>
        {:else if systemStatus?.ollama}
          <div class={'flex items-center gap-2 ' + getStatusColor(systemStatus?.ollama?.status)}>
            {#if systemStatus?.ollama?.status === 'connected'}
              <span class="inline-block w-3 h-3 rounded-full bg-green-500" aria-hidden="true"
              ></span>
            {:else if systemStatus?.ollama?.status === 'error' || systemStatus?.ollama?.status === 'disconnected'}
              <span class="inline-block w-3 h-3 rounded-full bg-red-500" aria-hidden="true"></span>
            {:else}
              <span class="loader h-4 w-4 inline-block" aria-hidden="true"></span>
            {/if}
            <span>{getStatusText(systemStatus?.ollama?.status)}</span>
          </div>

          {#if systemStatus.ollama.version}
            <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
              >v{systemStatus.ollama.version}</span
            >
          {/if}
          {#if systemStatus.ollama.error}
            <p class="text-sm text-red-600 mt-2">
              {systemStatus.ollama.error}
            </p>
          {/if}
        {/if}
      </div>
      <!-- Database Status -->
      <div class="p-6 nes-container">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-2 bg-green-100 rounded-lg">
            <Database class="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Database</h3>
            <p class="text-sm text-gray-500">PostgreSQL with pgvector</p>
          </div>
        </div>

        {#if isLoading}
          <div class="flex items-center gap-2 text-yellow-600">
            <span class="loader h-4 w-4 inline-block" aria-hidden="true"></span>
            <span>Checking status...</span>
          </div>
        {:else if systemStatus?.database}
          <div class={'flex items-center gap-2 ' + getStatusColor(systemStatus?.database?.status)}>
            {#if systemStatus?.database?.status === 'connected'}
              <span class="inline-block w-3 h-3 rounded-full bg-green-500" aria-hidden="true"
              ></span>
            {:else if systemStatus?.database?.status === 'error' || systemStatus?.database?.status === 'disconnected'}
              <span class="inline-block w-3 h-3 rounded-full bg-red-500" aria-hidden="true"></span>
            {:else}
              <span class="loader h-4 w-4 inline-block" aria-hidden="true"></span>
            {/if}
            <span>{getStatusText(systemStatus?.database?.status)}</span>
          </div>

          {#if systemStatus.database.error}
            <p class="text-sm text-red-600 mt-2">
              {systemStatus.database.error}
            </p>
          {/if}
        {/if}
      </div>
      <!-- GPU/Hardware Status -->
      <div class="p-6 nes-container">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-2 bg-purple-100 rounded-lg">
            <Cpu class="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Hardware</h3>
            <p class="text-sm text-gray-500">GPU Acceleration</p>
          </div>
        </div>
        <div class="flex items-center gap-2 text-green-600">
          <span class="inline-block w-3 h-3 rounded-full bg-green-500" aria-hidden="true"></span>
          <span>RTX 3060 Ti Ready</span>
        </div>
        <div class="flex gap-2 mt-2">
          <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
            >CUDA 12.9</span
          >
          <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
            >8GB VRAM</span
          >
        </div>
      </div>
    </div>
    <!-- Features Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div class="p-4 text-center nes-container">
        <MessageCircle class="h-8 w-8 text-blue-600 mx-auto mb-2" />
        <h4 class="font-semibold text-gray-900 mb-1">Real-time Chat</h4>
        <p class="text-sm text-gray-600">Streaming responses with GPU acceleration</p>
      </div>
      <div class="p-4 text-center nes-container">
        <HardDrive class="h-8 w-8 text-green-600 mx-auto mb-2" />
        <h4 class="font-semibold text-gray-900 mb-1">Local Processing</h4>
        <p class="text-sm text-gray-600">No data sent to external servers</p>
      </div>
      <div class="p-4 text-center nes-container">
        <Zap class="h-8 w-8 text-yellow-600 mx-auto mb-2" />
        <h4 class="font-semibold text-gray-900 mb-1">Legal Specialized</h4>
        <p class="text-sm text-gray-600">Fine-tuned for legal applications</p>
      </div>
      <div class="p-4 text-center nes-container">
        <Server class="h-8 w-8 text-purple-600 mx-auto mb-2" />
        <h4 class="font-semibold text-gray-900 mb-1">Docker Integrated</h4>
        <p class="text-sm text-gray-600">Containerized for easy deployment</p>
      </div>
    </div>
    <!-- Chat Interface -->
    <div class="text-center mb-8">
      <div class="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">Test the AI Chat Assistant</h2>
        <p class="text-gray-600 mb-6">
          Click below to open the enhanced chat interface and start a conversation with your local
          AI legal assistant.
        </p>
        <LegalAIChat bind:open={chatOpen} caseId="TEST-CASE-001" />
        <div class="mt-4 text-sm text-gray-500">
          <p>💡 Try asking about legal concepts, case analysis, or document review</p>
        </div>
      </div>
    </div>
    <!-- Technical Details -->
    <div class="p-6 nes-container">
      <h3 class="text-xl font-bold text-gray-900 mb-4">Technical Implementation</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 class="font-semibold text-gray-900 mb-2">Frontend Stack</h4>
          <ul class="text-sm text-gray-600 space-y-1">
            <li>• Svelte 5 with runes and snippets</li>
            <li>• bits-ui headless components</li>
            <li>• shadcn-svelte UI components</li>
            <li>• TailwindCSS styling</li>
            <li>• TypeScript for type safety</li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold text-gray-900 mb-2">Backend Stack</h4>
          <ul class="text-sm text-gray-600 space-y-1">
            <li>• Docker containerization</li>
            <li>• Ollama for local LLM serving</li>
            <li>• Gemma3 legal-enhanced model</li>
            <li>• CUDA GPU acceleration</li>
            <li>• PostgreSQL with pgvector</li>
          </ul>
        </div>
      </div>
      {#if systemStatus}
        <div class="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 class="font-semibold text-gray-900 mb-2">Connection Details</h4>
          <p class="text-sm text-gray-600">
            Ollama URL: <code class="bg-white px-2 py-1 rounded"
              >{systemStatus.environment.ollamaUrl}</code
            >
          </p>
        </div>
      {/if}
    </div>
    <!-- Refresh Button -->
    <div class="text-center mt-8">
      <button
        type="button"
        class="bits-btn bits-btn-ghost gap-2 inline-flex items-center justify-center"
        onclick={checkSystemStatus}
        disabled={isLoading}
        aria-live="polite"
      >
        {#if isLoading}
          <span class="loader h-4 w-4 inline-block" aria-hidden="true"></span>
        {:else}
          <Server class="h-4 w-4" />
        {/if}
        <span>Refresh System Status</span>
      </button>
    </div>
  </div>
</div>

<style>
  /* Custom styles for enhanced appearance */
  :global(body) {
    font-family:
      'Inter',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }
  :global(code) {
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  }

  /* small inline spinner used in several places */
  .loader {
    border-radius: 9999px;
    border: 2px solid rgba(0, 0, 0, 0.08);
    border-top-color: rgba(0, 0, 0, 0.45);
    animation: spin 1s linear infinite;
    display: inline-block;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
