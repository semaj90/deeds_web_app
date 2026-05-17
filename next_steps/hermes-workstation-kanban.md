# Hermes Workstation Kanban

## Backlog
- Phase 13 long-term soak optimizations
- TurboVec benchmark sidecar
- Service worker query trace IDs
- Admin Copilot ACE packet display

## Ready
- Phase 14: Observability and Operator Dashboard

## In Progress
- Phase 13B: Soak Ladder (30-minute and 60-minute bounded runs)

### Card: Phase 13B Soak Ladder Benchmark

Status: In Progress
Risk: Medium
Goal: Prove repeated workstation use remains stable over scaling soak runs.

Files:
- `scripts/atlas/soak-workstation-parent-atlas.mjs`
- `docs/reports/workstation-soak-report.json`
- `docs/reports/workstation-soak-report.md`

Definition of Done:
- [x] Bounded soak loop runs with `--cycles=2 --dry-run`
- [x] Bounded soak loop runs with `--cycles=10 --dry-run`
- [x] Bounded soak loop runs with `--cycles=25 --dry-run`
- [x] Bounded soak loop runs with `--cycles=10 --write`
- [ ] 30-minute bounded soak runs
- [ ] 60-minute bounded soak runs
- [x] sourceRefs checked for every query
- [x] forbidden fields checked for every output
- [x] VRAM before/after recorded per cycle
- [x] Redis/Qdrant/Postgres health checked
- [x] report files written
- [x] `audit:contracts` passes
- [x] `audit:pgvector` passes


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
