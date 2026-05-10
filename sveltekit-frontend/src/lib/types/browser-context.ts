/**
 * Browser Context Lane — shared types
 *
 * The Admin TRACE Copilot may receive a *sanitized* snapshot of the
 * operator's browser state to improve situational awareness:
 *   - which tab is active, what other tabs are open
 *   - short snippets of page content the operator has opened
 *   - search-history hits relevant to the current question
 *   - the highlighted DOM element (id only) on the current page
 *
 * This is **untrusted user-visible context**, never authoritative truth —
 * the TRACE backend retrieval (KAG / hypergraph / atlas) is canonical.
 *
 * Hard limits enforced server-side by browser-context-sanitizer.ts:
 *   - chrome:// / edge:// / about:// / file:// URLs dropped
 *   - query strings stripped by default (URL `?token=…` is the #1 leak)
 *   - matching token names redacted from the URL fragment + snippet text
 *   - 50 tabs max, 20 snippets max, 3000 chars per snippet
 *   - input / password / form-field values never accepted
 *
 * Storage is per-user, volatile (Redis with 1h TTL), one snapshot per session.
 */
import { z } from 'zod';

/** Cap constants used by the sanitizer. Importable by the API route + tests. */
export const BROWSER_CONTEXT_CAPS = {
  MAX_TABS:           50,
  MAX_SNIPPETS:       20,
  MAX_HISTORY_HITS:   30,
  MAX_SNIPPET_CHARS:  3_000,
  MAX_TITLE_CHARS:    250,
  MAX_URL_CHARS:      500,
  MAX_HIGHLIGHTED_ID: 250,
  REDIS_TTL_SECONDS:  3600,
} as const;

/** URL schemes that are NEVER accepted from the browser snapshot. */
export const FORBIDDEN_URL_SCHEMES = [
  'chrome:', 'edge:', 'about:', 'file:', 'view-source:', 'devtools:',
  'data:', 'javascript:', 'blob:', 'chrome-extension:', 'moz-extension:',
] as const;

/** Token-like substrings that get redacted from URLs + snippet text.
 *  Matched case-insensitively as `name=value` pairs in the URL query string,
 *  or as `name: value` lines inside snippet bodies. */
export const REDACTED_TOKEN_NAMES = [
  'access_token', 'access-token',
  'api_key', 'api-key', 'apikey',
  'auth', 'authorization',
  'bearer',
  'jwt',
  'password', 'passwd', 'pwd',
  'secret',
  'session', 'sessionid', 'session_id', 'session-id',
  'token',
  'x-api-key', 'x_api_key',
] as const;

// ── Zod schema (input shape — what the browser/extension may POST) ──────────

export const BrowserTabSchema = z.object({
  id:          z.string().max(BROWSER_CONTEXT_CAPS.MAX_HIGHLIGHTED_ID).optional(),
  title:       z.string().max(BROWSER_CONTEXT_CAPS.MAX_TITLE_CHARS),
  url:         z.string().max(BROWSER_CONTEXT_CAPS.MAX_URL_CHARS),
  active:      z.boolean().default(false),
  pinned:      z.boolean().default(false),
});
export type BrowserTab = z.infer<typeof BrowserTabSchema>;

export const BrowserSnippetSchema = z.object({
  source_url:  z.string().max(BROWSER_CONTEXT_CAPS.MAX_URL_CHARS),
  title:       z.string().max(BROWSER_CONTEXT_CAPS.MAX_TITLE_CHARS).optional(),
  text:        z.string().max(BROWSER_CONTEXT_CAPS.MAX_SNIPPET_CHARS),
  /** Optional CSS selector or DOM path the operator copied from. */
  selector:    z.string().max(500).optional(),
});
export type BrowserSnippet = z.infer<typeof BrowserSnippetSchema>;

export const BrowserHistoryHitSchema = z.object({
  url:         z.string().max(BROWSER_CONTEXT_CAPS.MAX_URL_CHARS),
  title:       z.string().max(BROWSER_CONTEXT_CAPS.MAX_TITLE_CHARS).optional(),
  /** Score from the local Transformers.js feature-extraction worker (0..1).
   *  May be omitted if WebGPU was unavailable and the worker degraded. */
  score:       z.number().min(0).max(1).optional(),
  /** ISO-8601 timestamp of the visit. Optional — Chrome/Firefox History API
   *  may not surface it for the current session. */
  visited_at:  z.string().optional(),
});
export type BrowserHistoryHit = z.infer<typeof BrowserHistoryHitSchema>;

export const BrowserContextSnapshotSchema = z.object({
  /** ISO-8601 — when the browser captured the snapshot. */
  captured_at:  z.string(),
  /** Browser-side session id (extension-generated, opaque). */
  session_id:   z.string().max(128),
  /** The active tab. May be the same object as one entry in `tabs[]`. */
  current_tab:  BrowserTabSchema.optional(),
  /** All open tabs across the operator's window(s). Capped at 50 server-side. */
  tabs:         z.array(BrowserTabSchema).default([]),
  /** Selected text / page snippets the operator highlighted. Capped at 20 × 3000 chars. */
  snippets:     z.array(BrowserSnippetSchema).default([]),
  /** Local-search hits from the operator's history (Transformers.js scored). */
  history_hits: z.array(BrowserHistoryHitSchema).default([]),
  /** id of the DOM element under the operator's cursor when they invoked Copilot.
   *  No values, no innerText — id only. Helps the assistant ground "what's selected". */
  highlighted_element_id: z.string().max(BROWSER_CONTEXT_CAPS.MAX_HIGHLIGHTED_ID).optional(),
  /** Local embedding model used by the worker, if any. e.g. 'Xenova/all-MiniLM-L6-v2'. */
  embed_model:  z.string().max(200).optional(),
  /** WebGPU / WASM / unavailable. */
  embed_device: z.enum(['webgpu', 'wasm', 'cpu', 'unavailable']).default('unavailable'),
});
export type BrowserContextSnapshot = z.infer<typeof BrowserContextSnapshotSchema>;

/** What the SERVER stores + serves — adds sanitization metadata so the LLM
 *  can know what was redacted/dropped. */
export interface SanitizedBrowserContext extends BrowserContextSnapshot {
  /** Counts of items that were dropped by the sanitizer. */
  sanitized: {
    tabs_dropped:           number;
    snippets_dropped:       number;
    history_hits_dropped:   number;
    urls_redacted:          number;
    snippet_redactions:     number;
    forbidden_schemes_seen: number;
  };
  /** Constant — propagated to the LLM as a "trust" hint. */
  trust:        'untrusted_user_visible';
  /** When the server received + sanitized this snapshot. */
  received_at:  string;
}