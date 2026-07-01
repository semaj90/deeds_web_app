# AGENTS.md — Deeds Web App

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + Bits-UI v2 + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.
> **Note: This file is hand-maintained to keep it compact and high-signal (<10KB).**

## 🚨 Critical Tech Stack Constraints (Read First!)

- **Svelte 5 Runes ONLY**: No `export let`, `$:`, `on:click`, or `<slot>`. Use `$state`, `$derived`, `$props`, `onclick`, and snippets.
- **Bits-UI v2**: Use namespace imports (e.g., `import { Dialog } from "bits-ui"`). Use `child` snippet for transitions, NOT `asChild`.
- **Drizzle Safety**: 
  - Always import from `$lib/server/db/client` (Pool).
  - Use `.js` extensions in imports.
  - NEVER use `drizzle-kit push` on live DBs. Use `generate` -> `migrate`.
- **API Response Contract**: Every GET API route MUST return a consistent JSON shape even on error (empty defaults, not just `{error}`).
- **Auth & Validation**: 
  - Auth check: `if (!locals.user) return json({...defaults, error: 'Unauthorized'}, {status: 401})`.
  - Body validation: Every `request.json()` MUST be validated with Zod.
- **Environment**: Use `env.server.ts` for all service URLs. Never hardcode `localhost`.

## 🛠 Essential Developer Commands

```bash
cd sveltekit-frontend
npm run dev                # Dev server (DEV_BYPASS_AUTH enabled)
npx svelte-check           # Required before every commit
npx vitest run             # Unit tests
npm run agents:write       # Regenerates per-dir docs (use --root-only for speed)
```

## 🏗 Repo Architecture

- `sveltekit-frontend/`: Main app (SvelteKit + Svelte 5).
- `simd-bridge/cpp/`: C++ addon for LibTorch/CUDA & SIMD JSON.
- `go-microservice/`: gRPC retrieval services (:50051-50057).
- `docker/`: Compose stacks for Redis, PG, Qdrant, RabbitMQ.

## 🧭 Navigation & Context

- **Directory Wiki**: See `sveltekit-frontend/AGENTS.md` for a high-level jump table.
- **Per-Dir Context**: Most `src/` subdirectories have their own `AGENTS.md` with local rules/tools.
- **Full Guide**: See `CLAUDE.md` for the canonical 600-line developer guide.

## ⚠️ Known Gotchas

- **User IDs**: Mixed types (INT, UUID, TEXT) across tables. Check schema before querying.
- **Storage**: SeaweedFS (:8333) is the primary S3 gateway; ignore MinIO stubs.
- **UnoCSS**: Do NOT use standard Tailwind classes unless defined in `uno.config.js`.
- **Engram Memory (Lane -1)**: Low-trust pre-routing hints. MUST NOT store hidden thoughts, raw tensors, or model cache. Boosting (0.05) is restricted to debug/workflow profiles and requires `accepted: true`.
- **Port Reservation**: Port 8888 is reserved for SeaweedFS Filer. SearXNG is relocated to port 8889.

---
*This file is protected from auto-generation overwrites.*

<!-- ingest: 2026-05-30T02:17:10.013Z -->
- ingested_nodes: 18742 from C:\Users\james\Videos\deeds-web-app\.opencode\cards

[2026-05-30T04:39:26.319Z] Phase19 CSV export and archive-preview generated (dry-run)
<!-- atlas-append:0bf81df426b5:2026-05-30T16:27:00.892Z -->
## Atlas Activity — 2026-05-30T16:27:00.892Z

- **Parent atlas rebuild**: 10,732 nodes / 9,378 edges across 8 lanes
- **Redis cache**: 10,732 nodes warmed (24h TTL)
- **CouchDB archive**: 11,136 docs durably persisted
- **This directory**: no tasks or fixes in current run

<!-- /atlas-append:0bf81df426b5 -->

## Parent Atlas Runtime Contract — 2026-07-01

Parent Atlas uses Postgres as canonical truth. Qdrant, Redis/Valkey, Neo4j, TurboVec, and Go Retrieval are mirrors, caches, graph projections, or accelerators. Do not promote accelerator output to packet identity.

Canonical identity fields:

- `packet_key`
- `source_ref`
- `source_ref_key`
- `canonical_source_ref`
- `feature_id`
- `feature_label`

Canonical live service map:

| lane | endpoint | role |
|---|---|---|
| Gemma4 llama-server | `http://127.0.0.1:8090` | bounded synthesis and LangExtract fallback |
| LangExtract | `http://127.0.0.1:8096` | Gemma4-backed extraction |
| TurboVec gRPC | `127.0.0.1:50062` | accelerator proof and ANN bridge |
| Go Retrieval | `http://127.0.0.1:8100`, gRPC `127.0.0.1:50053` | retrieval orchestration |
| EmbeddingGemma | `http://127.0.0.1:8081`, Ollama fallback `11434` | embeddings only |
| Postgres | host `127.0.0.1:5434`, Docker `postgres:5432` | canonical packet, summary, feature, telemetry, provenance truth |
| Qdrant | `http://127.0.0.1:6333` | dense vector mirror and payload filters |
| Redis/Valkey | `redis://127.0.0.1:6379` | BitFrost and hot cache |
| Neo4j | `http://127.0.0.1:7474`, Bolt `7687` | graph mirror and GDS/PageRank |
| SeaweedFS | `http://127.0.0.1:8333` | authenticated object/blob store |

Probe semantics:

- `LIVE_PASS` means the real service, real port, and real transport responded.
- `FALLBACK_PASS` is a warning, not green success.
- Legacy warnings are diagnostics only and do not count as canonical ACP/OpenTelemetry service probes.
- Stale LangExtract `8095` and stale TurboVec JSON-RPC `8792` should not be used for new lanes.
- Legacy endpoints `8095` and `8792` are diagnostic-only. They must never count against canonical service readiness unless they are explicitly promoted back into the service contract.

Current proof commands:

```bash
npm run atlas:services:probe
npm run atlas:evidence-spine:validate
npm run atlas:turbovec:qdrant-ingest:test
node scripts/atlas/qdrant-postgres-mirror-reconciliation.mjs --limit=250
```

Next indexing lanes:

1. Widen Gemma4 summaries in `atlas_summary_layers`.
2. Embed new summaries with EmbeddingGemma 768d.
3. Reconcile Qdrant payload tags from Postgres.
4. Warm Redis/BitFrost feature and packet cache keys.
5. Project feature envelopes into Neo4j for GDS/PageRank.
6. Feed ACP/OpenTelemetry events into the agentic Kanban recommendations.
