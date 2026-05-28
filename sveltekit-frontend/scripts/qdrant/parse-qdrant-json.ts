#!/usr/bin/env node
/**
 * parse-qdrant-json.ts — optional simdjson wrapper for Qdrant HTTP responses
 *
 * Provides a single exported helper `parseQdrantResponse(raw)` that:
 *   1. Tries to use `simdjson` (if installed) for fast SIMD-accelerated parsing
 *   2. Falls back to `JSON.parse` transparently when simdjson is unavailable
 *
 * simdjson is NEVER a hard dependency — this module always succeeds.
 *
 * Usage:
 *   import { parseQdrantResponse } from './parse-qdrant-json.js';
 *   const data = parseQdrantResponse(await response.text());
 *
 * Phase 11D — Qdrant hot-path optimization (B1)
 */

// ── simdjson optional import ──────────────────────────────────────────────────

type SimdJson = { parse: (raw: string) => unknown };
let simd: SimdJson | null = null;

try {
  // Dynamic import so missing module is a runtime warn, not a compile error
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  simd = require('simdjson') as SimdJson;
} catch {
  // simdjson not installed — silent fallback to JSON.parse
}

// ── Exported helpers ──────────────────────────────────────────────────────────

/**
 * Parse a Qdrant HTTP response body string.
 * Uses simdjson when available; falls back to JSON.parse.
 *
 * @throws {SyntaxError} if the string is not valid JSON
 */
export function parseQdrantResponse<T = unknown>(raw: string): T {
  if (simd) {
    try {
      return simd.parse(raw) as T;
    } catch {
      // simdjson failed (e.g. unusual encoding) — fall through to JSON.parse
    }
  }
  return JSON.parse(raw) as T;
}

/**
 * Whether simdjson acceleration is active.
 * Useful for telemetry / health checks.
 */
export const isSimdJsonActive: boolean = simd !== null;

/**
 * Parse a Qdrant scroll or search Response object.
 * Convenience wrapper: calls response.text() then parseQdrantResponse().
 */
export async function parseQdrantResponseObj<T = unknown>(response: Response): Promise<T> {
  const raw = await response.text();
  return parseQdrantResponse<T>(raw);
}
