<script lang="ts">
  import { fade } from 'svelte/transition';

  let { data } = $props<{ data: { card: any } }>();
  let card = $derived(data.card);

  function pct(val: number | null): string {
    if (val == null) return 'N/A';
    return (val * 100).toFixed(1) + '%';
  }
</script>

<svelte:head>
  <title>Deeds AI File Profile - {card.source_ref}</title>
</svelte:head>

<div class="min-h-screen app-bg text-sand flex items-center justify-center p-6 font-sans">
  <div
    in:fade={{ duration: 400 }}
    class="panel w-full max-w-4xl border border-sand/20 rounded-lg p-6 bg-sandDark/40 backdrop-blur-md shadow-2xl relative overflow-hidden"
  >
    <!-- Background grid decoration -->
    <div class="absolute inset-0 bg-[linear-gradient(rgba(200,180,150,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(200,180,150,0.05)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none"></div>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-sand/20 pb-4 mb-6 relative z-10">
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-1">
          <span class="text-xs uppercase tracking-widest bg-sand/10 text-sand px-2 py-0.5 rounded border border-sand/30 font-mono">
            {card.component_type}
          </span>
          <span class="text-xs font-mono text-sand/60">
            {(card.feature_id || 'unknown').toUpperCase()} LANE
          </span>
          {#if card.feature_dominant_status}
            <span class="text-xs font-mono px-2 py-0.5 rounded border
              {card.feature_dominant_status === 'done' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : ''}
              {card.feature_dominant_status === 'in-progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : ''}
              {card.feature_dominant_status === 'blocked' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : ''}
              {!['done','in-progress','blocked'].includes(card.feature_dominant_status) ? 'bg-sand/10 text-sand/50 border-sand/20' : ''}
            ">
              {card.feature_dominant_status}
            </span>
          {/if}
        </div>
        <h1 class="text-xl font-bold tracking-tight text-accent font-mono break-all">
          {card.source_ref}
        </h1>
        {#if card.file_path && card.file_path !== card.source_ref}
          <div class="text-xs text-sand/40 font-mono mt-0.5">{card.file_path}</div>
        {/if}
      </div>

      <!-- Health badge -->
      <div class="mt-3 sm:mt-0 flex items-center gap-2 flex-shrink-0">
        <span class="text-xs font-mono text-sand/60">STATUS:</span>
        <span class="px-3 py-1 text-xs uppercase tracking-wider font-bold font-mono rounded border
          {card.health_status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : ''}
          {card.health_status === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : ''}
          {card.health_status === 'critical' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : ''}"
        >
          ● {card.health_status}
        </span>
      </div>
    </div>

    <!-- Core stats row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 border-b border-sand/20 pb-6 relative z-10 font-mono">
      <div class="p-3 border border-sand/10 rounded bg-sand/5">
        <div class="text-xs text-sand/50 mb-1">SOM CLUSTER</div>
        <div class="text-base font-bold text-accent">{card.som_cluster}</div>
      </div>
      <div class="p-3 border border-sand/10 rounded bg-sand/5">
        <div class="text-xs text-sand/50 mb-1">CENTROID</div>
        <div class="text-base font-bold text-accent break-all">{card.centroid_id}</div>
      </div>
      <div class="p-3 border border-sand/10 rounded bg-sand/5">
        <div class="text-xs text-sand/50 mb-1">QDRANT POINT</div>
        <div class="text-base font-bold text-accent">{card.qdrant_point_id || 'N/A'}</div>
      </div>
      <div class="p-3 border border-sand/10 rounded bg-sand/5">
        <div class="text-xs text-sand/50 mb-1">LINE COUNT</div>
        <div class="text-base font-bold text-accent">{card.line_count}</div>
      </div>
    </div>

    <!-- Scores row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 border-b border-sand/20 pb-6 relative z-10 font-mono text-sm">
      <div class="p-3 border border-sand/10 rounded bg-sand/5">
        <div class="text-xs text-sand/50 mb-1">SEMANTIC CONF</div>
        <div class="font-bold text-sand/80">{pct(card.semantic_confidence)}</div>
      </div>
      <div class="p-3 border border-sand/10 rounded bg-sand/5">
        <div class="text-xs text-sand/50 mb-1">BEHAVIOR SCORE</div>
        <div class="font-bold text-sand/80">{card.behavior_score != null ? card.behavior_score.toFixed(3) : 'N/A'}</div>
      </div>
      <div class="p-3 border border-sand/10 rounded bg-sand/5">
        <div class="text-xs text-sand/50 mb-1">PACKETS (task/rt)</div>
        <div class="font-bold text-sand/80">{card.packet_count ?? 0} / {card.runtime_packet_count ?? 0}</div>
      </div>
      <div class="p-3 border border-sand/10 rounded bg-sand/5">
        <div class="text-xs text-sand/50 mb-1">FEAT CONFIDENCE</div>
        <div class="font-bold text-sand/80">{pct(card.feature_avg_confidence)}</div>
      </div>
    </div>

    <!-- Capability flags row -->
    <div class="flex flex-wrap gap-2 mb-6 relative z-10">
      {#each [
        { label: 'Route', val: card.is_route },
        { label: 'Svelte', val: card.is_svelte_comp },
        { label: 'Auth', val: card.has_auth },
        { label: 'Zod', val: card.has_zod },
        { label: 'Drizzle', val: card.drizzle_refs?.length > 0 },
      ] as flag}
        <span class="text-xs font-mono px-2 py-0.5 rounded border
          {flag.val ? 'bg-accent/10 text-accent border-accent/30' : 'bg-sand/5 text-sand/30 border-sand/10'}">
          {flag.val ? '✓' : '✗'} {flag.label}
        </span>
      {/each}
      {#if card.route_handlers?.length > 0}
        {#each card.route_handlers as handler}
          <span class="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">{handler}</span>
        {/each}
      {/if}
      {#if card.tags?.length > 0}
        {#each card.tags.slice(0, 8) as tag}
          <span class="text-xs font-mono px-2 py-0.5 rounded bg-sand/10 text-sand/60 border border-sand/15">{tag}</span>
        {/each}
      {/if}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
      <!-- Left column -->
      <div class="space-y-5">
        <!-- Imports -->
        {#if card.imports?.length > 0}
          <div>
            <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
              Imports ({card.imports.length})
            </h2>
            <div class="max-h-32 overflow-y-auto space-y-0.5 pr-1">
              {#each card.imports.slice(0, 20) as imp}
                <div class="text-xs font-mono bg-sand/5 border border-sand/10 rounded px-2 py-1 break-all text-sand/70">{imp}</div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Parent modules -->
        <div>
          <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
            Parent Modules
          </h2>
          {#if card.parent_modules?.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#each card.parent_modules as parent}
                <span class="text-xs font-mono bg-sand/10 border border-sand/20 px-2 py-0.5 rounded break-all">{parent}</span>
              {/each}
            </div>
          {:else}
            <span class="text-xs text-sand/40 italic">No parent modules cataloged.</span>
          {/if}
        </div>

        <!-- Nested routes -->
        {#if card.nested_routes?.length > 0}
          <div>
            <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
              Nested Routes
            </h2>
            <div class="space-y-0.5">
              {#each card.nested_routes as route}
                <div class="text-xs font-mono bg-sand/5 border border-sand/10 rounded px-2 py-1 break-all">{route}</div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Hypergraph -->
        <div>
          <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
            Hypergraph (Neo4j)
          </h2>
          {#if card.hypergraph_neighbors?.length > 0}
            <div class="space-y-0.5 max-h-40 overflow-y-auto pr-1">
              {#each card.hypergraph_neighbors as neighbor}
                <div class="text-xs font-mono bg-sand/5 border border-sand/10 rounded px-2 py-1 break-all">{neighbor}</div>
              {/each}
            </div>
          {:else}
            <span class="text-xs text-sand/40 italic">No graph neighborhood detected.</span>
          {/if}
        </div>
      </div>

      <!-- Right column -->
      <div class="space-y-5">
        <!-- Exports -->
        {#if card.exports?.length > 0}
          <div>
            <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
              Exports ({card.exports.length})
            </h2>
            <div class="flex flex-wrap gap-1.5">
              {#each card.exports.slice(0, 20) as exp}
                <span class="text-xs font-mono bg-accent/5 border border-accent/20 px-2 py-0.5 rounded">{exp}</span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Drizzle refs -->
        {#if card.drizzle_refs?.length > 0}
          <div>
            <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
              Drizzle Tables
            </h2>
            <div class="flex flex-wrap gap-1.5">
              {#each card.drizzle_refs as ref}
                <span class="text-xs font-mono bg-blue-500/10 border border-blue-500/20 text-blue-300 px-2 py-0.5 rounded">{ref}</span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Similar files (Qdrant) -->
        <div>
          <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
            Similar (Qdrant)
          </h2>
          {#if card.similar_files?.length > 0}
            <div class="space-y-0.5">
              {#each card.similar_files as file}
                <div class="text-xs font-mono bg-sand/5 border border-sand/10 rounded px-2 py-1 break-all text-sand/70">{file}</div>
              {/each}
            </div>
          {:else}
            <span class="text-xs text-sand/40 italic">No similar files detected.</span>
          {/if}
        </div>

        <!-- Related features -->
        {#if card.related_features?.length > 0}
          <div>
            <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
              Related Features
            </h2>
            <div class="flex flex-wrap gap-1.5">
              {#each card.related_features as feat}
                <span class="text-xs font-mono bg-sand/10 border border-sand/20 px-2 py-0.5 rounded">{feat}</span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Warnings & agentic fixes -->
        <div>
          <h2 class="text-xs font-bold tracking-wider uppercase border-l-2 border-accent pl-2 mb-2 text-sand/70 font-mono">
            Alerts
          </h2>
          {#if card.warnings?.length > 0}
            <div class="space-y-1.5 mb-3">
              {#each card.warnings as warning}
                <div class="text-xs font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded px-2 py-1.5 flex items-start gap-2">
                  <span class="flex-shrink-0">⚠</span>
                  <span>{warning}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded px-2 py-1.5 mb-3">
              ✓ No design warnings.
            </div>
          {/if}

          {#if card.agentic_fixes?.length > 0}
            <div class="space-y-1.5">
              {#each card.agentic_fixes as fix}
                <div class="text-xs font-mono bg-sand/5 border border-sand/20 rounded px-2 py-1.5">
                  <span class="text-accent uppercase tracking-wider text-[10px] font-bold mr-1">[{fix.type}]</span>
                  <span class="text-sand/70">{fix.description}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-6 pt-4 border-t border-sand/10 relative z-10 flex flex-wrap gap-4 text-xs font-mono text-sand/30">
      <span>feat_cluster: {card.feature_primary_cluster || 'N/A'}</span>
      <span>runtime: {card.runtime_state || 'N/A'}</span>
      {#if card.routing_score != null}
        <span>routing: {card.routing_score.toFixed(3)}</span>
      {/if}
      <span class="ml-auto">YoRHa Atlas v1 — Deeds AI Platform</span>
    </div>
  </div>
</div>
