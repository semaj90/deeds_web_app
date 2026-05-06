<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const statusColor = (s: string) =>
    s === 'ok' || s === 'healthy' ? 'text-green-400' :
    s === 'degraded'              ? 'text-yellow-400' : 'text-red-400';
</script>

<svelte:head><title>Audit — Code Intel</title></svelte:head>

<div class="p-6 max-w-6xl mx-auto space-y-6">
  <div class="flex items-center gap-4">
    <a href="/code-intel" class="text-[var(--t-fg-muted)] hover:text-[var(--t-fg)] text-sm">← Code Intel</a>
    <h1 class="text-xl font-bold">🔬 Audit Gates</h1>
  </div>

  <!-- GDS status -->
  <div class="panel p-4 rounded">
    <h2 class="text-xs uppercase text-[var(--t-fg-muted)] mb-3">GDS (Graph Data Science)</h2>
    {#if data.gds?.status}
      <div class="flex items-center gap-2">
        <span class="text-lg font-semibold {statusColor(data.gds.status)}">{data.gds.status}</span>
        {#if data.gds.version}
          <span class="text-xs text-[var(--t-fg-muted)]">v{data.gds.version}</span>
        {/if}
      </div>
    {/if}
    {#if data.gds?.algorithms}
      <div class="mt-2 flex gap-1 flex-wrap">
        {#each data.gds.algorithms as alg}
          <span class="tag">{alg}</span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Neo4j health -->
  <div class="panel p-4 rounded">
    <h2 class="text-xs uppercase text-[var(--t-fg-muted)] mb-3">Neo4j</h2>
    {#if data.neo4jHealth?.status}
      <span class="text-lg font-semibold {statusColor(data.neo4jHealth.status)}">{data.neo4jHealth.status}</span>
    {/if}
    {#if data.neo4jHealth?.nodeCounts}
      <div class="mt-2 font-mono text-xs space-y-0.5">
        {#each Object.entries(data.neo4jHealth.nodeCounts) as [label, count]}
          <div><span class="text-[var(--t-fg-muted)]">{label}:</span> {count}</div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Gate reference -->
  <div class="panel p-4 rounded">
    <h2 class="text-xs uppercase text-[var(--t-fg-muted)] mb-3">Quick Audit Gates</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
      {#each [
        ['G4', 'forest cluster prefilter warm', 'npm run forest:warm'],
        ['G15', 'gRPC proto contract', 'npm run grpc:health:retrieval'],
        ['G16', 'route test stubs', 'npm run audit:test-stubs'],
        ['G27', 'pytorch-graph wired', 'npm run smoke:compute-worker:gpu'],
        ['Smoke', 'graphify 5-pillar', 'npm run smoke:graphify'],
        ['Trace', 'TRACE stack', 'npm run verify:trace'],
      ] as [gate, label, cmd]}
        <div class="panel rounded p-2 flex items-center justify-between gap-2">
          <span class="text-[var(--t-accent)] font-bold">{gate}</span>
          <span class="text-[var(--t-fg-muted)] flex-1">{label}</span>
          <code class="text-[10px] bg-black/20 px-1 py-0.5 rounded">{cmd}</code>
        </div>
      {/each}
    </div>
  </div>
</div>