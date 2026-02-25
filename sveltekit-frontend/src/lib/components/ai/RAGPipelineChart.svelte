<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();

  interface PipelineNode {
    id: string;
    label: string;
    detail: string;
    type: 'input' | 'router' | 'embed' | 'search' | 'process' | 'output';
  }

  const nodes: PipelineNode[] = [
    { id: 'query', label: 'User Query', detail: 'ChatSession.svelte.ts', type: 'input' },
    { id: 'router', label: 'Client Router', detail: 'client-router.ts → local vs server', type: 'router' },
    { id: 'embed', label: 'Embed (768-dim)', detail: 'embeddinggemma → nomic fallback', type: 'embed' },
    { id: 'qdrant', label: 'Qdrant ANN', detail: '3 collections: evidence, legal, cases', type: 'search' },
    { id: 'pgvector', label: 'pgvector FTS', detail: 'Full-text + vector dual search', type: 'search' },
    { id: 'kag', label: 'KAG Graph-Hop', detail: '1-hop on yorha_evidence_connections', type: 'search' },
    { id: 'rerank', label: 'Legal Rerank', detail: 'cosine 75% + citations 15% + jurisdiction 10%', type: 'process' },
    { id: 'dag', label: 'DAG Context', detail: 'Document dependency ordering', type: 'process' },
    { id: 'history', label: 'Conv. Memory', detail: 'Last 10 turns from chatMessages', type: 'process' },
    { id: 'llm', label: 'LLM Generation', detail: 'gemma3-legal via Ollama /api/chat', type: 'process' },
    { id: 'cite', label: 'Citation Extract', detail: '[Source N] → document mapping', type: 'process' },
    { id: 'stream', label: 'SSE Stream', detail: '/api/sse/chat → ChatSession', type: 'output' },
  ];

  const localPath: PipelineNode = { id: 'local', label: 'Local ONNX', detail: 'gemma270m WebGPU→WASM→CPU', type: 'router' };

  const typeColors: Record<string, string> = {
    input: 'border-info/60 bg-info/10',
    router: 'border-warning/60 bg-warning/10',
    embed: 'border-accent/60 bg-accent/10',
    search: 'border-green-500/60 bg-green-500/10',
    process: 'border-purple-500/60 bg-purple-500/10',
    output: 'border-accent/60 bg-accent/10',
  };

  const typeDots: Record<string, string> = {
    input: 'bg-info',
    router: 'bg-warning',
    embed: 'bg-accent',
    search: 'bg-green-500',
    process: 'bg-purple-500',
    output: 'bg-accent',
  };
</script>

<div class="pipeline-chart" class:compact>
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-sm font-bold text-sand tracking-wide uppercase">RAG + KAG + DAG Pipeline</h3>
    <div class="flex gap-3 text-[10px] text-sand/50">
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-info inline-block"></span> Input</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-warning inline-block"></span> Router</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent inline-block"></span> Embed</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span> Search</span>
      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> Process</span>
    </div>
  </div>

  <!-- Query Input -->
  <div class="node {typeColors.input}">
    <span class="dot {typeDots.input}"></span>
    <div>
      <span class="node-label">{nodes[0].label}</span>
      {#if !compact}<span class="node-detail">{nodes[0].detail}</span>{/if}
    </div>
  </div>

  <div class="connector"></div>

  <!-- Client Router — fork -->
  <div class="node {typeColors.router}">
    <span class="dot {typeDots.router}"></span>
    <div>
      <span class="node-label">{nodes[1].label}</span>
      {#if !compact}<span class="node-detail">{nodes[1].detail}</span>{/if}
    </div>
  </div>

  <!-- Fork: Local vs Server -->
  <div class="fork-container">
    <div class="fork-branch fork-left">
      <div class="connector-short"></div>
      <div class="node node-small {typeColors.router}">
        <span class="dot {typeDots.router}"></span>
        <div>
          <span class="node-label">{localPath.label}</span>
          {#if !compact}<span class="node-detail">{localPath.detail}</span>{/if}
        </div>
      </div>
      <div class="fork-label">Simple queries</div>
    </div>
    <div class="fork-branch fork-right">
      <div class="connector-short"></div>
      <div class="node node-small {typeColors.embed}">
        <span class="dot {typeDots.embed}"></span>
        <div>
          <span class="node-label">{nodes[2].label}</span>
          {#if !compact}<span class="node-detail">{nodes[2].detail}</span>{/if}
        </div>
      </div>
      <div class="fork-label">Legal/RAG queries</div>
    </div>
  </div>

  <!-- Triple Search (server path) -->
  <div class="connector"></div>
  <div class="search-row">
    {#each [nodes[3], nodes[4], nodes[5]] as snode}
      <div class="node node-small {typeColors.search}">
        <span class="dot {typeDots.search}"></span>
        <div>
          <span class="node-label">{snode.label}</span>
          {#if !compact}<span class="node-detail">{snode.detail}</span>{/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Merge + Rerank → DAG → History → LLM → Cite → Stream -->
  {#each [nodes[6], nodes[7], nodes[8], nodes[9], nodes[10], nodes[11]] as pnode}
    <div class="connector"></div>
    <div class="node {typeColors[pnode.type]}">
      <span class="dot {typeDots[pnode.type]}"></span>
      <div>
        <span class="node-label">{pnode.label}</span>
        {#if !compact}<span class="node-detail">{pnode.detail}</span>{/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .pipeline-chart {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }
  .pipeline-chart.compact {
    padding: 0.5rem;
  }
  .pipeline-chart.compact .node {
    padding: 0.35rem 0.75rem;
  }
  .pipeline-chart.compact .connector {
    height: 12px;
  }

  .node {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid;
    border-radius: 0.5rem;
    min-width: 240px;
    max-width: 340px;
    width: 100%;
  }
  .node-small {
    min-width: 160px;
    max-width: 220px;
    padding: 0.35rem 0.75rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .node-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--sand, #d4c5a0);
  }
  .node-detail {
    display: block;
    font-size: 0.65rem;
    color: var(--sand, #d4c5a0);
    opacity: 0.5;
    line-height: 1.2;
  }

  .connector {
    width: 2px;
    height: 20px;
    background: color-mix(in srgb, var(--sand, #d4c5a0) 25%, transparent);
  }
  .connector-short {
    width: 2px;
    height: 14px;
    background: color-mix(in srgb, var(--sand, #d4c5a0) 25%, transparent);
    margin: 0 auto;
  }

  .fork-container {
    display: flex;
    gap: 2rem;
    margin-top: 0;
    position: relative;
  }
  .fork-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 25%;
    right: 25%;
    height: 2px;
    background: color-mix(in srgb, var(--sand, #d4c5a0) 25%, transparent);
  }

  .fork-branch {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .fork-label {
    font-size: 0.6rem;
    color: var(--sand, #d4c5a0);
    opacity: 0.4;
    margin-top: 0.25rem;
    text-align: center;
  }

  .search-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .search-row {
      flex-direction: column;
      align-items: center;
    }
    .fork-container {
      flex-direction: column;
      gap: 0.5rem;
    }
    .fork-container::before {
      display: none;
    }
  }
</style>
