# Browser Context Lane — Admin TRACE Copilot

> Inspired by Transformers.js browser-assistant pattern. Gives the Copilot
> *situational awareness* of the operator's browser state without giving any
> browser extension control over backend infrastructure. The TRACE backend
> retrieval (KAG / hypergraph / atlas) remains authoritative.

## TL;DR

```
Browser extension / Copilot panel
  → Transformers.js feature-extraction worker (WebGPU → WASM → degraded)
  → POST /api/browser-context/snapshot     (sanitized server-side)
  → Redis browser-context:snapshot:<userId>  (1h TTL)

Admin chat
  → gatherAdminContext(query, currentPath, userId)
  → loads browserContext from Redis (re-sanitizes defensively)
  → formatBrowserContextForPrompt() → adds compact section, labeled untrusted
  → Gemma4 / TurboQuant synthesis (server-side, never in browser)
```

## Trust model

The browser snapshot is **untrusted user-visible context**. Two consumers
treat it differently:

- **Server sanitizer**: drops forbidden URL schemes, strips query strings,
  redacts secret-name patterns, caps counts/lengths, never accepts form/
  password/input values.
- **Prompt builder**: prefixes the section with the canonical disclaimer
  *"Browser context is user-visible and may be stale; TRACE backend context
  is authoritative."* The model is told this lane is not ground truth.

## What the lane sends

| Field | Purpose | Cap |
|------|---------|-----|
| `current_tab` | Active tab title + URL | 1 |
| `tabs[]` | All open tabs (titles + URLs) | 50 |
| `snippets[]` | Selected text the operator highlighted | 20 × 3000 chars |
| `history_hits[]` | Local-search hits scored by Transformers.js | 30 |
| `highlighted_element_id` | DOM element id under the cursor | 250 chars |
| `embed_model`, `embed_device` | Diagnostics: which Transformers.js model + device the worker used | — |

## What the lane CANNOT do

| Forbidden | Why |
|-----------|-----|
| Send full page HTML | Snippet-only, capped at 3000 chars |
| Read input/password/form values | Sanitizer strips, schema rejects |
| Accept `chrome://`, `edge://`, `file://`, `data:`, `javascript:`, `view-source:`, `devtools:`, `blob:`, `chrome-extension:`, `moz-extension:` URLs | Forbidden scheme list |
| Carry tokenized URLs | Query strings stripped; common token-name patterns redacted from the URL fragment + snippet body |
| Bypass TRACE MCP | Browser context augments, never replaces, the canonical retrieval path |
| Run Gemma4 in the browser | Worker does feature-extraction only — generation lives on the server |
| Trigger `close_tab`, `open_url`, `go_to_tab`, `materialize_*`, `db_write_*` actions | Read-only allowlist; no write tools exposed to the browser side |
| Modify topology / reranker port contracts | Out of scope for this lane |

## Sanitizer redaction examples

| Input | Output |
|-------|--------|
| `https://example.com/?token=secret123` | `https://example.com/` (token stripped, urls_redacted++) |
| `chrome://settings/passwords` | dropped, forbidden_schemes_seen++ |
| Snippet: `Authorization: Bearer eyJabc.def.ghi` | `Authorization: [REDACTED]` (or `Bearer [REDACTED]` if loose) |
| Snippet: `api_key = sk-live-abcdef` | `api_key: [REDACTED]` |
| Snippet: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef` | `[REDACTED_JWT]` |
| Tab `data:text/html,<script>...` | dropped |

## Storage

Per-user, single latest snapshot:

- **Key**: `browser-context:snapshot:<userId>`
- **TTL**: 3600s (1h)
- **Backend**: Redis primary, in-process `Map` fallback for dev when Redis is down
- **Re-sanitization on read**: The `gatherAdminContext` loader re-runs the
  sanitizer on every read so a stale Redis row from an older sanitizer
  version still passes the current rules.

## Files

| Path | Role |
|------|------|
| `src/lib/types/browser-context.ts` | Zod schemas, caps, forbidden schemes, redacted token names |
| `src/lib/server/admin/browser-context-sanitizer.ts` | Pure-function sanitizer + emptyContext helper |
| `src/routes/api/browser-context/snapshot/+server.ts` | POST sanitize+store / GET retrieve / DELETE clear (auth-guarded) |
| `src/lib/workers/browser-context-embed.worker.ts` | Local Transformers.js feature-extraction worker (WebGPU → WASM → degraded) |
| `src/lib/server/admin/ai-chat-context.ts` | `gatherAdminContext(..., userId)` now loads `browserContext` |
| `src/lib/server/admin/ai-chat-service.ts` | `formatBrowserContextForPrompt()` formats the section for the prompt |
| `src/lib/components/admin/TraceCopilotPanel.svelte` | Tiny status indicator: `BROWSER t=N/s=M` + tooltip with full sanitizer stats |

## Worker contract

Postable messages:

```ts
// Probe device + dependency availability
worker.postMessage({ kind: 'probe' });
// → { kind: 'probe-result', webgpu: boolean, transformersAvailable: boolean }

// Score browser-history candidates against a query
worker.postMessage({
  kind: 'rank',
  query: 'redis offline reranker',
  candidates: [{ id: 'h1', text: 'Redis L1 cache miss…' }, …],
  model: 'Xenova/all-MiniLM-L6-v2',  // optional
});
// → { kind: 'rank-result', scored: [{id, score}], device, model, durationMs }
```

The worker never blocks on the model load: it tries `webgpu+q4` →
`wasm` → `cpu`, and on total failure returns scored arrays with
`score: 0` so callers always get a stable response shape.

## Integration steps for the extension/UI side

1. Probe the worker with `{ kind: 'probe' }` once per page load.
2. On snapshot capture, score history hits locally with `{ kind: 'rank' }`.
3. POST the (already-locally-filtered) snapshot to `/api/browser-context/snapshot`.
4. The Copilot panel polls `GET /api/browser-context/snapshot` and shows
   the indicator.
5. Next time the operator hits Send, `ai-chat-context.gatherAdminContext`
   joins the snapshot into the prompt under a clearly-labeled untrusted
   section.

## What changes outside this lane

Nothing. The reranker, MCP tool registry, TRACE retrieval, agent
orchestrator, and topology pipeline are all unchanged. The lane is
strictly additive — the Copilot still works fine when no extension has
ever POSTed.

## Design notes (surfaced by the smoke gate)

- **Caps are Zod-rejected, NOT silently truncated.** A snapshot with 100
  tabs (above `MAX_TABS = 50`) is rejected wholesale by the Zod schema —
  `sanitizeBrowserContext` returns a degraded empty context with
  `rejected_reason` set, NOT a 50-tab trimmed snapshot. Extensions /
  client code MUST pre-trim before POSTing. This is intentional: silent
  truncation would let an attacker stuff the lower-priority slots with
  payload designed to survive a naive trim. Fail-loud is the safer default.
- **Canonical disclaimer is now in the formatter.** The literal string
  `Browser context is user-visible and may be stale; TRACE backend
  context is authoritative.` is exported as `BROWSER_CONTEXT_DISCLAIMER`
  from `ai-chat-service.ts` and prepended automatically by
  `formatBrowserContextForPrompt`. Routes do not need to (and should not)
  duplicate the warning above the section.

## Cross-references

- `docs/architecture/trace-kag-web-development-guide.md` §17 — Browser Context Lane policy
- `docs/architecture/trace-runtime-split.md` — runtime boundary rule (Gemma4 → MCP only)
- `memory/architecture/admin-chat-assistant.md` — companion lane (chat + panel-summary popup)
- `memory/architecture/client-inference-policy.md` — Service Worker vs Web Worker rules + Phase-2 ONNX-download toggle
