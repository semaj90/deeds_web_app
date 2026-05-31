# Phase Completion Roadmap — Updated 2026-05-31

**Status snapshot** (drift remediation + GPU lanes session ended 02:30 PST):

| Layer | Status | Evidence |
|---|---|---|
| Drizzle drift | **0 (closed)** | introspect 305 tables, declared 342, filter 75, gap 0 |
| GPU bridge | **6/7 live** | tensorrt_bridge.node loaded, 5/5 production lanes ✓ |
| Atlas Phase 3-5 | **complete** | 467 USES_DB + 1,032 USES_TOOL + 6 intents + Neo4j synced |
| Karpathy-GPU | **complete** | 33,215 chunks → autoencoder 64d weights in Redis |
| ACE hit-rate audit | **complete** | top high-authority ghost files cached `ace:karpathy:hit_report` |
| Parent atlas index | **9 zones, 28.7 KB total** | CHR-ROM banks queryable via CouchDB |

---

## ✅ Done This Session (2026-05-30 → 2026-05-31)

- [x] Drizzle drift methodology bug fix (single-line regex → multi-line aware)
- [x] 7 Tier-A sidecars promoted (feature_registry_vectors, codebase_embeddings, codebase_files, intent_synthesis_rewards, feature_cards, codebase_relationship_reports, vector_smoke)
- [x] 2 Tier-D sidecars promoted (embeddings, model_weights)
- [x] 16 Tier-B/C tables added to tablesFilter (ACE + pipeline infra)
- [x] 1 Tier-D table added to tablesFilter (migrations — custom journal)
- [x] tsgo clean (only pre-existing scenario-cache errors)
- [x] Drizzle introspect re-ran — FK count 30 → 31 (codebase_embeddings → codebase_files)
- [x] Drift verifiably closed: gap = 0
- [x] LibTorch/TensorRT bridge probe wired (startup-gpu-bridge-probe.mjs)
- [x] 5-lane comprehensive GPU smoke (smoke-all-gpu-lanes.mjs)
- [x] All persistence to CouchDB + AGENTS.md temporal append

## 🟡 Next Up — Priority Order

### Phase A — Wire startup orchestration (1-2 hours, low risk)
**Goal**: workspace startup deterministically validates the GPU + retrieval stack.

- [ ] Add `scripts/startup-gpu-bridge-probe.mjs` to VS Code workspace startup task
- [ ] Wire `smoke-all-gpu-lanes.mjs` into `npm run smoke:gpu` (already exists as standalone)
- [ ] Add G18 audit gate: "tensorrt_bridge.node must load and report >0 live functions"
- [ ] Update `startup-truth.mjs` to call the probe and append result to its truth report

### Phase B — CUDA flag fix (15 min, build issue)
**Discovery**: `isCudaAvailable()` returns -99 even though VRAM probe shows 5,535/8,191 MB available. The CUDA detection is hard-stubbed in `libtorch_stubs.cc` line 23-25.

- [ ] Audit `simd-bridge/cpp/binding.cc` to confirm `isCudaAvailable` is correctly bridged
- [ ] Rebuild with `NO_LIBTORCH=0` if the build accidentally fell back to stubs for that one function
- [ ] Verify post-build: `node -e "console.log(require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node').isCudaAvailable())"` returns 1

### Phase C — Tier-D + ambiguous cleanup (operator gate, 5 min)
- [ ] Confirm `migrations` table can be filter-excluded (no Drizzle-side need for it)
- [ ] Decide: drop `vector_smoke` + 2 rows OR keep as health probe? (currently kept as sidecar)

### Phase D — Architecture roadmap execution (multi-week)
Per `2026-05-30_ARCHITECTURE_TODO_CLIENT_SERVER_SEPARATION.md`:
- [ ] Phase A (docs only): CLAUDE.md decision table for "when to use XState vs runes"
- [ ] Phase B (shared lane): create `src/lib/shared/types/` and move Zod schemas
- [ ] Phase C (client RPC): create `src/lib/client/rpc/` with typed fetch wrappers
- [ ] Phase D (XState retire): per-machine keep|migrate|retire decisions

### Phase E — Atlas Phase 6+ (supervision layer continuation)
Per `ATLAS_PHASE_3_5_EXECUTION_COMPLETE.md`:
- [ ] **Phase 6**: synthetic trace simulator using topology to generate valid code paths
- [ ] **Phase 6**: observation stream — wire context_timeline to record tool selections
- [ ] **Phase 7**: glyph reward computation — aggregate actual outcomes, update Redis reward cache
- [ ] **Phase 8**: LoRA training pair generator — combine synthetic baselines + actual outcomes
- [ ] **Phase 9**: LoRA fine-tuning (Unsloth) — GRPO with behavioral observation signals

### Phase F — Task Semantic Packet wiring (deferred from earlier session)
Postgres tables proposed but not applied (waiting on operator):
- [ ] Apply `drizzle/manual/proposed_20260530_task_semantic_packets.sql` (workspace_tasks, task_semantic_packets, task_file_links, task_cluster_links, agent_pickup_queue, agent_run_events)
- [ ] Qdrant `task_semantic_packets` collection + 15 payload indexes (DONE — verified live earlier)
- [ ] Bootstrap workspace tasks from `.opencode/recommendations/tasks.ndjson` (46,729 tasks → `.opencode/tasks/active/`)
- [ ] Wire OpenCode/Gemma4 pickup loop using `agent_pickup_queue` rows

### Phase G — Feature pillar barrels Phase 2 (mid-week)
Per `feature-organization-planner.mjs` output:
- [ ] Operator review of 8 pillar barrels (already created in `lib/server/features/`)
- [ ] Migrate top-5-importing files from scattered → pillar paths
- [ ] Smoke test: dev server up, evidence upload flow click-through
- [ ] Once >95% adoption: actual file moves (Phase 3, operator-gated)

---

## 🔴 Blocking gates (operator decisions needed)

1. **CUDA flag mismatch**: addon has VRAM access but `isCudaAvailable` returns -99 — is this intentional (degrade-to-cpu signal) or a build bug?
2. **Task Semantic Packet migration**: do you want the Postgres tables applied tonight, or wait for an operator review window?
3. **Feature pillar moves**: barrel exports exist; ready to start migrating consumer imports?

---

## File index for this session

| Artifact | Path |
|---|---|
| Drift v3 snapshot | `.tmp/drift-v3-couchdb.json` |
| Real-gap classification | `.tmp/drizzle-introspect/real-gap-classification.md` |
| 7 Tier-A sidecars | `sveltekit-frontend/src/lib/server/db/schema/{feature-registry-vectors,codebase-embeddings,codebase-files,intent-synthesis-rewards,feature-cards,codebase-relationship-reports,vector-smoke}.ts` |
| 2 Tier-D sidecars | `sveltekit-frontend/src/lib/server/db/schema/{embeddings,model-weights}.ts` |
| Updated drizzle filter | `sveltekit-frontend/drizzle.config.ts:55-67` |
| GPU bridge probe | `scripts/startup-gpu-bridge-probe.mjs` |
| 5-lane smoke | `scripts/smoke-all-gpu-lanes.mjs` |
| Probe output | `.tmp/gpu-bridge-probe.json` |
| Smoke output | `.tmp/gpu-lanes-smoke.json` |
| CouchDB drift docs | `codebase_graph/drizzle-drift-v3-2026-05-30T21-50` |
| Architecture TODO | `next_steps/active/2026-05-30_ARCHITECTURE_TODO_CLIENT_SERVER_SEPARATION.md` |

---

**Recommended next action** (~15 min): fix the CUDA-flag stub regression so `isCudaAvailable()` correctly reports the GPU you already proved has 5.5 GB free VRAM. That unblocks downstream code that branches on the flag.
