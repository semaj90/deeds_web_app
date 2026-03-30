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
let errorBuffer: ClientError[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function pushError(err: ClientError): void {
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

// ── SvelteKit handleError ──────────────────────────────────

export const handleError: HandleClientError = ({ error, event, status, message }) => {
  console.error('Client error:', error);
  pushError({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? '') : '',
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    timestamp: new Date().toISOString(),
    type: 'handleError',
  });
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
  pushError({
    message: event.error?.message ?? event.message ?? 'Unknown error',
    stack: event.error?.stack ?? '',
    url: window.location.pathname,
    timestamp: new Date().toISOString(),
    type: 'uncaught',
  });
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

startFlushTimer();

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushErrors();
});

window.addEventListener('pagehide', () => flushErrors());
