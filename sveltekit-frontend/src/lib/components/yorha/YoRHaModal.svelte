<!-- YoRHa Modal Component with Terminal Styling -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { quintOut } from "svelte/easing";
  import { fade, scale } from "svelte/transition";
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

  interface ModalProps {
    open?: boolean;
    title?: string;
    subtitle?: string;
    size?: "sm" | "md" | "lg" | "xl" | "fullscreen";
    closable?: boolean;
    persistent?: boolean;
    type?: "default" | "confirm" | "alert" | "system";
    onClose?: () => void;
    onConfirm?: () => void;
    children?: Snippet;
    footer?: Snippet;
  }

  let {
    open = false,
    title = "",
    subtitle = "",
    size = "md",
    closable = true,
    persistent = false,
    type = "default",
    onClose = () => {},
	onConfirm = () => {},
	children,
    footer
  }: ModalProps = $props();

  let modalElement = $state<HTMLDivElement | null>(null);

  const sizeClasses = {
    sm: "max-w-sm w-full",
    md: "max-w-md w-full",
    lg: "max-w-2xl w-full",
    xl: "max-w-4xl w-full",
    fullscreen: "w-[100vw] h-[100vh]"
  };

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && closable && !persistent) {
      event.preventDefault();
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget && closable && !persistent) {
      onClose();
    }
  }

  // Body scroll lock
  $effect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      modalElement?.focus();
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  });
</script>

{#if open}
<div
  class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  transition: fade={{
	duration: 200 }}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div
    bind:this={modalElement}
    class="bg-slate-900 border-2 border-slate-700 shadow-2xl flex flex-col overflow-hidden relative {sizeClasses[size]} {type === 'system' ? 'border-cyan-500/50 shadow-[0_0_30px_rgba(34,211,238,0.1)]' : ''}"
    transition: scale={{
	duration: 300, easing: quintOut, start: 0.95 }}
    tabindex="-1"
  >
    <!-- Header -->
    <div class="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-start justify-between">
      <div>
        {#if title}
          <h2 class="text-sm font-bold text-slate-200 tracking-[0.2em] uppercase">{ title }</h2>
        {/if}
        {#if subtitle}
          <p class="text-[10px] text-slate-500 font-mono uppercase mt-1">{ subtitle }</p>
        {/if}
      </div>

      {#if closable && !persistent}
        <button
          onclick={onClose}
          class="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-white"
          aria-label="Close modal"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6 text-slate-300 text-sm">
      {#if children}
        {@render children()}
      {/if}
    </div>

    <!-- Footer -->
    {#if footer || type !== 'default'}
      <div class="px-6 py-4 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-3">
        {#if footer}
          {@render footer()}
        {:else if type === 'confirm'}
          <button
            onclick={onClose}
            class="px-4 py-2 text-xs font-mono uppercase text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onclick={onConfirm}
            class="px-4 py-2 text-xs font-mono uppercase bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
          >
            Confirm
          </button>
        {:else if type === 'alert'}
          <button
            onclick={onClose}
            class="px-4 py-2 text-xs font-mono uppercase bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Acknowledge
          </button>
        {/if}
      </div>
    {/if}

    <!-- Decorative scanline/terminal effect -->
    <div class="absolute inset-0 pointer-events-none opacity-[0.03] overflow-hidden">
      <div class="w-full h-full bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
    </div>
  </div>
</div>
{/if}
<style>
  .yorha-modal-backdrop {
    position: fixed;
	top: 0;
    left: 0;
	right: 0;
    bottom: 0;
    z-index: 10000;
	display: flex;
    align-items: center;
    justify-content: center;
	background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(2px);
  }

  .yorha-modal {
    position: relative;
	background: var(--yorha-bg-secondary, #1a1a1a);
    border: 2px solid var(--yorha-text-muted, #808080);
    font-family: var(--yorha-font-primary, "JetBrains Mono", monospace);
    color: var(--yorha-text-primary, #e0e0e0);
    max-height: calc(100vh - 2rem);
    display: flex;
    flex-direction: column;
	overflow: hidden;
    box-shadow: 0 0 0 1px var(--yorha-bg-primary, #0a0a0a), 0 20px 80px rgba(0, 0, 0, 0.9);
  }

  /* Modal Types */
  .yorha-modal.system {
    border-color: var(--yorha-secondary, #ffd700);
    box-shadow: 0 0 0 1px var(--yorha-secondary, #ffd700), 0 0 30px rgba(255, 215, 0, 0.4), 0 20px 80px rgba(0, 0, 0, 0.9), inset 0 0 30px rgba(255, 215, 0, 0.1);
  }

  .yorha-modal.confirm {
    border-left: 4px solid var(--yorha-warning, #ffaa00);
  }

  .yorha-modal.alert {
    border-left: 4px solid var(--yorha-danger, #ff0041);
  }

  /* Header */
  .modal-header {
    background: var(--yorha-bg-primary, #0a0a0a);
    border-bottom: 2px solid var(--yorha-secondary, #ffd700);
    padding: 16px 20px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
	position: relative;
  }

  .header-content {
    flex: 1;
    min-width: 0;
  }

  .modal-title {
    color: var(--yorha-secondary, #ffd700);
    font-size: 16px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
	margin: 0 0 4px 0;
  }

  .modal-subtitle {
    color: var(--yorha-text-muted, #808080);
    font-size: 12px;
	margin: 0;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .system-status {
    display: flex;
    align-items: center;
	gap: 8px;
    margin-right: 16px;
  }

  .status-indicator {
    position: relative;
	width: 12px;
    height: 12px;
  }

  .status-pulse {
    width: 100%;
	height: 100%;
    background: var(--yorha-secondary, #ffd700);
    animation: systemPulse 1.5s infinite;
  }

  .status-text {
    font-size: 10px;
    font-weight: 600;
	color: var(--yorha-secondary, #ffd700);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .modal-close {
    width: 32px;
	height: 32px;
    background: transparent;
	border: 2px solid var(--yorha-text-muted, #808080);
    color: var(--yorha-text-muted, #808080);
    cursor: pointer;
	display: flex;
    align-items: center;
    justify-content: center;
	transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .modal-close:hover {
    border-color: var(--yorha-danger, #ff0041);
    color: var(--yorha-danger, #ff0041);
    background: rgba(255, 0, 65, 0.1);
    transform: scale(1.05);
  }

  .close-icon {
    font-size: 14px;
    font-weight: 700;
  }

  /* Content */
  .modal-content {
    padding: 20px;
	flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--yorha-secondary, #ffd700) var(--yorha-bg-primary, #0a0a0a);
  }

  .modal-content::-webkit-scrollbar {
    width: 8px;
  }

  .modal-content::-webkit-scrollbar-track {
    background: var(--yorha-bg-primary, #0a0a0a);
  }

  .modal-content::-webkit-scrollbar-thumb {
    background: var(--yorha-secondary, #ffd700);
    border: 1px solid var(--yorha-bg-primary, #0a0a0a);
  }

  /* Footer */
  .modal-footer {
    background: var(--yorha-bg-primary, #0a0a0a);
    border-top: 1px solid var(--yorha-text-muted, #808080);
    padding: 16px 20px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
	gap: 12px;
  }

  .modal-button {
    display: flex;
    align-items: center;
	gap: 8px;
    padding: 10px 16px;
    background: var(--yorha-bg-secondary, #1a1a1a);
    border: 2px solid var(--yorha-text-muted, #808080);
    color: var(--yorha-text-secondary, #b0b0b0);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
	cursor: pointer;
    transition: all 0.2s ease;
  }

  .modal-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .modal-button.confirm {
    border-color: var(--yorha-secondary, #ffd700);
    color: var(--yorha-secondary, #ffd700);
  }

  .modal-button.confirm:hover {
    background: var(--yorha-secondary, #ffd700);
    color: var(--yorha-bg-primary, #0a0a0a);
  }

  .modal-button.cancel {
    border-color: var(--yorha-danger, #ff0041);
    color: var(--yorha-danger, #ff0041);
  }

  .modal-button.cancel:hover {
    background: var(--yorha-danger, #ff0041);
    color: var(--yorha-text-primary, #e0e0e0);
  }

  .modal-button.acknowledge {
    border-color: var(--yorha-accent, #00ff41);
    color: var(--yorha-accent, #00ff41);
  }

  .modal-button.acknowledge:hover {
    background: var(--yorha-accent, #00ff41);
    color: var(--yorha-bg-primary, #0a0a0a);
  }

  .button-icon {
    font-size: 14px;
  }

  /* Terminal Border Effect */
  .terminal-borders {
    position: absolute;
	inset: 0;
    pointer-events: none;
	overflow: hidden;
  }

  @keyframes systemPulse {
    0% {
      opacity: 1;
      box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7);
    }
    70% {
      opacity: 0;
      box-shadow: 0 0 0 8px rgba(255, 215, 0, 0);
    }
    100% {
      opacity: 0;
      box-shadow: 0 0 0 0 rgba(255, 215, 0, 0);
    }
  }

  @keyframes scanlines {
    0% {
      transform: translateY(-100%);
    }
    100% {
      transform: translateY(100vh);
    }
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .yorha-modal-backdrop {
      padding: 1rem;
    }
    .yorha-modal {
      max-height: calc(100vh - 2rem);
    }
    .modal-header {
      padding: 12px 16px;
      flex-direction: column;
      align-items: flex-start;
	gap: 8px;
    }
    .system-status {
      margin-right: 0;
      margin-bottom: 8px;
    }
    .modal-close {
      position: absolute;
	top: 8px;
      right: 8px;
    }
    .modal-content {
      padding: 16px;
    }
    .modal-footer {
      padding: 12px 16px;
    }
    .modal-actions {
      flex-direction: column;
    }
    .modal-button {
      justify-content: center;
    }
  }

  .yorha-modal.max-w-none {
    border-radius: 0;
    max-height: 100vh;
  }
</style>







