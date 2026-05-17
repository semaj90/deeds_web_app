# Hermes Workstation Kanban

## Backlog
- Phase 13 long-term soak optimizations
- TurboVec benchmark sidecar
- Service worker query trace IDs
- Admin Copilot ACE packet display

## Ready
- Phase 13 soak test metric scaling

## In Progress
- None

## Verify
- Production Soak Benchmark metrics over 100+ cycles

## Done
- [x] Phase 12A: SIMD bridge memory audit.
- [x] Phase 12B: VRAM hygiene policy.
- [x] Phase 12C: GPU job mutex / semaphore queue.
- [x] Phase 12D: Compact 384d Warden/Nomic cache prewarm.
- [x] Phase 12E: Sequential VRAM recovery smoke.
- [x] Verify `npm run audit:contracts`.
- [x] Verify `npm run audit:pgvector`.
- [x] Verify no progressive VRAM leak during staged smoke.
- [x] Phase 13: Establish Workstation Parent Atlas Soak Benchmark Harness.
- [x] Verify context-assembler clusterPivot wiring.
- [x] Verify rg-cluster-pivot Vitest suite.
- [x] Verify 2-layer autoencoder encoded64 Vitest suite.
- [x] Verify Redis centroid cache.
- [x] Verify Qdrant codebase_chunks_768 health.
- [x] Verify pgvector HNSW indexes.
- [x] Verify llm_synthesis_events table.
- [x] Verify synthesis smoke:
  - Postgres insert/select
  - Redis BitFrost cache
  - JSONL append
  - forbidden field rejection
- [x] Verify MCP llm_synthesis.log_event registration.
- [x] Verify `rg-cluster-pivot.ts` TypeScript pass.
- [x] Wire rg cluster pivot into ACE packet.
- [x] Implement daily offline JSONL synthesis logging.
