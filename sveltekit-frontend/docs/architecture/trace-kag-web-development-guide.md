---
name: TRACE/Karpathy Web Development Guide
description: Practical guide for building the SvelteKit/Drizzle/Qdrant/Neo4j/Gemma4 app around KAG context
type: project
tags:
  - trace
  - karpathy
  - kag
  - web-development
  - sveltekit
  - drizzle
  - qdrant
  - neo4j
  - gemma4
---

# TRACE/Karpathy Web Development Guide

## 1. Goals

Build a SvelteKit 2 app that supports legal/evidence workflows, AI retrieval, uploads, graph analysis, and durable memory — using the runtime split defined in `trace-runtime-split.md`.

## 2. Runtime Split

Reference [`trace-runtime-split.md`](./trace-runtime-split.md). Short version: TypeScript orchestrates; GPU does dense math; Redis caches; Qdrant searches vectors; Postgres stores truth; Neo4j analyzes graphs; Gemma4 synthesizes only after retrieval has narrowed the candidate set.

## 3. RAG / HyperRAG / KAG / DAG / TRACE

- **RAG** — Retrieve chunks from Qdrant, then answer with Gemma4.
- **HyperRAG** — Retrieve across many memory types: chunks, summaries, wiki notes, research notes, prior answers, topology regions.
- **KAG (Knowledge-Augmented Generation)** — vectors + graph facts + ontology + audit gates + AGENTS.md + research provenance.
- **DAG (Directed Acyclic Graph)** — safe ordered execution plan with no loops.
- **TRACE** — Triage → Retrieve → Align → Compose → Encode. Production KAG-DAG.

## 4. SvelteKit Route Pattern

```ts
export const POST: RequestHandler = async ({ request, locals }) => {
  // 1. Auth guard
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Zod validate input
  const body = await request.json();
  const parsed = MyRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, { status: 400 });

  // 3. Call TypeScript service (NOT raw infra)
  const result = await myService.handle(parsed.data, locals.user.id);

  // 4. Service writes metadata; background jobs do heavy work
  return json(result);
};
```

Background heavy work goes through RabbitMQ queues, never inline in the request handler.

## 5. Drizzle + Postgres

Postgres is canonical app state and JSONB metadata envelopes via Drizzle ORM. **Do not** put binary blobs (images, GLBs, PDFs) in Postgres — those go to object storage.

Use:
- `pgvector` columns for relational vector queries (mirrored from Qdrant)
- JSONB for evolving metadata envelopes (`payload`, `metadata`, `manifold4`)
- HNSW indexes for vector columns (manual SQL — Drizzle can't express `WITH (m=16, ef_construction=64)`)

## 6. Object Storage

Use local filesystem in dev and the repo's SeaweedFS S3 gateway in prod. Keep the adapter generic so the same MinIO-compatible client shape can target SeaweedFS, R2, B2, S3, or Wasabi without touching call sites.

```
src/lib/server/storage/
├── object-storage.ts       interface
├── local-fs-storage.ts     dev
├── s3-storage.ts           AWS
├── r2-storage.ts           Cloudflare
└── b2-storage.ts           Backblaze
```

Interface:

```ts
export interface ObjectStorage {
  putObject(input: { key: string; body: ReadableStream | Buffer; contentType: string }): Promise<{ key: string }>;
  getObject(key: string): Promise<ReadableStream>;
  deleteObject(key: string): Promise<void>;
  createSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
```

### Compatibility note

SeaweedFS is Apache 2.0 and is the canonical object-store gateway in this repo. Keep MinIO-compatible client syntax only at the adapter boundary so legacy call sites do not change, and point that adapter at SeaweedFS or another S3 backend as needed.

## 7. Qdrant Collections

| Collection | Purpose |
|---|---|
| `codebase_chunks_768` | Source code chunks (dual vector: content + signature) |
| `directory_summaries_768` | Per-directory rollups |
| `summary_lenses_768` | Cross-cluster lens summaries |
| `synthesis_memory_768` | Persisted LLM outputs marked as "memory" |
| `research_memory_768` | Web-research crawl outputs |
| `evidence_items` | Case evidence chunks + metadata |

All 768-d (embeddinggemma). Use named vectors (`content`, `signature`) where dual representation matters.

## 8. Neo4j Graph Model

| Node | Edges |
|---|---|
| `File` | `IMPORTS`, `DEPENDS_ON`, `MEMBER_OF`, `BELONGS_TO_CLUSTER`, `SIMILAR_TOPOLOGY` |
| `Directory` | `CONTAINS`, `HAS_DIRECTORY_SUMMARY` |
| `Route` | `EXPOSES`, `CALLS_SERVICE` |
| `Evidence` | `BELONGS_TO_CASE`, `RELATED_TO`, `CITES` |
| `ResearchNote` | `SIMILAR_RESEARCH`, `CITES_CASE` |
| `Cluster` | `HAS_DIRECTORY_SUMMARY`, `CONTAINS_FILE` |
| `SynthesisMemory` | `DERIVED_FROM`, `INVALIDATES` |

Graph algorithms (PageRank, communities, shortest path) run via Neo4j GDS. Use cached `couchdb:pagerank_scores` (6h TTL) — never inline PageRank in Cypher.

## 9. Redis Cache Keys

| Pattern | Purpose | TTL |
|---|---|---|
| `wiki:note:dir:*` | Per-dir wiki notes | session |
| `rag:exact:*` | L1 exact-match cache | 1h |
| `tensor:embedding:*` | Embedding cache | 24h |
| `similarity:query:*` | Repeated query similarity | 1h |
| `centroid:members:*` | Cluster member lists | 24h |
| `ace:trace:*` | Retrieval traces | 300s |
| `ace:topo:{class}:{hash}` | Topo-byte candidate cache | 300s |
| `gpu:karpathy:scores` | Per-file blend score | 24h |
| `couchdb:pagerank_scores` | Graph PageRank | 6h |
| `kag:ingested:{hash}` | Ingest idempotency | 7d |

Always prefix with the lane (`ace:`, `kag:`, `gpu:`, `wiki:`, etc.) so `KEYS pattern` audits stay readable.

## 10. MCP Tool Boundary

Gemma4 calls MCP tools only. See `src/mcp/trace-mcp-server.ts`.

Allowlist defaults to **read-only**. Write/destructive tools require explicit operator opt-in flag.

Named tools (current): `trace.kag_search`, `topology.search_near`, `graph.expand_neighborhood`, `graph.shortest_path`, `clusters.get_summary_lenses`, `trace.explain_retrieval`, `kb.wiki_note_lookup`, `kb.archive_synthesis`.

## 11. Worker Threads

Use `worker_threads` for CPU-intensive non-LLM work:
- Markdown chunking
- AST parsing
- SHA-256 hashing
- Entity extraction
- JSONB metadata generation
- Qdrant payload serialization

Bounded queues + batch writers. Keep Gemma4 **out** of the worker pool except for selective summary tasks.

## 12. GPU Rules

GPU only for dense math and bounded reranking/clustering (LibTorch/CUDA via N-API).

| Allowed on GPU | Forbidden on GPU |
|---|---|
| Cosine similarity batches (32–128) | JSON parsing |
| K-means / SOM / BMU | File I/O |
| PageRank precompute (offline) | Small graph traversal |
| Autoencoding / projection | Postgres joins |
| INT4/INT8 inference (TensorRT) | Inline LLM token generation* |

*Gemma4 inference goes through llama-server / Ollama, not a direct GPU bridge.

## 13. Gemma4 Rules

Gemma4 synthesizes from retrieved context. It does **not** browse raw infra.

- Input: pre-narrowed candidate set (top-K notecards / chunks)
- Output: JSON-structured response per Zod schema (no free-form prose for tool calls)
- KV cache reuse via frozen system prompt (don't re-version unnecessarily)
- TurboQuant chat-only (per CLAUDE.md "Gemma4 TurboQuant caveat") — NOT for embeddings

## 14. Obsidian / Karpathy Memory

High-gain synthesis becomes wiki memory only after validation. Flow:

```
Gemma4 synthesis output
  → memory-gain scoring
  → operator review (or auto-approve if score > threshold)
  → wiki:note:dir:* Redis write
  → AGENTS.md update via incremental pipeline (never bulk rewrite)
  → Obsidian vault sync (one-way: Redis → vault, not reverse)
```

Wiki memory is **derived state**, not source of truth. Postgres + Qdrant + Neo4j remain canonical.

## 15. Testing

Smoke gates that should always pass before commit:

| Command | What |
|---|---|
| `npm run smoke:trace` | TRACE basic path |
| `npm run smoke:trace:full` | Full DAG loop |
| `npm run smoke:atlas` | MCP atlas P1.7/P1.8 |
| `npm run smoke:hypergraph:vault` | 4-lane retrieval substrate |
| `npm run smoke:fast-ast` | AST scan smoke |
| `npm run smoke:browser-context` | Browser context lane sanitizer |
| `npm run smoke:graphify` | Graphify deep imports |
| `npm run typecheck:native` | tsgo audit (~10× faster than tsc) |
| `npm run check` | svelte-check |
| `npm run validate:fast` | 25-gate Tier 0 validator |

## 16. Known issues (don't chase yet)

### RESOLVED — MCP `tools/list` Zod 4 schema crash

**Status:** Resolved.

The previous `tools/list` crash was not caused by the MCP SDK version alone
and should not be fixed by downgrading Zod.

**Root cause:** several TRACE MCP tool schemas used the Zod 3 single-argument
record form:

    z.record(z.any())

In Zod 4, records must specify both key and value schemas:

    z.record(z.string(), z.any())

The single-argument form can compile but fails during MCP `tools/list`
JSON-schema generation.

**Permanent guard:** `G34 mcp:zod-record-two-arg`

G34 scans MCP tool registrations and fails Tier 0 validation if any
single-argument `z.record(...)` pattern appears.

**Reference commit:** `f41951c0ee`

**Operational rule:**

- Keep Zod 4.
- Do not globally downgrade to Zod 3.
- Do not rely on runtime monkey patches for this issue.
- Fix schema definitions at source.
- Run `npm run smoke:mcp-tools-list:bisect` after MCP tool schema changes.

### RESOLVED — TRACE MCP `/mcp` returns silent HTTP 500 on every call after the first

**Status:** Resolved (2026-05-09).

**Symptom:** First MCP request after spawn (e.g. `initialize`) succeeded; every
subsequent call returned HTTP 500 with **empty body, no log, no
`transport.onerror`, no `process.uncaughtException`**. Looked like a Zod schema
crash, but `tools/list` body was 0 bytes — the SDK never reached schema
serialization.

**Root cause:** `trace-mcp-server.ts` used a single shared
`StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` for the
whole process. The MCP SDK explicitly forbids this in stateless mode
(`@modelcontextprotocol/sdk/.../webStandardStreamableHttp.js:139-141`):

    if (!this.sessionIdGenerator && this._hasHandledRequest) {
      throw new Error('Stateless transport cannot be reused across requests. Create a new transport per request.');
    }

The `throw` propagates through `@hono/node-server`'s `getRequestListener`
async chain, which converts it to a 500 response *before* it reaches the
SDK's `onerror` callback or our outer try/catch — explaining the
empty-body / no-log mystery.

**Fix:** create a fresh `StreamableHTTPServerTransport` and
`server.connect(transport)` per request inside the HTTP handler. The
shared `McpServer` instance (which holds the tool registry) is reused.

**Operational rule:**

- In stateless mode (no `sessionIdGenerator`), every HTTP handler must
  construct a new transport per request.
- Stateful mode (with `sessionIdGenerator`) requires clients to pass
  `Mcp-Session-Id` — only adopt if you control all clients.
- Keep `process.on('uncaughtException')` + `process.on('unhandledRejection')`
  + per-request error logger in the spawn log so the *next* swallowed-500
  bug is visible immediately.

### Open

- **P1.8 hypergraph.search needs SvelteKit dev server** — not an MCP failure; the API route is dev-server-dependent. Run `npm run dev` before `smoke:atlas` to exercise both P1.7 and P1.8.
- **`/api/ace/recommendations` skips when dev server down** — expected, not a regression; green only means the probe ran.

## 17. SurrealDB

Use SurrealDB as **experimental sidecar only**, not as a replacement for Postgres + Qdrant + Neo4j. License is BSL 1.1 (free for self-hosted, restricted for managed-DBaaS resale, converts to Apache 2.0 four years post-release). Strong unified document+graph+vector model, but the specialized stack still wins on graph algorithms (Neo4j GDS) and vector ANN performance (Qdrant).

## 18. SvelteKit Route Execution Contract (expands §4)

§4 introduces the basic shape; this section is the production contract.

```
Request
  → Zod validate input
  → auth/admin guard
  → call TypeScript service
  → service reads/writes metadata
  → background queue handles heavy work
  → response returns compact JSON / degraded JSON
```

**Hard rules**:
- Routes do **not** run GPU-heavy work. Push to RabbitMQ + sidecar.
- Routes do **not** call raw model providers unless they are model-facing API routes (`/api/v1/chat/completions`, `/api/embed`, etc.).
- Routes return **degraded JSON** instead of hard 500s when optional services are offline. Same top-level keys on success and degraded. See CLAUDE.md "Degraded Response Contract".
- Routes log provenance when touching evidence, retrieval, or agent state — write to `context_timeline` for retrieval/agent events, `evidenceAuditLog` for evidence mutations.
- Routes that compose retrieval go through TypeScript services that wrap MCP tools, not raw Qdrant/Neo4j calls.

## 19. Retrieval Lane Decision Tree

Pick the lane by question shape, not preference. Use this order:

```
Exact identifier / filename / route / error?
  → SPARSE first (rg / Fuse / BM25 over notecard search_text)

Conceptual question?
  → DENSE Qdrant search + summary lenses (codebase_chunks_768 / summary_lenses_768)

Relationship / path question?
  → Neo4j / hypergraph / pathway cards (graph.expand_neighborhood, graph.shortest_path)

Feature status / TODO / timeline?
  → feature cards + timeline cards (Postgres + context_timeline)

Current UI state?
  → UI snapshot + browser context lane (admin Copilot only)

Long answer / synthesis?
  → compact context pack → Gemma4 (top-K notecards or M-cards, never raw JSONL)

Repeated query?
  → Redis L1 (rag:exact:*) → Bifrost L2 (semantic) → pathway-card cache
```

Compositional rule: **most production queries are hybrid** — dense ANN → graph expansion of top-K → Karpathy rerank → ACE context pack. That's what `fetchACPKnowledgeResults()` already does at Stage A0.

**Hard rule**: do not send raw JSONL, raw graph dumps, or entire docs to Gemma4. Always pre-narrow to top-K notecards/cards/chunks first.

## 20. Admin Copilot Safety

Admin Copilot V1 is **read-only**. Allowed verbs:

- inspect, explain, recommend, summarize, search, rerank, show context pack

Blocked in V1:

- shell commands
- DB writes (Postgres / Qdrant / Neo4j / Redis)
- cache deletes
- RabbitMQ publish
- topology recompute execution (pre-computed views only)
- materialize pathway cards (read existing only)
- browser navigation actions (`open_url`, `close_tab`, `go_to_tab`)

**Write actions require explicit confirmation gates and audit logs.** No "agentic write" path bypasses operator approval in V1.

## 21. Browser Context Lane (canonical)

Browser context is **optional and untrusted**. Sanitized server-side, capped, redacted, labeled non-authoritative in the prompt.

**May include**: current tab, open tabs (sanitized), sanitized snippets, semantic history hits, highlighted element IDs.

**Must NOT include**: full page HTML, form inputs, passwords, tokenized URLs, `chrome://`, `edge://`, `about://`, `file://`, `view-source://`, `devtools://`, `data:`, `javascript:`, `blob:`, `chrome-extension:`, `moz-extension:`.

**Caps** (Zod-enforced, see `src/lib/types/browser-context.ts`):
- 50 tabs
- 20 snippets
- 30 history hits
- 3000 chars per snippet
- 250 chars title / highlighted ID
- 500 chars URL

**Sanitizer redacts** (see `src/lib/server/admin/browser-context-sanitizer.ts`):
- URL query params matching `REDACTED_TOKEN_NAMES` (api_key, token, bearer, jwt, session, etc.)
- Snippet `name: value` lines for the same token names
- `Bearer xxx` prefixes
- JWT-shaped tokens

**Allowed extension tools (V1)**: `get_open_tabs`, `find_history`, `ask_website`, `highlight_website_element`.

**Blocked (V1)**: `open_url`, `close_tab`, `go_to_tab`, `materialize_*`, `db_write_*`, `rabbitmq_publish_*`, `cache_delete_*`, `shell_*`.

**Prompt disclaimer** (recommended literal — track as future polish per smoke gate B07):
> Browser context is user-visible and may be stale; TRACE backend context is authoritative.

**Smoke**: `npm run smoke:browser-context` (7 gates, pure-function, no network).

## 22. RabbitMQ / Sidecar Rules

RabbitMQ handles long-running work. SvelteKit produces jobs; sidecars consume.

| Queue | Sidecar | Job |
|---|---|---|
| `comfyui.render` | ComfyUI HTTP bridge | image/keyframe gen |
| `evidence.render` | Python TRELLIS | image-to-3D GLB |
| `scene.render` | Blender background | Mixamo MP4 |
| `scene.export` | Node ZIP packer | offline HTML5 bundle |
| `chat.summarize` | Gemma4 worker | session rollups |
| `index.backfill` | TS indexer | Qdrant + Neo4j backfills |
| `cartridge.pack` | TS cartridge worker | CHR97 cold cartridges (per design doc) |

**Hard rules**:
- No heavy GPU/3D work runs on the SvelteKit main process.
- Jobs are durable (`persistent: true`, `durable: true`) per CLAUDE.md RabbitMQ pattern.
- Workers ack only on success; nack with requeue on retryable failure (max 3); DLQ on poison.
- Producer never blocks on consumer — fire-and-forget with status tracked via Redis or `context_timeline`.

## 23. Production Safety Gates

Before a feature ships, every box must be checked:

- [ ] Auth guard exists on every protected route (`locals.user` check)
- [ ] Zod validation exists for every JSON input
- [ ] Degraded/offline behavior exists (no hard 500s on optional-service failure)
- [ ] Audit log exists for every write (`evidenceAuditLog`, `context_timeline`, etc.)
- [ ] Source hashes / provenance exist for every piece of generated memory
- [ ] No raw infra access from Gemma4 — MCP tools only
- [ ] No GPU work on the Node main thread — RabbitMQ + sidecar
- [ ] No ambiguous ports (single source of truth in `env.server.ts`, no localhost literals)
- [ ] Smoke test exists and passes (`scripts/smoke/` or equivalent)
- [ ] G-gate coverage in `scripts/validate/full-system.mjs` if the feature crosses tier boundaries
- [ ] **G34 `mcp:zod-record-two-arg`** passes — MCP tool schemas use `z.record(z.string(), z.any())`, never the Zod 3 single-arg form (would crash `tools/list`)
- [ ] **G37 `mcp:tool-surface-clean`** passes — no cross-file MCP tool name collisions, no ungated handler aliases
- [ ] **G38 `mcp:stateless-transport-per-request`** passes — `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` is constructed *inside* the HTTP request handler, never as a module-scope singleton (would silent-500 every call after the first)

## Final rule

```
TypeScript orchestrates.
MCP gates.
Qdrant recalls.
Neo4j relates.
Redis caches.
GPU accelerates.
Gemma4 synthesizes.
Humans approve writes.
```

## Cross-references

- [`trace-runtime-split.md`](./trace-runtime-split.md) — runtime boundary rule
- §"Karpathy GPU Authority Blend + Redis ACE Cache" (project-root CLAUDE.md)
- §"Retrieval Lanes — Vector vs Hyper-Graph-RAG" (`sveltekit-frontend/CLAUDE.md`)
- `next_steps/active/2026-05-09_karpathy-chr97-wiring.md` — cartridge wiring design
- `next_steps/active/2026-05-09_agents-md-incremental-pipeline.md` — AGENTS.md update pipeline design
- `memory/hypergraph-4-lanes-vault.md` — 4-lane retrieval substrate
