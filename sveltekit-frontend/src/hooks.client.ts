/**
 * SvelteKit Client Hooks
 * Handles client-side initialization, error capture, and batch reporting
 */

import { dev } from '$app/environment';
import type { HandleClientError } from '@sveltejs/kit';

// ── Error Buffer ───────────────────────────────────────────

interface ClientError {
  message: string;
  stack: string;
  url: string;
  timestamp: string;
  type: 'handleError' | 'uncaught' | 'unhandledrejection' | 'fetch-failure';
}

const ERROR_BUFFER_MAX = 20;
const FLUSH_INTERVAL_MS = 10_000;
const STALE_CLIENT_RELOAD_KEY = 'atlas:stale-client-chunk-reloaded-at';
const STALE_CLIENT_RELOAD_WINDOW_MS = 60_000;
let errorBuffer: ClientError[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * A Vite/SvelteKit client can keep a route chunk from before a dev-server
 * rebuild. Reload once so it requests the current generated module graph;
 * leave repeated failures visible instead of creating a reload loop.
 */
function reloadOnceForStaleClientChunk(): boolean {
  try {
    const now = Date.now();
    const previous = Number(window.sessionStorage.getItem(STALE_CLIENT_RELOAD_KEY));
    if (Number.isFinite(previous) && previous > 0 && now - previous < STALE_CLIENT_RELOAD_WINDOW_MS) {
      return false;
    }
    window.sessionStorage.setItem(STALE_CLIENT_RELOAD_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    // If session storage is unavailable, don't risk an unbounded reload loop.
    return false;
  }
}

function isStaleClientChunkError(message: string, stack: string): boolean {
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    (/Cannot read properties of undefined \(reading 'call'\)/i.test(message) &&
      (/node_modules\\?\.vite\\?deps|node_modules\/.vite\/deps|\.svelte-kit\/generated/i.test(stack)))
  );
}

// Dev-server-only failures (stale HMR chunks after an edit, Vite transport timeouts, SvelteKit
// build-time globals missing from a pre-bundled dep). They are not application faults and
// otherwise dominate the runtime-error ranking. Filtered in dev only: in production a failed
// dynamic import is a real signal (stale chunk after a deploy) and must still be reported.
const DEV_SERVER_NOISE =
  /Failed to fetch dynamically imported module|transport invoke timed out|__SVELTEKIT_(?:APP_VERSION|DEV)__ is not defined/;

function pushError(err: ClientError): void {
  if (dev && DEV_SERVER_NOISE.test(err.message)) return;
  if (errorBuffer.length >= ERROR_BUFFER_MAX) errorBuffer.shift();
  errorBuffer.push(err);
}

async function flushErrors(): Promise<void> {
  if (errorBuffer.length === 0) return;
  const batch = errorBuffer.splice(0);
  try {
    await fetch('/api/errors/client-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors: batch }),
      keepalive: true,
    });
  } catch {
    // Re-enqueue on failure (bounded)
    for (const e of batch) {
      if (errorBuffer.length < ERROR_BUFFER_MAX) errorBuffer.push(e);
    }
  }
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flushErrors, FLUSH_INTERVAL_MS);
}

export function init(): void {
  startFlushTimer();
}

// ── SvelteKit handleError ──────────────────────────────────

export const handleError: HandleClientError = ({ error, event, status, message }) => {
  console.error('Client error:', error);
  // An unmatched route is a routing outcome, not a runtime fault (mirrors hooks.server.ts).
  if (status !== 404) {
    pushError({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? '') : '',
      url: typeof window !== 'undefined' ? window.location.pathname : '',
      timestamp: new Date().toISOString(),
      type: 'handleError',
    });
  }
  return {
    message: dev ? String(error) : 'An unexpected error occurred'
  };
};

// ── Global Error Handlers ──────────────────────────────────

if (dev) {
  console.log('🚀 Legal AI Platform initialized');
}

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  const errorMessage = event.error?.message ?? event.message ?? 'Unknown error';
  const errorStack = event.error?.stack ?? '';
  if (isStaleClientChunkError(errorMessage, errorStack) && reloadOnceForStaleClientChunk()) return;
  pushError({
    message: errorMessage,
    stack: errorStack,
    url: window.location.pathname,
    timestamp: new Date().toISOString(),
    type: 'uncaught',
  });
});

// Vite emits this when a dynamic route/component chunk cannot be loaded, such
// as when a tab still references a module invalidated by a dev-server rebuild.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleClientChunk()) event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  const reason = event.reason;
  pushError({
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? (reason.stack ?? '') : '',
    url: window.location.pathname,
    timestamp: new Date().toISOString(),
    type: 'unhandledrejection',
  });
});

// ── Performance Monitoring ─────────────────────────────────

if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 1000) {
          console.warn(`⚠️ Slow operation: ${entry.name} took ${entry.duration.toFixed(0)}ms`);
        }
      }
    });

    observer.observe({ entryTypes: ['measure', 'navigation'] });
  } catch (e) {
    // PerformanceObserver not supported
  }
}

// ── Flush on page unload ───────────────────────────────────

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushErrors();
});

window.addEventListener('pagehide', () => flushErrors());

// ── E2B Model Preload (idle time) ─────────────────────────
// Load Gemma 4 E2B (2.3B Q4F16 WebGPU) during idle time so
// first chat inference doesn't pay cold-start penalty.
// Falls back silently if WebGPU unavailable or VRAM too low.

async function preloadE2BAndWarmCache(): Promise<void> {
  try {
    const { initE2B } = await import('$lib/ai/gemma4-e2b-client.js');
    await initE2B();
    console.info('[E2B] Preloaded during idle');
  } catch {
    /* E2B unavailable — 270M ONNX fallback active */
  }

  // Warm synthesis cache with common legal queries (best-effort)
  try {
    const { warmSynthesisCache } = await import('$lib/ai/client-llm-synthesis.js');
    const warmed = await warmSynthesisCache([
      { query: 'What is habeas corpus?' },
      { query: 'Explain due process' },
      { query: 'What is the statute of limitations?' },
      { query: 'Define negligence in tort law' },
    ]);
    if (warmed > 0) console.info(`[Synthesis] Warmed ${warmed} cache entries`);
  } catch {
    /* non-critical */
  }
}

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(() => { preloadE2BAndWarmCache(); }, { timeout: 10_000 });
} else {
  setTimeout(() => { preloadE2BAndWarmCache(); }, 5_000);
}
