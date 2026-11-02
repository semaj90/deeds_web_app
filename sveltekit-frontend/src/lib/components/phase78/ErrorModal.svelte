<!-- Error Modal: Svelte 5 | Bits UI v2 Dialog | YoRHa / Phoenix Justice Tactical HUD -->
<script lang="ts">
  import { Dialog } from 'bits-ui';

  // API Contract Types
  type ErrorEvent = {
    id: string;
    routePath: string;
    file: string | null;
    kind: 'build' | 'runtime' | 'lint' | 'other';
    severity: 'info' | 'warn' | 'error' | 'fatal';
    message: string;
    lineNumber: number | null;
    columnNumber: number | null;
    clusterId: string | null;
    collectedAt: string; // ISO
  };

  type ErrorSuggestion = {
    id: string;
    clusterId: string;
    title: string;
    explanation: string;
    confidence: number | null;
    hints: string[] | null;
  };

  type SuggestionState = 'pending' | 'applied' | 'dismissed' | 'snoozed';

  // Props
  let {
    open = $bindable(false),
    routePath,
    onClose
  }: {
    open?: boolean;
    routePath: string;
    onClose?: () => void;
  } = $props();

  // State
  let loading = $state(false);
  let error: string | null = $state(null);
  let events: ErrorEvent[] = $state([]);
  let suggestions: ErrorSuggestion[] = $state([]);
  let selectedSuggestionId: string | null = $state(null);
  let applying = $state(false);
  let suggestionStates = $state<Record<string, SuggestionState>>({});
  let updatingStates = $state<Set<string>>(new Set());

  function handleOpenChange(isOpen: boolean) {
    open = isOpen;
    if (!isOpen && onClose) {
      onClose();
    }
  }

  // Load error data from endpoint
  async function loadData() {
    if (!routePath) return;

    loading = true;
    error = null;

    try {
      const res = await fetch(
        `/api/phase78/error-events?routePath=${encodeURIComponent(routePath)}`
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        events: ErrorEvent[];
        suggestions: ErrorSuggestion[];
      };

      events = data.events ?? [];
      suggestions = data.suggestions ?? [];

      // auto-select first suggestion if exists
      if (!selectedSuggestionId && suggestions.length > 0) {
        selectedSuggestionId = suggestions[0].id;
      }
    } catch (e: any) {
      error = e?.message ?? 'Failed to load error data';
    } finally {
      loading = false;
    }
  }

  // Apply selected suggestion as a patch
  async function applySelectedSuggestion() {
    if (!routePath || !selectedSuggestionId) return;

    applying = true;
    try {
      const res = await fetch('/api/phase78/route-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routePath,
          filePath: '',
          errorState: 'healthy',
          recentErrorCount: 0,
          lastErrorClusterId: selectedSuggestionId,
          selectedSuggestionId,
          lastErrorMessageShort: ''
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error('Patch not applied');
      }

      // Mark suggestion as applied in state tracking
      await updateSuggestionState(selectedSuggestionId, 'applied');

      // Optionally refetch to show updated state
      await loadData();
    } catch (e: any) {
      error = e?.message ?? 'Failed to apply patch';
    } finally {
      applying = false;
    }
  }

  // Update suggestion state (dismiss, snooze, applied, pending)
  async function updateSuggestionState(suggestionId: string, state: SuggestionState) {
    if (!routePath) return;

    updatingStates.add(suggestionId);
    updatingStates = updatingStates; // trigger reactivity

    try {
      const res = await fetch('/api/phase78/suggestion-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routePath: suggestionId,
          state
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Update local state cache
      suggestionStates[suggestionId] = state;
      suggestionStates = suggestionStates; // trigger reactivity
    } catch (e: any) {
      console.error(`Failed to update suggestion state: ${e?.message}`);
      error = e?.message ?? 'Failed to update suggestion state';
    } finally {
      updatingStates.delete(suggestionId);
      updatingStates = updatingStates; // trigger reactivity
    }
  }

  // Dismiss suggestion (user explicitly rejected)
  async function dismissSuggestion(suggestionId: string) {
    await updateSuggestionState(suggestionId, 'dismissed');
  }

  // Snooze suggestion (temporarily hide, keep as pending)
  async function snoozeSuggestion(suggestionId: string) {
    await updateSuggestionState(suggestionId, 'snoozed');
  }

  // load when modal opens or route changes
  $effect(() => {
    if (open && routePath) {
      loadData();
    }
  });
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <!-- Tactical Backdrop -->
    <Dialog.Overlay class="hud-modal-backdrop fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />

    <!-- Centered Modal Content -->
    <div class="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
      <Dialog.Content
        class="pointer-events-auto relative w-[920px] max-w-full max-h-[85vh] flex flex-col bg-[#131b2a]/95 text-sand border border-[#f3d471]/30 rounded-xl shadow-2xl p-6 backdrop-blur-xl"
      >
        <!-- Tactical Corner Notches (Phoenix Justice / YoRHa HUD) -->
        <span class="hud-notch-tl" aria-hidden="true"></span>
        <span class="hud-notch-tr" aria-hidden="true"></span>
        <span class="hud-notch-bl" aria-hidden="true"></span>
        <span class="hud-notch-br" aria-hidden="true"></span>

        <!-- Top Highlight Bar -->
        <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471]/80 to-transparent"></div>

        <!-- Header -->
        <header class="flex items-center justify-between pb-4 border-b border-[#f3d471]/20">
          <div>
            <Dialog.Title class="text-base font-bold text-white flex items-center gap-2">
              <span class="text-[#f3d471]">⚡</span>
              <span>ERROR BRAIN // ROUTE AUDIT</span>
            </Dialog.Title>
            <p class="text-xs font-mono text-[#f3d471]/80 mt-0.5">{routePath}</p>
          </div>

          <Dialog.Close
            class="text-neutral-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            ✕
          </Dialog.Close>
        </header>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto py-4">
          {#if loading}
            <div class="py-12 text-center text-sm text-sand/60 font-mono animate-pulse">
              Scanning route logs and clusters…
            </div>
          {:else if error}
            <div class="p-3 rounded bg-red-950/40 border border-red-500/30 text-xs text-red-200">
              {error}
            </div>
          {:else}
            <div class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
              <!-- Left: events list -->
              <div class="border border-sand/20 rounded-lg p-3 bg-black/30 overflow-y-auto max-h-[55vh]">
                <h3 class="text-xs font-semibold text-[#f3d471] mb-2 uppercase tracking-wide font-mono">
                  Error Timeline ({events.length})
                </h3>
                {#if events.length === 0}
                  <p class="text-xs text-sand/50 italic py-4 text-center">No recent error events for this route.</p>
                {:else}
                  <ul class="space-y-2 text-xs">
                    {#each events as ev}
                      <li class="border border-sand/20 rounded p-2.5 bg-black/20 hover:border-[#f3d471]/40 transition-colors">
                        <div class="flex justify-between items-center mb-1">
                          <span class="font-mono text-[11px] text-[#ff6b6b] uppercase font-bold">
                            {ev.kind} / {ev.severity}
                          </span>
                          <span class="text-[10px] text-sand/60 font-mono">
                            {ev.file ?? '(unknown)'}:{ev.lineNumber ?? '-'}
                          </span>
                        </div>
                        <div class="text-[11px] text-sand/90 font-mono break-words leading-relaxed">
                          {ev.message}
                        </div>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>

              <!-- Right: suggestions -->
              <div class="border border-sand/20 rounded-lg p-3 bg-black/30 flex flex-col gap-3 max-h-[55vh]">
                <h3 class="text-xs font-semibold text-[#f3d471] mb-1 uppercase tracking-wide font-mono">
                  Autonomous Suggestions
                </h3>

                {#if suggestions.length === 0}
                  <p class="text-xs text-sand/50 italic py-4 text-center">
                    No suggestions available. Re-run Error Brain analysis.
                  </p>
                {:else}
                  <div class="flex-1 overflow-y-auto flex flex-col gap-2">
                    {#each suggestions as s}
                      <div class="flex flex-col gap-1.5 p-2 rounded border transition-colors {s.id === selectedSuggestionId ? 'border-[#f3d471] bg-[#f3d471]/10' : 'border-sand/20 hover:border-sand/40 bg-black/20'}">
                        <button
                          type="button"
                          class="w-full text-left cursor-pointer"
                          onclick={() => (selectedSuggestionId = s.id)}
                        >
                          <div class="flex justify-between items-center">
                            <span class="font-semibold text-xs text-white">
                              {s.title}
                            </span>
                            {#if s.confidence != null}
                              <span class="text-[10px] text-[#22c55e] font-mono font-bold">
                                {(s.confidence * 100).toFixed(0)}%
                              </span>
                            {/if}
                          </div>
                          <div class="text-[11px] text-sand/70 mt-1 leading-normal">
                            {s.explanation}
                          </div>
                          {#if s.hints && s.hints.length > 0}
                            <div class="mt-2 flex flex-wrap gap-1">
                              {#each s.hints as h}
                                <span class="inline-flex px-1.5 py-0.5 rounded bg-black/40 border border-sand/20 text-[9px] text-sand/80 font-mono">
                                  {h}
                                </span>
                              {/each}
                            </div>
                          {/if}
                        </button>

                        <!-- State buttons (dismiss, snooze) -->
                        <div class="flex gap-1.5 pt-1 border-t border-sand/10">
                          <button
                            type="button"
                            class="flex-1 text-[10px] py-1 rounded border border-sand/20 hover:border-red-400 text-sand/60 hover:text-red-300 disabled:opacity-40 cursor-pointer font-mono"
                            onclick={() => dismissSuggestion(s.id)}
                            disabled={updatingStates.has(s.id) || suggestionStates[s.id] === 'dismissed'}
                          >
                            {updatingStates.has(s.id) ? '…' : suggestionStates[s.id] === 'dismissed' ? '✓ Dismissed' : 'Dismiss'}
                          </button>
                          <button
                            type="button"
                            class="flex-1 text-[10px] py-1 rounded border border-sand/20 hover:border-amber-400 text-sand/60 hover:text-amber-300 disabled:opacity-40 cursor-pointer font-mono"
                            onclick={() => snoozeSuggestion(s.id)}
                            disabled={updatingStates.has(s.id) || suggestionStates[s.id] === 'snoozed'}
                          >
                            {updatingStates.has(s.id) ? '…' : suggestionStates[s.id] === 'snoozed' ? '⏱ Snoozed' : 'Snooze'}
                          </button>
                        </div>
                      </div>
                    {/each}
                  </div>

                  <button
                    type="button"
                    class="mt-2 w-full text-xs font-bold uppercase tracking-wider rounded bg-[#f3d471] hover:bg-[#ffe180] text-black py-2.5 transition-all shadow-[0_0_12px_rgba(243,212,113,0.3)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-mono"
                    onclick={applySelectedSuggestion}
                    disabled={!selectedSuggestionId || applying}
                  >
                    {#if applying}
                      Applying Autonomous Patch…
                    {:else}
                      Apply Selected Patch
                    {/if}
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </Dialog.Content>
    </div>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .hud-notch-tl,
  .hud-notch-tr,
  .hud-notch-bl,
  .hud-notch-br {
    position: absolute;
    width: 8px;
    height: 8px;
    pointer-events: none;
  }
  .hud-notch-tl {
    top: -1px;
    left: -1px;
    border-top: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-tr {
    top: -1px;
    right: -1px;
    border-top: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
  .hud-notch-bl {
    bottom: -1px;
    left: -1px;
    border-bottom: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-br {
    bottom: -1px;
    right: -1px;
    border-bottom: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
</style>
