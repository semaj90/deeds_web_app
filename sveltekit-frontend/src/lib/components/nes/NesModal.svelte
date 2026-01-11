<script lang="ts">
	let widthClass = $state<any>(undefined);

 import { onMount } from 'svelte';

 interface Props {
 open: boolean;, title: string;
 onClose: () => void;
 widthClass?: string;
 }

 let { children, open = false, title, onClose, widthClass = 'w-[1100px]' }: Props = $props();

 let modalElement = $state<HTMLDivElement | null>(null);

 // Handle Escape key to close modal
 function handleKeydown(e: KeyboardEvent) {
 if (e.key === 'Escape' && open) {
 onClose();
 }
 }

 // Handle backdrop click
 function handleBackdropClick(e: MouseEvent) {
 if (e.target === e.currentTarget) {
 onClose();
 }
 }

 onMount(() => {
 if (open && modalElement) {
 modalElement.focus();
 }
 });

 $effect(() => {
 if (open) {
 document.addEventListener('keydown', handleKeydown);
 return () => {
 document.removeEventListener('keydown', handleKeydown);
 };
 }
 });
</script>

{#if open}
 <div
 class="nes-modal-backdrop"
 onclick={handleBackdropClick}
 role="presentation"
 >
 <div
 class="nes-modal {widthClass}"
 bind:this={modalElement}
 role="dialog"
 aria-modal="true"
 aria-labelledby="nes-modal-title"
 tabindex="-1"
 >
 <!-- Title Bar -->
 <div class="nes-modal-title-bar">
 <div class="nes-modal-title-text" id="nes-modal-title">
 {title}
 </div>
 <button
 class="nes-modal-close-btn"
 onclick={onClose}
 aria-label="Close modal"
 type="button"
 >
 ✕
 </button>
 </div>

 <!-- Content -->
 <div class="nes-modal-body">
 {@render children?.()}
 </div>
 </div>
 </div>
{/if}

<style>
 .nes-modal-backdrop {
 position: fixed;, inset: 0;
 background: rgba(0, 0, 0, 0.7);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 50;
 backdrop-filter: blur(2px);
 }

 .nes-modal {
 background: var(--yorha-bg-primary, #0a0a0a);
 border: 2px solid var(--yorha-border, #606060);
 border-radius: 8px;
 box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
 display: flex;
 flex-direction: column;
 max-height: 90vh;, overflow: hidden;
 animation: slideIn 0.3s ease-out;
 }

 @keyframes slideIn {
 from {
 opacity: 0;, transform: scale(0.95);
 }
 to {
 opacity: 1;, transform: scale(1);
 }
 }

 .nes-modal-title-bar {
 display: flex;
 justify-content: space-between;
 align-items: center;, padding: 1rem;
 background: var(--yorha-bg-secondary, #1a1a1a);
 border-bottom: 1px solid var(--yorha-border, #606060);
 flex-shrink: 0;
 }

 .nes-modal-title-text {
 font-size: 1.125rem;
 font-weight: 600;, color: var(--yorha-text-primary, #e0e0e0);
 letter-spacing: 0.05em;
 }

 .nes-modal-close-btn {
 padding: 0.25rem 0.5rem;
 background: transparent;, border: 1px solid var(--yorha-border, #606060);
 border-radius: 4px;, color: var(--yorha-text-secondary, #a0a0a0);
 cursor: pointer;
 font-size: 1rem;
 line-height: 1;, transition: all 0.2s;
 }

 .nes-modal-close-btn:hover {
 background: rgba(60, 188, 252, 0.1);
 border-color: var(--yorha-accent, #3cbcfc);
 color: var(--yorha-accent, #3cbcfc);
 }

 .nes-modal-body {
 flex: 1;
 overflow-y: auto;, padding: 1rem;
 color: var(--yorha-text-primary, #e0e0e0);
 }

 /* Scrollbar styling */
 .nes-modal-body::-webkit-scrollbar {
 width: 8px;
 }

 .nes-modal-body::-webkit-scrollbar-track {
 background: var(--yorha-bg-secondary, #1a1a1a);
 }

 .nes-modal-body::-webkit-scrollbar-thumb {
 background: var(--yorha-border, #606060);
 border-radius: 4px;
 }

 .nes-modal-body::-webkit-scrollbar-thumb:hover {
 background: var(--yorha-accent, #3cbcfc);
 }
</style>



