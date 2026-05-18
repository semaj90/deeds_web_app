# Legal AI Platform — Developer Strategy Guide

**Last updated: 2026-05-10**
Status: `svelte-check 0 errors` · `vite build PASS` · Atlas smoke 8/10 · 73 MCP tools

This is the "how to play this game" guide. It assumes you can read the code. It tells you the non-obvious things: which path to take when there are three options, which tool to call first, which port to use, and where prior mistakes are buried.

---

## 1. The Mental Model

Think of this codebase in five orthogonal layers. Each layer has an owner. Crossing the boundary between layers is the most common source of bugs.

```
┌─────────────────────────────────────────────────────┐
│  Gemma4 / Claude (synthesis + planning)             │  ← calls MCP tools only
├─────────────────────────────────────────────────────┤
│  TRACE MCP :8788 (73 tools — the model surface)     │  ← TypeScript orchestration
├─────────────────────────────────────────────────────┤
│  ACE / Atlas (11-lane retrieval + trust tiers)      │  ← SvelteKit server-side
├─────────────────────────────────────────────────────┤
│  Data stores: Postgres · Redis · Qdrant · Neo4j     │  ← infra, never direct from model
└─────────────────────────────────────────────────────┘
```

**Hard rule**: Gemma4 never talks to Postgres/Redis/Qdrant/Neo4j directly. It calls MCP tools. TypeScript translates MCP calls into DB queries. This boundary exists so infra changes don't ripple into the model.

---

## 2. Database Connection — The #1 Gotcha

There are two Postgres ports and they have **different data**.

| Port | What it is | Use for |
|------|-----------|---------|
| **5434** | Docker proxy (`deeds-postgres-prod-proxy`) | ✅ Everything: app, scripts, seeds, migrations |
| **5432** | Raw Postgres (different data) | ❌ Never — psql default lands here |

`$DATABASE_URL` is usually not set in PowerShell. Always use the explicit string:

```bash
# psql
psql "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" -f migration.sql

# Node scripts
DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db node scripts/foo.mjs

# pg.Pool in scripts
new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' })
```

---

## 3. Service Port Map

| Service | Port | Health check |
|---------|------|-------------|
| SvelteKit dev | 5173 | `curl localhost:5173` |
| TRACE MCP | **8788** | `curl localhost:8788/health` |
| KB Retrieval MCP | **8789** | `curl localhost:8789/health` |
| Redis | 6379 | `docker exec legal-ai-redis redis-cli ping` |
| Bifrost semantic cache | 3040 | `curl localhost:3040/health` |
| Qdrant | 6333 | `curl localhost:6333/` |
| Ollama | 11434 | `curl localhost:11434/api/tags` |
| TurboQuant llama-server | 8090 | `curl localhost:8090/health` (chat-only, no /embeddings) |
| VLM | 8085 | `curl localhost:8085/health` |
| RabbitMQ AMQP | 5672 | — |
| RabbitMQ UI | 15672 | `curl -u guest:guest localhost:15672/api/overview` |
| Postgres (Docker proxy) | **5434** | — |
| Neo4j Bolt | 7687 | neo4j browser at :7474 |
| ComfyUI | 8188 | `curl localhost:8188/system_stats` |

---

## 4. The Retrieval Pipeline — 11 Lanes

`fetchACPKnowledgeResults()` in `src/lib/server/ace/context-assembler.ts` fuses these lanes:

| Lane | Backing store | Trust | When it fires |
|------|-------------|-------|--------------|
| **L0** | Redis `ace:topo:{class}:{hash}` (300s TTL) | T1 | Stage A0 pre-filter, skips Qdrant on hit |
| **L1** | Qdrant `codebase_chunks_768` content vector (768-dim) | T3 | Always |
| **L2** | Qdrant `codebase_chunks_768` signature vector (AST) | T3 | Always (fused with L1) |
| **L3** | Qdrant `summary_lenses_768` cluster narratives | T2 | Always |
| **L4** | Redis `wiki:note:*` + `agents:dir:*` | T1 | Always |
| **L5** | Qdrant `synthesis_memory_768` | T2 | Always |
| **L6** | Redis `code:llm:*` + `ace:chunks:*` cached outputs | T2 | On cache hit |
| **L7** | Neo4j IMPORTS + BELONGS_TO_CLUSTER + SIMILAR_TOPOLOGY | T3 | When filePath provided |
| **L8** | Redis `gpu:karpathy:scores` + `ace:authority:top` | T1 | Final rerank |
| **L9** | Postgres `feature_implementations` FTS | T1 | When query matches feature name |
| **L10** | `/api/web-research`, ACP cross-feed | T4 | When external research requested |
| **L11** | Postgres `panel_activity_log` | T1 | When userId provided |

**Trust score multiplier** (applied in `applyKarpathyBoost`):
T1 ×1.20 · T2 ×1.00 · T3 ×0.95 · T4 ×0.70 · T5 ×0.60

---

## 5. ACE Scoring Spine

Final chunk score in `applyKarpathyBoost()`:

```
rawFinal = semantic(0.60) + qdrantTag(0.12) + ast_graph(0.10) + som(0.08) + hyperedge(0.10)
           + clusterBoost + bowBoost + pagerankBoost + pairedTestBoost + sameAgentsDirBoost + quaternionBoost

finalScore = rawFinal × TRUST_SCORE_MULTIPLIER[chunk.trust_tier ?? 'T3']
```

Karpathy blend (Redis `gpu:karpathy:scores`, 24h TTL): `0.4·PageRank + 0.3·attention + 0.3·authority`

---

## 6. Prompt Injection Defense

Every external (T4/T5) chunk passes through `sanitizer.ts` before entering the context pack.

Eight blocked patterns:

| Pattern | Example trigger |
|---------|----------------|
| `ignore_previous_instructions` | "ignore all previous instructions" |
| `system_override` | `<system>`, "system prompt" |
| `tool_call_injection` | `tool_calls: [` |
| `ops_execute` | `ops.execute(...)`, `ops.run(...)` |
| `role_switch` | `<assistant>`, `<human>` |
| `jailbreak_prefix` | "DAN", "STAN", "AIM" |
| `prompt_leak` | "repeat everything above" |
| `delimiter_injection` | `[INST]`, `<\|im_start\|>` |

Blocked content is replaced with `[REDACTED]`. Hits are logged to Redis `ace:injection:blocked:*`. Check count: `ops.trust_audit` via MCP.

**Hard rule**: T4/T5 chunks can NEVER have `instructionAuthority: true`. The type system enforces this but double-check any new lane additions.

---

## 7. MCP Tool Cheat Sheet

Always call MCP tools via `http://127.0.0.1:8788/mcp` (Streamable HTTP JSON-RPC). Never call Postgres/Redis/Qdrant directly from model code.

### Most-used tools

```bash
# Find code chunks related to a topic
kag.multi_lane_search  { query: "...", lanes?: ["L1","L7","L9"] }

# Which files implement a feature
kag.feature_lookup  { featureName: "context assembler", role?: "primary" }

# Recent user panel activity (L11)
kag.panel_context  { userId: "...", route?: "/cases/[id]" }

# Injection audit
ops.trust_audit  { limit?: 10 }

# Build a compressed KV context card
context.build_kv_packet  { query: "...", filePath?: "..." }

# Graph neighborhood
graph.expand_neighborhood  { nodeId: "...", hops: 2 }

# Top-N by PageRank
graph.pagerank_top  { limit: 20 }

# 4D topology search
topology.search_4d  { query: "...", topK: 10 }

# Wiki / AGENTS.md note for a directory
trace.wiki_note_lookup  { dir: "src/lib/server/ace" }

# Full-text + vector codebase search
trace.kag_search  { query: "...", limit: 10 }
```

Shell: `npx mcporter call trace.kag_search query:"reranker topology"`

---

## 8. Dev Startup Modes

### Which script to use

| Goal | Command | What it does |
|------|---------|-------------|
| **Just SvelteKit** (Docker already up) | `npm run dev` | startup-plan → Vite :5173, port **5434** DB ✅ |
| **GPU + Docker auto-start** | `npm run dev:gpu` | Starts legal-ai Docker containers → Vite :5173 + GPU env |
| **Full stack** (everything) | `npm run dev:full` | Docker + llama-server + ACE prime + Vite + TRACE MCP (concurrently) |
| **QUIC proxy** (Caddy HTTP/3) | `npm run dev:quic:local` | Vite :5173 + Caddy QUIC, port 5434 DB |
| **GRPC retrieval lane** | `npm run dev:grpc` | TurboQuant + Go retrieval service + Vite |
| **Docker-native** (all services in containers) | `npm run docker:dev:detached` | docker-compose.dev.yml |

### Full stack startup order

```bash
# 1. Docker infra (Postgres :5434, Redis :6379, Qdrant :6333, SeaweedFS S3 :8333)
npm run orchestrator:docker:up

# 2. llama-server / TurboQuant (chat inference :8090)
npm run turbo:start:detached

# 3. TRACE MCP server (:8788)
node scripts/ensure-mcp-server.mjs --spawn

# 4. ACE startup (Redis priming, dirty-file scan)
npm run startup:ace:detached

# 5. SvelteKit dev server (:5173)
npm run dev

# OR — all five in one terminal:
npm run dev:full
```

### WASM / ONNX — no process to start

ONNX Runtime files are pre-built in `static/ort/` (served by Vite as static assets):
- `ort-wasm-simd-threaded.wasm` — main runtime
- `ort-wasm-simd-threaded.jsep.wasm` — WebGPU backend
- `ort-wasm-simd-threaded.asyncify.wasm` — streaming

AssemblyScript vector ops: `npm run build:wasm` rebuilds `static/wasm/vector-ops.wasm`.
Neither needs a process — they load in the browser on demand.

### GPU (RTX 3060 Ti) env flags

Set by `dev:gpu` / `dev:full` automatically:
```
ENABLE_GPU=true
RTX_3060_OPTIMIZATION=true
OLLAMA_GPU_LAYERS=30
SIMD_JSON_PARSER=true   # enables tensorrt_bridge.node simdjson path
REDIS_COMPRESS=true
```

Verify GPU addon loads: `node -e "const a=require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('CUDA:', a.isCudaAvailable())"`

### Other key scripts

```bash
# Codebase intelligence
npm run graphify:daily         # AST scan → graph JSON + Redis KAG (~5-10s)
npm run graphify:semantic      # Qdrant 768-dim index + ACE smoke (~60s, needs Ollama)
npm run graphify:full          # Full rebuild incl. cluster glyphs (~15-20 min)
npm run smoke:graphify         # 5-pillar health check (<1s)

# HyperRAG
npm run smoke:hyperrag         # G-HR1–G-HR10 gates (9/9 pass when Docker+MCP up)
npm run seed:feature-atlas     # (Re-)seed 18 features / 34 edges
npm run seed:feature-atlas:dry # Preview SQL

# Karpathy GPU authority blend
npm run karpathy:gpu           # → Redis gpu:karpathy:scores / by_lane (top-50)
npm run karpathy:ace:hits      # Cross-ref ACE hits vs Karpathy index (hit-rate report)

# Type checking
npm run typecheck:native       # tsgo 10× faster parallel audit
npx svelte-check               # Must pass before commit
```

---

## 9. Drizzle ORM — Do's and Don'ts

```typescript
// ✅ Correct DB import (no .js extension for this file specifically)
import { db } from '$lib/server/db/client';

// ✅ pgvector — native Drizzle
import { vector } from 'drizzle-orm/pg-core';  // NOT 'pgvector/drizzle-orm'

// ✅ Type inference
type Case = typeof cases.$inferSelect;

// ❌ Wrong — postgres.js not node-postgres
import { pool } from '$lib/server/db/client';  // must be default import

// ❌ NEVER use drizzle-kit push on production (drops tables with data)
// ALWAYS use migrate or manual SQL
```

Manual migrations go in `drizzle/manual/<date>_<name>.sql` and are run with:
```bash
psql "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" -f drizzle/manual/<file>.sql
```

---

## 10. Svelte 5 Runes — Non-Negotiable

No Svelte 4 patterns. The audit system gates G21–G25 enforce this statically.

| Old (Svelte 4) | New (Svelte 5) |
|---------------|---------------|
| `export let x` | `let { x } = $props()` |
| `$: doubled = x * 2` | `let doubled = $derived(x * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `on:click={fn}` | `onclick={fn}` |
| `<slot>` | `{#snippet children()}{/snippet}` + `{@render children()}` |
| `writable()` store | `$state()` in `.svelte.ts` files |

`$derived(() => {...})` returns a function. Use `$derived.by(() => {...})` for complex blocks.

Runes (`$state`, `$derived`, `$effect`) only work in `.svelte` and `.svelte.ts` files — not plain `.ts`.

---

## 11. The Embedding Stack

**Never route embedding work through TurboQuant llama-server (:8090)**. It's chat-only and will return `code: 501`.

Canonical embed cascade (used by `karpathy-gpu-enrich.mjs` and ACE):
1. **SvelteKit `/api/embed`** — wraps Ollama embeddinggemma with Redis L1 (5ms) + Bifrost L2 (2-5s)
2. **Direct Ollama `/api/embeddings`** — fallback when dev server is down
3. Model: `embeddinggemma:latest` (primary), `nomic-embed-text` (fallback)
4. Dimensions: **768** (all collections)

---

## 12. Inference Cascade

```
TensorRT-LLM :8099 (INT4 AWQ, GPU)
  → Bifrost :3040 (ε-greedy, 500ms deadline, ~5ms hits)
  → TurboQuant :8090 (llama-server, q8_0 KV, chat-only)
  → VLM :8085 (Gemma4, text+vision)
  → LiteRT :8070 (CPU speculative)
  → Ollama :11434 (final fallback)
```

TurboQuant KV policy: `TURBO_PROFILE=stock` (default, `-ctk q8_0 -ctv q8_0`). For Gemma4 specifically, the D=256/512 head dimensions require the `test1111` fork — stock TurboQuant prebuilts (TheTom) are D=128 only and crash on Gemma4 attention. Don't enable turbo3/turbo4 on Gemma4 until verified with the right fork.

---

## 13. ioredis in Standalone Scripts

Startup scripts run before Docker containers are healthy. Required pattern:

```typescript
import Redis from 'ioredis';
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});
await redis.connect().catch(() => {});
// Now safe to call redis.get() / redis.setex()
await redis.quit().catch(() => {});
```

Without `enableOfflineQueue: false` + explicit `connect()`, commands queued before connection lands will either hang or throw "Stream isn't writeable". This is distinct from long-running server code — use `getRedis()` from `src/lib/server/redis.ts` there.

---

## 14. Audit Gates Quick Reference

Run before any significant merge:

```bash
# Code connectivity (orphan detection)
bash sveltekit-frontend/scripts/audit/orphan-detector.sh src/

# HyperRAG trust system
npm run smoke:hyperrag

# 5-pillar codebase health
npm run smoke:graphify

# Rune compliance (G21–G25)
# Automated in tests/runes/svelte5-rune-compliance.test.ts

# TypeScript fast check
npm run typecheck:native  # tsgo

# Full check
npx svelte-check
```

Key gates to never break:
- **G34**: `z.record()` must be two-arg: `z.record(z.string(), z.any())` — single-arg crashes MCP tools
- **G38**: `StreamableHTTPServerTransport` must be constructed per-request, never module-scope
- **G-HR8**: `ACE_PIPELINE_VERSION` must stay at `'3.0.0'` or higher

---

## 15. Where Things Break (Pattern Catalog)

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| psql connects to wrong DB | `$DATABASE_URL` not set; defaults to port 5432 | Use full connection string with port 5434 |
| MCP tool "not found" | Server is a stale build | Kill port 8788 process, run `ensure-mcp-server.mjs --spawn` |
| L9 feature atlas returns 0 | FTS not matching or table empty | Run `npm run seed:feature-atlas` |
| G-HR3/G-HR4 WARN | Qdrant `codebase_chunks_768` empty | Run `npm run graphify:semantic` |
| `TRUST_SCORE_MULTIPLIER` not applied | Qdrant payload missing `trust_tier` field | Add `trust_tier` to Qdrant upsert payload in indexer |
| Embedding call to TurboQuant fails 501 | Routed to :8090 which is chat-only | Use `/api/embed` or direct Ollama :11434 |
| `ace_chunks` serving stale context | `ACE_PIPELINE_VERSION` mismatch | `ACE_PIPELINE_VERSION` bump invalidates automatically; don't roll back |
| `$derived(() => {})` returns function | Used `$derived` instead of `$derived.by` for block | Use `$derived.by(() => { ... })` |
| VS Code Edit tool change reverted | Linter reformatted on save | Use Write tool for full rewrites instead |
| ioredis "Stream isn't writeable" | `connect()` called after command sent | Add `lazyConnect:true` + explicit `await redis.connect()` before first command |
| Drizzle drops existing tables | Running `drizzle-kit push` with new schema | Use `migrate` not `push`; add missing tables to schema first |
| Neo4j SIMILAR_TOPOLOGY count is 0 | SOM not run or `SIMILAR_TOPOLOGY` edges not created | Run `npm run graphify:topology` |
| `CUDA not available` from tensorrt_bridge | LibTorch DLLs not in PATH | Add `C:\libtorch-win-shared-with-deps-*\libtorch\lib` to user PATH |

---

## 16. Feature Atlas — How to Add a Feature

When you implement a new significant feature:

1. Add an entry to `FEATURES` in `scripts/seed-feature-atlas.mjs`:
```javascript
{
  featureKey:  'my.feature_key',        // dot-namespaced, unique
  featureName: 'Human-readable name',
  description: 'What it does and why',
  laneIds:     ['L1', 'L7'],            // which HyperRAG lanes
  files: [
    { filePath: 'src/lib/server/my-feature.ts', entryExport: 'myFunction', role: 'primary' },
    { filePath: 'src/routes/api/my-route/+server.ts', role: 'consumer' },
  ],
}
```

2. Re-seed: `DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db npm run seed:feature-atlas`

3. Verify via MCP: `kag.feature_lookup { featureName: "my feature name" }`

This makes the feature discoverable to Gemma4 and ACE without a full Qdrant ANN — survives file renames as long as you update the seed.

---

## 17. Phase D Hooks (Deferred — Now Unblocked)

The prerequisites are met as of 2026-05-10:
- ✅ `TrustMeta` live on all retrieved chunks
- ✅ T1/T2 system prompt fence live
- ✅ `ACE_PIPELINE_VERSION === '3.0.0'`

Draft policy from `hyperrag-feature-atlas-runtime.md §15`:
- `PreToolUse` hook on `ops.*` — deny if triggering chunk had `instructionAuthority: false`
- `PostToolUse` hook on `.*` — audit every tool call via `context_timeline`

To activate, implement `scripts/hooks/check-tool-authority.mjs` and `scripts/hooks/audit-tool-use.mjs`, then add to `.claude/settings.json`.

---

## 18. Cross-References

| Document | What it covers |
|----------|---------------|
| `docs/architecture/hyperrag-feature-atlas-runtime.md` | 11-lane HyperRAG blueprint, trust tiers, §12 build order, Phase D hooks |
| `docs/architecture/trace-runtime-split.md` | Layer ownership rules + G34/G38 hard rules |
| `docs/architecture/trace-kag-web-development-guide.md` | 23-section practical guide (route contract, retrieval decision tree) |
| `docs/architecture/hermes-agent-windows-gemma4-guide.md` | MCP tool allowlist, TurboQuant Gemma4 binary caveat |
| `CLAUDE.md` (root) | Full project instructions, all audit gates, technology stack |
| `memory/drizzle-schema-reference.md` | 70+ tables, 14 enums, route map |
| `memory/karpathy-gpu-redis-ace.md` | Redis key layout, embed cascade, MLA revival path |
| `memory/reconstruction-3-tracks.md` | 3-track timeline/image/3D architecture |
| `memory/ioredis-coldstart-pattern.md` | Standalone script Redis connection pattern |
