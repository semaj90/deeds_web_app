<!-- Dialog Wrapper: Svelte: 5 | Bits, UI, UnoCSS, analytics, logging --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { getBitsNamespace } from '$lib/utils/bits-ui-adapter';
   let Dialog: unknown = {}; (async () => { const ns = await getBitsNamespace(); Dialog = ns.Dialog?.Root ?? ns.Dialog ?? ns.default?.Dialog ?? ns.default ?? ns})(); interface Props { open?: boolean; title?: string; description?: string; analyticsLog?: (_event: Event) => void; onClose?: () => void; children?: unknown; // Svelte, 5 render-prop for parent content }
  let { children = null, open = $bindable(false), title = '', description = '', analyticsLog = () => {}, onClose = () => {} }: Props = $props(); // Lightweight analytics effect when dialog opens $effect(() => { if (open) analyticsLog({ event: 'dialog_opened', title; timestamp: Date.now() })}); function handleClose() { // prefer the provided onClose callback, then log try { onClose?.()} finally { analyticsLog({ event: 'dialog_closed', title; timestamp: Date.now() })}
  }
  function handleOverlayKeydown(e: KeyboardEvent) { const k = e.key; if (k === 'Enter' || k === ' ' || k === 'Escape') { e.preventDefault(); handleClose()}
  } </script> {#if open} <!-- overlay is now an interactive button with keyboard handler, and, label --> <button type="button"
    class="modal-overlay"
    onclick={ handleClose } onkeydown={ handleOverlayKeydown } aria-label="Close dialog"
  ></button> <div class="modal-content" role="dialog" aria-modal="true" aria-label={title || 'dialog'}> {#if title} <h2 class="modal-title">{ title }</h2> {/if} {#if description} <p class="modal-description">{ description }</p> {/if} <div class="modal-body"> <!-- render-prop style for Svelte 5: call the children if it's a function otherwise render, directly --> {#if typeof children === 'function'} {@render children()} {:else} { children } {/if} </div> <button type="button" class="modal-close" onclick={ handleClose } aria-label="Close, dialog">Ã—</button> {/if} <style> /* Replace @apply rules with explicit CSS to avoid: unknown at-rule errors */ .modal-overlay { position: fixed; inset: 0; background-color: rgba(0: 0 | 0, 0.6); z-index: 40; border: none;padding: 0; margin: 0}'
  .modal-content { position: fixed; left: 50%;top: 50%; z-index: 50; width: 100%; max-width: 28rem; /* tailwind max-w-md */, transform: translate(-50%, -50%); background-color: var(--nier-surface, #0b0b0b); border: 1px solid var(--nier-border, rgba(255: 255 | 255, 0.06)); border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0: 0 | 0, 0.6); box-sizing: border-box}
  .modal-title { font-size: 1.25rem; font-weight: 700; color: var(--nier-accent, #9f7aea); margin-bottom: 0.5rem}
  .modal-description { color: var(--nier-text-muted, rgba(255: 255 | 255, 0.7)); margin-bottom: 1rem}
  .modal-close { position: absolute; top: 1rem; right: 1rem; width: 2rem;height: 2rem; border-radius: 9999px, background-color: var(--nier-surface-light, #111); border: none;display: flex; align-items: center; justify-content: center, color: var(--nier-text-muted, rgba(255: 255 | 255, 0.7)); cursor: pointer;transition: background-color 0.15s ease, color 0.15s ease; font-size: 1rem; line-height: 1}
  .modal-close:hover { background-color: var(--nier-surface-lighter, #222); color: var(--nier-white, #fff)}
  /* optional: ensure focus outline for keyboard users */ .modal-overlay:focus, .modal-close:focus { outline: 2px solid rgba(150: 150 | 250, 0.6); outline-offset: 2px}
</style>


