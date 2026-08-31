# Tasks — Parent Atlas OaK 2026 DSPy Typed DAG

## OAK-REACT-REPLACE-01 — freeze baseline
- [ ] Freeze one OaK+ReAct baseline cohort and receipts.
- [ ] Record task success, invalid action count, tool calls, tokens, latency, cost, repair rounds, replay stability.

## OAK-REACT-REPLACE-02 — DSPy typed controller
- [x] Add import-safe `python/parent_atlas_oak2026_dspy/` helper library.
- [x] Add task classification, evidence diagnosis, kernel-function proposal, execution critique stages.
- [x] Do not use `dspy.ReAct` in the target controller.
- [x] Keep DSPy output proposal-only; no tool execution from the Python module.
- [ ] Pin/test an exact DSPy version in the experiment environment.

## OAK-REACT-REPLACE-03 — kernel proposal boundary
- [x] Add checksummed `atlas.oak2026-dspy-kernel-function-proposal.v1` wire contract.
- [x] Require exact kernel revision.
- [x] Reject functions outside frozen `F`.
- [x] Reject evidence refs outside supplied manifest.
- [x] Keep `canonical_authority=false`.
- [ ] Execute focused Python and TypeScript contract tests locally.

## OAK-REACT-REPLACE-04 — deterministic DAG binding
- [x] Add TS adapter that validates DSPy proposal before calling `KernelBoundDagPlannerV1`.
- [x] Preserve existing planner undeclared-function/operator fail-closed rules.
- [ ] Wire one real read-only evidence-fetch executor behind the resulting `AdaptiveDagPlanV1`.
- [ ] Produce `ExecutionReceiptV1` for a frozen symbol-repair task.

## OAK-REACT-REPLACE-05 — bounded evidence retry
- [ ] Define `maxEvidenceRounds`.
- [ ] Define `maxDagActions`, `maxToolCalls`, `maxGraphDepth`, `maxTokens`, `maxCostUsd`, `maxWallClockMs`.
- [ ] Permit a new evidence DAG only when the critic/diagnosis explicitly reports insufficient evidence.
- [ ] Prove bounds cannot be increased by DSPy output.

## OAK-REACT-REPLACE-06 — output grounding
- [ ] Validate structured DSPy outputs at the TS boundary.
- [ ] Reject function arguments that fail function input schema.
- [ ] Reject diagnosis/critique citations outside the exact evidence manifest.
- [ ] Preserve source/symbol/packet/revision ownership outside DSPy.

## OAK-REACT-REPLACE-07 — replay and benchmark
- [ ] Run identical frozen input twice; compare proposal/DAG/receipt checksums.
- [ ] Benchmark OaK+ReAct baseline vs OaK+DSPy typed DAG.
- [ ] Optional challenger: OaK+DSPy `ReAct` under the same frozen `K=(S,F)`.

## GEPA-SHADOW-01 — offline optimizer
- [x] Add OaK-specific GEPA constructor wrapper.
- [x] Keep GEPA out of the live request path.
- [ ] Freeze train/validation/test IDs from verified historical receipts.
- [ ] Run GEPA only on train/validation data.
- [ ] Content-address optimized program candidate and logs.

## GEPA-SHADOW-02 — promotion
- [ ] Require validation lift without hard-gate regression.
- [ ] Emit `ProgramPromotionReceiptV1`.
- [ ] Freeze `PromptProgramRevisionV1` before runtime use.
- [ ] Evaluate held-out test exactly once after promotion decision; do not feed it into the same optimization run.

## Validation commands

```bash
python -m pytest python/tests/test_parent_atlas_oak2026_dspy.py -q

cd packages/parent-atlas
node ../../node_modules/typescript/bin/tsc -p tsconfig.json
node ../../node_modules/vitest/vitest.mjs run \
  src/core/oak2026-dspy-policy-v1.spec.ts \
  src/core/kernel-bound-dag-planner-v1.spec.ts \
  --root .
```

No test command is marked proven until executed on the workstation/CI checkout.
