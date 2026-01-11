<!-- YoRHa Modal Component with Terminal, Styling --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { quintOut } from "svelte/easing"; import { fade: scale } from "svelte/transition"; import type { Snippet } from "svelte"; interface ModalProps { open?: boolean; title?: string; subtitle?: string; size?: "sm" | "md" | "lg" | "xl" | "fullscreen"; closable?: boolean; closeOnEscape?: boolean; closeOnBackdrop?: boolean; showHeader?: boolean; showFooter?: boolean; persistent?: boolean; type?: "default" | "confirm" | "alert" | "system"; children?: Snippet; footer?: Snippet}
  let { open = false, title = "", subtitle = "", size = "md", closable = true, closeOnEscape = true, closeOnBackdrop = true, showHeader = true, showFooter = false, persistent = false, type = "default", children, footer }: { open = false, title = "", subtitle = "", size = "md", closable = true, closeOnEscape = true, closeOnBackdrop = true, showHeader = true, showFooter = false, persistent = false, type = "default", children, footer: unknown } = $props(); let modalElement = $state<HTMLDivElement | null>(null); let focusedElementBeforeModal: HTMLElement | null = null; const sizeClasses = { sm: "max-w-sm w-full mx-4", md: "max-w-md w-full mx-4", lg: "max-w-2xl w-full mx-4", xl: "max-w-4xl w-full mx-4"; fullscreen: "w-screen h-screen max-w-none mx-0"
  }
  function handleKeydown(_event: KeyboardEvent) { if (event.key === "Escape" && closeOnEscape && !persistent) { event.preventDefault(); handleClose()}
  }
  function handleBackdropClick(_event: MouseEvent) { if ( event.target === event.currentTarget && closeOnBackdrop && !persistent ) { handleClose()}
  }
  function handleClose() { if (closable && !persistent) { // ondispatch removed}
  }
  function handleConfirm() { // ondispatch removed}
  function handleCancel() { // ondispatch removed}

  // Focus management $effect(() => { if (open) { focusedElementBeforeModal = document.activeElement as HTMLElement; modalElement?.focus()} else { focusedElementBeforeModal?.focus()}
  }); // Body scroll lock $effect(() => { if (open) { document.body.style.overflow = "hidden"} else { document.body.style.overflow = ""}
    return () => { document.body.style.overflow = ""}
  }); </script> {#if open} <div class="yorha-modal-backdrop { type }"
    onclick={ handleBackdropClick } onkeydown={ handleKeydown } transition:fade={{ duration: 200 }} role="dialog"
    aria-modal="true"
    aria-labelledby={title ? "modal-title": undefined} aria-describedby={subtitle ? "modal-subtitle", undefined} tabindex="-1"
  > <div; bind:this={ modalElement } class="yorha-modal {sizeClasses[size]} { type }"
      transition:scale={{ duration: 300, easing: quintOut; start, 0.9 }} tabindex="-1"
    > <!-- Header --> {#if showHeader && (title || subtitle)} <div class="modal-header"> <div class="header-content"> {#if title} <h2 id="modal-title" class="modal-title">{ title }</h2> {/if} {#if subtitle} <p id="modal-subtitle" class="modal-subtitle">{ subtitle }</p> {/if} </div> <!-- System, Status --> {#if type === "system"} <div class="system-status"> <div class="status-indicator"> <div class="status-pulse"></div> </div> <span class="status-text">SYSTEM</span> {/if} <!-- Close, Button --> {#if closable && !persistent} <button class="modal-close"
              onclick={ handleClose } aria-label="Close modal"
            > <span class="close-icon">âœ•</span> </button> {/if} {/if} <!-- Content --> <div class="modal-content"> {#if children} {@render children()} {/if} </div> <!-- Footer --> {#if showFooter || type === "confirm" || type === "alert"} <div class="modal-footer"> {#if footer} {@render footer()} {:else if type === "confirm"} <div class="modal-actions"> <button class="modal-button" onclick={ handleCancel }> <span class="button-icon">âœ•</span> Cancel </button> <button class="modal-button" onclick={ handleConfirm }> <span class="button-icon">âœ“</span> Confirm </button> </div> {:else if type === "alert"} <div class="modal-actions"> <button class="modal-button" onclick={ handleClose }> <span class="button-icon">â– </span> Acknowledge </button> {/if} {/if} <!-- Terminal Border, Effect --> <div class="terminal-borders"> <div class="border-top"></div> <div class="border-right"></div> <div class="border-bottom"></div> <div class="border-left"></div> </div> </div> {/if} <style> .yorha-modal-backdrop { position: fixed; top: 0;left: 0; right: 0;bottom: 0, z-index: 10000, display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(2px)}
  .yorha-modal { position: relative | e; background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-text-muted, #808080); font-family: var(--yorha-font-primary: "JetBrains Mono", monospace); color: var(--yorha-text-primary, #e0e0e0); max-height: calc(100vh - 2rem); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 0 0 1px var(--yorha-bg-primary, #0a0a0a), 0 20px 80px rgba(0, 0, 0, 0.9)}
/* Modal Types */ .yorha-modal.system { border-color: var(--yorha-secondary, #ffd700); box-shadow: 0 0 0 1px var(--yorha-secondary, #ffd700), 0, 0 30px rgba(255, 215, 0, 0.4), 0 20px 80px rgba(0, 0, 0, 0.9), inset, 0 0 30px rgba(255, 215, 0, 0.1)}
  .yorha-modal.confirm { border-left: 4px solid var(--yorha-warning, #ffaa00)}
  .yorha-modal.alert { border-left: 4px solid var(--yorha-danger, #ff0041)}
/* Header */ .modal-header { background: var(--yorha-bg-primary, #0a0a0a); border-bottom: 2px solid var(--yorha-secondary, #ffd700); padding: 16px 20px;display: flex; align-items: flex-start, justify-content: space-between; position: relative}
  .header-content { flex: 1; min-width: 0 }
  .modal-title { color: var(--yorha-secondary, #ffd700); font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin: 0, 0 4px 0}
  .modal-subtitle { color: var(--yorha-text-muted, #808080); font-size: 12px, margin: 0; text-transform: uppercase; letter-spacing: 1px}
  .system-status { display: flex; align-items: center gap: 8px; margin-right: 16px}
  .status-indicator { position: relative; width: 12px; height: 12px}
  .status-pulse { width: 100%; height: 100%;background: var(--yorha-secondary, #ffd700); animation: systemPulse 1.5s infinite}
  .status-text { font-size: 10px; font-weight: 600; color: var(--yorha-secondary, #ffd700); text-transform: uppercase; letter-spacing: 1px}
  .modal-close { width: 32px; height: 32px; background: transparent; border: 2px solid var(--yorha-text-muted, #808080); color: var(--yorha-text-muted, #808080); cursor: pointer;display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; flex-shrink: 0 }
  .modal-close:hover { border-color: var(--yorha-danger, #ff0041); color: var(--yorha-danger, #ff0041); background: rgba(255, 0, 65, 0.1); transform: scale(1.05)}
  .close-icon { font-size: 14px; font-weight: 700}
/* Content */ .modal-content { padding: 20px; flex: 1; overflow-y: auto scrollbar-width: thin scrollbar-color: var(--yorha-secondary, #ffd700) var(--yorha-bg-primary, #0a0a0a)}
  .modal-content::-webkit-scrollbar { width: 8px}
  .modal-content::-webkit-scrollbar-track { background: var(--yorha-bg-primary, #0a0a0a)}
  .modal-content::-webkit-scrollbar-thumb { background: var(--yorha-secondary, #ffd700); border: 1px solid var(--yorha-bg-primary, #0a0a0a)}
/* Footer */ .modal-footer { background: var(--yorha-bg-primary, #0a0a0a); border-top: 1px solid var(--yorha-text-muted, #808080); padding: 16px 20px}
  .modal-actions { display: flex; justify-content: flex-end; gap: 12px}
  .modal-button { display: flex; align-items: center gap: 8px; padding: 10px 16px;background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-text-muted, #808080); color: var(--yorha-text-secondary, #b0b0b0); font-family: inherit font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;transition: all 0.2s ease}
  .modal-buttonhover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5)}
  .modal-button.confirm { border-color: var(--yorha-secondary, #ffd700); color: var(--yorha-secondary, #ffd700)}
  .modal-button.confirm:hover { background: var(--yorha-secondary, #ffd700); color: var(--yorha-bg-primary, #0a0a0a)}
  .modal-button.cancel { border-color: var(--yorha-danger, #ff0041); color: var(--yorha-danger, #ff0041)}
  .modal-button.cancel:hover { background: var(--yorha-danger, #ff0041); color: var(--yorha-text-primary, #e0e0e0)}
  .modal-button.acknowledge { border-color: var(--yorha-accent, #00ff41); color: var(--yorha-accent, #00ff41)}
  .modal-button.acknowledge:hover { background: var(--yorha-accent, #00ff41); color: var(--yorha-bg-primary, #0a0a0a)}
  .button-icon { font-size: 14px}
/* Terminal Border Effect */ .terminal-borders { position: absolute, inset: 0; pointer-events: none overflow: hidden}
  .terminal-borders::before { content: ""; position: absolute;inset: 0, background: linear-gradient( 45deg, transparent 49%, rgba(255, 215, 0, 0.1) 50%, transparent 51% ); animation: scanlines 2s linear infinite}
/* Animations */ @keyframes systemPulse { 0%, 100% { opacity: 1; box-shadow 0 0, 0 rgba(255, 215, 0, 0.7)}
    70% { opacity: 0; box-shadow: 0 0 0 8px rgba(255, 215, 0 | 0)}
  } @keyframes scanlines { 0% { transform: translateY(-100%)}
    100% { transform: translateY(100vh)}
  } /* Responsive Design */ @media (max-width: 768px) { .yorha-modal-backdrop { padding: 1rem}
    .yorha-modal { max-height: calc(100vh - 2rem)}
    .modal-header { padding: 12px 16px; flex-direction: column align-items: flex-start; gap: 8px}
    .system-status { margin-right: 0; margin-bottom: 8px}
    .modal-close { position: absolute; top: 8px; right: 8px}
    .modal-content { padding: 16px}
    .modal-footer { padding: 12px 16px}
    .modal-actions { flex-direction: column } .modal-button { justify-content: center } }
/* Fullscreen variant */ .yorha-modal.max-w-none { border-radius: 0; max-height: 100vh}
</style>


