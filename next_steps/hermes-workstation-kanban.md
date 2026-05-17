# Hermes Workstation Kanban

## Backlog
- Phase 12 VRAM hygiene / SIMD bridge memory pools
- TurboVec benchmark sidecar
- Service worker query trace IDs
- Admin Copilot ACE packet display

## Ready
- pre-warm compact 384d Nomics warden vector cache

## In Progress
- Phase 12 initialization: Limit LibTorch CUDA allocations inside native bridge

## Verify
- Dry-run VRAM smoke execution
- Bounded memory pool simulation

## Done
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
