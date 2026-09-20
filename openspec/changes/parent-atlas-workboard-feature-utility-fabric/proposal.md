## Why

The workboard challenger tournament (`RECOMMENDATION-TOURNAMENT-01`, gate 8) cannot run: on the live
workboard only 1 of 14 ranking features varies across 2,309 tasks and the adapter fills constant
defaults (`lowRankScore=0.5`, `estimatedMinutes=15`, `remainingRequiredGates=999`). The low-rank producer
correctly emits `DEGENERATE_INSUFFICIENT_FEATURE_VARIANCE`. The next useful work is real feature
production plus the topic/domain/index helpers that feed it — not more ranking code.

## What Changes

A utility-fabric tranche with a strict split: LangGraph traverses **process state** (task → evidence →
feature row → rank → tournament → BLOCKED/RECOMMEND/APPROVAL); PostgreSQL/NetworkX/cuGraph/pgvector/
Qdrant traverse **knowledge**; GPU workers execute tensors; the SvelteKit studio holds UI state only.
Phases `WFU-01..13`, smoke suite `UTILITY-*` / `TOURNAMENT-*`. See `tasks.md` (authoritative, including
"Review outcomes" — where this plan was corrected against the repo).

## Impact

Advisory/shadow only. No canonical write, no runtime enablement, no Python environment upgrade.
Companion: `docs/architecture/PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT.md` (slots S1–S7).
