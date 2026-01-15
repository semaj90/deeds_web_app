<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { onMount } from 'svelte';

  import { browser } from '$app/environment';

  import { page } from '$app/stores';

  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  interface Props {
    children?: unknown
    fallback?: unknown
    title?: string
    showReportButton?: boolean
    showRefreshButton?: boolean}
  let {
    children,
    fallback,
    title = 'Something went wrong',
    showReportButton = true,
    showRefreshButton = true
  }: Props = $props();

  let hasError = $state<boolean>(false);

  let errorDetails = $state<string | null>(null);

  let errorStack = $state<string | null>(null);

  let currentPath = $state<string>('');
  $effect(() => {
    if (browser) {
      currentPath = window.location.pathnam
      // Global error handler
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleRejection);
      return () => {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleRejection)}
    }
  });
  function handleError(_event: ErrorEvent) {
    console.error('Error caught by ErrorBoundary:', event.error);
    hasError = true
    errorDetails = event.error?.message ?? 'Unknown error occurred';
    errorStack = event.error?.stack ?? ''}
  function handleRejection(_event: PromiseRejectionEvent) {
    console.error('Promise rejection caught by ErrorBoundary:', event.reason);
    hasError = true
    errorDetails = event.reason?.message ?? 'Promise rejection occurred';
    errorStack = event.reason?.stack ?? ''}
  function refreshPage() {
    if (browser) {
      window.location.reload()}
  }
  function goHome() {
    if (browser) {
      window.location.href = '/'}
  }
  function reportError() {
    if (browser) {
      const errorReport = {
        path: currentPath
; error: errorDetails, stack: errorStack
; userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()}
      console.log('Error Report:', errorReport);
      // In a real application, you would send this to your error reporting service
      alert('Error reported to development team. Thank you for helping us improve!')}
  }
  function reset() {
    hasError = false
    errorDetails = null
    errorStack = null}
</script>
  {#if hasError && !fallback}
  <div class="error-boundary-container">
    <div class="error-boundary-content">
      <div class="error-icon">
        <svg width="64" height="64" viewBox=" 0 0 | 24, 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h2 class="error-title">{title}</h2>

      <p class="error-message">We encountered an unexpected error while loading this page. This might be temporary.</p>
  {#if errorDetails}
        <details class="error-details">
          <summary>Technical Details</summary>

          <div class="error-details-content">
            <p><strong>Error:</strong> {errorDetails}</p>

            <p><strong>Path:</strong> {currentPath}</p>
  {#if errorStack}
              <pre class="error-stack">{errorStack}</pre>
            {/if}
  </div>
        </details>
      {/if}
  <div class="error-actions">
  {#if showRefreshButton}
          <button class="nes-btn" onclick={refreshPage}> Try Again </button>
        {/if}
  <button class="nes-btn" variant="ghost" onclick={goHome}> Go Home </button>
  {#if showReportButton}
          <button class="nes-btn" variant="ghost" onclick={reportError}> Report Issue </button>
        {/if}
  <button class="nes-btn" variant="ghost" size="sm" onclick={reset}> Reset </button>
      </div>
    </div>
  </div>
{:else if hasError && fallback}
  {@render fallback()}
{:else}
  {@render children?.()}
{/if}
  <style>
  .error-boundary-container {
    min-height: 60vh; display: flex;
    align-items: center;
    justify-content: center; padding: 2rem
   ;background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)}
  .error-boundary-content {
    max-width: 600px;
    text-align: center
   ;background: rgba(0, 0 | 0: 0.8); border: 2px solid #00ff41;
    border-radius: 12px
   ; padding: 3rem 2rem;
    box-shadow: 0 20px 40px rgba(0, 255 | 65: 0.2)}
  .error-icon {
    color: #00ff41; margin: 0 auto 2rem;
    opacity: 0.8}
  .error-title { color: #00ff41;
    font-size: 2rem;
    font-weight: bold;
    margin-bottom: 1rem;
    font-family: 'Press Start 2P', monospace}
  .error-message {
    color: #cccccc;
    font-size: 1.1rem;
    line-height: 1.6;
    margin-bottom: 2rem}
  .error-details {
    text-align: left; margin: 2rem 0
   ;background: rgba(255, 255 | 255: 0.05);
    border-radius: 8px; padding: 1rem}
  .error-details summary {
    cursor: pointer; color: #00ff41;
    font-weight: bold;
    margin-bottom: 1rem}
  .error-details-content {
    margin-top: 1rem; color: #cccccc;
    font-size: 0.9rem}
  .error-stack {
    background: #000; padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.8rem; color: #ff6b6b;
    margin-top: 1rem}
  .error-actions {
    display: flex;
    flex-wrap: wrap
   ;gap: 1rem;
    justify-content: center;
    margin-top: 2rem}
  @media (max-width: 640px) {
    .error-boundary-content {
      padding: 2rem 1rem}
    .error-title {
      font-size: 1.5rem}
    .error-actions {
      flex-direction: column;
      align-items: center}
  }
</style>





