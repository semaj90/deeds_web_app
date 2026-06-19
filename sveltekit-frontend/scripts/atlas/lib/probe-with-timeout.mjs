#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

function normalizeError(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? 'unknown error');
}

export async function probe({ label, timeoutMs = 5000, fn }) {
  const started = performance.now();
  let timeoutId;

  try {
    const value = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);

    return {
      label,
      status: 'READY',
      elapsed_ms: Number((performance.now() - started).toFixed(2)),
      error: null,
      value,
    };
  } catch (error) {
    const message = normalizeError(error);
    return {
      label,
      status: /timed out/i.test(message) ? 'TIMEOUT' : 'ERROR',
      elapsed_ms: Number((performance.now() - started).toFixed(2)),
      error: message,
      value: null,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
