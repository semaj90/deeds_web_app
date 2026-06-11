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
- **Phase 3D — Retrieval Telemetry & Lifecycle Management**
  - Status: Active (P0)
  - Goal: Capture behavioral telemetry to convert structural temperature (guess) into evidence
  - Deliverable 1: `retrieval_telemetry` table + `scripts/atlas/capture-retrieval-telemetry.mjs`
    - Schema: query, query_hash, latency_ms, vector_hits, trigram_hits, fts_hits, selected_packet_key, selected_feature_id, fusion_score, cache_hit, surface, environment
    - Wire into ACE context assembler + hybrid-search + rag-pipeline
  - Deliverable 2: Runtime context correlation via environment-detector.mjs
    - Attach: {surface: "vscode"|"claudecode"|"opencode"|"codex"|"ci", environment: "phase-3d-retrieval-telemetry"}
  - Deliverable 3: Quality reports
    - `docs/reports/retrieval-telemetry-summary.json` (p50, p95, cache hit ratio, lane contributions, top features/dirs, orphans)
    - `docs/reports/retrieval-telemetry-summary.md` (narrative analysis)
  - Success: >1,000 queries captured, telemetry flowing continuously, behavioral temperature visible
  - Timeline: 1-2 weeks
  - Critical: Must complete before any caching policy decisions (telemetry informs policy)

### READY
- **Retrieval Evaluation Harness** (Phase 3E)
  - Status: Ready (P1)
  - Goal: Establish ground-truth quality metrics (precision, recall, latency, fusion effectiveness)
  - Deliverables:
    - `scripts/atlas/run-retrieval-evals.mjs` with 5 test suites:
      - feature_lookup (find feature by name)
      - source_ref_lookup (find packets by source_ref)
      - directory_lookup (list features in directory)
      - packet_reconstruction (reconstruct packet from som_cluster)
      - multi_hop_lookup (traverse feature → som_cluster → related)
    - `docs/reports/retrieval-evals-baseline.json` (precision, recall, latency per test)
  - Success: All 5 tests passing, baseline metrics locked
  - Timeline: 1 week (after 3D)
  - Note: Requires telemetry to interpret results
- **Feature Governance Audit** (Phase 3F)
  - Status: Ready (P1)
  - Goal: Audit feature_id lifecycle using telemetry signals (not just structure)
  - Deliverables:
    - `atlas_feature_quality` analysis (feature_id → {retrieval_count, orphan_rate, quality_tier})
    - Find: dead features, oversized features, underused features
    - `docs/reports/feature-quality-audit.json` (archival + decomposition recommendations)
  - Success: Quality audit complete, candidates identified
  - Timeline: 1 week (after eval harness)
  - Note: Uses telemetry from 3D to validate decisions
- **Temperature-Driven Cache Policy** (Phase 3G)
  - Status: Ready (P1)
  - Goal: Automate HOT/WARM/COLD tiers using behavioral evidence (not structural guesses)
  - Deliverables:
    - Update temperature model: HOT = retrieved >5 times in 7 days (was: packet in frequent directory)
    - WARM = retrieved 1-5 times in 7 days
    - COLD = retrieved 0 times in 30 days
    - Implement eviction: HOT→Redis+Qdrant/30d, WARM→Qdrant/90d, COLD→SeaweedFS/365d
    - `docs/reports/cache-policy-report.json` (behavioral temperature distribution)
  - Success: Policy driven by telemetry, not structure
  - Timeline: 1 week (after governance audit)
  - Dependencies: REQUIRES Phase 3D telemetry
- **Automated SeaweedFS Promotion** (Phase 3H)
  - Status: Ready (P1)
  - Goal: Automate cold storage archival for genuinely unused packets
  - Deliverables:
    - Background job: detect COLD packets (0 retrievals in 30 days) → archive to SeaweedFS
    - Manifest update: track archived packets for reconstruction
    - `docs/reports/seaweedfs-promotions.json` (archive events, cost savings)
  - Success: COLD packets automatically archived, manifests tracked
  - Timeline: 1 week (after cache policy)
  - Dependencies: REQUIRES Phase 3G cache policy, Phase 3D telemetry

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
| Three missing root lanes have crosswalk entries | ⏳ pending — `redis_agent_memory_server_eval`, `memory_address_registry`, `duckdb_analytics_lane` (evaluation-deferred, not blocking) |
| UI topology shows SOM cluster + trust-tier badges | ⏳ pending Lane B-3 |
