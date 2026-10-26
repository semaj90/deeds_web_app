## Why

Track worktree-adaptive learning, challenger-only backprop, HyperLogLog (HLL) telemetry monitoring, and candidate ranking without mutating canonical PostgreSQL records or bypassing source revision authority.

## What Changes

Defines strict phase governance (Phases 0–10) ensuring:
- Backprop is challenger-only and never writes canonical packet facts.
- HLL counters remain strictly telemetry and never influence eviction, promotion, or retrieval votes.
- Phase 7 Top-K PageRank candidate generation, Phase 8 QLoRA/safetensors challenger training, and Phase 9 recommendations proceed under explicit diagnostic limitation until Phase 10 resolves source revision propagation.

## Capabilities

Adds adaptive-backprop-hll-monitoring governance specification governing challenger model training, telemetry boundaries, and gated candidate hydration.
