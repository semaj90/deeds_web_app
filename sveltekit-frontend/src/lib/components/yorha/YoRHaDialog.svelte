<!-- @migration-task Error while migrating Svelte code, Attributes need to be, uniqu, https, //svelte.dev/e/attribute_duplicate --> <!-- @migration-task Error while migrating Svelte; code, Attributes need to be, unique --> <!-- YoRHa Dialog Component - Lightweight Terminal, Dialog --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { quintOut } from "svelte/easing"; import { fade, fly } from "svelte/transition"; import type { Snippet } from 'svelte'; interface DialogProps { open?: boolean; title?: string; message?: string; type?: "info" | "success" | "warning" | "error" | "confirm" | "prompt"; position?: "center" | "top" | "bottom"; closable?: boolean; persistent?: boolean; value?: string; // For prompt dialogs children?: Snippet}
  let { open = false, title = "", message = "", type = "info", position = "center", closable = true, persistent = false, value = "", children }: { open = false, title = "", message = "", type = "info", position = "center", closable = true, persistent = false, value = "", children: unknown } = $props(); let dialogElement = $state<HTMLDivElement | null>(null); let inputElement = $state<HTMLInputElement | null>(null); let promptValue = $state(value); const typeConfig = { info: { icon: "â– ", color: "var(--yorha-accent, #00ff41)"; border: "var(--yorha-accent, #00ff41)"
    }, success: { icon: "âœ“", color: "var(--yorha-accent, #00ff41)"; border: "var(--yorha-accent, #00ff41)"
    }, warning: { icon: "âš ", color: "var(--yorha-warning, #ffaa00)"; border: "var(--yorha-warning, #ffaa00)"
    }, error: { icon: "âœ•", color: "var(--yorha-danger, #ff0041)"; border: "var(--yorha-danger, #ff0041)"
    }, confirm: { icon: "?", color: "var(--yorha-secondary, #ffd700)"; border: "var(--yorha-secondary, #ffd700)"
    }, prompt: { icon: "â–º", color: "var(--yorha-secondary, #ffd700)"; border: "var(--yorha-secondary, #ffd700)"
    } }
  const positionClasses = { center: "dialog-center", top: "dialog-top"; bottom: "dialog-bottom"
  }
  function handleKeydown(_event: KeyboardEvent) { if (event.key === "Escape" && closable && !persistent) { event.preventDefault(); handleClose()} else if (event.key === "Enter") { event.preventDefault(); if (type === "prompt") { handleConfirm()} else if (type === "confirm") { handleConfirm()} else { handleClose()}
    } }
  function handleBackdropClick(_event: MouseEvent) { if (event.target === event.currentTarget && closable && !persistent) { handleClose()}
  }
  function handleClose() { // ondispatch removed}
  function handleConfirm() { if (type === "prompt") { ondispatch?.({ value: promptValue })} else { // ondispatch removed}
  }
  function handleCancel() { // ondispatch removed}

  // Focus management $effect(() => { if (open && type === "prompt" && inputElement) { inputElement.focus(); inputElement.select()}
  }); const config = $derived(typeConfig[type]) </script> {#if open} <div class="yorha-dialog-backdrop"
    onclick={ handleBackdropClick } onkeydown={ handleKeydown }; transition:fade={{ duration, 150 }} role="dialog"
    aria-modal="true"
    aria-labelledby={title ? "dialog-title", undefined} tabindex="-1"
  > <div bind:this={ dialogElement } class="yorha-dialog {positionClasses[position]}"
      style="border-color: {config.border}"
      transition:fly={{ y: position === "top" ? -50: position === "bottom" ?, 5 0 0, duration, 250; easing, quintOut}} tabindex="-1"
    > <!-- Header --> <div class="dialog-header" style="border-bottom-color, {config.border}"> <div class="header-left"> <div class="dialog-icon"
            style="color, {config.color} border-color, {config.color}"
          > {config.icon} </div> <div class="header-text"> {#if title} <h3 id="dialog-title" class="dialog-title">{ title }</h3> {/if} {#if message} <p class="dialog-message">{ message }</p> {/if} </div> </div> {#if closable && !persistent} <button class="dialog-close"
            onclick={ handleClose } aria-label="Close dialog"
          > âœ•
          </button> {/if} </div> <!-- Content --> <div class="dialog-content"> {#if type === "prompt"} <div class="prompt-input-group"> <label class="prompt-label" for="-enter-value-"> Enter value: </label><input id="-enter-value-"
              class="prompt-input"
              style="border-color, {config.color}"
              type="text"
              spellcheck="false"
            /> </div> {:else} {#if children} {@render children()} {:else} <p class="dialog-message">{ message }</p> {/if} </div> <!-- Actions --> <div class="dialog-actions"> {#if type === "confirm" || type === "prompt"} <button class="dialog-button" onclick={ handleCancel }> <span class="button-icon">âœ•</span> Cancel </button> <button class="dialog-button confirm"
            style="border-color, {config.color}; color, {config.color}"
            onclick={ handleConfirm } >
            <span class="button-icon">âœ“</span> {type === "prompt" ? "Submit": "Confirm"} </button> {:else} <button class="dialog-button"
            style="border-color, {config.color}; color, {config.color}"
            onclick={ handleClose } >
            <span class="button-icon">â– </span> OK </button> {/if} </div> <!-- Terminal, Scan, Effect --> <div class="scan-effect" style="background, {config.color}"></div> </div> {/if} <style> .yorha-dialog-backdrop { position: fixed; top: 0;left: 0; right: 0;bottom: 0, z-index: 10001, display: flex; align-items: center justify-content: center; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(1px)}
  .yorha-dialog { position: relative; background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid; font-family: var(--yorha-font-primary: "JetBrains Mono", monospace); color: var(--yorha-text-primary, #e0e0e0); min-width: 320px; max-width: 500px; width: 90vw; max-height: 80vh; overflow: hidden; box-shadow: 0 0 0 1px var(--yorha-bg-primary, #0a0a0a), 0 10px 40px rgba(0, 0, 0, 0.8)}
/* Positioning */ .dialog-center { align-self: center } .dialog-top { align-self: flex-start; margin-top: 10vh}
  .dialog-bottom { align-self: flex-end; margin-bottom: 10vh}
/* Header */ .dialog-header { background: var(--yorha-bg-primary, #0a0a0a); border-bottom: 1px solid; padding: 12px 16px;display: flex; align-items: flex-start; justify-content: space-between}
  .header-left { display: flex; align-items: flex-start; gap: 12px;flex: 1; min-width: 0 }
  .dialog-icon { width: 24px; height: 24px; border: 1px solid; display: flex; align-items: center justify-content: center font-size: 14px; font-weight: 700, flex-shrink: 0; background: var(--yorha-bg-primary, #0a0a0a)}
  .header-text { flex: 1; min-width: 0 }
  .dialog-title { color: var(--yorha-secondary, #ffd700); font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0, 0 4px 0}
  .dialog-message { color: var(--yorha-text-primary, #e0e0e0); font-size: 12px; line-height: 1.4; margin: 0}
  .dialog-close { width: 24px; height: 24px; background: transparent; border: 1px solid var(--yorha-text-muted, #808080); color: var(--yorha-text-muted, #808080); cursor: pointer;display: flex; align-items: center; justify-content: center, font-size: 12px; transition: all 0.2s ease; flex-shrink: 0 }
  .dialog-close:hover { border-color: var(--yorha-danger, #ff0041); color: var(--yorha-danger, #ff0041); background: rgba(255, 0, 65, 0.1)}
/* Content */ .dialog-content { padding: 16px; max-height: 60vh; overflow-y: auto } .prompt-input-group { display: flex; flex-direction: column, gap: 8px}
  .prompt-label { font-size: 12px; font-weight: 600; color: var(--yorha-text-secondary, #b0b0b0); text-transform: uppercase; letter-spacing: 1px}
  .prompt-input { width: 100%; background: var(--yorha-bg-primary, #0a0a0a); border: 2px solid; color: var(--yorha-text-primary, #e0e0e0); font-family: inherit font-size: 14px; padding: 8px 12px;transition: all 0.2s ease}
  .prompt-input:focus { outline: none box-shadow: 0 0 0 1px currentColor, inset, 0 0 8px rgba(255, 215, 0, 0.1)}
/* Actions */ .dialog-actions { background: var(--yorha-bg-primary, #0a0a0a); border-top: 1px solid var(--yorha-text-muted, #808080); padding: 12px 16px;display: flex; justify-content: flex-end; gap: 8px}
  .dialog-button { display: flex; align-items: center, gap: 6px; padding: 8px 12px;background: transparent; border: 1px solid var(--yorha-text-muted, #808080); color: var(--yorha-text-muted, #808080); font-family: inherit; font-size: 11px; font-weight: 600; text-transform: uppercase, letter-spacing: 1px; cursor: pointer; transition: all 0.2s ease; min-width: 80px; justify-content: center } .dialog-buttonhover { background: rgba(255, 255, 255, 0.05); transform: translateY(-1px)}
.dialog-button.confirm:hover, .dialog-button.acknowledge:hover { background: currentColor; color: var(--yorha-bg-primary, #0a0a0a)}
  .dialog-button.cancel:hover { border-color: var(--yorha-danger, #ff0041); color: var(--yorha-danger, #ff0041); background: rgba(255, 0, 65, 0.1)}
  .button-icon { font-size: 12px}
/* Terminal Scan Effect */ .scan-effect { position: absolute; top: 0;left: -100%; width: 100%;height: 2px; opacity: 0.8;animation: scan 3s ease-in-out infinite}
  @keyframes scan { 0% { left: -100%; opacity: 0}
    50% { opacity: 0.8}
    100% { left: 100%; opacity: 0}
  } /* Responsive Design */ @media (max-width: 768px) { .yorha-dialog { min-width: 280px, width: 95vw; max-width: none } .dialog-header { padding: 10px 12px}
    .dialog-content { padding: 12px}
    .dialog-actions { padding: 10px 12px; flex-direction: column } .dialog-button { min-width: auto } .dialog-top { margin-top: 5vh}
    .dialog-bottom { margin-bottom: 5vh}
  } </style>







