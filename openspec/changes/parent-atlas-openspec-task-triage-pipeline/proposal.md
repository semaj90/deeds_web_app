## Why

The OpenSpec task population and its generated reports are too large and revision-skewed for reliable daily selection; the checked-in Workboard snapshot is dated 2026-09-26 while active task ledgers changed afterward. We need a bounded, reproducible way to turn current `tasks.md` claims and daily Graphify evidence into a small, reviewable next-work queue without treating stale TODOs, model summaries, or rankers as authority.

## What Changes

- Start with WB-COMPACT-01: a read-only, revision-bound census of current OpenSpec task ledgers and report artifacts; treat heuristic supersession matches as review candidates, never confirmed replacements.
- Compress only reviewed superseded work to one revision-bound card and exclude `SUPERSEDED`/`HISTORICAL` from default retrieval unless history/debugging is explicit.
- Reuse the existing Workboard/evidence-fabric, workstation context, and challenger-tournament owners; do not create another task ledger or scheduler authority.
- Add optional task-aware chunking and EmbeddingGemma retrieval, deterministic ranking, and shadow tournament comparisons over the same frozen candidate population.
- Generate bounded evidence cards and optional LangExtract/Ornith summaries with exact task/evidence references; keep output advisory and preserve uncertainty.
- Define revision-qualified Redis/Valkey shortlist caching and a separate SeaweedFS archive plan for large, superseded derived reports, with checksum/readback gates before any archival write.
- Defer centroid routing until compact TaskCards exist; use the existing WSL `atlas-rapids-cu13` cuML KMeans owner, never a second PyTorch KMeans implementation. Keep TurboVec limited to the small current hot corpus and benchmark simdjson only on metadata JSON/JSONL.

## Capabilities

### New Capabilities
- `openspec-task-triage`: Revision-bound extraction, lifecycle classification, bounded evidence context, advisory ranking, cache identity, and gated archival for OpenSpec task work.

### Modified Capabilities
- None. Existing Kanban/Workboard requirements remain unchanged; this adds a source-ledger triage projection rather than changing feature state or canonical task authority.

## Impact

Reuses `scripts/atlas/build-openspec-workboard-v1.mjs`, the OpenSpec evidence fabric and workstation synthesis, existing tournament/ranker adapters, Graphify daily receipts, EmbeddingGemma, LangExtract, Ornith through the existing llama-server resolver, Redis/Valkey, SeaweedFS, and the existing Python/GPU execution boundary. The first implementation is read-only and advisory; any cache or archive write is a separate, revision-bound, explicitly authorized gate. No WSL dependency installation, task-ledger edits, schema migration, or production write is included by default.
