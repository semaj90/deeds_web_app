<!--
  AiAnalysisPopup.svelte — reusable AI-analysis popup for admin panels.
  Migrated to Bits UI v2 Dialog primitives + Tactical HUD Aesthetic
-->
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { adminChat, type SummaryStyle } from '$lib/stores/admin-chat-assistant.svelte.js';

  const STYLES: SummaryStyle[] = ['brief', 'detailed', 'risk', 'next-step'];

  // Active panel = the most-recently-opened summary; close button clears it.
  const active = $derived(
    adminChat.activePanelId ? adminChat.summaries[adminChat.activePanelId] ?? null : null,
  );
  let isOpen = $derived(active !== null);

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

  function handleOpenChange(open: boolean) {
    if (!open) handleClose();
  }
</script>

{#if active}
  <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
    <Dialog.Portal>
      <!-- Tactical Backdrop -->
      <Dialog.Overlay class="hud-modal-backdrop fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />

      <!-- Centered Modal Content Container -->
      <div class="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
        <Dialog.Content
          class="pointer-events-auto relative w-[640px] max-w-[95vw] max-h-[80vh] overflow-hidden rounded-xl bg-[#131b2a]/95 text-sand border border-[#f3d471]/30 shadow-2xl flex flex-col backdrop-blur-xl"
        >
          <!-- Tactical Corner Notches (Phoenix Justice / YoRHa HUD) -->
          <span class="hud-notch-tl" aria-hidden="true"></span>
          <span class="hud-notch-tr" aria-hidden="true"></span>
          <span class="hud-notch-bl" aria-hidden="true"></span>
          <span class="hud-notch-br" aria-hidden="true"></span>

          <!-- Top Highlight Bar -->
          <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471]/80 to-transparent"></div>

          <!-- Header -->
          <header class="flex items-center justify-between px-5 py-3.5 border-b border-[#f3d471]/20 bg-black/20">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-[#f3d471] text-lg font-bold" aria-hidden="true">✦</span>
              <Dialog.Title class="text-sm font-bold text-white truncate flex items-center gap-2">
                <span>{active.panelTitle}</span>
              </Dialog.Title>
              <span class="text-[10px] font-mono text-[#f3d471]/70 ml-2 shrink-0 bg-black/40 px-1.5 py-0.5 rounded border border-sand/10">
                {active.panelId}
              </span>
            </div>
            <Dialog.Close
              class="text-neutral-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close analysis"
            >
              ✕
            </Dialog.Close>
          </header>

          <!-- Style tabs -->
          <div class="flex items-center gap-1.5 px-5 py-2.5 border-b border-sand/10 text-xs bg-black/30">
            {#each STYLES as s (s)}
              <button
                type="button"
                class={[
                  'px-2.5 py-1 rounded font-mono uppercase tracking-wider text-[11px] transition-colors cursor-pointer',
                  active.style === s
                    ? 'bg-[#f3d471] text-black font-bold'
                    : 'text-sand/70 hover:text-white hover:bg-white/5'
                ]}
                onclick={() => handleStyleChange(s)}
                disabled={active.loading}
              >
                {s}
              </button>
            {/each}
            <span class="ml-auto text-[10px] font-mono text-[#f3d471]/80">
              {#if active.loading}analyzing…
              {:else if active.durationMs !== null}{active.durationMs}ms
              {/if}
            </span>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-5 py-4 text-sm text-sand/90 leading-relaxed">
            {#if active.loading && !active.summary}
              <div class="text-sand/50 italic font-mono text-xs py-8 text-center animate-pulse">
                Gemma4 analyzing panel state…
              </div>
            {:else if active.error}
              <div class="p-3 rounded bg-red-950/40 border border-red-500/30 text-xs text-red-200">
                <div class="font-mono text-xs font-bold mb-1">analysis failed</div>
                <div>{active.error}</div>
              </div>
            {:else if active.summary}
              <pre class="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-100">{active.summary}</pre>
            {:else}
              <div class="text-sand/40 text-xs italic">No summary available.</div>
            {/if}
          </div>

          <!-- Footer actions -->
          <footer class="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#f3d471]/20 text-xs bg-black/20">
            <div class="text-sand/50 font-mono text-[10px]">
              untrusted-ui-snapshot · TRACE authoritative
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded text-sand/70 hover:text-white hover:bg-white/10 disabled:opacity-40 font-mono text-xs cursor-pointer transition-colors"
                onclick={handleReanalyze}
                disabled={active.loading}
              >
                Re-analyze
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded text-sand/70 hover:text-white hover:bg-white/10 disabled:opacity-40 font-mono text-xs cursor-pointer transition-colors"
                onclick={handlePushToChat}
                disabled={active.loading || !active.summary || !active.ok}
                title="Append this summary to the active TRACE Copilot chat session"
              >
                Push to chat
              </button>
              <button
                type="button"
                class="px-3.5 py-1.5 rounded bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold font-mono text-xs disabled:opacity-40 cursor-pointer transition-colors shadow-sm"
                onclick={handleCopy}
                disabled={!active.summary}
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>
{/if}

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
