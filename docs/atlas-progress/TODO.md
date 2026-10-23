# Parent Atlas — to do

Open items from the 2026-10-23 session, in rough priority order. Each item names its owner. Nothing here is authorized to write canonical data unless the item says so.

## Needs an operator decision

- [ ] Choose the push target: current branch `chore/parent-atlas-session-2026-10-17`, or `origin/main`.
- [ ] Decide whether to commit the live admission receipt `docs/reports/workspace-revision-tournament-admission-v1.json`. It replaces the prior receipt, so committing it publishes that change.
- [ ] Decide whether to grant the `CANONICAL_SOURCE_BINDING_WRITE` scope to any receipt. Until someone does, all three canonical writers refuse.

## Current-workspace authority

- [ ] Restore currency: pause writers, capture a new snapshot, run the chain, and pass the live readback. The last check failed on 7 changed sources.
- [ ] Replace the live receipt with that passing chain's receipt (operator permission required each time).
- [ ] Recheck the frame with a live `currentAtEvaluation` before any current-workspace use.
- [ ] Resolve the reseal mismatch between `6288726b…` and `8cc50d57…`. Find the exact reseal receipt; do not repurpose the `8cc50d57…` receipt.

## Historical versus current

- [ ] Explain the 17 missing historical sources (`models/gemma3-client-onnx/*`, deleted untracked files) and the 2,190 changed tracked files, if they matter for the current frame.
- [ ] Keep historical and current validity as separate predicates.

## Tooling cleanup

- [ ] Retire `.tmp/atlas/workspace-snapshot-scratch-v1/probe/admit-chain.sh`. It's superseded by `chain-v2.sh`, which passed end to end.
- [ ] Document the `chain-v2.sh` invocation and its refusal paths once the owner agrees.

## Owners still open (not started)

- [ ] WSR-08 and WSR-10 to WSR-13c: independent valid/current/admitted states and the freshness contract (`workspace-snapshot-runtime/tasks.md`).
- [ ] WSR-99 follow-on: gate2 tasks beyond 2.3, once their own prerequisites pass.
- [ ] Canonical writer approval design: add the write scope to the receipt producer, not only to the guard.

## Not in scope here

- Graphify execution, GPU work, bulk embeddings, canonical AST or symbol writes, production projection.
