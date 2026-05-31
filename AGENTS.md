# AGENTS.md — Deeds Web App

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + Bits UI v2 + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.

## Critical constraints

- Svelte 5 runes only: no `export let`, `$:`, `on:click`, or `<slot>`; use `$state`, `$derived`, `$props`, `onclick`, and snippets.
- Bits UI uses namespace imports from `bits-ui`; prefer the `child` snippet pattern.
- Drizzle server code should come from `$lib/server/db/client`, keep `.js` import extensions, and use migrate flows rather than `drizzle-kit push` on live data.
- GET API routes should keep a stable JSON shape even on failure.
- Zod-validate every `request.json()` payload.
- Use `env.server.ts` for service URLs; do not hardcode `localhost` in app code.
- **Engram Memory (Lane -1)**: Low-trust pre-routing hints. MUST NOT store hidden thoughts, raw tensors, or model cache.
- **Port 8888**: Reserved for SeaweedFS Filer. Do NOT bind SearXNG to 8888; use port 8889 (SEARXNG_PORT=8889).

## Docs Ingestion Governance
- **Official Docs First**: Prioritize official documentation over third-party tutorials or blog posts.
- **SourceRefs Required**: Every synthesized fact or code suggestion must include valid `sourceRefs` to the local Docs Atlas.
- **External Unverified**: All external web results are marked `external_unverified` until promoted by an operator or validated against the codebase.
- **No Direct Promotion**: Do not promote web search results directly to the canonical knowledge base without verification.
- **No Hidden Reasoning**: Do not store `hiddenThoughts`, `chainOfThought`, or `kv_cache` in the Docs Atlas or browser outputs.
- **Multi-Lane Retrieval**: Retrieval should always combine `local_code` (Parent Atlas) and `official_docs` (Programming Docs Atlas).
- **External Collection**: Use `external_programming_docs_768` in Qdrant for technical documentation.
- **Trust Hierarchy**: `local_code` (Authoritative) > `official_docs` (High Trust) > `external_unverified` (Web/Low Trust).

## Commands

- `cd sveltekit-frontend && npm ci`
- `cd sveltekit-frontend && npm run dev`
- `cd sveltekit-frontend && npm run check`
- `cd sveltekit-frontend && npm run test:run`
- `cd sveltekit-frontend && npm run agents:write`

## Repo map

- `sveltekit-frontend/` is the main app root.
- `simd-bridge/` holds the native bridge code.
- `services/` holds standalone services.
- `docker/` holds compose/runtime stacks.
- `drizzle/` holds migrations and schema assets.
- `scripts/` and `docs/` contain repo-level tooling and documentation.

## Agent context

- The repo-local wiki lives in `llm/`.
- `llm/llm_timeline.md` is append-only and must never lose prior entries.
- When updating `llm/`, add a new timestamped note instead of rewriting history; keep the index and timeline in sync.
- Prefer `llm/llm.md` plus the nearest `AGENTS.md` for agentic context; treat `llm/` as the repo's `llms.txt`-style ingest hub for ACE packet injection, 4D topology lookup, and Gemma4 tool-calling.
- Do not create new directory `AGENTS.md` files just to mirror docs; use `llm/` pages for durable repo-wide context and add directory files only when a subtree already depends on them.

## Gotchas

- User IDs are mixed across tables; check schema before querying.
- SeaweedFS is the primary S3 gateway; ignore MinIO stubs.
- UnoCSS is the styling baseline; do not assume default Tailwind classes exist.

## Drizzle / SvelteKit / Contract Audit Lane (Phase 6E — 2026-05-16)

Relevant files:
- sveltekit-frontend/drizzle.config.ts
- sveltekit-frontend/drizzle/**
- sveltekit-frontend/src/lib/server/db/**
- sveltekit-frontend/src/routes/**
- sveltekit-frontend/src/lib/schema/**
- sveltekit-frontend/tests/playwright/**
- docs/reports/*contract*
- docs/graph/contract-error-map.json

Rules:
- Do not run `drizzle-kit push` against production.
- Do not mutate live DB in audit scripts.
- Do not place AGENTS.md, LLMS.md, or Markdown files inside `drizzle/meta`.
- Drizzle meta must contain only supported JSON snapshot/journal files.
- Use `db:check`, `db:generate`, and audits before migrations.
- Use Playwright for browser/network contract verification.
- Use web search only as `external_unverified` when local docs atlas misses.
- Every finding must include localSourceRefs, externalDocRefs when available, suggestedFix, validationCommand, and trustTier.

Run the full cross-layer audit before pushing schema changes, adding new API routes, or wiring new Superforms pages:

```bash
# Full 8-layer orchestrator + KAG/DAG/HMM error-fix DAG
npm run audit:contracts

# Sub-audits (can run independently)
npm run audit:drizzle-meta          # drizzle/meta/ hygiene (non-JSON files)
npm run audit:drizzle-meta:fix      # auto-move violations to drizzle/meta/archived/
npm run audit:pgvector              # pgvector extension, HNSW indexes, dimensions
npm run audit:drizzle               # Drizzle ↔ Postgres schema drift + FK type mismatches
npm run audit:forms                 # SvelteKit + Superforms v2 form contracts
npm run audit:error-dag             # KAG/DAG/HMM error-fix graph (reads prior report)
npm run services:health             # TCP health gate for all 10 dev services
npm run services:health:strict      # Exits 1 if Postgres or Redis are down
```

### Output files
| Report | Purpose |
|--------|---------|
| `docs/reports/contract-error-map-report.{json,md}` | All 8-layer findings |
| `docs/reports/drizzle-postgres-contract-report.{json,md}` | Drizzle ↔ live PG drift |
| `docs/reports/pgvector-audit-report.json` | pgvector extension + HNSW check |
| `docs/reports/sveltekit-form-contracts-report.json` | Superforms / Zod gaps |
| `docs/reports/error-fix-dag-report.{json,md}` | KAG/DAG/HMM topological fix order |
| `docs/graph/contract-error-map.json` | Graph nodes+edges for Neo4j/visualization |
| `docs/reports/dev-service-health-report.json` | Docker/WSL2 service TCP probe results |

### HMM error states (fix in this order)
1. `meta_hygiene` — drizzle/meta has non-JSON files (breaks `drizzle-kit generate`)
2. `stale_migration` — SQL on disk not in `_journal.json` or vice versa
3. `schema_mismatch` — Drizzle column type ≠ live Postgres column type (esp. `user_id uuid` vs `users.id integer`)
4. `vector_infra_missing` — pgvector extension or HNSW indexes absent
5. `env_url_mismatch` — port 5432 instead of 5434, missing SEAWEED_* vars
6. `route_contract_mismatch` — missing `fail(400, { form })`, superValidate without load()
7. `api_validation_gap` — POST/PATCH without Zod validation, legacy `zod` adapter
8. `ssr_safety_violation` — `$lib/server/` imports in `.svelte` client files

### Vector Dimension Policy (Phase 6E)
- **768**: Canonical codebase and programming-doc semantic embeddings (embeddinggemma:latest).
- **384**: Compact warden/GPU-cache and Nomic-Embed-Text embeddings.
- **Other**: Dimensions like 1536 (OpenAI) or 128 (compressed) require explicit documentation in the audit whitelist.

## Drizzle Sidecar Migration Policy (Phase 6E)

**Definition**: A sidecar migration is a numbered `.sql` file in `drizzle/` that is intentionally **not** in `drizzle/meta/_journal.json` because it:
- Uses SQL syntax Drizzle Kit cannot express (GIN trgm, HNSW, enum-only, concurrent index)
- Was applied manually at a point where regenerating the journal snapshot would break drift

**Rules**:
1. Every sidecar MUST be listed in `sveltekit-frontend/drizzle/sidecar-migrations.json` with a `reason`, `appliedAt` date, and `validationCommand`.
2. Unlisted unjournaled numbered SQL files are **WARN/FAIL** in the contract audit (`unknown_unjournaled_sql`).
3. Do NOT delete or auto-journal sidecars without operator review.
4. Do NOT add vector HNSW indexes without first reviewing `docs/reports/pgvector-index-plan.md`.
5. Keep `drizzle/meta/` limited to `_journal.json` and `NNNN_snapshot.json` only — no `.md`, `.txt`, or other files.

**Audit commands**:
```bash
npm run audit:drizzle-meta          # hygiene check (non-JSON detection)
npm run audit:drizzle-meta:fix      # auto-move violations to drizzle/meta/archived/
npm run audit:pgvector              # pgvector extension, HNSW indexes, dim validation
```

## LLM Synthesis Memory & Telemetry Policy (Phase 11 — 2026-05-17)

### Core Rules
- **No Hidden Thoughts / Chain of Thoughts**: Any persisted, cached, or JSONL training records MUST NOT retain `hiddenThoughts`, `chainOfThought`, `kv_cache`, `tensor`, or `cudaPointer` attributes.
- **Durable Event Storage**: The Postgres table `llm_synthesis_events` serves as the canonical transaction log.
- **Hot Caches (Redis BitFrost)**: Hot keys must be strictly rebuildable and enforce expirations:
  - `ace:packet:{runId}` (1h TTL)
  - `ace:cluster:{clusterId}` (24h TTL)
- **JSONL Dataset Writes**: Every synthesis logging event must append to the daily training JSONL log (`memory/datasets/llm_synthesis/YYYY-MM-DD.jsonl`) to support offline fine-tuning.

### MCP Interface
- **Tool**: `llm_synthesis.log_event`
- **Port**: 3002 (`scripts/phase76-mcp-server.mjs`)

<!-- ingest: 2026-05-30T02:17:10.013Z -->
- ingested_nodes: 18742 from C:\Users\james\Videos\deeds-web-app\.opencode\cards

[2026-05-30T04:39:26.319Z] Phase19 CSV export and archive-preview generated (dry-run)
---

## [2026-05-30 06:05 PST] Atlas Phase 3-5 Persistence Layer Complete

**Topology Persisted to CouchDB**: `codebase_graph/atlas-snapshot-2026-05-30T06-03-44-534Z`

**DuckDB CSVs Generated** (offline mapreduce joins):
- `.tmp/duckdb-csvs/db-usage.csv` — 467 USES_DB edges
- `.tmp/duckdb-csvs/tool-usage.csv` — 1,032 USES_TOOL edges
- `.tmp/duckdb-csvs/intent-graph.csv` — 6 intents
- `.tmp/duckdb-csvs/mutations.csv` — 4 baseline mutations

**Verified MapReduce Join** (DuckDB):
```sql
SELECT file, COUNT(DISTINCT table) as tables, COUNT(DISTINCT tool) as tools
FROM db_usage FULL OUTER JOIN tool_usage USING (source_file)
GROUP BY file ORDER BY tables + tools DESC LIMIT 10;
```
Top file by topology footprint: `route-health-queries.ts` (6 tables touched).

**Pipeline Status**:
- ✅ Phase 3 extraction (467 + 1,032 edges)
- ✅ Phase 4 intent graph (6 intents, 0.85-0.95 confidence)
- ✅ Phase 5 mutation ledger (4 baseline mutations)
- ✅ CouchDB persistence (codebase_graph DB)
- ✅ DuckDB CSV export (mapreduce-ready)
- ⏳ PostgreSQL 18 upgrade (pgvector 0.8.1 verified compatible)
- ⏳ Neo4j ingestion (script ready: scripts/atlas/ingest-topology-to-neo4j.mjs)
- ⏳ GPU CUDA tensor analysis (waiting on Neo4j sync)

**Next Actions** (temporal append — do not delete):
1. Apply Gemma4 titles to 46,729 tasks (background batch)
2. Trigger Neo4j topology sync once Neo4j is up
3. Run graphify directory analysis pass for AGENTS.md temporal annotations
4. PostgreSQL 18 upgrade with pgvector 0.8.1 validation

---

## [2026-05-30T07:39:32.886Z] Parent Atlas Index — 9 Zone Cards

**Pattern**: NES CHR-ROM swappable cards + LoRA adapter banks
**Total**: 28.7 KB across 9 zones
**Avg card size**: 3.2 KB

### Zones Indexed
- **drizzle** (bank 0): Drizzle ORM 0.45.2 migrations + manual SQL sidecars for PostgreSQL 17 (pgvector 0.8.1).
- **infrastructure** (bank 1): Docker compose stack: PG17+pgvector, Redis, Qdrant, CouchDB, SeaweedFS, RabbitMQ, Ollama, llama-server (TurboQuant), Bifrost, Langfuse, Neo4j, GPU services (TensorRT-LLM, LangGraph), Caddy reverse proxy.
- **memory-docs** (bank 2): Atlas of documentation, memory, and knowledge layers supporting the legal AI system. Tracks active subsystems, artifact inventory, and improvement signals.
- **models** (bank 3): Local model artifacts: Gemma4 GGUF/ONNX, embeddinggemma, granite-docling VLM, training datasets for GRPO/LoRA fine-tuning.
- **opencode** (bank 4): OpenCode integration platform: SOM-clustered semantic cards, AI-generated task proposals, and ingest pipeline for codebase intelligence. Provides a unified knowledgebase for legal AI system reasoning and code analysis.
- **scripts** (bank 5): Pipeline orchestration: atlas extraction, opencode card generation, karpathy GPU enrichment, graphify directory analysis, error-resolution, audits.
- **services-simd-bridge** (bank 6): Go gRPC microservices + GPU-accelerated C++/Rust N-API native addons that power legal document processing, embeddings, retrieval, and CUDA/PyTorch graph analysis.
- **sveltekit-frontend** (bank 7): Enterprise legal AI frontend with evidence management, case theory, RAG-powered retrieval. SvelteKit 2 + Svelte 5 runes + Drizzle ORM + Lucia v3 + Gemma 4 LLM + Qdrant vector search + MCP tool calling.
- **tests-audits** (bank 8): Playwright E2E + Vitest unit tests + audit reports + scratch + logs.

### Application Synthesis
Legal evidence retrieval, RAG-grounded chat, case management, GRPO-trained Gemma4 for legal reasoning

**Core features**:
- Evidence ingestion (PDF/OCR/audio/video → embeddings)
- RAG pipeline (Qdrant 768-dim + Postgres pgvector)
- Case management (cases + evidence + persons-of-interest)
- Legal corpus search (statutes + citations + precedents)
- AI chat (Gemma4 + tool calling via FastMCP)
- Forensic analysis (entity extraction + PII detection)
- 3D reconstruction (TimelineEvent → ComfyUI + Blender + WebGPU)

### Cross-Zone Links
- opencode → scripts: cards consumed by atlas pipeline
- scripts → sveltekit-frontend: extractors scan src/
- sveltekit-frontend → drizzle: app uses ORM schemas
- sveltekit-frontend → models: app consumes local LLM endpoints
- infrastructure → sveltekit-frontend: app deployed via docker compose
- models → services-simd-bridge: GPU bridges accelerate inference
- memory-docs → opencode: AGENTS.md feeds ACE/KAG cards
- tests-audits → sveltekit-frontend: tests cover routes + components

### Top Improvement Themes (50 total)
- **drizzle**: Populate canonical schema-postgres.ts with full 247-table introspection
- **drizzle**: Enable drizzle-kit journal tracking for audit trail
- **drizzle**: Codify manual sidecars into schema.ts constraints + index definitions
- **drizzle**: Standardize 25 manual migrations into drizzle/migrations/ structure
- **drizzle**: Decide identity_strategy (Path A/B/C/D) before PG18 upgrade
- **infrastructure**: Nginx legacy configs unused (nginx/, ssl/); Caddy is active — remove legacy
- **infrastructure**: Proto archive: 39 deprecated files — cleanup recommended
- **infrastructure**: Dual message brokers (RabbitMQ + NATS) — evaluate architectural necessity
- **infrastructure**: Document GPU memory requirements (TensorRT: 8GB RAM + 1x GPU)
- **infrastructure**: Add Kubernetes manifests; docker-compose is dev-only

**Files written**:
- Parent index: `.tmp/parent-atlas-index.json`
- Zone cards: `.tmp/atlas-cards/*.json` (9 files)
- CouchDB: `codebase_graph/parent-atlas-2026-05-30T07-39-32-886Z`

<!-- ATLAS_TEMPORAL_APPEND_START id=append-1780127035768 time=2026-05-30T07:43:55.768Z -->
### Temporal Event Note [2026-05-30T07:43:55.768Z]
Successfully wired Scenario Cache preflight bypass and registered atlas-tools.create_task, propose_fix, record_fix_outcome
<!-- ATLAS_TEMPORAL_APPEND_END id=append-1780127035768 -->

<!-- atlas-append:0bf81df426b5:2026-05-30T16:27:00.892Z -->
## Atlas Activity — 2026-05-30T16:27:00.892Z

- **Parent atlas rebuild**: 10,732 nodes / 9,378 edges across 8 lanes
- **Redis cache**: 10,732 nodes warmed (24h TTL)
- **CouchDB archive**: 11,136 docs durably persisted
- **This directory**: no tasks or fixes in current run

<!-- /atlas-append:0bf81df426b5 -->


---

## [2026-05-30 08:50 PST] Owner Column Drift Audit — 95% Resolved

**Surprise finding**: the 2026-05-10 audit reported 24 tables with broken uuid user_id FKs.
**Live introspection today**: **0 uuid columns remain**. Drift is 95% resolved.

### Current Distribution (75 columns audited)
| Type | Count | Status |
|---|---|---|
| `integer` | 70 | ✅ Lucia-aligned, Path A |
| `text` | 3 | outlier (all empty) |
| `varchar` | 2 | outlier (all empty) |
| `uuid` | 0 | ✅ migrated |

### 5 Outliers (all 0 rows, zero-risk migration)
- `case_reports.created_by` (varchar)
- `vector_outbox.owner_id` (varchar)
- `admin_ai_chat_sessions.user_id` (text)
- `saved_citation_annotations.user_id` (text)
- `saved_citations.user_id` (text)

**Drizzle status**: all 5 schemas match the live DB types (no TS-side drift).

### Recommendation
**Apply proposed migration to ratify Path A**:
- File: `drizzle/manual/proposed_20260530_unify_owner_columns_to_integer.sql`
- Effort: ~5 minutes (5 ALTERs + 5 FK constraints + 4 Drizzle schema updates)
- Risk: 🟢 NONE (all tables empty)
- Unlocks: operator-only gate on broad migration work (CLAUDE.md Drizzle Safety Rule §2)

### Persistence
- Report: `.tmp/owner-column-drift-report.md`
- CouchDB: `codebase_graph/owner-column-drift-report-2026-05-30` (rev 1-964c437edd...)
- Proposed migration: `drizzle/manual/proposed_20260530_unify_owner_columns_to_integer.sql`

### Test Stabilization
- Added `.js` compatibility shims for `src/lib/server/redis.js` + `ollama.js` (re-export TS impl)
- Removed broken `export { default }` from `ollama.js` (TS source has no default export)
- Enables vitest tests that import the `.js` paths to resolve cleanly

---

## [2026-05-30 20:35 PST] Drizzle Introspect — Live Drift Snapshot

**Live DB**: 305 tables, 3,196 columns, 37 enums, 378 indexes, 30 FKs, 7 checks, 4 views
**Drizzle declares (all sidecar files combined)**: 281 tables

**Real drift**:
- 96 live tables with **zero Drizzle declaration**
- 72 declared tables that don't exist in the live DB
- 209 tables present in both

**Tier 1 critical undeclared** (18 tables — most are active app tables):
- `case_notes`, `case_statute_links`, `case_note_versions`, `case_note_evidence_refs`
- `legal_documents`, `statute_chunks`, `timeline_events`
- `workspaces`, `workspace_notes`, `workspace_sessions`, `workspace_evidence`, `workspace_citations`, `workspace_statutes`
- `chat_document_attachments`, `agent_sessions`, `vault_md_index`, `file_summaries`, `file_hotness_scores`

**Tier 2 ACE/KAG undeclared** (10 tables — infrastructure):
- `ace_chunks`, `ace_context_packets`, `ace_context_sources`, `ace_docs`, `ace_hit_logs`, `ace_sources`
- `agent_context_files`, `agent_context_files_history`, `agent_context_relations`, `agent_memory_observations`

**Artifacts**:
- Full DDL: `.tmp/drizzle-introspect/0000_previous_mother_askani.sql` (4,644 lines)
- Auto schema: `.tmp/drizzle-introspect/schema.ts` (4,977 lines)
- Relations: `.tmp/drizzle-introspect/relations.ts`
- Drift report: `.tmp/drizzle-introspect/DRIFT_REPORT.md`
- CouchDB: `codebase_graph/drizzle-drift-snapshot-2026-05-30T20-35` (rev 1-d6a8f8f5a2...)

**Recommended actions**:
1. **Phase 1**: Add sidecar schema files for 18 Tier-1 tables (safe, type-safety win, ~30 min effort)
2. **Phase 2**: Decide ACE/warden/fixer tables → promote sidecar OR add to `tablesFilter`
3. **Phase 3**: Remove dead schema declarations OR apply pending migrations

**Note**: ACE/KAG tables represent infrastructure scaffolding — likely managed via sidecar SQL (already in `tablesFilter` per CLAUDE.md). Verify before adding sidecars.

---

## [2026-05-30 21:15 PST] Drizzle Drift Corrected + Sidecar Disambiguation

**Methodology bug fix**: The 2026-05-30 20:35 drift report used a single-line regex to detect `pgTable(...)` declarations, which **missed every multi-line declaration in `schema-postgres.ts`** (where canonical legal_documents, case_notes, workspaces, etc. live).

**Corrected numbers**:
- Declared (sidecar + canonical, multi-line-aware): **333** (was 281)
- Live undeclared: **49** (was 96)
- Real gap after subtracting `tablesFilter`: **26** (was 61)

The 10 sidecars I auto-extracted (`case-notes.ts`, `legal-documents.ts`, etc.) were **redundant** with `schema-postgres.ts`. Disambiguation strategy:
- Kept all 10 sidecar files (zero importers, no risk)
- Prepended `MERGED-WITH-CANONICAL` banner to each, pointing to canonical line in `schema-postgres.ts`
- Live-DB shape snapshots preserved for future drift diffing

**Architecture TODO captured**: `next_steps/active/2026-05-30_ARCHITECTURE_TODO_CLIENT_SERVER_SEPARATION.md`
- XState v5 de-prioritized for UI flows (Bits UI v2 + runes handle it)
- Client/server lane separation planned: `src/lib/{client,server,shared}/`
- Per-feature RPC wrappers (typed fetch + ergonomic) to replace ad-hoc API calls
- Keep XState for multi-actor orchestration only (retrieval-machine, chat-machine)

**Persistence**:
- AGENTS.md temporal append (this block)
- Architecture TODO: `next_steps/active/2026-05-30_ARCHITECTURE_TODO_CLIENT_SERVER_SEPARATION.md`
- Drift snapshot updated: `.tmp/drizzle-introspect/real-gap-v2.txt` (26 truly orphan tables)
