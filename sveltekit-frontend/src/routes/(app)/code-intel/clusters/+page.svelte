<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let expanded = $state<string | null>(null);
</script>

<svelte:head><title>Clusters — Code Intel</title></svelte:head>

<div class="p-6 max-w-6xl mx-auto space-y-6">
  <div class="flex items-center gap-4">
    <a href="/code-intel" class="text-[var(--t-fg-muted)] hover:text-[var(--t-fg)] text-sm">← Code Intel</a>
    <h1 class="text-xl font-bold">🔵 Qdrant Clusters</h1>
    <span class="ml-auto text-sm text-[var(--t-fg-muted)]">{data.clusters.length} clusters</span>
  </div>

  {#if data.clusters.length === 0}
    <div class="panel p-4 rounded text-[var(--t-fg-muted)] text-sm">
      No clusters yet. Run <code>npm run graphify:cluster-summaries</code>.
    </div>
  {/if}

  <div class="space-y-2">
    {#each data.clusters as c}
      {@const key = c.clusterKey ?? c.cluster_key ?? String(c.id ?? c.clusterId)}
      <div class="panel rounded overflow-hidden">
        <!-- header row -->
        <button
          class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--t-surface-hover)] transition-colors"
          onclick={() => expanded = expanded === key ? null : key}
        >
          <div class="flex items-center gap-3">
            <span class="font-mono text-sm text-[var(--t-accent)]">{key}</span>
            {#if c.summary || c.label}
              <span class="text-sm text-[var(--t-fg-muted)] truncate max-w-md">{c.summary ?? c.label}</span>
            {/if}
          </div>
          <div class="flex items-center gap-4 text-xs text-[var(--t-fg-muted)] shrink-0">
            <span>{c.memberCount ?? c.member_count ?? 0} files</span>
            {#if c.avgAuthority ?? c.avg_authority}
              <span>auth {Number(c.avgAuthority ?? c.avg_authority).toFixed(3)}</span>
            {/if}
            <span>{expanded === key ? '▲' : '▼'}</span>
          </div>
        </button>

        <!-- expanded detail -->
        {#if expanded === key}
          <div class="px-4 pb-4 space-y-3 border-t border-[var(--t-border-soft)]">
            {#if c.description}
              <p class="text-sm mt-3">{c.description}</p>
            {/if}
            {#if c.tags?.length}
              <div class="flex gap-1 flex-wrap mt-2">
                {#each c.tags as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            {/if}
            {#if c.topPaths?.length || c.top_paths?.length}
              <div>
                <div class="text-xs text-[var(--t-fg-muted)] mb-1">Top members</div>
                <ul class="font-mono text-xs space-y-0.5">
                  {#each (c.topPaths ?? c.top_paths ?? []).slice(0, 8) as p}
                    <li class="text-[var(--t-fg-muted)]">{p}</li>
                  {/each}
                </ul>
              </div>
            {/if}
            <div class="flex gap-2 pt-2">
              <a href="/code-intel/clusters/{key}" class="btn-base text-xs px-3 py-1">Detail →</a>
              <a href="/code-intel/topology?cluster={key}" class="btn-base text-xs px-3 py-1">Topology →</a>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
