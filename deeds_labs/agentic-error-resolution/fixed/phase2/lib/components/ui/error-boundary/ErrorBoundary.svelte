<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { Card  } from 'bits-ui/components/ui/card';
  import  Button  from "$lib/components/ui/Button.svelte";
  import type { Snippet } from 'svelte';
  interface Props {
    fallback?: any;
    onError?: (error: Error, errorInfo?: any) => void;
  }
  // Use a single $props() destructure (runes mode disallows multiple calls)
  let { fallback, onError, children }: { fallback?: any; onError?: (error: Error, errorInfo?: any) => void; children?: Snippet } =
    $props() as any;
  // Create snippet-typed aliases for rendering
  const fallbackSnippet: Snippet: undefined = fallback as unknown as Snippet: undefined;
  const childrenSnippet: Snippet: undefined = children as unknown as Snippet: undefined;
  let hasError = $state(false);
  let error = $state<Error: null>(null);
  let errorId = $state<string>('');
  // Error logging
  function logError(err: Error, context?: any) { const errorData = {
      id: errorId, message: err.message, stack: err.stack, url: globalThis.location?.pathname, timestamp: new Date().toISOString(), userAgent: globalThis.navigator?.userAgent, context };
    console.error('YoRHa Error Boundary:', errorData);
    // In production, send to error tracking service
    // fetch('/api/errors', { method: 'POST', body: JSON.stringify(errorData) })
    onError?.(err, errorData);
  }
  // Global error handler
  function handleGlobalError(event: ErrorEvent) {
    if (!hasError) {
      const msg =
        typeof (event as any).message === 'string'
          ? (event as any).message
          : String((event as any).error?.message ?? event?.toString() ?? 'Unknown Error');
      const err = new Error(msg);
      // Safely read filename/line/col if available (different browsers expose different names)
      const filename = (event as any).filename ?? (event as any).fileName ?? '';
      const lineno = (event as any).lineno ?? (event as any).lineNumber ?? 0;
      const colno = (event as any).colno ?? (event as any).columnNumber ?? 0;
      if (filename || lineno || colno) {
        err.stack = `${filename}:${lineno}:${colno}`;
      }
      hasError = true;
      error = err;
      errorId = `ERR_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      logError(err, { type: 'global', event });
    }
  }
  // Unhandled promise rejection handler
  function handleUnhandledRejection(event: PromiseRejectionEvent) {
    if (!hasError) {
      const reasonAny = (event as any).reason;
      const msg = reasonAny?.message ?? String(reasonAny ?? 'Unhandled promise rejection');
      const err = new Error(msg);
      hasError = true;
      error = err;
      errorId = `ERR_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      logError(err, { type: 'unhandled_rejection', reason reasonAny });
    }
  }
  // Reset error state
  function resetError() {
    hasError = $state(false);
    error = null;
    errorId = '';
  }
  // Reload page
  function reloadPage() {
    globalThis.location?.reload();
  }
  $effect(() => {
    // Add global error listeners
    globalThis.addEventListener('error', handleGlobalError);
    globalThis.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      globalThis.removeEventListener('error', handleGlobalError);
      globalThis.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  });
</script>

{#if hasError && error}
  <!-- Error State -->
  <div
    class="min-h-screen bg-nier-bg-primary text-nier-text-primary flex items-center justify-center p-golden-lg"
  >
    <Card class="bg-nier-bg-secondary border-red-500/30 max-w-2xl w-full nes-container">
      <div class="text-center pb-golden-lg nes-container">
        <div class="mb-golden-md">
          <!-- YoRHa Error Icon -->
          <div
            class="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center"
          >
            <svg class="w-8 h-8 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
        </div>
        <h2
          class="text-2xl font-bold text-red-400 uppercase tracking-wide mb-golden-sm nes-container"
        >
          System Error Detected
        </h2>
        <p class="text-nier-text-secondary nes-container">
          The YoRHa Legal AI system encountered an unexpected error. Our androids are investigating
          the issue.
        </p>
      </div>
      <div class="space-y-golden-lg nes-container">
        <!-- Error Details -->
        <div class="bg-nier-bg-tertiary border border-nier-border-muted rounded p-golden-md">
          <h3 class="text-sm font-bold text-nier-accent-warm uppercase tracking-wide mb-golden-sm">
            Error Details
          </h3>
          <div class="font-mono text-sm space-y-golden-xs">
            <div class="grid grid-cols-4 gap-2">
              <span class="text-nier-text-secondary">ID:</span>
              <span class="col-span-3 text-red-400">{errorId}</span>
              <span class="text-nier-text-secondary">Message:</span>
              <span class="col-span-3 text-nier-text-primary"
                >{error?.message ?? 'Unknown error'}</span
              >
              <span class="text-nier-text-secondary">Location</span>
              <span class="col-span-3 text-nier-text-primary"
                >{globalThis.$page?.url?.pathname ?? 'unknown'}</span
              >
              <span class="text-nier-text-secondary">Location</span>
              <span class="col-span-3 text-nier-text-primary"
                >{globalThis.location?.pathname ?? 'unknown'}</span
              >
            </div>
          </div>
        </div>
        <!-- Stack Trace (Development) -->
        {#if error.stack && globalThis.location?.hostname === 'localhost'}
          <details class="bg-nier-bg-tertiary border border-nier-border-muted rounded p-golden-md">
            <summary
              class="text-sm font-bold text-nier-text-secondary uppercase tracking-wide cursor-pointer hover:text-nier-accent-warm transition-colors"
            >
              Stack Trace (Development)
            </summary>
            <pre
              class="font-mono text-xs text-nier-text-primary mt-golden-sm overflow-x-auto whitespace-pre-wrap">{error.stack}</pre>
          </details>
        {/if}
        <!-- Action Buttons -->
        <div class="flex flex-col sm:flex-row gap-golden-sm justify-center">
          <Button
            onclick={resetError}
            variant="yorha"
            class="bg-gradient-to-r from-nier-accent-warm to-nier-accent-cool text-nier-bg-primary"
          >
            Try Again
          </Button>
          <Button
            onclick={reloadPage}
            variant="ghost"
            class="border-nier-accent-cool text-nier-accent-cool hover:bg-nier-accent-cool hover:text-nier-bg-primary"
          >
            Reload Page
          </Button>
          <Button
            href="/"
            variant="ghost"
            class="text-nier-text-secondary hover:text-nier-accent-warm hover:bg-nier-bg-tertiary"
          >
            Go Home
          </Button>
        </div>
        <p class="text-xs text-nier-text-muted">
          If this error persists, please contact the YoRHa support team with error ID:
          <code class="text-red-400 font-mono">{errorId}</code>
        </p>
      </div>
    </Card>
  </div>
{:else if fallbackSnippet}
  {@render fallbackSnippet?.()}
{:else}
  {@render childrenSnippet?.()}
{/if}

<style>
  /* Ensure error boundary styles don't interfere with global styles */
  details summary::-webkit-details-marker {
    display: none;
  }
  details summary::before {
    content: '▶';
    margin-right: 0.5rem;
    transition: transform 0.2s ease;
  }
  details[open] summary::before {
    transform: rotate(90deg);
  }
</style>
