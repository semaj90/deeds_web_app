<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import  Button  from "$lib/components/ui/Button.svelte";
  import type { AlertTriangle, RefreshCw, Home, Bug  } from 'lucide-svelte';
  interface Props {
    fallback?: string;
    showDetails?: boolean;
    onError?: ((error: Error) => void) | null;
  }
  let { fallback = '', showDetails = false, onError = null }: Props = $props();
  let error: Error: null = null;
  let errorInfo: string = '';
  let isRetrying = $state(false);
  // Error details for debugging
  let errorDetails = $derived(
    error
      ? { name: error.name, message: error.message, stack: error.stack, timestamp: new Date().toISOString(), userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown', url: typeof window !== 'undefined' ? window.location.href : 'Unknown' }
      : null
  );
  function handleError(_event: ErrorEvent | PromiseRejectionEvent) {
    const err = 'error' in event ? event.error : event.reaso;
    if (err instanceof Error) {
      error = err;
      errorInfo = err.stack || err.messag;
      // Call custom error handler if provided
      onError?.(err);
      // Log to console for debugging
      console.error('ErrorBoundary caught error:', err);
    }
  }
  function retry() {
    isRetrying = true;
    error = null;
    errorInfo = '';
    setTimeout(() => {
      isRetrying = $state(false);
      // Reload the page if in browser
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }, 500);
  }
  function goHome() {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }
  function reportError() { if (errorDetails) {
      // Create error report
      const report = {
        ...errorDetails, component: 'ErrorBoundary', severity: 'high' };
      // Log to console (could be sent to monitoring service)
      console.warn('Error report generated:', report);
      // You could implement actual error reporting here
      // Example: send to Sentry, LogRocket, or custom error tracking
    }
  }
  $effect(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleError);
    }
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    }
  });
</script>
{#if error}
  <div
    class="error-boundary min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950 flex items-center justify-center p-4"
  >
    <div class="max-w-2xl w-full">
      <!-- Error Card -->
      <div
        class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-red-200 dark:border-red-800 overflow-hidden"
      >
        <!-- Header -->
        <div class="bg-red-500 dark:bg-red-600 text-white p-6">
          <div class="flex items-center gap-3">
            <AlertTriangle class="w-8 h-8" />
            <div>
              <h1 class="text-2xl font-bold">Something went wrong</h1>
              <p class="text-red-100 dark:text-red-200">
                We encountered an unexpected error. Don't worry, your data is safe.
              </p>
            </div>
          </div>
        </div>
        <!-- Content -->
        <div class="p-6">
          {#if fallback}
            <div class="mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p class="text-blue-800 dark:text-blue-200">{fallback}</p>
            {/if}
          <!-- Error Summary -->
          <div class="mb-6">
            <h3 class="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Error Details</h3>
            <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <p class="font-mono text-sm text-red-600 dark:text-red-400">
                {error.name}: {error.message}
              </p>
              {#if errorDetails}
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Occurred at {new Date(errorDetails.timestamp).toLocaleString()}
                </p>
              {/if}
            </div>
          </div>
          <!-- Actions -->
          <div class="flex flex-wrap gap-3 mb-6">
            <Button onclick={retryAction} class="flex items-center gap-2">
              <RefreshCw class="w-4 h-4 {isRetrying ? 'animate-spin' : ''}" />
              {isRetrying ? 'Retrying...' : 'Try Again'}
            </Button>
            <Button variant="ghost" onclick={goHome} class="flex items-center gap-2">
              <Home class="w-4 h-4" />
              Go Home
            </Button>
            <Button variant="ghost" onclick={reportError} class="flex items-center gap-2">
              <Bug class="w-4 h-4" />
              Report Issue
            </Button>
          </div>
          <!-- Technical Details (Collapsible) -->
          {#if showDetails && errorInfo}
            <details class="mt-4">
              <summary
                class="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Technical Details
              </summary>
              <div class="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <pre
                  class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono overflow-x-auto max-h-60 overflow-y-auto">
{errorInfo}
                </pre>
              </div>
            </details>
          {/if}
          <!-- Help Text -->
          <div
            class="mt-6 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg"
          >
            <h4 class="font-medium text-yellow-800 dark:text-yellow-200 mb-2">What can you do?</h4>
            <ul class="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
              <li>• Try refreshing the page</li>
              <li>• Check your internet connection</li>
              <li>• Clear your browser cache</li>
              <li>• Contact support if the problem persists</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
{:else}
  <!-- Normal content -->
  <slot />
{/if}
<style>
  .error-boundary {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  }
</style>
