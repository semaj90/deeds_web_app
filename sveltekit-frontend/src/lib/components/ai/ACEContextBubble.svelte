<script lang="ts">
  import { Collapsible } from 'bits-ui';
  import { slide } from 'svelte/transition';

  interface ACEContextProps {
    confidence: number;
    source: 'local-onnx' | 'server-ollama';
    confidenceFactors?: {
      caseContext: boolean;
      ragHits: number;
      topScore: number | null;
      embeddingModel: string;
      codebaseHits: number;
      kagNeighbors: number;
    };
    citations?: Array<{ sourceNum: number; documentId: string; similarity: number }>;
    contextUsed?: string[];
    conversationTurns?: number;
    routerDecision?: { source: string; reason: string; confidence: number };
    cacheHit?: string;
  }

  let {
    confidence = 0.4,
    source = 'server-ollama',
    confidenceFactors,
    citations,
    contextUsed,
    conversationTurns = 0,
    routerDecision,
    cacheHit = 'none',
  }: ACEContextProps = $props();

  let expanded = $state(false);

  const pct = $derived(Math.round(confidence * 100));

  const color = $derived.by(() => {
    if (confidence >= 0.7) return 'accent';
    if (confidence >= 0.5) return 'warning';
    return 'danger';
  });

  const sourceLabel = $derived(source === 'local-onnx' ? 'ONNX' : 'Ollama');
  const sourceIcon = $derived(source === 'local-onnx' ? 'i-lucide-cpu' : 'i-lucide-server');
</script>

<Collapsible.Root bind:open={expanded}>
  <Collapsible.Trigger
    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all cursor-pointer
           border-{color}/30 bg-{color}/8 hover:border-{color}/50 hover:bg-{color}/15"
  >
    <!-- Confidence pill -->
    <span class="w-1.5 h-1.5 rounded-full bg-{color}"></span>
    <span class="text-{color}">{pct}%</span>

    <!-- Source badge -->
    <span class="text-sand/50">|</span>
    <span class="{sourceIcon} w-3 h-3 text-sand/60 inline-block"></span>
    <span class="text-sand/60">{sourceLabel}</span>

    <!-- RAG hits -->
    {#if confidenceFactors && confidenceFactors.ragHits > 0}
      <span class="text-sand/50">|</span>
      <span class="text-sand/60">RAG:{confidenceFactors.ragHits}</span>
    {/if}

    <!-- KAG -->
    {#if confidenceFactors && confidenceFactors.kagNeighbors > 0}
      <span class="text-green-500/80">KAG:{confidenceFactors.kagNeighbors}</span>
    {/if}

    <!-- Chevron -->
    <svg
      class="w-3 h-3 text-sand/40 transition-transform"
      class:rotate-180={expanded}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </Collapsible.Trigger>

  <Collapsible.Content>
    {#snippet child({ open })}
      {#if open}
        <div transition:slide={{ duration: 200 }} class="mt-2 p-3 rounded-lg border border-sand/10 bg-panelSoft text-xs space-y-2.5 max-w-sm">
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-sand/40 mb-1">ACE Context Pipeline</h4>

          <!-- 1. Router Decision -->
          <div class="flex items-start gap-2">
            <span class="i-lucide-split w-3.5 h-3.5 text-warning/70 inline-block mt-0.5 shrink-0"></span>
            <div class="min-w-0">
              <span class="font-semibold text-sand/80">Router</span>
              <span class="text-sand/50 ml-1">{routerDecision?.source ?? source}</span>
              {#if routerDecision?.reason}
                <p class="text-sand/40 text-[10px] truncate" title={routerDecision.reason}>{routerDecision.reason}</p>
              {/if}
            </div>
          </div>

          <!-- 2. RAG Retrieval -->
          <div class="flex items-start gap-2">
            <span class="i-lucide-database w-3.5 h-3.5 text-accent/70 inline-block mt-0.5 shrink-0"></span>
            <div>
              <span class="font-semibold text-sand/80">RAG</span>
              <span class="text-sand/50 ml-1">{confidenceFactors?.ragHits ?? 0} hits</span>
              {#if confidenceFactors?.topScore != null}
                <span class="text-sand/40 ml-1">(top: {(confidenceFactors.topScore * 100).toFixed(0)}%)</span>
              {/if}
              {#if confidenceFactors?.embeddingModel}
                <p class="text-sand/40 text-[10px] font-mono">{confidenceFactors.embeddingModel}</p>
              {/if}
            </div>
          </div>

          <!-- 3. KAG Graph -->
          <div class="flex items-start gap-2">
            <span class="i-lucide-git-branch w-3.5 h-3.5 text-green-500/70 inline-block mt-0.5 shrink-0"></span>
            <div>
              <span class="font-semibold text-sand/80">KAG</span>
              {#if confidenceFactors && confidenceFactors.kagNeighbors > 0}
                <span class="text-green-500/80 ml-1">{confidenceFactors.kagNeighbors} neighbors</span>
                <p class="text-sand/40 text-[10px]">1-hop graph traversal active</p>
              {:else}
                <span class="text-sand/40 ml-1">no graph hits</span>
              {/if}
            </div>
          </div>

          <!-- 4. Context Sources -->
          <div class="flex items-start gap-2">
            <span class="i-lucide-layers w-3.5 h-3.5 text-purple-500/70 inline-block mt-0.5 shrink-0"></span>
            <div>
              <span class="font-semibold text-sand/80">Context</span>
              <div class="flex flex-wrap gap-1.5 mt-0.5">
                {#if confidenceFactors?.caseContext}
                  <span class="px-1.5 py-0.5 rounded bg-accent/15 text-accent/80">Case</span>
                {/if}
                {#if confidenceFactors && confidenceFactors.codebaseHits > 0}
                  <span class="px-1.5 py-0.5 rounded bg-info/15 text-info/80">Code:{confidenceFactors.codebaseHits}</span>
                {/if}
                {#if conversationTurns > 0}
                  <span class="px-1.5 py-0.5 rounded bg-sand/10 text-sand/60">Turns:{conversationTurns}</span>
                {/if}
                {#if cacheHit !== 'none'}
                  <span class="px-1.5 py-0.5 rounded bg-warning/15 text-warning/80">Cache:{cacheHit}</span>
                {/if}
              </div>
            </div>
          </div>

          <!-- 5. Citations -->
          {#if citations && citations.length > 0}
            <div class="flex items-start gap-2">
              <span class="i-lucide-bookmark w-3.5 h-3.5 text-accent/70 inline-block mt-0.5 shrink-0"></span>
              <div>
                <span class="font-semibold text-sand/80">Citations</span>
                <span class="text-sand/50 ml-1">{citations.length} extracted</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each citations as cite}
                    <span class="px-1.5 py-0.5 rounded bg-accent/10 text-accent/70 font-mono text-[10px]" title={cite.documentId}>
                      [S{cite.sourceNum}] {(cite.similarity * 100).toFixed(0)}%
                    </span>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          <!-- Confidence bar -->
          <div class="pt-1.5 border-t border-sand/8">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sand/40">Confidence</span>
              <span class="font-bold text-{color}">{pct}%</span>
            </div>
            <div class="h-1.5 rounded-full bg-sand/10 overflow-hidden">
              <div class="h-full rounded-full bg-{color} transition-all" style="width: {pct}%"></div>
            </div>
          </div>
        </div>
      {/if}
    {/snippet}
  </Collapsible.Content>
</Collapsible.Root>
