# Pipeline-Driven Next Actions — 2026-05-08

> Source: VS Code startup pipeline + `skill:codebase-todo` + atlas smoke + hit-demand seed.
> Status: ACTIVE
> Update command: `npm run skill:codebase-todo && npm run smoke:atlas && npm run seed:hit-demand`
>
> This is the **human-readable planning doc layered on top of the auto-generated ranking**.
> For raw signal-driven rankings, see [`codebase-todo-recommendations.md`](./codebase-todo-recommendations.md)
> (regenerated on every `skill:codebase-todo` run).

## Current Startup Pipeline

```txt
folderOpen
  → TRACE MCP Server (:8788)
  → Service Health Check
  → graphify:daily
  → ACE Incremental Refresh
  → Atlas Smoke Gate
  → Seed Hit-Demand
```

Each stage is read-only or idempotent, lock-protected, and surfaces failures
through the smoke harness — the chain is self-verifying on every folderOpen.

## Verified Runtime State

- ✅ SvelteKit 2 reads canonical Postgres schema on `:5434`
- ✅ `DATABASE_URL_FALLBACK` removed from `env.server.ts`
- ✅ `hypergraph_edges` Drizzle schema mirrors live table (10 → 25 cols)
- ✅ `smoke:atlas`: green
- ✅ `smoke:hypergraph`: 5/5 pass
- ✅ `svelte-check`: 0 errors / 0 warnings
- ✅ `tsgo`: 0 errors
- ✅ MCP TRACE: 44+ tools at `:8788`
- ✅ VS Code startup refreshes `ace:rank:demand` on folderOpen
- ✅ Atlas → demand rank → hypergraph → HTTP/MCP loop self-verifies on startup

## Top Signal-Driven Targets

Surfaced by the latest `npm run skill:codebase-todo` run (top-7 by fused
authority + Karpathy GPU + demand + dirty signal). Each target carries:
**why now**, **next actions**, **verification commands**.

### 1. `src/lib/server/db/client.ts`

**Why now**
- Highest fused atlas/Karpathy/authority priority (blend 0.66, PR 7.06, attn 1.0)
- Central to DB correctness after canonical `:5434` promotion
- All major lanes depend on stable DB pooling and connection behavior

**Next actions**
- Review connection pooling (max, idleTimeout, statement_timeout)
- Remove stale fallback assumptions
- Add explicit canonical DB diagnostics (host:port + schema version on boot)
- Add smoke coverage for modern schema tables (`hypergraph_edges`, `agent_context_files`, `chunk_hit_log`)

**Verify**
```bash
npm run typecheck:native
npm run check
npm run smoke:agents
npm run smoke:atlas
```

### 2. `src/lib/server/env.server.ts`

**Why now**
- `DATABASE_URL_FALLBACK` was intentionally removed
- Startup and services now assume one canonical DB source
- Any stale consumer should fail at compile time

**Next actions**
- Audit all `DATABASE_URL_FALLBACK` references
- Ensure canonical `DATABASE_URL` points to `:5434`
- Add a health-detail line showing canonical DB host/port without leaking credentials

**Verify**
```bash
rg "DATABASE_URL_FALLBACK|POSTGRES_URL_FALLBACK" src scripts
node scripts/check-all-tools.mjs
```

### 3. `src/routes/api/analytics/research-graph/+server.ts`

**Why now**
- Fresh Gemma4 synthesis identified it as the primary graph-data consumer
- Recent graph/hypergraph/indexing fixes should be reflected in route behavior
- Likely candidate for new `hypergraph.search` integration

**Next actions**
- Confirm it reads the current atlas/hypergraph lanes
- Add degraded response shape (per CLAUDE.md GET contract)
- Add timeout (`AbortSignal.timeout`) and typed Zod validation if missing
- Wire into `/api/ace/recommendations` flow when relevant

**Verify**
```bash
curl -s http://127.0.0.1:5173/api/analytics/research-graph | jq
```

### 4. `src/lib/server/redis.ts`

**Why now**
- Redis is now core for atlas, demand, startup, AGENTS, Karpathy, and prompt cards
- More Redis hashes now have TTL-sensitive semantics — easy to lose data on misuse

**Next actions**
- Add typed helpers for TTL-bound hashes (`getHashWithTtl<T>(key)`, `setHashWithTtl<T>(key, value, ttl)`)
- Standardize key naming (`ace:*`, `gpu:*`, `agents:*`, `taxonomy:*`)
- Add safe reconnect/fallback behavior (existing `getRedis()` pool retry)
- Document Redis key namespaces:
  - `ace:rank:demand` (1h TTL, hit-demand hash)
  - `ace:authority:top` (6h TTL, 200 entries from graphify:gds)
  - `ace:atlas:*` (24h TTL, atlas dir cards)
  - `gpu:karpathy:scores` (24h TTL, GPU rank blend)
  - `agents:dir:*` (24h TTL, AGENTS.md envelope mirror)

**Verify**
```bash
docker exec legal-ai-redis redis-cli TTL ace:rank:demand
docker exec legal-ai-redis redis-cli HLEN ace:rank:demand
docker exec legal-ai-redis redis-cli HLEN ace:authority:top
docker exec legal-ai-redis redis-cli HLEN gpu:karpathy:scores
```

### 5. `src/lib/server/ollama.ts`

**Why now**
- LLM calls now support Gemma4/TurboQuant screenshot captions and synthesis
- Agent reliability depends on clean fallback behavior
- VRAM contention between TurboQuant `:8090` and Ollama `:11434` is the known failure mode

**Next actions**
- Separate Ollama and TurboQuant call paths clearly
- Add timeout and error-shape normalization (consistent `{ ok, content?, source? }` envelope)
- Avoid parallel VLM GPU contention when TurboQuant is already serving (probe `:8090/health` first, same pattern as `caption-screenshots-gemma4.mjs`)

**Verify**
```bash
curl -s http://127.0.0.1:8090/health
curl -s http://127.0.0.1:11434/api/tags
```

### 6. `src/lib/server/db/relations.ts`

**Why now**
- Atlas relationships now include AGENTS, tags, tools, clusters, topology, and KAG notes
- This file likely participates in relation integrity and type definitions
- New `agent_context_relations` table introduces relations not yet declared

**Next actions**
- Review relation types against `agent_context_relations` (SHARES_TAGS, MIRRORS_KAG_NOTE, COVERS_CLUSTER, etc.)
- Add type guards for relation payloads
- Confirm no circular dependency or schema drift

**Verify**
```bash
npm run smoke:agents
npm run agents:relations:rebuild
```

### 7. `src/lib/server/gpu/libtorch-bridge.ts`

**Why now**
- Karpathy GPU and visual lanes rely on GPU resource discipline
- RTX 3060 Ti VRAM pressure is real when TurboQuant/VLM/embedding lanes coexist
- Bridge is N-API addon — failures cascade silently if cleanup is missed

**Next actions**
- Validate cleanup and resource release (Tensor lifetime, CUDA stream sync)
- Add guardrails around GPU availability (`isCudaAvailable()` probe before each batch op)
- Ensure CPU fallback is explicit (current path silently degrades without notice)

**Verify**
```bash
npm run karpathy:gpu:hit-log:dry
npm run startup:ace:dry
node -e "const a=require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('CUDA:', a.isCudaAvailable())"
```

## Active Engineering Queue

### P0 — Keep the new loop stable

- ✅ Confirm canonical DB `:5434` is the only runtime DB target
- ✅ Keep `DATABASE_URL_FALLBACK` removed
- ✅ Add/keep startup smoke for atlas and hypergraph
- ✅ Ensure `seed:hit-demand` remains in the safe startup lane (`allowedOnStartup`)

### P1 — Improve signal quality

- 🔜 Add `chunk_hit_log` writer hooks in production retrieval paths so demand signal populates with real recent hits (CLAUDE.md G50 audit gate)
- ✅ Karpathy risk-query attention probe (z-score sigmoid spread; 0.05–0.96 differential)
- 🔜 Add `atlas:prompt:smoke` (5-check regression like `smoke:hypergraph`)
- ✅ Add `smoke:hypergraph` regression smoke (5/5 pass)

### P2 — Expand graph coverage

- 🔜 Hypergraph seeder Lane B from `code_relations` (call-graph adjacency)
- 🔜 Hypergraph seeder Lane C from `agent_context_relations.SHARES_TAGS` (semantic adjacency)
- 🔜 UI Atlas Context panel backed by `/api/ace/recommendations`

## Refresh Commands

The pipeline-driven workflow is:

```bash
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend

# Refresh signals (also runs automatically on VS Code folderOpen)
npm run skill:codebase-todo       # rebuild ranked file recommendations
npm run smoke:atlas               # 16-check atlas health gate
npm run seed:hit-demand           # refresh ace:rank:demand from chunk_hit_log

# Verify nothing regressed
npm run smoke:hypergraph          # 5/5 hypergraph search lane
node scripts/check-all-tools.mjs  # 46+ probe full stack

# Inspect the rendered ranking
head -40 next_steps/active/codebase-todo-recommendations.md
```

## Source of Truth

| Doc | Purpose | Update method |
|---|---|---|
| `2026-05-08_pipeline-driven-next-actions.md` (this file) | Human planning + commentary | Manual edit |
| `codebase-todo-recommendations.md` | Auto-generated top-25 with Gemma4 synthesis | `npm run skill:codebase-todo` |
| `2026-05-08_atlas-signal-quality-todo.md` | Tier P0–P3 backlog by acceptance criteria | Manual edit |
| `2026-05-08_master-pipeline-todo.md` | Closed-this-session log + signal recap | Manual edit |

**Rule of thumb:** The auto-generated doc tells you *which files* matter today.
This doc tells you *what to do about them* and *why now*.
