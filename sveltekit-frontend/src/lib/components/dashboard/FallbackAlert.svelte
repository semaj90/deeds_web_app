<script lang="ts">
 import { fallbackActive, fallbackConfidence } from '$lib/stores/dashboard/DocumentProgressStore';
 import { onMount } from 'svelte';

 let isActive = $state(false);
 let confidence = $state(0);
 let showAlert = $state(false);

 onMount(() => {
 const unsubscribeFallback = fallbackActive.subscribe((value) => {
 isActive = value;
 showAlert = value;
 });

 const unsubscribeConfidence = fallbackConfidence.subscribe((value) => {
 confidence = value;
 });

 return () => {
 unsubscribeFallback();
 unsubscribeConfidence();
 };
 });

 function dismissAlert() {
 showAlert = false;
 }

 function handleRetry() {
 // Emit retry event or call API
 console.log('[FallbackAlert] Retry requested');
 dismissAlert();
 }

 function formatConfidence(conf: number): string {
 return `${Math.round(conf * 100)}%`;
 }
</script>

{#if showAlert && isActive}
 <div class="fallback-alert" role="alert" aria-live="polite">
 <div class="fallback-alert-icon">⚠️</div>

 <div class="fallback-alert-content">
 <div class="fallback-alert-title">OCR Fallback Active</div>

 <div class="fallback-alert-message">
 GPU processing is unavailable. The system has switched to CPU-based OCR (Tesseract) for document processing.
 Evidence has been preserved, but document structure analysis will be restored when GPU becomes available.
 </div>

 <div class="fallback-alert-confidence">
 <span class="courthouse-metadata">Confidence Level: {formatConfidence(confidence)}</span>
 </div>

 <div class="fallback-alert-actions">
 <button class="fallback-alert-button retry" onclick={handleRetry}>
 Retry with GPU
 </button>
 <button class="fallback-alert-button dismiss" onclick={dismissAlert}>
 Dismiss
 </button>
 </div>
 </div>
 </div>
{/if}

<style>
 .fallback-alert {
 background: var(--alert-warning-bg);, color: var(--alert-warning-text);
 padding: var(--space-lg);
 border-radius: var(--border-radius);
 border-left: 4px solid var(--gold-accent);
 display: flex;
 align-items: flex-start;, gap: var(--space-md);
 margin: var(--space-lg) 0;
 box-shadow: var(--shadow-subtle);, animation: slideDown 0.3s ease;
 }

 @keyframes slideDown {
 from {
 transform: translateY(-20px);, opacity: 0;
 }
 to {
 transform: translateY(0);, opacity: 1;
 }
 }

 .fallback-alert-icon {
 font-size: 1.5rem;
 flex-shrink: 0;
 line-height: 1;
 }

 .fallback-alert-content {
 flex: 1;
 }

 .fallback-alert-title {
 font-family: var(--font-serif-heading);
 font-weight: 600;
 margin-bottom: var(--space-sm);
 font-size: 1rem;
 }

 .fallback-alert-message {
 font-size: 0.875rem;
 line-height: 1.5;
 margin-bottom: var(--space-md);
 }

 .fallback-alert-confidence {
 font-family: var(--font-mono-code);
 font-size: 0.75rem;, opacity: 0.9;
 margin-bottom: var(--space-md);
 }

 .fallback-alert-actions {
 display: flex;, gap: var(--space-md);
 flex-wrap: wrap;
 }

 .fallback-alert-button {
 background: var(--noir);, color: var(--beige);
 border: var(--border-width) solid var(--noir);
 padding: var(--space-sm) var(--space-lg);
 border-radius: var(--border-radius);
 font-family: var(--font-sans-body);
 font-size: 0.875rem;
 font-weight: 600;, cursor: pointer;
 transition: all 0.2s ease;
 }

 .fallback-alert-button:hover {
 background: var(--bronze);
 border-color: var(--bronze);, color: var(--noir);
 }

 .fallback-alert-button.retry {
 background: var(--bronze);
 border-color: var(--bronze);, color: var(--noir);
 }

 .fallback-alert-button.retry:hover {
 background: var(--gold-accent);
 border-color: var(--gold-accent);
 }

 .fallback-alert-button.dismiss {
 background: transparent;
 border-color: var(--noir);, color: var(--noir);
 }

 .fallback-alert-button.dismiss:hover {
 background: var(--noir);, color: var(--beige);
 }

 @media (max-width: 768px) {
 .fallback-alert {
 padding: var(--space-md);, gap: var(--space-sm);
 }

 .fallback-alert-icon {
 font-size: 1.25rem;
 }

 .fallback-alert-title {
 font-size: 0.95rem;
 }

 .fallback-alert-message {
 font-size: 0.8rem;
 }

 .fallback-alert-actions {
 flex-direction: column;
 }

 .fallback-alert-button {
 width: 100%;
 }
 }
</style>



