# Serialization Roadmap — JSONB → Proto → gRPC → MCP → QUIC

> Captures the user's planning intent for compiling the YoRHa schema spine
> across wire formats. **Not** a request to implement now — this is the
> map for when each layer becomes load-bearing.

## Current state (2026-05-08, verified)

| Layer | Tooling | Status |
|---|---|---|
| **JSONB** (storage) | Drizzle + Postgres `jsonb` columns + Zod runtime validators | ✅ canonical, in use everywhere |
| **Zod → Protobuf** | `scripts/proto-from-zod.mjs` (`npm run proto:from-zod`) | ✅ generates `proto/generated/yorha_metadata.proto` from canonical schemas |
| **Proto → JS/TS** | `npm run proto:generate` (pbjs/pbts → `src/proto/legal_api_pb.{js,d.ts}`) | ✅ wired for `legal_api.proto` |
| **gRPC services** | 6 clients · 3 Go services live (50051/50053/8100) | ✅ embedding + retrieval + chr97; 3 disabled by default |
| **MCP transport** | FastMCP over Streamable HTTP `:8788` (35 tools) | ✅ JSON-RPC over HTTP/SSE |
| **QUIC** | not present | 🔴 not yet — see decision matrix below |

## Schema spine inventory

**Zod-validated (runtime):**
- `src/lib/server/agents-md/schema.ts` — AGENTS.md envelope (parsed → `agent_context_files`)
- `src/lib/server/glyph/*.ts` — GlyphRecord (semantic + vector + topology + render)
- `src/lib/server/db/schema-postgres.ts` — 70+ tables; `$inferSelect` / `$inferInsert` for type derivation

**Proto-generated** (`proto/`):
- `legal_api.proto` (top-level case/evidence/document API)
- `embedding.proto` (gRPC :50051)
- `retrieval.proto` (gRPC :50053)
- `analyzer.proto`, `codeintel.proto`, `legal.proto` (active services)
- `generated/yorha_metadata.proto` (auto-generated, do not hand-edit)

**Wire-only via `tools/list`** (no .proto yet):
- 35 MCP tool input schemas — currently JSON Schema (Zod-derived) over HTTP
- Taxonomy nodes/edges (just shipped) — Postgres-only, no .proto yet
- Screenshot artifacts — Postgres-only, no .proto yet

## When to compile each layer

### 1. JSONB → Proto (P1 — when CrossLanguage)
Trigger: another language (Go, Python, Rust) needs to read the same shape.
Today only Go services consume proto — TypeScript reads Zod.
Action: extend `scripts/proto-from-zod.mjs` to walk new schemas as they're
added. Add `proto:check` to CI so drift fails the build.

**Already extendable to:**
- `taxonomy_nodes` / `taxonomy_edges` (5,527 nodes / 62,802 edges) — emit
  `yorha.taxonomy.v1.Node` + `Edge` so a future Go service can stream the
  hierarchy
- `screenshot_artifacts` — emit `yorha.visual.v1.ScreenshotArtifact` once
  the Go retrieval service learns to dual-mode (code + visual)

### 2. Proto → gRPC (P1 — already done where needed)
Existing services consume proto. New ones: define `.proto` first,
`generate.sh` writes Go + TS clients, fall back to inline TypeScript when
service is offline (the `*_GRPC_ENABLED=false` pattern).

**Pending wires:**
- `taxonomy.children` / `taxonomy.path` — currently MCP-only. Promote to
  gRPC when ACE wants stream-back-pressure on large drill-downs.
- `screenshot.search` (visual retrieval) — only worth a gRPC service once
  the caption pipeline catches up; HTTP via SvelteKit fine for now.

### 3. MCP (P0 — already canonical)
MCP is the model-facing surface. Tools wrap the gRPC + Postgres calls.
Don't expose .proto directly to the model. Keep tool schemas in Zod (close
to the handler) and let MCP serialize JSON-RPC.

**Discipline:**
- One Zod schema per tool input
- Reuse runtime validators between SvelteKit endpoints and MCP handlers
- Never let a tool return raw .proto — always project to a model-friendly
  JSON shape (truncate vectors, drop debug fields)

### 4. QUIC (P3 — defer)
**Decision**: don't add QUIC until one of these is true:
- gRPC-over-HTTP/2 latency limits the agent loop (unlikely on localhost)
- Multi-region deployment with mobile clients (not on roadmap)
- Streaming workloads exceed HTTP/2 head-of-line blocking limits (not
  observed today; MCP SSE handles streaming fine)

When the trigger lands: `gRPC over QUIC` via `quiche` or `msquic` Go
binding, **not** rolling our own. Keep the .proto contracts unchanged;
swap transport only.

## Concrete next steps (when ready)

1. **Add taxonomy + screenshot schemas to `proto-from-zod.mjs`**
   ```ts
   // scripts/proto-from-zod.mjs — add to schema list
   { name: 'TaxonomyNode',          source: 'src/lib/server/taxonomy/schema.ts' },
   { name: 'TaxonomyEdge',          source: 'src/lib/server/taxonomy/schema.ts' },
   { name: 'ScreenshotArtifact',    source: 'src/lib/server/screenshots/schema.ts' },
   ```
   (Schemas don't exist yet — ship Zod versions first, then regenerate.)

2. **Add `proto:check` to startup health (read-only)**
   Already wired as an npm script. Add to `check-all-tools.mjs` as a
   non-fatal advisory: warn if `git diff` shows uncommitted .proto drift.

3. **Document the contract drift invariant**
   "Every JSONB column with > 100 callers has a Zod schema. Every Zod
   schema with cross-language consumers has a .proto. Every .proto has a
   gRPC service or is auto-generated metadata." This already holds for
   most of the codebase; making it a written invariant prevents drift.

## Why this isn't urgent

- **JSONB stays canonical** — Postgres is the source of truth; everything
  else is a projection.
- **Proto is generated, not authored** — `proto:from-zod` keeps drift to
  zero by construction.
- **gRPC services have inline fallback** — `*_GRPC_ENABLED=false` keeps
  the system running without them; promoting a tool to gRPC is purely a
  performance call.
- **MCP is already canonical** — the agent talks to MCP; MCP talks to
  whatever is fastest.
- **QUIC is a transport optimization, not a feature** — the contracts
  don't change.

So: keep adding Zod schemas as new shapes appear (taxonomy, screenshots),
let `proto:from-zod` sweep them when convenient, only stand up new gRPC
services when latency or cross-language demands it. QUIC waits.

## Verification snapshot (this session)

```bash
npx svelte-check --threshold error    # 0 errors / 5 warnings
npx tsgo --noEmit                      # 0 errors  (TS 7 native preview)
node scripts/check-all-tools.mjs       # 47/47 PASS
npm run proto:check                    # exit 0 — proto in sync with Zod
npm run smoke:fast-ast                 # 6/6 PASS
npm run smoke:kag                      # 6/6 PASS
npm run smoke:agents                   # 374 dir keys + agents:root
npm run karpathy:gpu:dry                # 50 candidates, 48 embedded, 6.2s
```

All clean. No outstanding errors to fix in code or contracts.
