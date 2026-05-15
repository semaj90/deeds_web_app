<!--
  AiAnalysisPopup.svelte — reusable AI-analysis popup for admin panels.

  Pattern (mount once at the layout root):

    <script>
      import AiAnalysisPopup from '$lib/components/admin/AiAnalysisPopup.svelte';
    </script>
    <AiAnalysisPopup />

  Then any panel triggers a summary via the adminChat store:

    import { adminChat } from '$lib/stores/admin-chat-assistant.svelte.js';
    adminChat.summarizePanel({ panelId: 'reranker-status', panelTitle: 'Reranker Health',
                               content: { ports: 8090, healthy: false, lastError: 'ECONNREFUSED' } });

  The popup renders the active summary, supports style swap (brief / detailed /
  risk / next-step), Re-analyze, copy to clipboard, persist to chat, and close.
-->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { adminChat, type SummaryStyle } from '$lib/stores/admin-chat-assistant.svelte.js';

  const STYLES: SummaryStyle[] = ['brief', 'detailed', 'risk', 'next-step'];

  // Active panel = the most-recently-opened summary; close button clears it.
  const active = $derived(
    adminChat.activePanelId ? adminChat.summaries[adminChat.activePanelId] ?? null : null,
  );
  const isOpen = $derived(active !== null);

  let copied = $state(false);

  async function handleCopy() {
    if (!active?.summary) return;
    try {
      await navigator.clipboard.writeText(active.summary);
      copied = true;
      setTimeout(() => (copied = false), 1200);
    } catch { /* clipboard blocked — non-fatal */ }
  }

  async function handleStyleChange(s: SummaryStyle) {
    if (!active || s === active.style) return;
    await adminChat.summarizePanel({ ...active.spec, style: s });
  }

  async function handleReanalyze() {
    if (!active) return;
    await adminChat.summarizePanel(active.spec);
  }

  async function handlePushToChat() {
    if (!active) return;
    await adminChat.summarizePanel({ ...active.spec, persistToChat: true });
  }

  function handleClose() {
    if (active) adminChat.closeSummary(active.panelId);
  }

  function handleBackdropKey(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }
</script>

{#if isOpen && active}
  <div
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    onclick={handleClose}
    onkeydown={handleBackdropKey}
    role="dialog"
    aria-modal="true"
    aria-labelledby="ai-analysis-title"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="w-[640px] max-w-[95vw] max-h-[80vh] overflow-hidden rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col"
      transition:scale={{ duration: 180, start: 0.95 }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <header class="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-emerald-500 text-lg" aria-hidden="true">✦</span>
          <h2 id="ai-analysis-title" class="text-sm font-semibold text-zinc-100 truncate">
            {active.panelTitle}
          </h2>
          <span class="text-[10px] font-mono text-zinc-600 ml-2 shrink-0">
            {active.panelId}
          </span>
        </div>
        <button
          type="button"
          class="text-zinc-500 hover:text-zinc-200 text-lg leading-none px-2"
          onclick={handleClose}
          aria-label="Close analysis"
        >×</button>
      </header>

      <!-- Style tabs -->
      <div class="flex items-center gap-1 px-5 py-2 border-b border-zinc-900 text-xs">
        {#each STYLES as s (s)}
          <button
            type="button"
            class="px-2.5 py-1 rounded-md transition-colors"
            class:bg-emerald-500={active.style === s}
            class:text-black={active.style === s}
            class:text-zinc-500={active.style !== s}
            class:hover:text-zinc-200={active.style !== s}
            onclick={() => handleStyleChange(s)}
            disabled={active.loading}
          >
            {s}
          </button>
        {/each}
        <span class="ml-auto text-[10px] font-mono text-zinc-600">
          {#if active.loading}analyzing…
          {:else if active.durationMs !== null}{active.durationMs}ms
          {/if}
        </span>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-4 text-sm text-zinc-200 leading-relaxed">
        {#if active.loading && !active.summary}
          <div class="text-zinc-500 italic">Gemma4 analyzing panel state…</div>
        {:else if active.error}
          <div class="text-red-400">
            <div class="font-mono text-xs mb-2">analysis failed</div>
            <div>{active.error}</div>
          </div>
        {:else if active.summary}
          <pre class="whitespace-pre-wrap font-sans">{active.summary}</pre>
        {:else}
          <div class="text-zinc-500">No summary yet.</div>
        {/if}
      </div>

      <!-- Footer actions -->
      <footer class="flex items-center justify-between gap-2 px-5 py-3 border-t border-zinc-800 text-xs">
        <div class="text-zinc-600 font-mono">
          untrusted-ui-snapshot · TRACE backend authoritative
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 disabled:opacity-40"
            onclick={handleReanalyze}
            disabled={active.loading}
          >
            Re-analyze
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 disabled:opacity-40"
            onclick={handlePushToChat}
            disabled={active.loading || !active.summary || !active.ok}
            title="Append this summary to the active TRACE Copilot chat session"
          >
            Push to chat
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md text-emerald-400 hover:text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40"
            onclick={handleCopy}
            disabled={!active.summary}
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}
