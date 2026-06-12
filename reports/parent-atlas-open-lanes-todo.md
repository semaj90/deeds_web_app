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
| Memory Address Registry (Lane A) | `atlas_memory_address_registry` seeded: 9,099 rows (5,253 postgres/atlas + 3,846 qdrant/karpathy); smoke 8/8 PASS; FK integrity clean; feature_id 100%; Qdrant 42.3% |
| **Topology Mirror Verification + Repair** (Lane B) | `scripts/atlas/backfill-active-topology-mirror-from-qdrant.mjs` — verification tool (beforeMissing=0, afterMissing=0, writes=0); SOM coverage 100% / 4,830 active rows; used for regression detection |
| **Phase 3A — Multi-Lane Retrieval Foundation** | Dense (Qdrant HNSW), Lexical (pg_trgm + FTS), Structural (JSONB payload) — verified operational |
| **Phase 3B — Retrieval Integration & Fusion** | vectorRecall + ngramRecall + fullTextRecall fused; measured: "ui component" → 20-25ms → 12-18ms (40% latency improvement, VALIDATED) |
| **Phase 3C — Directory Topology & Cold Storage** | Directory topology map (10,951 mappings / 326 dirs), Hidden surface registry (5 layers), Packet temperature classification (9,484 HOT / 427 WARM / 0 COLD), SeaweedFS manifest ready; identity spine complete: directory_path → source_ref → feature_id → som_cluster → retrieval fusion |
| **postgres-contract-mirrors audit** | `scripts/atlas/audit-postgres-contract-mirrors.mjs` — audit lane 100% complete, report written to `docs/reports/postgres-contract-mirrors-report.{md,json}` |

---

## Canonical Active Board

### DONE
- [x] Parent Atlas export chain
- [x] Source-ref normalization
- [x] Open-lanes prep lane
- [x] Open-lanes unmatched relevant refs = 0
- [x] Neo4j USED_CONCEPT seeding
- [x] Recommendation merge audit explained
- [x] Artifact bloat audit classified
- [x] Engram decision documented (spectra-g/engram MCP preferred, Tiny-Engram and claude-mem-opencode retired)
- [x] GPU bridge validation
- [x] Phase 16 refresh promotion wired
- [x] postgres-contract-mirrors audit complete
- [x] TurboVec lane implementation complete — port fixed (:8099 → :8792), /prefilter + /search endpoints verified, Python TurboVec indexes 54,331 vectors from codebase_chunks_768, JS centroid fallback active

### ACTIVE
- [ ] BM25 text/content coverage (22.5% → target 85%+)
- [ ] concept_ids/tag enrichment (34.3% → target 60%+)
- [ ] community_confidence quality (high-conf 15% → target 50–65% practical)
- [ ] ranking signal coverage audit (make this the main dashboard gate)
- [ ] additive sidecar alignment for `task_semantic_packets` and `route_runtime_packets` (ADD_DRIZZLE_MIRROR follow-ups)

### NEXT
- [ ] Qdrant payload enrichment
- [ ] XGBoost feature rows
- [ ] QLoRA/export candidates from verified rows

### THEN
- [ ] HyperRAG Packet RPC
- [ ] Neo4j contextual trees
- [ ] higher-hop enrichment

### DEFERRED
- [ ] widen full bundle (full-bundle unmatched refs deferred until signal-density improves)
- [ ] SOM retraining
- [ ] native GEMM / pybind11
- [ ] RL policy
- [ ] Gemma4 planner QLoRA
- [ ] GpJSON / RAPIDS / ClickHouse

---

## Active Blocker: Ranking Signal Density Gate

> [!IMPORTANT]
> Do not train XGBoost or export QLoRA planner candidates until:
> - BM25 text >= 85%
> - concept_ids >= 60%
> - community_confidence populated = 100%
> - selected_concepts = 100%
> - reward trace coverage = 100%
>
> Since community provenance, selected concepts, and reward traces are already effectively done, the only two immediate fill jobs are:
> 1. **BM25 summaries** (ingesting into parent-atlas documents/packets)
> 2. **concept_ids enrichment**

---

## Memory Decision Summary

- **Memory Stack**: Use `spectra-g/engram` MCP server for temporal, validation, and knowledge graph memory. Wire via MCP config (stdio or HTTP transport — NOT HTTP port 8792 which is the TurboVec ANN sidecar).
- **Do NOT Use**:
  - `Tiny-Engram` PEFT adapter memory (too complex, modifies Gemma weights).
  - `claude-mem-opencode` session memory (proven to be unstable/unreliable in live workspace).

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
| Ingest MessagePack chunks into `atlas_packets` | ✅ Ingested |
| Hybrid search with RRF Fusion active | ✅ Fused and active (NDCG@10 avg = 0.711) |
| Autoencoder embedding projection active | ⏳ Active (Phase 4B) |
| UI topology shows SOM cluster + trust-tier badges | ⏳ pending Lane B-3 |
