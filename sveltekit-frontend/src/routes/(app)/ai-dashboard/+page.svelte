<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import AskAI from '$lib/components/ai/AskAI.svelte';
  import ClientSideAIChat from '$lib/components/ai/ClientSideAIChat.svelte';

  interface AIStats {
    activeChats: number;
    ragQueries: number;
    documentsAnalyzed: number;
    citationsFound: number;
    casesProcessed: number;
    assistantSessions: number;
    embeddingModel: string;
    llmModel: string;
    ollamaStatus: string;
  }

  interface ModelInfo {
    name: string;
    size: string;
    modified_at: string;
  }

  let stats = $state<AIStats>({
    activeChats: 0,
    ragQueries: 0,
    documentsAnalyzed: 0,
    citationsFound: 0,
    casesProcessed: 0,
    assistantSessions: 0,
    embeddingModel: 'embeddinggemma:latest',
    llmModel: 'gemma3-legal:latest',
    ollamaStatus: 'unknown',
  });
  let models = $state<ModelInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showAskAI = $state(false);
  let showLocalAI = $state(false);

  $effect(() => {
    loadDashboard();
  });

  async function loadDashboard() {
    loading = true;
    error = null;
    try {
      const [statsRes, modelsRes] = await Promise.all([
        fetch('/api/ai/stats').catch(() => null),
        fetch('/api/ai/models').catch(() => null),
      ]);

      if (statsRes?.ok) {
        const data = await statsRes.json();
        stats = { ...stats, ...data };
      }

      if (modelsRes?.ok) {
        const data = await modelsRes.json();
        models = data.models ?? [];
        stats.ollamaStatus = 'connected';
      } else {
        stats.ollamaStatus = 'disconnected';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load AI dashboard';
      stats.ollamaStatus = 'error';
    } finally {
      loading = false;
    }
  }

  const statusColor = $derived(
    stats.ollamaStatus === 'connected' ? 'text-accent' :
    stats.ollamaStatus === 'disconnected' ? 'text-danger' : 'text-warning'
  );
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <header class="mb-8 text-center">
    <h1 class="text-3xl font-bold text-sand mb-2">AI Dashboard</h1>
    <p class="text-sand/60 text-sm">Monitor AI services, models, and processing pipelines</p>
  </header>

  {#if loading}
    <div class="text-center py-16 text-sand/50">Loading AI status...</div>
  {:else}
    <!-- Ollama Status -->
    <Card class="mb-6 bg-panel border-sand/10">
      <CardHeader>
        <CardTitle class="text-sm flex items-center gap-2">
          <span class="w-2 h-2 rounded-full {statusColor === 'text-accent' ? 'bg-accent' : statusColor === 'text-danger' ? 'bg-danger' : 'bg-warning'}"></span>
          Ollama Status:
          <span class={statusColor}>{stats.ollamaStatus}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-sand/50">Embedding Model:</span>
            <span class="text-sand ml-2 font-mono">{stats.embeddingModel}</span>
          </div>
          <div>
            <span class="text-sand/50">LLM Model:</span>
            <span class="text-sand ml-2 font-mono">{stats.llmModel}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      {#each [
        { label: 'RAG Queries', value: stats.ragQueries, color: 'text-accent' },
        { label: 'Documents Analyzed', value: stats.documentsAnalyzed, color: 'text-info' },
        { label: 'Citations Found', value: stats.citationsFound, color: 'text-warning' },
        { label: 'Cases Processed', value: stats.casesProcessed, color: 'text-accent' },
        { label: 'Active Chats', value: stats.activeChats, color: 'text-info' },
        { label: 'Assistant Sessions', value: stats.assistantSessions, color: 'text-sand' },
      ] as stat}
        <Card class="bg-panel border-sand/10">
          <CardContent class="p-4 text-center">
            <p class="text-2xl font-bold {stat.color}">{stat.value}</p>
            <p class="text-xs text-sand/50 mt-1">{stat.label}</p>
          </CardContent>
        </Card>
      {/each}
    </div>

    <!-- Models -->
    {#if models.length > 0}
      <Card class="bg-panel border-sand/10">
        <CardHeader>
          <CardTitle class="text-sm text-sand/80">Available Models ({models.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid gap-2">
            {#each models as model}
              <div class="flex items-center justify-between px-3 py-2 bg-black/20 rounded text-sm">
                <span class="font-mono text-accent">{model.name}</span>
                <div class="flex items-center gap-4 text-xs text-sand/40">
                  <span>{model.size}</span>
                  <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                </div>
              </div>
            {/each}
          </div>
        </CardContent>
      </Card>
    {/if}

    <!-- AI Chat (Server) -->
    <div class="mt-6">
      <button
        onclick={() => (showAskAI = !showAskAI)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showAskAI ? 'Hide AI Chat' : 'Ask AI (Server — Gemma3 Legal)'}
      </button>
      {#if showAskAI}
        <div class="mt-3">
          <AskAI placeholder="Ask a legal question..." showReferences={true} />
        </div>
      {/if}
    </div>

    <!-- Client-Side AI Chat -->
    <div class="mt-4">
      <button
        onclick={() => (showLocalAI = !showLocalAI)}
        class="w-full text-left px-4 py-3 bg-panel border border-sand/20 rounded-lg text-sand/80 hover:border-accent/40 transition text-sm font-medium"
      >
        {showLocalAI ? 'Hide Local AI' : 'Local AI Chat (Client ONNX — No Server)'}
      </button>
      {#if showLocalAI}
        <div class="mt-3">
          <ClientSideAIChat showStatus={true} />
        </div>
      {/if}
    </div>

    {#if error}
      <Card class="mt-4 bg-panel border-danger/40">
        <CardContent class="p-4 text-center">
          <p class="text-danger text-sm">{error}</p>
          <Button onclick={() => loadDashboard()} class="mt-2">Retry</Button>
        </CardContent>
      </Card>
    {/if}
  {/if}
</div>
