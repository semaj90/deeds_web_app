# HyperRAG Proof Roadmap — Aligned to Current Spine

**Last Updated:** 2026-06-23 Session  
**Current Status:** P0 COMPLETE | P1 IN PROGRESS | P2 PLANNED | P3–P4 DEFERRED

---

## ✅ P0: Runtime Proof Skeleton — COMPLETE

### ✅ Startup Health Gate
- [x] `npm run atlas:startup` passes 7/7 gates
- [x] 17,995 packets, 52,606 Qdrant points, 36,838 Neo4j edges verified
- [x] XGBoost NDCG@10 = 0.9516 baseline established

### ✅ Packet RPC Route
- [x] `POST /api/hyperrag/packet-rpc` responds with fusion strategy
- [x] Cache hit/miss paths verified (Redis exact-match + live fallback)
- [x] 4 smoke tests pass (cache miss/hit, confidence scoring, provenance immutability)

### ✅ trace_id Promotion
- [x] `trace_id` emitted at top level (promoted from `run_id` / `replay_id`)
- [x] Persisted to packet.run_id and packet.replay_id (dual-write for backward compat)
- [x] Live endpoint returns: `trace_id: 1782184745187-ce3q6rj`

### ✅ Contributor Counts
- [x] Top-level `contributors{}` block with lane hit counts
  - [x] `bm25_hits` (FTS/lexical)
  - [x] `qdrant_hits` (vector ANN)
  - [x] `neo4j_hits` (graph/KAG/DAG)
  - [x] `turbovec_hits` (optional compression)
  - [x] `rrf_final_hits` (RRF fusion output)
- [x] Derived from per-packet `retrieval_lanes` + `fusion_sources`
- [x] Live endpoint returns: `{ bm25_hits: 5, qdrant_hits: 1, neo4j_hits: 5, turbovec_hits: 0, rrf_final_hits: 5 }`

### ✅ Proof Report Artifacts
- [x] `docs/reports/hyperrag-runtime-proof.json` — structured proof data
- [x] `docs/reports/hyperrag-runtime-proof.md` — human-readable summary
- [x] `docs/reports/hyperrag-runtime-proof-gaps.md` — gap inventory + cleanup roadmap
- [x] Written by `smoke:hyperrag-packet-rpc` on every run
- [x] Pass status: **PASS-DEGRADED** (turbovec offline, all other lanes green)

---

## 🚀 P1: Qdrant Dense Miss Cleanup — IN PROGRESS

### Current Gap: 8/10 Packets Are FTS-Only
- Packets 2–9 from typical retrieval have `qdrant_point_id = NULL`
- Hitting BM25 fallback instead of Qdrant ANN
- Root cause: schema files added to Postgres but never ingested to Qdrant `codebase_chunks_768`

### P1a: Backfill Missing Packets to Qdrant
**Script:** `scripts/atlas/backfill-packets-to-qdrant.mjs` (new)

**Steps:**
- [ ] Query Postgres: `SELECT * FROM atlas_packets WHERE qdrant_point_id IS NULL LIMIT 1000`
- [ ] For each packet:
  - [ ] Extract `content` field (or summarize from `source_ref` file)
  - [ ] Call `/api/embed` (Ollama embeddinggemma) → get 768-dim vector
  - [ ] Upsert to Qdrant `codebase_chunks_768` collection:
    - `content` vector (768-dim)
    - Payload: `packet_key`, `source_ref`, `feature_id`, `directory_path`, `som_cluster` (if present)
  - [ ] Capture returned `qdrant_point_id`
  - [ ] Update Postgres: `UPDATE atlas_packets SET qdrant_point_id = $1 WHERE packet_key = $2`
- [ ] Batch size: 50–100 packets per iteration
- [ ] Dry-run first with `--dry-run` flag

**Acceptance Criteria:**
- [ ] All FTS-only packets have `qdrant_point_id` set
- [ ] Re-run smoke test: expect `qdrant_hits` to rise from 2 → 10
- [ ] `dense` scores > 0 for all packets
- [ ] `fusion_sources` includes `"qdrant_vector"` for all results
- [ ] Proof remains PASS-DEGRADED or upgrades to FULL-PASS

### P1b: Verify Payload Completeness
- [ ] Check that all Qdrant payloads have required fields:
  - [x] `packet_key`
  - [x] `source_ref`
  - [x] `feature_id`
  - [ ] `cache_namespace` (if applicable)
  - [ ] `retrieval_path` (if applicable)
- [ ] Script: existing `backfill-qdrant-payload-complete.mjs` or extend it

---

## 📋 P2: Replay/Provenance Breadth — PLANNED

### P2a: Materialize Provenance Tree Rows
**Script:** `scripts/atlas/materialize-provenance-tree.mjs` (exists, verify coverage)

**Required Fields on Every Row:**
- [x] `trace_id` (from packet-rpc response)
- [ ] `run_id` (from packet-rpc response)
- [ ] `replay_id` (from packet-rpc response)
- [x] `packet_key` (from packet)
- [x] `feature_id` (from packet)
- [ ] `story_id` (from request header or context)
- [ ] `task_id` (from request header or packet context)
- [ ] `worker_id` (from packet-rpc route, e.g., "sveltekit-frontend")
- [ ] `cache_namespace` (e.g., "hyperrag:query")
- [ ] `cache_hit_source` (redis_exact_match / live_fusion)
- [ ] `retrieval_path` (array: ["packet_rpc", "qdrant", "neo4j", "rrf"])
- [x] `retrieved_at` (timestamp)
- [x] `retrieved_from` (retrieval source)
- [x] `retrieval_confidence` (0–1 score)

**Target Table:** `retrieval_eval_times` (verify schema exists)

**Dry-run:**
- [ ] `npm run atlas:materialize:provenance -- --dry-run`
- [ ] Verify all rows have required fields
- [ ] Check for NULL values in non-nullable columns

**Apply:**
- [ ] `npm run atlas:materialize:provenance -- --apply`
- [ ] Spot-check 10 random rows in DB

### P2b: Breadth Smoke Test
**Script:** `smoke:hyperrag-packet-rpc` (already runs P0–P1)

**Add Check:**
- [ ] Query `retrieval_eval_times` for rows from last 10 min
- [ ] Verify all required fields present (no unexpected NULLs)
- [ ] Report: rows created, field coverage %

---

## 🔮 P3: Runtime Evidence Packetization — LATER

### P3a: Packetize API/Log/Cache Events
**Scope:** Convert Playwright test logs, dev server API responses, Redis cache events into chrom97/neschrom97 packets

**Out of scope for P0–P1–P2.** Design doc: `next_steps/active/2026-XX-XX_runtime-evidence-packetization.md`

---

## 🗄️ P4: Cold-Storage Restore Verification — LATER

### P4a: Verify CouchDB/SeaweedFS Cold Archive
**Scope:** Ensure packets archived to cold storage are restorable with proof

**Out of scope for current session.**

---

## Command Reference

### P0 Verification (Done)
```bash
npm run atlas:startup
npm run smoke:hyperrag-packet-rpc
# Outputs: docs/reports/hyperrag-runtime-proof.json, .md
```

### P1 Backfill (Next)
```bash
# Dry-run
node scripts/atlas/backfill-packets-to-qdrant.mjs --dry-run --limit 10

# Apply
node scripts/atlas/backfill-packets-to-qdrant.mjs --apply --limit 100

# Verify
npm run smoke:hyperrag-packet-rpc
# Expect: qdrant_hits rises, qdrant_point_id populated
```

### P2 Materialize (After P1)
```bash
# Dry-run
npm run atlas:materialize:provenance -- --dry-run

# Apply
npm run atlas:materialize:provenance -- --apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) AS rows, COUNT(trace_id) AS with_trace_id FROM retrieval_eval_times WHERE retrieved_at > NOW() - INTERVAL '10 min'"
```

---

## Artifact Map

| Artifact | Location | Status | Purpose |
|---|---|---|---|
| Proof JSON | `docs/reports/hyperrag-runtime-proof.json` | ✅ Live | Structured proof data |
| Proof Markdown | `docs/reports/hyperrag-runtime-proof.md` | ✅ Live | Human-readable summary |
| Gaps Inventory | `docs/reports/hyperrag-runtime-proof-gaps.md` | ✅ Live | P1 roadmap + Qdrant misses |
| Replay Traces | `docs/reports/replay/*.trace.json` | ✅ Live | 50+ SHA-256-keyed trace files |
| Timing Audit | `docs/reports/hyperrag-timing-coverage-audit.json` | ✅ Live | Lane coverage 100% |
| RRF Benchmark | `docs/reports/rrf-20-query-benchmark.json` | ✅ Live | Ablation study (NDCG 0.544) |

---

## Blockers & Dependencies

### P1 Unblocks P2
- Must complete Qdrant backfill before materializing full provenance tree
- Replay rows need complete `retrieval_path` (requires 100% Qdrant coverage)

### P2 Unblocks P3
- Runtime evidence packetization depends on stable provenance materialization
- Playrig test data needs `task_id` / `story_id` context (requires P2 field mapping)

---

## Notes for Next Session

1. **Start with P1a.** The backfill script is the quickest win and directly improves proof quality.
2. **Measure before/after.** Run smoke test before and after P1 to show qdrant_hits improvement.
3. **P2 is mechanical.** Field mapping is straightforward once P1 is done.
4. **P3–P4 can wait.** Focus on proving the retrieval path end-to-end first; evidence packetization is a follow-on.
