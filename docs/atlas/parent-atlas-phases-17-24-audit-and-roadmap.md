# Parent Atlas Phases 17–24: Audit and Roadmap

**Status:** audited 2026-10-15 · **Scope:** workstation phases 17–24 (`reports/parent-atlas-workstation-todo.md`)

## TL;DR

Phases 19–21 are operational or gated, so they're the closest to done. Phases 17–18 are scaffolds with real code but no validated data. Phases 22–24 are research surfaces: no trainer exists for DPO, and the PPO and QLoRA work has no chat-model artifact yet. "Near 100%" is realistic for 17–21 and for the QLoRA gate in 23. It isn't realistic, or justified, for 22 and 24 without a decision on whether those lanes should exist.

## Audit results

| Phase | Status | Complete | Evidence |
|---|---|---|---|
| 17 PyTorch feature extraction | SCAFFOLD_ONLY | 35% | Extractor and Python fallback exist. Artifact has 1 row. Card-length heuristics remain. |
| 18 XGBoost reranker | SCAFFOLD_ONLY | 40% | Scripts and sidecar lanes exist. Compatibility artifact has 1 row. No validated training denominator. |
| 19 HMM + linear policy | OPERATIONAL | 90% | Append-only retrieval loop: 443 rows. |
| 20 DSPy program contract | OPERATIONAL | 95% | Zod validation 3,251 / 3,251 valid (audit's figure, not re-derived). |
| 21 GEPA optimization | EVAL_GATED | 75% | 50-query replay proof passes. Policy/PPO and Gym scripts are research surfaces. |
| 22 learned-policy experiments | Research only | — | PPO audit scripts only. No PPO trainer. |
| 23 QLoRA / SFT | Eval-only | — | PEFT trainer for a tool-routing cross-encoder. QLoRA dataset exporter. No chat-model adapter. |
| 24 DPO | Not started | 0% | No trainer. Mentioned only in a readiness report generator. |

**Unresolved:** the audit reports summary schema `MIGRATION_PENDING` while its missing-column field is null. Check the columns directly first.

Source: `scripts/atlas/audit-phase17-21-workstation.mjs` (read-only), `docs/reports/phase17-21-workstation-audit.{json,md}`, and code-presence checks for 22–24.

## Roadmap

Each step has a gate. A step isn't done until its gate passes, and a receipt is written.

### Phase 17: feature extraction (35% → ~95%)

1. Replace card-length heuristics with a measured feature set. **Gate:** feature parity between Python and JS on a fixed fixture.
2. Build the phase17 artifact from the full candidate set, not one row. **Gate:** row count equals the candidate count, with checksums.
3. Confirm the LibTorch/CUDA path against the CPU reference. **Gate:** max-diff within tolerance, recorded in a receipt.

### Phase 18: XGBoost reranker (40% → ~90%)

1. Define the training denominator from the validated retrieval evaluation set. **Gate:** the denominator's checksum is recorded.
2. Train and save the model with its feature schema. **Gate:** held-out metrics against the reviewed labels, not self-retrieval.
3. Wire the sidecar as a reranker only, never as a retrieval vote. **Gate:** the single-fusion owner rule holds (see `SearchRuntime`).

### Phase 19: HMM + linear policy (90% → ~100%)

1. Keep events tied to `replay_id`, `packet_key`, `source_ref`, and outcome. **Gate:** a rejected event is counted, not dropped.
2. Confirm the baseline on the same replay set used for phase 21. **Gate:** a receipt with the policy's decisions.

### Phase 20: DSPy contract (95% → ~100%)

1. Re-run the Zod validation check directly, not from the audit summary. **Gate:** count matches the audit.
2. Close the remaining 5%: the audit doesn't name the gap, so identify it first.

### Phase 21: GEPA optimization (75% → ~95%)

1. Build the adversarial and tensor-analysis evaluation sets. **Gate:** a labeled set with a reviewed checksum.
2. Keep policy/PPO as research unless it beats the baseline on that set. **Gate:** the decision is written down either way.

### Phase 22: learned-policy experiments (research)

No roadmap to 100%. Decide first whether this lane is justified. If it is, define one bounded experiment with a baseline and a stop rule. **Decision needed.**

### Phase 23: QLoRA / SFT (eval-only → ~80%)

1. Pick the base model and the adapter target. **Decision needed:** the chat model (Ornith) or the embedder.
2. Train on the exported dataset with the 8 GB card's VRAM budget: stop `:8090` first, per the project's GPU rules.
3. Evaluate the adapter against the base on held-out data, then keep or reject it. **Gate:** a receipt. Adapters are not merged without one.

### Phase 24: DPO (not started)

**Decision needed.** No preference data or trainer exists. Recommendation: defer until phase 23 has a validated adapter, since DPO depends on a working SFT baseline.

## Decisions needed

1. Are phases 22 and 24 wanted at all, or should they be closed as out of scope?
2. Which model should the phase 23 adapter target?
3. Should phase 17's CUDA path be prioritized, given the VRAM budget?

## Related

- Audit evidence and status: `openspec/changes/parent-atlas-agent-framework-integration-hardening/tasks.md` (section "Workstation phases 17–24 audit").
- Run procedures for phases 17–19: `docs/atlas/phase-lanes.md`.
- Historical phase definitions: `reports/parent-atlas-workstation-todo.md`.
