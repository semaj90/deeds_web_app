<script lang="ts">
  import { onMount } from 'svelte';
  import { createActor, type SnapshotFrom } from 'xstate';
  import { keyboardShortcuts } from '$lib/utils/keyboard-shortcuts.svelte.js';
  import { investigatorIntelMachine } from './investigator-intel-machine.js';
  import { normalizeIntelSignals } from './investigator-intel-contract.js';

  let {
    caseId,
    query = 'Investigation overview',
    compact = false,
    onFocusEvidence
  }: {
    caseId: string | null;
    query?: string;
    compact?: boolean;
    onFocusEvidence?: (ids: string[]) => void;
  } = $props();

  type IntelSnapshot = SnapshotFrom<typeof investigatorIntelMachine>;
  let snapshot = $state<IntelSnapshot | null>(null);
  let isOpen = $state(!compact);
  let actor: ReturnType<typeof createActor<typeof investigatorIntelMachine>> | null = null;
  let queryText = $state(query);

  const loading = $derived(snapshot?.matches('loading') ?? false);
  const result = $derived(snapshot?.context.result ?? null);
  const signals = $derived(normalizeIntelSignals(result?.predictiveSignals ?? []));
  const error = $derived(snapshot?.context.error ?? null);

  function refresh() {
    actor?.send({ type: 'REFRESH', query: queryText });
  }

  onMount(() => {
    const instance = createActor(investigatorIntelMachine, {
      input: { caseId, query }
    });
    actor = instance;
    const subscription = instance.subscribe((next) => {
      snapshot = next;
    });
    instance.start();
    refresh();

    const unregisterToggle = keyboardShortcuts.register({
      key: 'alt+shift+i',
      description: 'Toggle investigator intelligence',
      handler: () => { isOpen = !isOpen; }
    });
    const unregisterRefresh = keyboardShortcuts.register({
      key: 'alt+shift+r',
      description: 'Refresh investigator intelligence',
      handler: refresh
    });
    return () => {
      unregisterRefresh();
      unregisterToggle();
      subscription.unsubscribe();
      instance.stop();
      actor = null;
    };
  });

  function focusSignal(ids: string[]) {
    if (!ids.length) return;
    onFocusEvidence?.(ids);
  }
</script>

<aside class="rounded-xl border border-slate-600/40 bg-slate-950/95 text-slate-100 shadow-xl" aria-label="Investigator intelligence">
  <header class="flex items-center justify-between gap-2 border-b border-white/10 p-3">
    <button type="button" class="flex items-center gap-2 text-sm font-semibold" aria-expanded={isOpen} onclick={() => isOpen = !isOpen}>
      <span aria-hidden="true">✦</span> Investigator Intel
    </button>
    <span class="text-xs text-slate-400">Alt+Shift+I</span>
  </header>
  {#if isOpen}
    <div class="space-y-3 p-3">
      <form class="flex gap-2" onsubmit={(event) => { event.preventDefault(); refresh(); }}>
        <input aria-label="Investigation query" class="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm" maxlength="2000" bind:value={queryText} />
        <button type="submit" class="rounded bg-cyan-900 px-3 py-1 text-sm disabled:opacity-40" disabled={loading || !queryText.trim()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </form>
      {#if error}
        <p role="alert" class="text-sm text-amber-300">{error}</p>
      {/if}
      {#if result}
        {#if result.provenance?.source === 'FALLBACK'}
          <p class="text-xs text-amber-300">Live intelligence unavailable — manual-review guidance only</p>
        {:else}
          <p class="text-xs text-slate-400">Model-generated investigative hints, not verified evidence</p>
        {/if}
        <p class="text-sm leading-relaxed">{result.summary}</p>
        <section aria-label="Predictive signals">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">Predictive signals</h3>
          {#if signals.length === 0}
            <p class="text-xs text-slate-400">No predictive signals returned.</p>
          {:else}
            <ul class="space-y-2">
              {#each signals as signal (signal.id)}
                <li class="rounded border border-slate-700 p-2 text-sm">
                  <p>{signal.text}</p>
                  {#if signal.evidenceRefs.length}
                    <button type="button" class="mt-1 text-xs text-cyan-300 underline" onclick={() => focusSignal(signal.evidenceRefs)}>
                      Highlight linked evidence
                    </button>
                  {:else}
                    <span class="text-xs text-slate-500">No verified evidence links</span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
        {#if result.recommendations.length}
          <details>
            <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-cyan-300">Recommendations ({result.recommendations.length})</summary>
            <ul class="mt-2 space-y-2">
              {#each result.recommendations as recommendation, index (index)}
                <li class="text-sm"><strong>{recommendation.title}</strong><p class="text-slate-400">{recommendation.rationale}</p></li>
              {/each}
            </ul>
          </details>
        {/if}
      {:else if !loading}
        <p class="text-xs text-slate-400">Run an investigation query to load signals.</p>
      {/if}
    </div>
  {/if}
</aside>
