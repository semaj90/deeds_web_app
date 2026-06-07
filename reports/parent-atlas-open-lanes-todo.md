# Parent Atlas Open Lanes — Finish List

Generated: 2026-06-06. Single authoritative finish list. Do not append — rewrite in place.

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
| Parent Atlas / feature lineage / runtime packet / PostgreSQL mirror audits | audit scripts in place; `atlas:production-readiness` returns 63 PASS / 3 WARN / 0 FAIL |
| Traversal smoke | `npm run atlas:smoke:traversal` — 75/75 pass |
| Engram adapter decision (Lane 1) | `HINT_ONLY_ADAPTER` locked; `repo_report_answer` is the canonical repo-audit path |
| Parent Atlas overlay crosswalk (Lane 2) | `CATALOG_ALIGNED` (4208/4209 key overlap; rootMissingInApp=0; appMissingInRoot=0); crosswalk bridge at `docs/reports/parent-atlas-crosswalk.{json,md}`; 18/18 deployment lanes matched |
| Feature-gap registry reconciliation (Lane 3) | `npm run atlas:feature-gap` → 8 rows, all `implemented`, `missingLiveAtlasContract: false` |
| Graph refresh invalidation / promotion wiring (Lane 4) | `promote-to-postgres.mjs` calls `write-graph-refresh-manifest.mjs` as post-promote hook |
| PyTorch workstation artifact (Lane 5) | `gpu:karpathy:summary` Redis key active (last run 2026-06-05); `gpu:karpathy:scores` feeds ACE authority blend |
| XGBoost reranker contract (Lane 6) | `side-channel-hotness-scorer` decision locked; contract at `sveltekit-frontend/docs/reports/xgboost-reranker-contract.md`; phase 18 stays bounded |

| Memory Address Registry (Lane A) | `atlas_memory_address_registry` seeded: 9,099 rows (5,253 postgres/atlas + 3,846 qdrant/karpathy); smoke 8/8 PASS; FK integrity clean; feature_id 100%; Qdrant 42.3% |

---

## Open Lanes — Finish Order

---

### Lane B — UI Cluster / Trust-Tier Controls

**Status**: open — unblocked (Lane A complete)

**Finish line**:
- Surface `som_cluster` and `trust_tier` labels in the codebase topology UI (`src/routes/(app)/code-intel/topology/+page.svelte`)
- Wire `atlas_feature_map.som_cluster` + `atlas_feature_map.centroid_id` into the topology route load function
- Add cluster badge component alongside existing node inspector
- Only begin after Memory Address Registry seed is complete (Lane A)

---

## Exit Criteria

| Criterion | Status |
|-----------|--------|
| Overlay audit = `CATALOG_ALIGNED` (repo-root ↔ app) | ✅ 4208/4209 overlap |
| Deployment crosswalk = all 18 lanes matched | ✅ 18/18 SEMANTIC matches |
| `atlas:smoke:traversal` = 75/75 | ✅ PASS |
| No lane depends on hidden legacy Gemma4 forwarding path | ✅ PASS |
| Memory Address Registry table seeded | ✅ 9,099 rows; smoke 8/8 PASS |
| Three missing root lanes have crosswalk entries | ⏳ pending — `redis_agent_memory_server_eval`, `memory_address_registry`, `duckdb_analytics_lane` (evaluation-deferred, not blocking) |
| UI topology shows SOM cluster + trust-tier badges | ⏳ pending Lane B |
