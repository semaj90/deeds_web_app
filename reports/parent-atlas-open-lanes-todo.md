# Parent Atlas Open Lanes — Finish List

Generated: 2026-06-11 (updated). Single authoritative finish list. Do not append — rewrite in place.

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
| Parent Atlas / feature lineage / runtime packet / PostgreSQL mirror audits | audit scripts in place; `atlas:production-readiness` returns PASS 66 / WARN 0 / FAIL 0 |
| Traversal smoke | `npm run atlas:smoke:traversal` — 75/75 pass |
| Engram adapter decision (Lane 1) | `HINT_ONLY_ADAPTER` locked; `repo_report_answer` is the canonical repo-audit path |
| Parent Atlas overlay crosswalk (Lane 2) | `CATALOG_ALIGNED` (4208/4209 key overlap; rootMissingInApp=0; appMissingInRoot=0); crosswalk bridge at `docs/reports/parent-atlas-crosswalk.{json,md}`; 18/18 deployment lanes matched |
| Feature-gap registry reconciliation (Lane 3) | `npm run atlas:feature-gap` → 8 rows, all `implemented`, `missingLiveAtlasContract: false` |
| Graph refresh invalidation / promotion wiring (Lane 4) | `promote-to-postgres.mjs` calls `write-graph-refresh-manifest.mjs` as post-promote hook |
| PyTorch workstation artifact (Lane 5) | `gpu:karpathy:summary` Redis key active (last run 2026-06-05); `gpu:karpathy:scores` feeds ACE authority blend |
# Parent Atlas Open Lanes — Finish List

Generated: 2026-06-11 (updated). Single authoritative finish list. Do not append — rewrite in place.

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

### QUEUED / PLANNED
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
