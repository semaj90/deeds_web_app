<script lang="ts">
  /**
   * Context Confirmation Modal
   *
   * Shows a proposed context from chat history and asks the user:
   * "Is this the one you meant?"
   *
   * Migrated to Bits UI v2 Dialog primitives with Phoenix Justice / YoRHa styling.
   */
  import { Dialog } from 'bits-ui';

  interface ContextData {
    context_id: string;
    source: string;
    score: number;
    snippet: string;
    range?: { from_msg_id: number; to_msg_id: number };
    timestamp?: string;
  }

  interface Props {
    context: ContextData;
    hint?: string | null;
    open?: boolean;
    onclose?: () => void;
    onaccept?: (detail: { comment: string }) => void;
    onreject?: (detail: { comment: string }) => void;
  }

  let {
    context,
    hint = null,
    open = $bindable(true),
    onclose,
    onaccept = undefined,
    onreject = undefined
  }: Props = $props();

  let userComment = $state('');
  let isSubmitting = $state(false);

  function close() {
    open = false;
    onclose?.();
  }

  async function accept() {
    isSubmitting = true;
    if (onaccept) {
      onaccept({ comment: userComment });
    }
    isSubmitting = false;
    close();
  }

  async function reject() {
    isSubmitting = true;
    if (onreject) {
      onreject({ comment: userComment });
    }
    isSubmitting = false;
    close();
  }

  function formatScore(score: number): string {
    return (score * 100).toFixed(1);
  }
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) close(); }}>
  <Dialog.Portal>
    <Dialog.Overlay class="ccm-backdrop" />
    <Dialog.Content class="ccm-panel">
      <!-- Tactical Corner Notches -->
      <div class="hud-notch-tl" aria-hidden="true"></div>
      <div class="hud-notch-tr" aria-hidden="true"></div>
      <div class="hud-notch-bl" aria-hidden="true"></div>
      <div class="hud-notch-br" aria-hidden="true"></div>

      <!-- Top accent gradient -->
      <div class="ccm-top-line" aria-hidden="true"></div>

      <!-- Header -->
      <div class="ccm-header">
        <div class="flex justify-between items-start w-full gap-4">
          <div>
            <div class="text-[10px] uppercase font-mono tracking-widest text-[#f3d471] mb-1">
              Context Resolution Protocol
            </div>
            <Dialog.Title class="font-bold text-base tracking-wide text-white">
              Possible Previous Context
            </Dialog.Title>
            <Dialog.Description class="text-xs text-sand/70 mt-0.5">
              I found a likely match in your chat history. Is this what you meant?
            </Dialog.Description>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[10px] uppercase font-mono tracking-wider text-sand/60">
              {context.source}
            </div>
            <div class="text-sm font-bold text-[#f3d471] font-mono mt-0.5">
              {formatScore(context.score)}% match
            </div>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="ccm-body space-y-4">
        <!-- Hint -->
        {#if hint}
          <div class="text-xs text-[#7ee7ff] bg-black/40 rounded px-3 py-2 border-l-2 border-[#7ee7ff]">
            {hint}
          </div>
        {/if}

        <!-- Snippet -->
        <div class="border border-[#bad0ff]/15 rounded bg-black/40 p-3 max-h-56 overflow-auto">
          <pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-zinc-200">{context.snippet}</pre>
        </div>

        <!-- Metadata -->
        {#if context.range}
          <div class="text-[11px] font-mono text-sand/60 space-y-1">
            <div>
              <span class="opacity-60">Message range:</span>
              <span class="text-white ml-1">
                {context.range.from_msg_id}–{context.range.to_msg_id}
              </span>
            </div>
            {#if context.timestamp}
              <div>
                <span class="opacity-60">Timestamp:</span>
                <span class="text-white ml-1">{context.timestamp}</span>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Optional comment -->
        <div class="space-y-1.5">
          <label for="user-comment" class="text-[11px] font-mono uppercase tracking-wider text-sand/70 block">
            Optional clarification comment
          </label>
          <textarea
            id="user-comment"
            bind:value={userComment}
            placeholder="e.g., 'Yes, but I meant the earlier section' or 'No, I was asking about something else'"
            class="w-full bg-black/50 border border-sand/30 focus:border-[#f3d471] focus:outline-none rounded p-2.5 text-xs text-white placeholder:text-zinc-500 font-mono"
            rows="2"
          ></textarea>
        </div>
      </div>

      <!-- Actions -->
      <div class="ccm-footer">
        <button
          type="button"
          class="px-4 py-2 text-xs font-mono uppercase text-sand/70 hover:text-white border border-sand/30 hover:border-sand/60 rounded transition-colors"
          onclick={reject}
          disabled={isSubmitting}
        >
          No, that's not it
        </button>
        <button
          type="button"
          class="px-5 py-2 text-xs font-mono uppercase bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold rounded transition-colors shadow-[0_0_10px_rgba(243,212,113,0.3)] disabled:opacity-50"
          onclick={accept}
          disabled={isSubmitting}
        >
          {#if isSubmitting}
            <span class="animate-spin inline-block mr-1">⏳</span>
          {/if}
          Yes, use this
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.ccm-backdrop) {
    position: fixed; inset: 0; z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(4, 7, 14, 0.85); backdrop-filter: blur(12px) saturate(1.15); padding: 1rem;
    animation: ccmFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  :global(.ccm-panel) {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 10001;
    width: min(40rem, calc(100vw - 2rem)); max-height: 88vh;
    display: flex; flex-direction: column;
    background: linear-gradient(180deg, rgba(18, 24, 36, 0.98) 0%, rgba(9, 13, 20, 0.99) 100%);
    border: 1px solid rgba(243, 212, 113, 0.32);
    border-radius: 8px; box-shadow: 0 0 0 1px rgba(243, 212, 113, 0.08), 0 28px 70px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(243, 212, 113, 0.1);
    backdrop-filter: blur(20px); overflow: hidden;
    animation: ccmScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ccm-top-line {
    position: absolute; top: 0; left: 1.5rem; right: 1.5rem; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(243, 212, 113, 0.9), rgba(126, 231, 255, 0.6), transparent);
    pointer-events: none; z-index: 2;
  }

  .hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
    position: absolute; width: 8px; height: 8px; pointer-events: none; z-index: 3;
  }
  .hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #f3d471; border-left: 2px solid #f3d471; }
  .hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #f3d471; border-right: 2px solid #f3d471; }
  .hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #f3d471; border-left: 2px solid #f3d471; }
  .hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #f3d471; border-right: 2px solid #f3d471; }

  .ccm-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(243, 212, 113, 0.2);
    background: rgba(0, 0, 0, 0.35); flex-shrink: 0;
    position: relative; z-index: 1;
  }

  .ccm-body {
    padding: 1.5rem; overflow-y: auto; flex: 1;
  }
  .ccm-body::-webkit-scrollbar { width: 6px; }
  .ccm-body::-webkit-scrollbar-thumb { background: rgba(243, 212, 113, 0.18); border-radius: 3px; }

  .ccm-footer {
    padding: 1rem 1.5rem; border-top: 1px solid rgba(243, 212, 113, 0.15);
    background: rgba(0, 0, 0, 0.35); flex-shrink: 0;
    display: flex; justify-content: flex-end; gap: 0.75rem;
  }

  @keyframes ccmFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ccmScale { from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
</style>
