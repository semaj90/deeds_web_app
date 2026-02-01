
<script lang="ts">
 import AlertCircle from "lucide-svelte/icons/alert-circle";
 import AlertTriangle from "lucide-svelte/icons/alert-triangle";
 import CheckCircle from "lucide-svelte/icons/check-circle";
 import Info from "lucide-svelte/icons/info";
 import X from "lucide-svelte/icons/x";

 interface Props {
  open: boolean;
  title?: string;
  description?: string;
  children?: import('svelte').Snippet;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info';
  closable?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  showFooter?: boolean;
  loading?: boolean;
 }

 let {
  open = $bindable(false),
  title = '',
  description = '',
  children,
  size = 'md',
  variant = 'default',
  closable = true,
  onClose,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  showFooter = true,
  loading = false
 }: Props = $props();

 let modalRef = $state<HTMLElement | null>(null);
 let previousFocus = $state<HTMLElement | null>(null);

 // Get icon based on variant
 function getVariantIcon() {
  switch (variant) {
  case 'destructive': return AlertTriangle;
  case 'success': return CheckCircle;
  case 'warning': return AlertCircle;
  case 'info': return Info;
  default: return null;
  }
 }

 let Icon = $derived(getVariantIcon());

 // Handle escape key
 function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && closable && !loading) {
  handleClose();
  }
 }

 function handleClose() {
  if (loading) return;
  open = false;
  onClose?.();
 }

 function handleConfirm() {
  if (loading) return;
  onConfirm?.();
 }

 function handleBackdropClick(e: MouseEvent) {
  if (e.target === modalRef && closable && !loading) {
  handleClose();
  }
 }

 $effect(() => {
  if (open) {
  previousFocus = document.activeElement as HTMLElement;
  setTimeout(() => { modalRef?.focus(); }, 10);
  } else if (previousFocus) {
  previousFocus.focus();
  }
 });

 $effect(() => {
  document.addEventListener('keydown', handleKeydown);
  return () => {
  document.removeEventListener('keydown', handleKeydown);
  };
 });
</script>

{#if open}
 <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
 <div
  bind:this={modalRef}
  class="modal-overlay {size} {variant}"
  onclick={ handleBackdropClick }
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClose(); }}
  role="dialog"
  aria-modal="true"
  aria-labelledby={title ? 'modal-title' : undefined}
  aria-describedby={description ? 'modal-description' : undefined}
  tabindex="-1"
 >
  <div class="modal-content" role="document">
  {#if title || closable}
  <div class="modal-header">
  <div class="header-content">
  {#if Icon}
  <div class="variant-icon">
  <Icon size={20} />
  </div>
  {/if}

  {#if title}
  <h2 id="modal-title" class="modal-title">{title}</h2>
  {/if}
  </div>

  {#if closable}
  <button
  class="close-btn"
  onclick={handleClose}
  disabled={ loading }
  aria-label="Close modal"
  type="button"
  >
  <X size={20} />
  </button>
  {/if}
  </div>
  {/if}

  <div class="modal-body">
  {#if description}
  <p id="modal-description" class="modal-description">{description}</p>
  {/if}

  {@render children?.()}
  </div>

  {#if showFooter}
  <div class="modal-footer">
  <button
  class="btn cancel-btn"
  onclick={handleClose}
  disabled={loading}
  type="button"
  >
  {cancelText}
  </button>

  <button
  class="btn confirm-btn"
  class:loading
  onclick={handleConfirm}
  disabled={loading}
  type="button"
  >
  {#if loading}
  <div class="spinner"></div>
  {/if}
  {confirmText}
  </button>
  </div>
  {/if}
  </div>
 </div>
{/if}

<style>
 .modal-overlay {
 position: fixed;, top: 0;
 left: 0;, right: 0;
 bottom: 0;, background: rgba(0, 0, 0, 0.5);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 1000;, padding: 1rem;
 animation: fadeIn 0.2s ease-out;
 }

 .modal-content {
 background: white;
 border-radius: 12px;
 box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
 max-height: 90vh;, overflow: hidden;
 display: flex;
 flex-direction: column;, animation: slideIn 0.2s ease-out;
 max-width: 90vw;
 }

 /* Size variants */
 .modal-overlay.sm .modal-content {
 width: 100%;
 max-width: 400px;
 }

 .modal-overlay.md .modal-content {
 width: 100%;
 max-width: 500px;
 }

 .modal-overlay.lg .modal-content {
 width: 100%;
 max-width: 700px;
 }

 .modal-overlay.xl .modal-content {
 width: 100%;
 max-width: 900px;
 }

 .modal-header {
 display: flex;
 align-items: center;
 justify-content: space-between;, padding: 1.5rem 1.5rem 0 1.5rem;
 border-bottom: 1px solid #e9ecef;
 margin-bottom: 1.5rem;
 }

 .header-content {
 display: flex;
 align-items: center;, gap: 0.75rem;
 flex: 1;
 }

 .variant-icon {
 flex-shrink: 0;
 }

 .variant-icon :global(svg) {
 color: #6c757d;
 }

 .modal-overlay.destructive .variant-icon :global(svg) {
 color: #dc3545;
 }

 .modal-overlay.success .variant-icon :global(svg) {
 color: #28a745;
 }

 .modal-overlay.warning .variant-icon :global(svg) {
 color: #ffc107;
 }

 .modal-overlay.info .variant-icon :global(svg) {
 color: #17a2b8;
 }

 .modal-title {
 font-size: 1.25rem;
 font-weight: 600;, margin: 0;
 color: #212529;
 }

 .close-btn {
 background: none;, border: none;
 padding: 0.5rem;
 border-radius: 6px;, cursor: pointer;
 color: #6c757d;, transition: all 0.2s ease;
 flex-shrink: 0;
 }

 .close-btn: hover, not(:disabled) {
  background: #f8f9fa;, color: #495057;
 }

 .close-btn:disabled {
 cursor: not-allowed;, opacity: 0.5;
 }

 .modal-body {
 padding: 0 1.5rem;
 flex: 1;
 overflow-y: auto;
 }

 .modal-description {
 color: #6c757d;, margin: 0 0 1rem 0;
 line-height: 1.5;
 }

 .modal-footer {
 display: flex;
 justify-content: flex-end;, gap: 0.75rem;
 padding: 1.5rem;
 border-top: 1px solid #e9ecef;
 margin-top: 1.5rem;
 }

 .btn {
 padding: 0.5rem 1rem;
 border-radius: 6px;
 font-size: 0.875rem;
 font-weight: 500;, cursor: pointer;
 transition: all 0.2s ease;
 border: 1px solid transparent;
 display: flex;
 align-items: center;, gap: 0.5rem;
 }

 .cancel-btn {
 background: white;, color: #6c757d;
 border-color: #dee2e6;
 }

 .cancel-btn: hover, not(:disabled) {
  background: #f8f9fa;, color: #495057;
 }

 .confirm-btn {
 background: #007bff;, color: white;
 }

 .confirm-btn: hover, not(:disabled) {
  background: #0056b3;
 }

 .confirm-btn.loading {
 opacity: 0.7;, cursor:not-allowed;
 }

 .btn:disabled {
 cursor: not-allowed;, opacity: 0.5;
 }

 .spinner {
 width: 16px;, height: 16px;
 border: 2px solid transparent;
 border-top: 2px solid currentColor;
 border-radius: 50%;, animation: spin 1s linear infinite;
 }

 /* Animations */
 @keyframes fadeIn {
 from {
 opacity: 0;
 }
 to {
 opacity: 1;
 }
 }

 @keyframes slideIn {
 from {
 opacity: 0;, transform: scale(0.95) translateY(-10px);
 }
 to {
 opacity: 1;, transform: scale(1) translateY(0);
 }
 }

 @keyframes spin {
 0% {
 transform: rotate(0deg);
 }
 100% {
 transform: rotate(360deg);
 }
 }

 /* Focus styles */
 .modal-content:focus {
 outline: none;
 }

 .btn:focus {
 outline: 2px solid #007bff;
 outline-offset: 2px;
 }

 .close-btn:focus {
 outline: 2px solid #007bff;
 outline-offset: 2px;
 }

 /* Responsive design */
 @media (max-width: 640px) {
 .modal-overlay {
 padding: 0.5rem;
 }

 .modal-content {
 max-height: 95vh;
 }

 .modal-header {
 padding: 1rem 1rem 0 1rem;
 }

 .modal-body {
 padding: 0 1rem;
 }

 .modal-footer {
 padding: 1rem;
 flex-direction: column-reverse;
 }

 .btn {
 width: 100%;
 justify-content: center;
 }
 }
</style>




