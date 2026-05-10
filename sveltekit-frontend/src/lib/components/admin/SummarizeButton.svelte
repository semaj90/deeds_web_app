<!--
  SummarizeButton.svelte — drop-in "✦ Analyze" trigger for admin panels.

  Usage:

    <SummarizeButton
      panelId="reranker-status"
      panelTitle="Reranker Health"
      content={{ port: 8090, healthy: false, lastError: 'ECONNREFUSED' }}
      style="risk"
    />

  The button:
    1. Calls `adminChat.summarizePanel(spec)`.
    2. Reuses the singleton `<AiAnalysisPopup>` mounted at the layout root.
    3. Shows a tiny inline spinner while the model is thinking.
    4. Re-clicking re-analyzes (useful after panel state changes).
-->
<script lang="ts">
  import { adminChat, type SummaryStyle } from '$lib/stores/admin-chat-assistant.svelte.js';

  let {
    panelId,
    panelTitle,
    content,
    metadata = undefined,
    style = 'brief',
    persistToChat = false,
    /** "compact" = icon + label, "icon" = icon only, "label" = label only */
    variant = 'compact',
    /** Optional Tailwind classes appended to the button */
    class: extraClass = '',
  }: {
    panelId: string;
    panelTitle: string;
    content: unknown;
    metadata?: Record<string, unknown>;
    style?: SummaryStyle;
    persistToChat?: boolean;
    variant?: 'compact' | 'icon' | 'label';
    class?: string;
  } = $props();

  // Reactive view of THIS panel's slot in the store.
  const slot = $derived(adminChat.summaries[panelId] ?? null);
  const loading = $derived(slot?.loading === true);

  async function handleClick() {
    await adminChat.summarizePanel({
      panelId, panelTitle, content, metadata, style, persistToChat,
    });
  }
</script>

<button
  type="button"
  onclick={handleClick}
  disabled={loading}
  class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
          bg-zinc-900 text-emerald-400 border border-zinc-800
          hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:text-emerald-300
          disabled:opacity-60 disabled:cursor-progress ${extraClass}`}
  title={`AI analyze: ${panelTitle}`}
  aria-label={`AI analyze ${panelTitle}`}
>
  {#if loading}
    <span class="inline-block w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" aria-hidden="true"></span>
  {:else}
    <span aria-hidden="true">✦</span>
  {/if}
  {#if variant !== 'icon'}
    <span>{loading ? 'Analyzing…' : 'Analyze'}</span>
  {/if}
</button>
