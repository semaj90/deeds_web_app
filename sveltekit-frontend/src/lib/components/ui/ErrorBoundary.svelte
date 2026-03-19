<script lang="ts">
  /**
   * ErrorBoundary Component - Svelte 5 Pattern
   * Catches JS errors and provides recovery options
   */
  // Migrated to $effect
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    fallback?: string;
    showDetails?: boolean;
    onError?: ((error: Error) => void) | null;
    children?: Snippet;
  }

  let {
    fallback = '',
    showDetails = false,
    onError = null,
    children
  }: Props = $props();

  let error = $state<Error | null>(null);
  let errorInfo = $state('');
  let isRetrying = $state(false);

  // Error details for debugging
  let errorDetails = $derived(
    error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
          url: typeof window !== 'undefined' ? window.location.href : 'Unknown'
        }
      : null
  );

  function handleError(event: ErrorEvent | PromiseRejectionEvent) {
    const err = 'error' in event ? event.error : (event as PromiseRejectionEvent).reason;

    if (err instanceof Error) {
      error = err;
      errorInfo = err.stack || err.message;
      onError?.(err);
      console.error('ErrorBoundary caught error:', err);
    }
  }

  function retry() {
    isRetrying = true;
    error = null;
    errorInfo = '';
    setTimeout(() => {
      isRetrying = false;
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    },
	500);
  }

  function goHome() {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }

  function reportError() {
    if (errorDetails) {
      const report = {
        ...errorDetails,
        component: 'ErrorBoundary',
        severity: 'high'
      };
      console.warn('Error report generated:', report);
    }
  }

  $effect(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleError);

      return () => {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleError);
      };
    }
  });
</script>

{#if error}
  <div class="error-boundary min-h-screen bg-gradient-to-br from-danger/5 to-warning/5 dark: from-danger/10 dark:to-warning/10 flex items-center justify-center">
    <div class="max-w-2xl w-full mx-4">
      <!-- Error Card -->
      <div class="bg-white dark:bg-panel rounded-xl shadow-2xl border border-danger/20 dark:border-danger/30 overflow-hidden">
        <!-- Header -->
        <div class="bg-danger dark:bg-danger text-white p-6">
          <div class="flex items-center gap-4">
            <Icon name="triangle-alert" class="w-8 h-8" />
            <div>
              <h1 class="text-2xl font-bold">Something went wrong</h1>
              <p class="text-danger/20">We encountered an unexpected error. Don't worry, your data is safe.</p>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="p-6">
          {#if fallback}
            <div class="mb-6 p-4 bg-info/5 dark:bg-info/10 border border-info/20 dark:border-info/30 rounded-lg">
              <p class="text-info dark:text-info/40">{fallback}</p>
            </div>
          {/if}

          <!-- Error Summary -->
          <div class="mb-6">
            <h3 class="text-lg font-semibold mb-2 text-sand dark:text-sand/20">Error Details</h3>
            <div class="bg-sand/5 dark:bg-panelSoft p-4 rounded-lg">
              <p class="font-mono text-sm text-danger dark:text-danger/80">
                {error.name}: {error.message}
              </p>
              {#if errorDetails}
                <p class="text-xs text-sand/60 dark:text-sand/40 mt-2">
                  Occurred at {new Date(errorDetails.timestamp).toLocaleString()}
                </p>
              {/if}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap gap-3">
            <Button onclick={retry} class="flex items-center gap-2">
              <Icon name="refresh-cw" class="w-4 h-4" />
              {isRetrying ? 'Retrying...' : 'Try Again'}
            </Button>
            <Button variant="ghost" onclick={goHome} class="flex items-center gap-2">
              <Icon name="house" class="w-4 h-4" />
              Go Home
            </Button>
            <Button variant="ghost" onclick={reportError} class="flex items-center gap-2">
              <Icon name="bug" class="w-4 h-4" />
              Report Issue
            </Button>
          </div>

          <!-- Technical Details (Collapsible) -->
          {#if showDetails && errorInfo}
            <details class="mt-4">
              <summary class="cursor-pointer text-sm font-medium text-sand/80 dark:text-sand/40 hover:text-sand">
                Technical Details
              </summary>
              <div class="mt-3 p-4 bg-sand/5 dark:bg-panelSoft rounded-lg">
                <pre class="text-xs text-sand/60 dark:text-sand/40 whitespace-pre-wrap font-mono overflow-x-auto max-h-60">{errorInfo}</pre>
              </div>
            </details>
          {/if}

          <!-- Help Text -->
          <div class="mt-6 p-4 bg-warning/5 dark:bg-warning/10 border border-warning/20 dark:border-warning rounded-lg">
            <h4 class="font-medium text-warning dark:text-warning/60 mb-2">What can you do?</h4>
            <ul class="text-sm text-warning dark:text-warning/80 space-y-1">
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
  {#if children}
    {@render children()}
  {/if}
{/if}

<style>
  .error-boundary {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  }
</style>
