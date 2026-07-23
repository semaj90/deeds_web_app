# Parent Atlas Docs Mirror

This folder mirrors the canonical Atlas lane docs that are relevant to `@deeds/parent-atlas`.
The source of truth remains the repo-level `docs/atlas/` directory; this copy exists so the package
has a local lane map tied to the current implementation boundary.

## Current Lane Map

Closed / structurally complete:
- Packet identity and indexing
- Higher-hop identity ledger
- Neo4j USED_CONCEPT projection
- Recommendation merge audit
- Hidden surface registry
- Phase 12 overlay sync
- Phase 13 feature-gap reconciliation
- Engram decision
- XGBoost decision and training
- Agentic startup briefing

Open work:
- HyperRAG fusion wiring
- Retrieval E2E benchmark and telemetry
- Phase 16 refresh-manifest invalidation
- Temporal Kanban consolidation
- Artifact tiering application
- Proof system: `PROOF-SYSTEM.md`
- Phase 17 runtime recovery, focused on Go Retrieval
- Optional Redis / Bifrost mirrors as query-time cache
- Cold-storage restore verification
- Evaluation harnesses and agent-learning gates

## Mirrored Documents

- `parent-atlas-table-of-contents.md`
- `OPEN-LANES-NEXT-STEPS-2026-06-13.md`
- `ATLAS-3.0-HYPERRAG-RUNTIME.md`
- `QDRANT-POSTGRES-PAYLOAD-CONTRACT.md`
- `parent-atlas-data-spine.md`
- `parent-atlas-storage-decision.md`
- `phase-20-training-readiness.md`
- `engram-api-spec.md`
- `OPENCODE-IMPLEMENTATION-CHECKLIST.md`
- `AGENT-TASK-PACKAGES-2026-06-13.md`
- `native-gemm-deferral.md`
- `LANE-1B-HIGHER-HOP-ENRICHMENT.md`
- `ATLAS-1.0-BASELINE.md`
- `ATLAS-2.0-PHASE-2-COMPLETION.md`
- `phase-lanes.md`
- `retrieval-outcome-ledger.md`
- `xgboost-reranker-contract.md`
- `gemma4-provider-cache-config.md`

## Notes

- Parent Atlas stays the canonical packet / index spine.
- Redis, Qdrant, and Neo4j are mirrors or enrichment layers.
- Gemma4 summarizes top-k retrieved packets; it does not scan the whole repo first.
- `packages/atlas` is not the package boundary in this repo. Use `packages/parent-atlas`.
