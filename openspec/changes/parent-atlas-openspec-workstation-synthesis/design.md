## Context

The repository already has a generated OpenSpec workboard, a single portfolio authority, ACE/ContextManifest contracts, BitFrost/Valkey residency, governed DAG execution, validation receipts, and an Ornith llama-server boundary. The missing piece is a small planning adapter that joins these existing owners for one bounded workstation decision.

Portfolio placement: this is an `ACTIVE_DEPENDENCY` implementation owner referenced by the sole `CURRENT_AUTHORITY` change, `parent-atlas-retrieval-lineage-dag-convergence`. The convergence ledger remains the only dependency-ordering and acceptance authority.

The workflow must remain read-only until an explicit mutation authorization is supplied. OpenSpec task ledgers and linked evidence remain canonical; reports, ACE packets, model outputs, and cache entries are derived artifacts.

## Goals / Non-Goals

**Goals:**

- Freeze a deterministic workboard snapshot with a checksum.
- Give each task a stable identity and retain its task text/checksum, source location, declared references, and dependency metadata.
- Resolve evidence and classify only a bounded candidate set.
- Produce a revision-qualified `OpenSpecWorkPlanV1` for one next action.
- Assemble compact ACE context by reference, with explicit token limits and evidence checksums.
- Allow Ornith synthesis only from validated context and record a synthesis receipt.
- Permit cache residency only under exact workboard, task, evidence, model, and prompt revisions.
- Require validation receipt and explicit authorization before modifying task ledgers or source files.

**Non-Goals:**

- Replacing OpenSpec CLI or creating a second task database.
- Inferring completion or priority from percentages alone.
- Automatically changing checkboxes, source files, databases, Qdrant, Neo4j, or Valkey canonical state.
- Replacing SearchRuntime, ACE, BitFrost, DAG, classifier, or Ornith owners.
- Sending the complete backlog to an LLM.

## Decisions

1. **Existing workboard as input.** Consume `docs/reports/openspec-workboard-v1.json` produced by `scripts/atlas/build-openspec-workboard-v1.mjs`. A snapshot is valid only when its source and report checksums are recorded; the workboard remains a projection, not authority.

2. **Deterministic readiness before synthesis.** Filter task rows using explicit state, dependency, source-pointer, blocker, and evidence rules. Model synthesis cannot promote a blocked, stale, superseded, or unclassified task.

3. **Bounded context.** The adapter emits references to task ledgers, reports, receipts, tests, and source files. The ACE assembler expands only selected references under a token budget and creates a ContextManifest checksum.

4. **Model-neutral receipt with active runtime policy.** Ornith is called through the existing llama-server `:8090` resolver and its loaded model identity is recorded. No Gemma4-specific model name or Ollama chat path is introduced. Ollama remains outside this workflow except for the separate EmbeddingGemma embedding lane.

5. **Cache as residency only.** BitFrost/Valkey keys include workboard checksum, task checksum, evidence revision set, context checksum, model revision, and prompt revision. A cache hit must be revision-verified; a mismatch is a miss.

6. **Validation before mutation.** The workflow emits a plan and validation commands. A later explicitly authorized executor may apply a patch or checkbox update only after source/task revisions still match the plan and a validation receipt is produced.

7. **Scripts-first implementation.** Initial adapters, proof runners, and reports live in `scripts/atlas`. Promotion to `packages/atlas*` requires a separate stable-owner proof.

## Risks / Trade-offs

- [Stale workboard] → record generated time and content checksum; rebuild before planning.
- [False readiness from prose] → require linked evidence and deterministic status/dependency checks; keep uncertain rows `NEEDS_PROOF` or `NEEDS_HUMAN_DECISION`.
- [Model hallucination] → ground context to exact evidence refs and prohibit identity/status mutation from model output.
- [Cache staleness] → include all relevant revisions in keys and verify them on read.
- [Backlog overload] → cap candidates, context references, and synthesis attempts.
- [Concurrent edits] → compare task/source revisions immediately before any future mutation and reject stale plans.

## Migration Plan

1. Build a read-only snapshot/task-identity proof over the existing workboard.
2. Add bounded evidence resolution and readiness classification.
3. Add ACE context and ContextManifest assembly without model or datastore writes.
4. Add optional Ornith synthesis receipt behind an explicit dry-run flag.
5. Add BitFrost/Valkey residency readback only after checksum proof.
6. Add a separate authorization-gated executor and validation receipt.

Rollback is deletion-free: stop using derived reports/cache entries and retain them as historical evidence. No canonical state is changed by the initial stages.

## Open Questions

- Which existing ACE ContextManifest adapter should receive the OpenSpec context reference without creating a second manifest owner?
- Which existing validation receipt owner should represent a future task-ledger checkbox update?
- Which exact task/source revision fields are required for each mutation class?
