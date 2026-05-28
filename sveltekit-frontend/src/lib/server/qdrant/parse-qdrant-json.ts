/**
 * parse-qdrant-json.ts — simdjson hot path for raw Qdrant HTTP responses.
 *
 * PURPOSE
 * -------
 * The @qdrant/js-client-rest SDK parses JSON internally and cannot be
 * intercepted without forking it. This helper targets the handful of places
 * in the codebase that call `fetch(qdrantUrl, …).then(r => r.json())` directly
 * (primarily ace-agent.ts search / scroll calls).
 *
 * THRESHOLD
 * ---------
 * Responses >= QDRANT_SIMDJSON_THRESHOLD_BYTES use fastJsonParse (simdjson via
 * the native tensorrt_bridge addon) if the bridge is available; otherwise
 * JSON.parse is used as the fallback. fastJsonParse itself falls back to
 * JSON.parse if the native addon is absent.
 *
 * TRACE METADATA
 * --------------
 * A non-enumerable QdrantParseTrace is attached to the result object via
 * QDRANT_TRACE_SYMBOL so callers can optionally log parser telemetry without
 * polluting the JSON shape. Use getQdrantParseTrace() to read it.
 *
 * USAGE
 * -----
 * Before:
 *   const data = await qdrantResp.json() as MyType;
 *
 * After:
 *   const data = await parseQdrantResponse<MyType>(qdrantResp, 'search');
 *
 * DO NOT use this for @qdrant/js-client-rest SDK calls — they handle
 * JSON parsing internally and cannot be intercepted here.
 */

import { fastJsonParse, isSimdJsonAvailable } from '$lib/server/gpu/simdjson-bridge.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum response size in bytes before simdjson is attempted. */
export const QDRANT_SIMDJSON_THRESHOLD_BYTES = 5_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface QdrantParseTrace {
  /** Which JSON parser was used for this response. */
  parser: 'simdjson' | 'json.parse';
  /** Byte length of the raw response text. */
  responseBytes: number;
  /** Label for the Qdrant operation (e.g. 'search', 'scroll', 'upsert'). */
  qdrantOperation: string;
  /** Wall-clock parse time in milliseconds. */
  parseTimeMs: number;
}

/** Symbol key for the non-enumerable trace attached to parsed Qdrant results. */
export const QDRANT_TRACE_SYMBOL: unique symbol = Symbol('qdrantParseTrace');

// Augment object interface so TypeScript knows the symbol may exist
declare global {
  interface Object {
    [QDRANT_TRACE_SYMBOL]?: QdrantParseTrace;
  }
}

// ── Core helper ──────────────────────────────────────────────────────────────

/**
 * Parse a raw Qdrant HTTP Response, using simdjson for large payloads.
 *
 * @param response   Unconsumed fetch Response from a Qdrant endpoint.
 * @param operation  Short label: 'search' | 'scroll' | 'upsert' | …
 * @returns          Parsed value typed as T, with a non-enumerable trace attached.
 *
 * @throws {SyntaxError} if the response body is not valid JSON (same as r.json()).
 */
export async function parseQdrantResponse<T = unknown>(
  response: Response,
  operation: string,
): Promise<T> {
  const text          = await response.text();
  const responseBytes = text.length;

  const t0 = performance.now();
  let parsed: T;
  let parser: QdrantParseTrace['parser'] = 'json.parse';

  if (responseBytes >= QDRANT_SIMDJSON_THRESHOLD_BYTES && isSimdJsonAvailable()) {
    try {
      parsed = fastJsonParse<T>(text);
      parser = 'simdjson';
    } catch {
      // Simdjson can fail on Qdrant error bodies (non-standard JSON).
      // Fall back to JSON.parse — same behaviour as a plain r.json() call.
      parsed = JSON.parse(text) as T;
    }
  } else {
    parsed = JSON.parse(text) as T;
  }

  const parseTimeMs = performance.now() - t0;

  const trace: QdrantParseTrace = {
    parser,
    responseBytes,
    qdrantOperation: operation,
    parseTimeMs,
  };

  // Attach trace as non-enumerable so it doesn't leak into JSON.stringify output
  if (parsed !== null && typeof parsed === 'object') {
    Object.defineProperty(parsed, QDRANT_TRACE_SYMBOL, {
      value:        trace,
      enumerable:   false,
      writable:     false,
      configurable: true,
    });
  }

  return parsed;
}

// ── Utility ──────────────────────────────────────────────────────────────────

/**
 * Extract the QdrantParseTrace from a previously parsed Qdrant response.
 * Returns null when called on a primitive result or untraced object.
 */
export function getQdrantParseTrace(parsed: unknown): QdrantParseTrace | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  return (parsed as Record<typeof QDRANT_TRACE_SYMBOL, QdrantParseTrace | undefined>)[
    QDRANT_TRACE_SYMBOL
  ] ?? null;
}
