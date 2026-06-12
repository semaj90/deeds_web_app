# Parent Atlas Open Lanes — Finish List

Generated: 2026-06-12 (updated). Single authoritative finish list. Do not append — rewrite in place.

---

## Architecture: Four Separate Concerns

| Layer | Schema | Rows | Purpose |
|-------|--------|------|---------|
| Feature Catalog (App) | `featureKey / title / status / sourceRefs` | 4,209 | UI features, ACE retrieval, doc inventory |
| Deployment Registry (Root) | `feature_id / storage_lane / retrieval_lane` | 18 | Architecture lanes — retrieval_spine, turbovec_prefilter, ace_packet_flow, etc. |
| Crosswalk Table | `feature_id / featureKey / match_score / match_type / verified` | bridge | Durable ownership contract between the two taxonomies |
| Temporal Task Registry | `recommendation-events.jsonl / task-state.json` | append-only | Kanban persistence — correct pattern, already wired |

**The two registries use disjoint taxonomies and must not be merged.** The crosswalk is the correct artifact.

**Audit classification model** (replaces `OVERLAY_MISMATCH`):

| Classification | Meaning |
|----------------|---------|
| `CATALOG_ALIGNED` | repo-root ↔ app catalog — same schema, 4208/4209 overlap |
| `TAXONOMY_MISMATCH` | external deployment taxonomy ↔ app catalog — expected, solved by crosswalk |
| `CROSSWALK_REQUIRED` | ≥1 root lane has zero app matches — needs new entry or manual verification |

**Operational layer discipline**:

| Layer | Purpose |
|-------|---------|
| stdout | JSON-RPC / MCP protocol only |
| stderr | human diagnostics only |
| NDJSON | append-only event ledgers (graphify-events, packet-events, task-events, recommendation-events) |
| JSONB / Postgres | canonical state |
| Redis | hot cache |
| Qdrant | vectors |
| Neo4j | graph truth |
| CouchDB | archival snapshots |
| TOON | compressed transient packets |

---

## Already Closed

| Lane | Evidence |
|------|----------|
| OpenCode bootstrap / ACE evidence pull | `reports/opencode-bootstrap.md` — bootstrap wired |
| Recommendation materialization (legacy Gemma4 hook) | `npm run atlas:engram-adapter:decision` → `HINT_ONLY_ADAPTER`; `gemma4_chat` deprecated |
| Temporal registry | `atlas_task_registry` table wired; time-indexed event anchoring active in atlas spine |
| Graphify startup health cache | warm graph state restored from Redis on folder open without full rebuild |
| Memory exports report batching | `memory/exports/reports.ndjson`, `memory/exports/reports.manifest.json`, `docs/reports/memory-exports-ldjson-batch-report.{json,md}` |
| Redis preflight / ACE startup gating | `scripts/ingest/wait-for-redis.mjs`; `ace:startup` and `ace:startup:offline` now gate on Redis readiness |
| Parent Atlas / feature lineage / runtime packet / PostgreSQL mirror audits | audit scripts in place; `atlas:production-readiness` returns PASS 66 / WARN 0 / FAIL 0 |
| Traversal smoke | `npm run atlas:smoke:traversal` — 75/75 pass |
| Engram adapter decision (Lane 1) | `HINT_ONLY_ADAPTER` locked; `repo_report_answer` is the canonical repo-audit path |
| Parent Atlas overlay crosswalk (Lane 2) | `CATALOG_ALIGNED` (4208/4209 key overlap; rootMissingInApp=0; appMissingInRoot=0); crosswalk bridge at `docs/reports/parent-atlas-crosswalk.{json,md}`; 18/18 deployment lanes matched |
| Feature-gap registry reconciliation (Lane 3) | `npm run atlas:feature-gap` → 8 rows, all `implemented`, `missingLiveAtlasContract: false` |
| Graph refresh invalidation / promotion wiring (Lane 4) | `promote-to-postgres.mjs` calls `write-graph-refresh-manifest.mjs` as post-promote hook |
| PyTorch workstation artifact (Lane 5) | `gpu:karpathy:summary` Redis key active (last run 2026-06-05); `gpu:karpathy:scores` feeds ACE authority blend |


## Already Closed

| Lane | Evidence |
|------|----------|
| OpenCode bootstrap / ACE evidence pull | `reports/opencode-bootstrap.md` — bootstrap wired |
| Recommendation materialization (legacy Gemma4 hook) | `npm run atlas:engram-adapter:decision` → `HINT_ONLY_ADAPTER`; `gemma4_chat` deprecated |
| Temporal registry | `atlas_task_registry` table wired; time-indexed event anchoring active in atlas spine |
| Graphify startup health cache | warm graph state restored from Redis on folder open without full rebuild |
| Memory exports report batching | `memory/exports/reports.ndjson`, `memory/exports/reports.manifest.json`, `docs/reports/memory-exports-ldjson-batch-report.{json,md}` |
| Redis preflight / ACE startup gating | `scripts/ingest/wait-for-redis.mjs`; `ace:startup` and `ace:startup:offline` now gate on Redis readiness |
| Parent Atlas / feature lineage / runtime packet / PostgreSQL mirror audits | audit scripts in place; `atlas:production-readiness` returns PASS 66 / WARN 0 / FAIL 0 |
| Traversal smoke | `npm run atlas:smoke:traversal` — 75/75 pass |
| Engram adapter decision (Lane 1) | `HINT_ONLY_ADAPTER` locked; `repo_report_answer` is the canonical repo-audit path |
| Parent Atlas overlay crosswalk (Lane 2) | `CATALOG_ALIGNED` (4208/4209 key overlap; rootMissingInApp=0; appMissingInRoot=0); crosswalk bridge at `docs/reports/parent-atlas-crosswalk.{json,md}`; 18/18 deployment lanes matched |
| Feature-gap registry reconciliation (Lane 3) | `npm run atlas:feature-gap` → 8 rows, all `implemented`, `missingLiveAtlasContract: false` |
| Graph refresh invalidation / promotion wiring (Lane 4) | `promote-to-postgres.mjs` calls `write-graph-refresh-manifest.mjs` as post-promote hook |
| PyTorch workstation artifact (Lane 5) | `gpu:karpathy:summary` Redis key active (last run 2026-06-05); `gpu:karpathy:scores` feeds ACE authority blend |
| XGBoost reranker contract (Lane 6) | `side-channel-hotness-scorer` decision locked; contract at `sveltekit-frontend/docs/reports/xgboost-reranker-contract.md`; phase 18 stays bounded |

| Memory Address Registry (Lane A) | `atlas_memory_address_registry` seeded: 9,099 rows (5,253 postgres/atlas + 3,846 qdrant/karpathy); smoke 8/8 PASS; FK integrity clean; feature_id 100%; Qdrant 42.3% |
| **Topology Mirror Verification + Repair** (Lane B) | `scripts/atlas/backfill-active-topology-mirror-from-qdrant.mjs` — verification tool (beforeMissing=0, afterMissing=0, writes=0); SOM coverage 100% / 4,830 active rows; used for regression detection |
| **Phase 3A — Multi-Lane Retrieval Foundation** | Dense (Qdrant HNSW), Lexical (pg_trgm + FTS), Structural (JSONB payload) — verified operational |
| **Phase 3B — Retrieval Integration & Fusion** | vectorRecall + ngramRecall + fullTextRecall fused; measured: "ui component" → 20-25ms → 12-18ms (40% latency improvement, VALIDATED) |
| **Phase 3C — Directory Topology & Cold Storage** | Directory topology map (10,951 mappings / 326 dirs), Hidden surface registry (5 layers), Packet temperature classification (9,484 HOT / 427 WARM / 0 COLD), SeaweedFS manifest ready; identity spine complete: directory_path → source_ref → feature_id → som_cluster → retrieval fusion |

---

## Open Lanes — Finish Order

### ACTIVE
- **Higher-Hop Coverage Repair / Semantic ACE Traversals (Active P0)**
  - Goal: fill the remaining higher-hop lineage fields so the semantic traversal lane can promote from report-only coverage to materialized data.
  - Scope:
    - `somCluster`
    - `glyphRecord`
    - `qdrantHit`
    - `redisHotKey`
    - `neo4jNode`
  - Repair shape:
    - Redis / Valkey hot-cache replay via Bitfrost
    - Qdrant hit backfill and payload relink
    - Neo4j node relink for traversal edges
    - Task-board promotion for codebase semantic ACE traversals
  - Deliverables:
    - bounded backfill plan
    - higher-hop coverage audit rerun
    - runtime trace population for selected_concepts / selected_packets
    - remap `concept_records.evidence_cards` to the live packet spine (`packet_keys` / `feature_ids`)
    - board update with the next repair lane
  - Timeline: active now.
  - Downstream open lanes:
    - `atlas_feature_map` ↔ `parent_atlas_documents` join repair
    - `route_runtime_packets` materialization
    - `som_cluster` coverage audit / backfill

- **Historical Concept Evidence Spine Backfill (Active P0)**
  - Goal: rewrite `concept_records.evidence_cards` from legacy card IDs to the live packet spine.
  - Scope:
    - `concept_records.evidence_cards`
    - `packet_keys`
    - `feature_ids`
  - Repair shape:
    - bounded dry-run/apply backfill
    - backup report before mutation
    - preserve legacy card IDs in the `evidence` field
  - Deliverables:
    - backfill script with `--dry-run`, `--apply`, and `--limit`
    - concept evidence spine report
    - stale legacy IDs reduced to zero
  - Timeline: active now.
  - Upstream dependency:
    - `Higher-Hop Coverage Repair / Semantic ACE Traversals`

- **Phase 3I — Metadata Index Ingestion (Active P0)**
  - Goal: Ingest parsed MessagePack chunks into the Postgres `atlas_packets` table to serve as the canonical packet registry.
  - Deliverable 1: `atlas_packets` database schema (`20260611_atlas_packets_schema.sql`) ✅ Created & Applied.
  - Deliverable 2: Ingestion script (`scripts/atlas/ingest-msgpack-chunks.mjs`) to load chunks from `memory/packets/` into Postgres `atlas_packets`.
  - Deliverable 3: Audit verification to ensure all 30,683 rows are imported successfully.
  - Timeline: Active now.

- **Phase 4A — Retrieval Evaluation Harness & RRF Fusion (P1)**
  - Goal: Establish hybrid search using BM25 + Vector ANN + JSONB + Neo4j GDS combined via Reciprocal Rank Fusion (RRF).
  - Deliverables:
    - `scripts/atlas/eval-hybrid-fusion.mjs` to measure RRF precision/recall.
    - Wire RRF fusion client into SvelteKit hybrid retriever.
  - Timeline: 1 week (after Phase 3I).

- **Phase 4B — GPU Autoencoder Lane (P1)**
  - Goal: Dimensionality reduction of embeddings (768 -> 64) using a PyTorch autoencoder, mapped to SOM cluster coordinates for Neo4j update.
  - Deliverables:
    - Train autoencoder on distilled high-reward trace examples.
    - Update `atlas_packets` and `concept_records` with projected coordinates.
  - Timeline: 2 weeks.

### COMPLETED & INTEGRATED (PHASES 3A–3H)
- **Phase 3D — Retrieval Telemetry & Lifecycle Management** ✅ Integrated: Captured telemetry, validated environment-detector, and generated telemetry logs.
- **Phase 3E — Retrieval Evaluation Harness** ✅ Integrated: 150 retrievals evaluated with 66.6% fusion dominance.
- **Phase 3F — Feature Governance Audit / Trace Accumulation** ✅ Integrated: 1,134 synthetic agent traces seeded, 813 high-reward QLoRA training examples distilled to `qlora_examples.jsonl`.
- **Phase 3G — Temperature-Driven Cache Policy** ✅ Integrated: evictions and temperature classifications mapped to directories and files.
- **Phase 3H — Automated SeaweedFS Promotion** ✅ Integrated: cold packet archival promotion manifests built.

### ACTIVE SUBGRAPH: HyperRAG Packet RPC + NESCHROM97
- **HyperRAG Packet RPC — Multi-Lane Semantic Exposure**
  - Status: Registry Built (P0)
  - Goal: Expose codebase semantic indexing as bounded, replayable RPC over NES/CHR packets
  - Architecture:
    - **Storage Tiers**: Postgres (canonical), Qdrant (dense ANN), Neo4j (graph), DuckDB (joins), SeaweedFS (cold), Redis (hot cache)
    - **RPC Response Shape**: packets array with packet_key, source_ref, feature_id, feature_label, directory_path, qdrant_tags, neo4j_neighbors, retrieval_lanes (dense/fts/trigram/jsonb scores), gemma4_summary, rank
    - **Trace Metadata**: qdrant_hits, postgres_hits, neo4j_expansions, duckdb_join_used, latency_ms
  - Deliverables:
    1. **NESCHROM97 Card Registry** (`neschrom97-card-registry.json`)
       - Map: card_id → packet_key → source_ref → feature_id
       - Source: `neschrom97/cards/*.json` + live `nes_chrom_packets` + `memory/packets/nes-chrom-packets.jsonl`
       - Status: Done — `8170` cards, `14911` live packets, `45` NDJSON packets, `91.69%` card→packet join coverage
    2. **Qdrant Payload Enrichment**
       - Status: Applied (19 patched; 1 already covered)
       - Plan report: `docs/reports/neschrom97-qdrant-tag-plan.{json,md}`
       - Apply report: `docs/reports/neschrom97-qdrant-tag-apply-report.{json,md}`
       - Add tags: card_id, packet_key, source_ref, feature_id, directory_path, surface:neschrom97
    3. **Neo4j Edge Mapping**
       - `(:NesChromCard)-[:MATERIALIZES]->(:Packet)`
       - `(:Packet)-[:DERIVED_FROM]->(:SourceRef)`
    4. **Smoke Test**
       - `npm run smoke:neschrom97-registry` (narrow: no broad Drizzle, no SvelteKit bootstrap, explicit pool.end())
       - Status: PASS
  - Timeline: tagging + graph edge mapping remain
  - Critical: Card store is cold/offline evidence, NOT canonical truth. Postgres + Neo4j are canonical.

- **NESCHROM97 Surface Discovery** (RESOLVED)
  - Status: Discovered & Mapped (P0)
  - Live surfaces:
    - `neschrom97/cards/*.json` — offline card evidence layer
    - `memory/packets/nes-chrom-packets.jsonl` — packet NDJSON ledger
    - `sveltekit-frontend/src/routes/api/atlas/nes-chrom/+server.ts` — API endpoint
    - `sveltekit-frontend/src/lib/server/features/ai/ace/nes-chrom-packet-service.ts` — service layer
    - `sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts` — Drizzle schema
    - `sveltekit-frontend/src/lib/server/ace/nes-chrom-card-store.ts` — card store
    - `docs/reports/nes-chrom-*.json|md` — audit reports
  - Rules:
    - Do NOT commit full card store if large (keep locally only)
    - Do NOT treat card JSON as canonical
    - Use Postgres/NES packet tables as canonical
    - Use neschrom97 as cold/offline evidence layer
    - Preserve card hash and restore path
  - Next: bounded Qdrant tag plan generated from `docs/reports/neschrom97-card-registry.json`

- **NDJSON Semantic Ingestion / Warm Summary Packets**
  - Status: Active (P1)
  - Goal: Parse gitignored NDJSON into warm, searchable summary packets while keeping raw blobs cold and recoverable.
  - Inputs:
    - `.tmp/*.ndjson`
    - `memory/packets/*.jsonl`
    - `neschrom97/packets/*.ndjson`
    - `docs/reports/*.ndjson`
  - Pipeline:
    1. `npm run ndjson:mapreduce` - offline join / reduce / minify
    2. `npm run atlas:path-join` - split atlas source kinds and emit slim path index
    3. `node scripts/atlas/gemma4-parent-atlas-summaries.mjs --cache --limit=50` - batch semantic summaries
    4. `node scripts/atlas/materialize-neschrom97-ldjson.mjs --apply` - canonical NESCHROM97 LDJSON packets
    5. `npm run graph:bitfrost-qdrant-sync` - hot cache replay and payload sync
    6. `npm run atlas:qdrant:tag` - payload tag enrichment
  - Outputs:
    - warm `.md` summary packets for Git / docs
    - Qdrant payload tags for `source_ref`, `feature_id`, `feature_label`, `directory_path`, `som_cluster`
    - Neo4j multi-hop traversal edges
    - Redis / Bitfrost hot packet shortcuts
  - Rules:
    - raw NDJSON remains gitignored or cold-stored
    - `source_ref` stays the canonical join key
    - `LangExtract`, TurboVec, and Gemma4 are enrichment helpers, not canonical storage
    - Rust N-API / LibTorch / matmul work stays on the parsing / acceleration lanes, not the metadata lane

- **TurboVec sidecar / temporal packet indexing**
  - Status: Active (P1)
  - Goal: Keep the TurboVec sidecar, temporal intent cache, and Bitfrost replay lane aligned so hot summaries do not depend on regenerating raw NDJSON.
  - Commands:
    - `npm run turbovec:sidecar`
    - `npm run turbovec:sidecar:health`
    - `npm run turbovec:memory:stats`
    - `node scripts/agent/turbovec-search-memory.mjs --stats`
    - `npm run atlas:materialize:neschrom97:ldjson`
    - `npm run atlas:materialize:neschrom97:ldjson:apply`
    - `npm run opencode:tasks:state`
  - Inputs:
    - `turbovec:memory:*` Redis keys
    - ACE packet cache
    - warm summary packets
  - Outputs:
    - temporal cache hits
    - stable hot summary packets
    - replayable intent memory
  - Rules:
    - do not regenerate raw NDJSON if a cache-backed summary already exists
    - keep sidecar transport isolated from Postgres / Qdrant writes
    - preserve `source_ref` as the lookup spine across temporal and semantic cache layers

- **Local Deep Research / Firecrawl / LDR MCP**
  - Status: Active (P1)
  - Goal: Keep web-backed deep research, URL fetch, and async research tasks behind a bounded MCP lane so OpenCode can use local-deep-research without bypassing repo evidence.
  - Commands:
    - `npm run mcp:probe:json`
    - `npm run ldr:probe`
  - Inputs:
    - `sveltekit-frontend/scripts/mcp/ldr-mcp.mjs`
    - `sveltekit-frontend/src/lib/server/analytics/ldr-client.ts`
    - Firecrawl-backed `web_search` / URL fetch surfaces already present in the app repo
  - Outputs:
    - `ldr.search_history`
    - `ldr.quick_summary`
    - `ldr.start_research`
    - stdio MCP tool listing for the local-deep-research container
    - LangExtract remains service-backed here; the MCP probe skips it when no local wrapper script is present
  - Rules:
    - use LDR for web-backed research and summaries, not canonical storage
    - keep `source_ref` and repo evidence first
    - do not route generic chat through the research lane

### QUEUED / PLANNED
- **Phase 17I — Binary Transport & GPU Structural Parsing**
  - Status: Ready / Spec
  - Goal: Measure transport pressure before adding gRPC, FlatBuffers, CUDA JSONPath, or GpJSON.
  - Audit: `npm run atlas:audit:transport-pressure`
  - Outputs: `docs/reports/transport-pressure-audit.{json,md}`
- **Redis / Bitfrost hot-cache indexing**
  - Status: Queued (P1)
  - Goal: Keep hot packet shortcuts, centroid lookups, and replayable cache state aligned with the packet ledger.
  - Command: `npm run graph:bitfrost-qdrant-sync`
- **PostgreSQL 18 indexing**
  - Status: Queued (P1)
  - Goal: Keep JSONB, GIN, and pgvector mirrors aligned with the live contract tables.
  - Command: `node scripts/postgres18-verify-optimizations.mjs`
- **Qdrant tag enrichment**
  - Status: Queued (P1)
  - Goal: Add stable payload tags for `source_ref`, `feature_id`, `feature_label`, `directory_path`, and `som_cluster`.
  - Command: `npm run atlas:qdrant:tag`
- **Rust N-API parsing**
  - Status: Queued (P2)
  - Goal: Add optional high-throughput NDJSON / JSONL parsing behind read-only smoke gates.
  - Command: `node scripts/native/audit-gpu-capabilities.mjs`
- **LibTorch / GPU parsing lane**
  - Status: Queued (P2)
  - Goal: Keep libtorch projection / matmul work separate from packet metadata repair and indexing.
  - Command: `node scripts/startup-gpu-bridge-probe.mjs`
- **Parent Atlas overlay reconciliation**
  - Status: Queued (P1)
  - Goal: Resolve overlay mismatch.
  - Command: `npm run atlas:parent-atlas:overlay-crosswalk`
- **MCP allowlist mapping**
  - Status: Queued (P1)
  - Goal: Complete command routing and tool authorization mapping.
  - Command: `npm run opencode:tasks:refresh`
- **Circular dependency cleanup**
  - Status: Queued (P1)
  - Goal: Remove remaining dependency cycles.
- **Synthetic evidence concept cards**
  - Status: Queued (P2)
- **Provenance parity**
  - Status: Queued (P2)
- **Trust-tier editing**
  - Status: Queued (P2)

---

## Exit Criteria

| Criterion | Status |
|-----------|--------|
| Overlay audit = `CATALOG_ALIGNED` (repo-root ↔ app) | ✅ 4208/4209 overlap |
| Deployment crosswalk = all 18 lanes matched | ✅ 18/18 SEMANTIC matches |
| `atlas:smoke:traversal` = 75/75 | ✅ PASS |
| No lane depends on hidden legacy Gemma4 forwarding path | ✅ PASS |
| Memory Address Registry table seeded | ✅ 9,099 rows; smoke 8/8 PASS |
| Active Production SOM Coverage = 100% | ✅ 4,830/4,830 rows; gaps resolved |
| Ingest MessagePack chunks into `atlas_packets` | ⏳ Active (Phase 3I) |
| Hybrid search with RRF Fusion active | ⏳ Active (Phase 4A) |
| Autoencoder embedding projection active | ⏳ Active (Phase 4B) |
| UI topology shows SOM cluster + trust-tier badges | ⏳ pending Lane B-3 |
