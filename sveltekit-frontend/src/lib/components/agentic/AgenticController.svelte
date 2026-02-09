<script lang="ts">
  // Migrated to $effect

  interface AgenticStatus {
    status: string;
	system: {
	redisConnected: boolean;
	agenticControllerActive: boolean;
	watcherStatus: string;
    };
    activity: {
	recentASTProcessing: number;
	pendingErrors: number;
	lastActivity: string;
    };
  }

  interface ErrorEmbedding {
    id: number;
	text: string;
    screenshotPath?: string;
	confidence: number;
	resolved: boolean;
	createdAt: string;
  }

  interface FixSuggestion {
    suggestion: string;
	successRate: number;
	similarError: string;
	relevance: number;
  }

  let status = $state<AgenticStatus | null>(null);
  let recentErrors = $state<ErrorEmbedding[]>([]);
  let fixSuggestions = $state<FixSuggestion[]>([]);
  let loading = $state<boolean>(false);
  let error = $state<string>('');
  let errorQuery = $state<string>('');
  let selectedFile = $state<File | null>(null);
  let dragActive = $state<boolean>(false);

  async function fetchStatus(): Promise<void> {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/v1/agentic?action=status');
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      status = await response.json();
    } catch (err: unknown) {
      error = `Failed to fetch status: ${err instanceof Error ? err.message : String(err)}`;
      console.error('Status fetch error:', err);
    } finally {
      loading = false;
    }
  }

  async function fetchRecentErrors(): Promise<void> {
    try {
      const response = await fetch('/api/v1/agentic?action=recent-errors');
      if (!response.ok) {
        throw new Error(`Failed to fetch errors: ${response.status}`);
      }
      const data = await response.json();
      recentErrors = data.errors || [];
    } catch (err: unknown) {
      error = `Failed to fetch errors: ${err instanceof Error ? err.message : String(err)}`;
      console.error('Errors fetch error:', err);
    }
  }

  async function queryFixSuggestions(): Promise<void> {
    if (!errorQuery.trim()) return;
    loading = true;
    fixSuggestions = [];
    try {
      const response = await fetch(`/api/v1/agentic?action=fix-suggestions&query=${encodeURIComponent(errorQuery)}`);
      if (!response.ok) {
        throw new Error(`Fix query failed: ${response.status}`);
      }
      const data = await response.json();
      fixSuggestions = data.suggestions || [];
    } catch (err: unknown) {
      error = `Fix query failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error('Fix query error:', err);
    } finally {
      loading = false;
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }

  function handleDragLeave() {
    dragActive = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    if (e.dataTransfer?.files.length) {
      selectedFile = e.dataTransfer.files[0];
    }
  }

  $effect(() => {

    fetchStatus();
    fetchRecentErrors();
  
});
</script>

<div class="agentic-controller p-4 bg-gray-900 rounded-lg">
  <h2 class="text-xl font-bold text-white mb-4">🤖 Agentic Controller</h2>

  {#if loading}
    <div class="text-center py-4">
      <div class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
      <p class="text-gray-400 mt-2">Loading...</p>
    </div>
  {/if}

  {#if error}
    <div class="bg-red-900/50 border border-red-500 rounded p-3 mb-4">
      <p class="text-red-300">{error}</p>
    </div>
  {/if}

  {#if status}
    <div class="grid grid-cols-2 gap-4 mb-6">
      <div class="bg-gray-800 rounded p-3">
        <h3 class="text-sm text-gray-400 mb-1">Status</h3>
        <p class="text-lg font-semibold {status.status === 'active' ? 'text-green-400' : 'text-yellow-400'}">
          {status.status}
        </p>
      </div>
      <div class="bg-gray-800 rounded p-3">
        <h3 class="text-sm text-gray-400 mb-1">Redis</h3>
        <p class="text-lg font-semibold {status.system.redisConnected ? 'text-green-400' : 'text-red-400'}">
          {status.system.redisConnected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
      <div class="bg-gray-800 rounded p-3">
        <h3 class="text-sm text-gray-400 mb-1">Pending Errors</h3>
        <p class="text-lg font-semibold text-white">{status.activity.pendingErrors}</p>
      </div>
      <div class="bg-gray-800 rounded p-3">
        <h3 class="text-sm text-gray-400 mb-1">Last Activity</h3>
        <p class="text-sm text-white">{status.activity.lastActivity}</p>
      </div>
    </div>
  {/if}

  <div class="mb-6">
    <h3 class="text-lg font-semibold text-white mb-2">Query Fix Suggestions</h3>
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={errorQuery}
        placeholder="Describe the error..."
        class="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
      />
      <button
        onclick={queryFixSuggestions}
        disabled={loading || !errorQuery.trim()}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white"
      >
        Search
      </button>
    </div>
  </div>

  {#if fixSuggestions.length > 0}
    <div class="mb-6">
      <h3 class="text-lg font-semibold text-white mb-2">Suggestions</h3>
      <div class="space-y-2">
        {#each fixSuggestions as suggestion}
          <div class="bg-gray-800 rounded p-3">
            <p class="text-white">{suggestion.suggestion}</p>
            <div class="flex gap-4 mt-2 text-sm text-gray-400">
              <span>Success Rate: {(suggestion.successRate * 100).toFixed(0)}%</span>
              <span>Relevance: {(suggestion.relevance * 100).toFixed(0)}%</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if recentErrors.length > 0}
    <div>
      <h3 class="text-lg font-semibold text-white mb-2">Recent Errors</h3>
      <div class="space-y-2 max-h-64 overflow-y-auto">
        {#each recentErrors as err}
          <div class="bg-gray-800 rounded p-3 {err.resolved ? 'opacity-50' : ''}">
            <p class="text-white text-sm">{err.text}</p>
            <div class="flex gap-4 mt-2 text-xs text-gray-400">
              <span>Confidence: {(err.confidence * 100).toFixed(0)}%</span>
              <span>{err.resolved ? '✓ Resolved' : '⏳ Pending'}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .agentic-controller {
    max-width: 800px;
	margin: 0 auto;
  }
</style>
