## Context

Phase 11 ("Engram / model memory wiring") was planned in
`docs/reports/parent-atlas-workstation-phase-11-17-implementation-plan-v1.md` with two named gates
and no owning OpenSpec change. A same-day caller census (this change's founding evidence) found the
model-routing half of the plan already done at its source: `resolveLlamaInferenceTarget()`
(`sveltekit-frontend/src/lib/server/llm/runtime-contract.ts`) does live `/v1/models` discovery
rather than trusting a hardcoded string, and `VLM_MODELS.legal`
(`sveltekit-frontend/src/lib/server/ollama.ts`) already resolves to `'ornith-1.5-9b'`. Every real
analysis-pass synthesis call site checked either goes through one of these two, or correctly stays
on the separate VLM lane (`LOCAL_VLM_MODEL`/Granite-Docling — confirmed Ornith has no vision
modality live: `GET :8090/props` → `modalities: {vision: false}`, and the only `mmproj` file on
disk, `models/mmproj-F16.gguf`, is a Gemma-4-family SigLIP tower per its own manifest entry, not
reusable for a different base model).

What remains real: (1) no governance record exists claiming these two gates, so a concurrent
session could plausibly duplicate this exact audit or build a redundant fix for an already-solved
problem; (2) the Engram ingestion lane itself (distinct from model *routing*) is still recorded as
"created + wired; deferred" — the memory/ingestion capability exists but isn't live; (3) no proof
exists yet that `analysis_pass_results` replay and current-pass selection behave correctly before
any future supersession operation touches that table.

## Goals / Non-Goals

**Goals:**
- Formally own `ORNITH-ANALYSIS-ADAPTER-01` (close it as already-satisfied, with the caller-census
  evidence as its proof) and `ANALYSIS-PASS-CURRENT-SELECTION-01` (define and run the actual
  replay/current-selection proof).
- Decide, with evidence, whether the deferred Engram ingestion lane should be completed now or
  stay deferred, and if completed, do so without introducing a second receipt owner alongside
  `analysis-pass-results.ts`/`analysis-pass-current.ts`/`analysis-pass-boundary.ts`.
- Leave a clear, checkable record so no other session re-runs this exact caller census.

**Goals (added, same day, web-verified correction):**
- Acquire and register the real, Ornith-specific projector (`mmproj-Ornith-1.5-9B-BF16.gguf`,
  confirmed to exist upstream at `ornith-ai/Ornith-1.5-9B-GGUF` on Hugging Face) and prove a local
  vision-enabled startup profile — Ornith is upstream vision-capable; this was previously a
  local-config gap, not a model limitation.

**Non-Goals:**
- Rewriting any of the 12 already-correct analysis-pass files — the census found nothing to fix.
- Repurposing `mmproj-F16.gguf` (Gemma-4-family) for Ornith — confirmed architecturally
  incompatible regardless of Ornith's own vision capability; the correct fix is the Ornith-specific
  projector, not cross-model reuse.
- Training a new vision tower from scratch — a real, working Ornith projector already exists
  upstream; this is an acquisition/wiring/proof task, not a training project.
- Reconciling the two parallel workstation-tracking docs (`docs/parent-atlas-workstation-todo.md`
  vs `reports/parent-atlas-workstation-todo.md`) — a separate, larger concern the operator has
  said is already being worked on elsewhere.
- Any Postgres/Qdrant/Neo4j/Valkey mutation — this change is proof/governance only until a
  specific task explicitly requests and receives write authorization.

## Decisions

- **`ORNITH-ANALYSIS-ADAPTER-01` closes as `ALREADY_SATISFIED`, not `NOT_STARTED`.** The evidence
  (live code reading of all 12 flagged files, plus the `VLM_MODELS.legal`/`resolveLlamaInferenceTarget`
  source check) is strong enough to close this gate on record rather than re-verify it from scratch
  in `tasks.md` — re-litigating an already-read codebase wastes effort for no new information.
  Alternative considered: leave it open pending a second independent read — rejected, since the
  first read already went to primary source (constant definitions, not just call-site grep) for
  every claim.
- **`ANALYSIS-PASS-CURRENT-SELECTION-01` stays open and becomes this change's real deliverable.**
  Unlike the routing question, this has not been checked at all yet — it requires reading
  `analysis-pass-current.ts`'s actual selection logic and either replaying a known scenario or
  reasoning about it against real Postgres data, which the caller census did not attempt.
- **Engram ingestion completion is scoped as an investigate-then-decide task, not committed work
  yet.** "Created + wired; deferred" could mean anything from "one missing env var" to "a
  fundamentally unfinished pipeline" — sequencing a build task before reading the actual deferred
  reason would repeat this session's own recurring mistake (assuming from a label instead of
  checking).
- **Extend the existing receipt trio, never introduce a parallel one.** Matches this repo's
  Duplication Prevention rule and the pattern already re-applied several times this session
  (`WorkflowActionEventV1` over a new receipt type, `LodPromotionDecisionV1` over a new residency
  contract).
- **Two separate startup profiles (`ornith-1.5-text`, `ornith-1.5-vlm`), not one profile with
  mmproj always loaded.** The Ornith projector adds real VRAM cost (~922MB) on an 8GB RTX 3060 Ti
  that already tracks headroom carefully throughout this repo's own docs; loading it unconditionally
  would shrink text-mode context/throughput for no benefit on text-only requests. Resolution is by
  model family, not a single global `TURBO_MMPROJ_PATH` pointer:
  `resolveMultimodalProjector({ modelFamily, required: wantsVision })`, failing closed on a family
  mismatch (never silently substitute a Gemma-family projector for an Ornith request).

## Risks / Trade-offs

- [Risk: another concurrent session already has an unmerged fix for the same "gemma4 fallback"
  belief this change found to be a false alarm] → Mitigation: this change's proposal.md explicitly
  states the corrected finding with file-level evidence, so a reviewer merging concurrent work can
  quickly see the routing question is already closed and avoid re-applying a redundant patch.
- [Risk: the Engram ingestion "deferred" reason turns out to require a decision only the operator
  can make (e.g., a missing external service, a cost tradeoff)] → Mitigation: the investigate step
  is sequenced before any build step in `tasks.md`, and the design explicitly does not commit to
  completing ingestion — only to characterizing it honestly.
- [Risk: `ANALYSIS-PASS-CURRENT-SELECTION-01`'s replay proof surfaces a real correctness bug in
  `analysis-pass-current.ts`] → Mitigation: acceptable outcome — this change's purpose is to find
  out, not to assume the selector is correct; a found bug becomes a new tracked task, not scope
  creep.

## Migration Plan

Not applicable — this change performs no data migration. Any future write work identified by its
tasks (e.g., completing Engram ingestion) would get its own migration plan at that time, gated on
explicit authorization per this repo's Agent Execution Integrity rules.

## Open Questions

- Which of the two parallel workstation-tracking docs should be authoritative going forward — left
  to the operator, explicitly out of scope for this change.
- Whether Engram ingestion should be completed now or remain deferred — depends on what the
  investigate task in `tasks.md` finds.
