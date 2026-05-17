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
- Vitest suites for autoencoder (13/13 passing)
- Vitest suites for cluster pivot (5/5 passing)
- Standalone cluster pivot smoke query verification
- Postgres pgvector HNSW catalog check (14 indexes healthy)

## Done
- **Verify `rg-cluster-pivot.ts` TypeScript pass**
  - *Proof*: TypeScript checks and Vitest unit tests pass with 0 errors.
- **Run ACE packet smoke**
  - *Proof*: Handled through fast-AST integration and `smoke-rg-cluster-pivot.mjs` verification.
- **Verify `llm_synthesis_events` exists**
  - *Proof*: PostgreSQL relation lookup confirmed table existence; `smoke-llm-synthesis-event.mjs` insert/select runs successfully.
- **Add `llm_synthesis.log_event` MCP tool**
  - *Proof*: Registered under `scripts/phase76-mcp-server.mjs` on Port 3002.
- **Wire rg cluster pivot into ACE packet**
  - *Proof*: Integrated under Step P3-A of SvelteKit's `context-assembler.ts`, capping pivot scores to `0.12`.
- **Implement daily offline JSONL synthesis logging**
  - *Proof*: `memory/datasets/llm_synthesis/` updates cleanly under zero-hidden-thought rules.
