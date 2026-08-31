# Tasks — Parent Atlas Ontology Kernel (OaK-derived)

Queue frozen 2026-08-31 per the user's own OAK-00 through OAK-12
sequencing. See `spec.md` for the full framework mapping, contract shapes,
and the two operating modes (`KERNEL_MODE` / `EXPLORATION_MODE`).

## Session handoff (2026-08-31, ended on context budget — not blocked on anything)

Stopping point reached because the conversation's context window filled up,
not because of any open error, failing test, or unresolved question. Every
change described below is committed to disk, rebuilt clean, and passing.
**A fresh session can resume directly from here — read this file top to
bottom plus `spec.md`, no other context needed.**

**Built and verified this session** (43/43 tests passing across 8 spec
files in `packages/parent-atlas/src/core/`, package rebuilds clean, smoke
test `scripts/atlas/oak-task-function-compiler-readiness-smoke-v1.mjs`
PASS, report at `docs/reports/oak-task-function-compiler-readiness-v1.json`,
**all of this committed and pushed to `main`** — do not re-derive,
`git log`/`git show` it):
- OAK-02 schema, OAK-03A OWL projection + `OntologyProfileReceiptV1` +
  `SchemaVerificationReceiptV1` output contract + policy-routing function
  (pure TS, no JVM, no reasoner adopted yet — see OAK-03 section), OAK-04
  operator library (**18 of 24 kinds**, each `implementationRef` verified
  real — not guessed), OAK-05 function compiler + a 3-function catalog,
  OAK-06 `QueryKernelGraphV1`, OAK-08 `OakJudgeFeedbackV1` contract + one
  real (not fabricated) fixture grounded in this session's own F02
  failure — schema/fixture only, **not** a working judge, see the OAK-08
  section below before treating this as more than it is — OAK-10 freeze
  manifest (correctly capped at `DRAFT`).
- F01/F02 field-gap extensions closed per the user's second audit pass.
- Three real collisions with a concurrent process's work caught via file
  mtime and reconciled (not duplicated) — see the "External audit
  corroboration" and "OAK-F01 through F05" sections in `spec.md`/this file
  for the specifics. That concurrent process is still active in this repo
  — **check `packages/parent-atlas/src/core/` for newer files before
  resuming any of the items below**, the same discipline that caught the
  three collisions above.

**Genuinely open, not attempted, each for a stated reason** (do not treat
as "just needs more time" — each needs something external):
- OAK-S01 `SchemaVerificationReceiptV1` (OWL/HermiT) — options researched
  2026-08-31 in two passes (see the OAK-03 section below), now **three**
  real choices: (a) `owlready2`+HermiT (real OWL DL, LGPL, new Python-
  sidecar call, known `log4j.jar` risk), (b) `neosemantics` inside the
  Neo4j this repo already runs (Apache-2.0, zero new processes, but
  RDFS/SHACL-level only, not OWL DL, shares fault domain with topology
  infra), (c) hand-rolled TS checker (no dependency, weakest guarantee).
  No option is both Apache-licensed and full OWL DL — that combination
  doesn't exist in this ecosystem. Still needs the operator to pick one —
  research only, no adoption yet.
- OAK-J01 `KernelRepairSuggestionV1` (**automatic** judge/repair loop,
  OAK-09) — still needs real, ongoing failing-task execution data to
  calibrate an actual classifier against; fabricating synthetic failures
  would still defeat the point. **Narrower than before**: the contract
  shape itself (`OakJudgeFeedbackV1`) is now built and proven against one
  real historical failure (this session's own F02 event) — see OAK-08
  below. What's still open is the automatic part: something that observes
  a live execution receipt and produces this record without a human first
  diagnosing the fix, plus OAK-09's repair *loop* (two full rounds with
  deterministic receipts). (A prior pointer to "GA8-style judge/test/
  compiler/schema-validation infrastructure" as reusable groundwork was
  checked this session and does not hold up — see the correction note
  under OAK-08 below. Don't re-chase that pointer.)
- ~~OAK-07 `KernelBoundDagPlannerV1`~~ — **DONE 2026-08-31** (built by the
  concurrent process, reconciled/verified/committed this session — see
  the OAK-07 section below). The planner's core constraint is real: it
  refuses to plan any operator not declared by the selected `F` function.
  Not yet done: binding it to a real, live evidence-fetch executor (it
  currently lowers into `AdaptiveDagPlanV1` action descriptors, which
  nothing executes yet) — that's the natural next slice, not attempted
  this session.
- OAK-11 benchmark — needs a working executor behind OAK-07's plans, not
  just the planner contract, to have anything real to benchmark against.
- 6 of 24 operator kinds still unmapped (`FILTER`/`JOIN`/`PROJECT`/
  `GROUP`/`AGGREGATE`/`VALIDATE_SCHEMA`) — the first 5 are generic SQL
  primitives with no single owner to cite honestly; `VALIDATE_SCHEMA` has
  no repo-authored owner either (Zod itself is the validator everywhere,
  not a repo capability) until OAK-S01 exists. `GET_CALLEES` and
  `COMPARE_REVISION` were resolved and added this session (see "Second
  late addendum" below) — operator library is now **18 of 24**.

**Smallest safe next step for a fresh session**: re-check
`packages/parent-atlas/src/core/` for anything new from the concurrent
process (5 minutes, grep-only, no writes) before picking any item above —
it has repeatedly shipped real, relevant work mid-session.

**Resume commands** (copy-pasteable, run from repo root
`C:/Users/james/Videos/deeds-web-app` unless noted):

```bash
# 1. Rebuild the package after any source change (run from packages/parent-atlas)
cd packages/parent-atlas && node ../../node_modules/typescript/bin/tsc -p tsconfig.json

# 2. Run all 8 ontology-kernel spec files (run from packages/parent-atlas — its
#    own vitest, NOT sveltekit-frontend's, whose scope doesn't cover this package)
cd packages/parent-atlas && node ../../node_modules/vitest/vitest.mjs run \
  src/core/ontology-kernel-end-to-end.spec.ts \
  src/core/kernel-operator-library-symbol-repair-v0.spec.ts \
  src/core/kernel-function-catalog-symbol-repair-v0.spec.ts \
  src/core/query-kernel-graph-v1.spec.ts \
  src/core/kernel-function-catalog-v1.spec.ts \
  src/core/oak-judge-feedback-v1.spec.ts \
  src/core/ontology-owl-projection-v1.spec.ts \
  src/core/schema-verification-receipt-v1.spec.ts \
  --root .
# Expect: 8 passed, 43 passed (0 known failures as of this handoff)

# 3. Re-run the OaK readiness smoke test (run from repo root — it imports
#    directly from packages/parent-atlas/dist/index.js via pathToFileURL,
#    bypassing the pnpm virtual store, which has been stale before)
node scripts/atlas/oak-task-function-compiler-readiness-smoke-v1.mjs
# Expect: "OAK-F05 smoke: PASS", regenerates
# docs/reports/oak-task-function-compiler-readiness-v1.json
```

## Late addendum (2026-08-31): 16th operator, `INTERSECT_ELIGIBILITY`

The operator library is now **16 of 24** kinds populated (up from 15).
Found via `feature-promotion-eligibility-v1.ts`, added by the concurrent
process and confirmed by reading its actual logic (not just its name):
`buildFeaturePromotionEligibilityV1()` gates a classified candidate
through abstention/evidence-presence/source-revision checks →
`ELIGIBLE`/`BLOCKED_*` — a genuine match for `INTERSECT_ELIGIBILITY`.
Added a 7th `executorClass` value, `IN_MEMORY_COMPUTE_EXECUTOR` (none of
the original 6 fit a pure in-memory computation honestly). **Verified**:
package rebuilt clean, **21/21 tests pass** across all 5 spec files, smoke
test re-run and still **PASS**, report regenerated at
`docs/reports/oak-task-function-compiler-readiness-v1.json`. Remaining
unpopulated: 8 of 24 (`FILTER`/`JOIN`/`PROJECT`/`GROUP`/`AGGREGATE`/
`COMPARE_REVISION`/`VALIDATE_SCHEMA`/`GET_CALLEES`), each with a
documented reason it isn't verifiable yet.

## Second late addendum (2026-08-31): 17th/18th operators, `GET_CALLEES` + `COMPARE_REVISION`

Picked up the "8 of 24 need their own verification pass" item from the
session handoff. Checked `packages/parent-atlas/src/core/` first for newer
concurrent-process files per the handoff's own instruction — newest file
was still `kernel-operator-library-symbol-repair-v0.spec.ts` (18:06:38 the
prior session), nothing new to reconcile.

Verified two of the remaining eight are real and distinct, added both:
- **`GET_CALLEES`** — confirmed distinct from `GET_CALLERS` by reading
  actual code, not inferring from the name: `GET_CALLERS` is a live MCP
  graph traversal (`graph_expand_neighborhood`); `GET_CALLEES` is backed
  by a genuinely separate mechanism — `codebase-scanner-v2.ts`'s ts-morph
  pass (`buildTsMorphMap`, ~lines 235-304) statically extracts a
  per-file `callees: string[]` array, which `codebase-neo4j-sync.ts`
  mirrors onto the Neo4j `CodebaseFile.callees` property. Confirmed live
  (not dead code) via two real route consumers:
  `src/routes/api/codebase-index/orchestrate/+server.ts` and
  `src/routes/api/codebase-index/graph-sync/+server.ts`.
- **`COMPARE_REVISION`** — backed by `graph-snapshot-revision-v1.ts`'s
  `verifyGraphSnapshotRevisionV1()` / `assertGraphSnapshotRevisionMatchesHashes()`,
  a real, tested, deterministic revision-comparison function (throws
  `GRAPH_REVISION_MISMATCH:<id>` / `GRAPH_SNAPSHOT_REVISION_HASH_MISMATCH`
  on mismatch) — not the same as any Postgres lookup already in the
  library.

**Checked but left unmapped, with a stated reason** (not silently
dropped): `VALIDATE_SCHEMA` has no single repo-authored owner to cite —
schema validation here is done inline via Zod's own `.parse()`/`.strict()`
calls everywhere in the codebase (a library call, not a repo capability),
and the one repo-specific schema-verification pass (OWL/HermiT, OAK-S01)
is still unbuilt per the open-items list above. `FILTER`/`JOIN`/`PROJECT`/
`GROUP`/`AGGREGATE` remain unmapped for the same reason as before: generic
relational-algebra primitives composed ad hoc in every query, no single
citable owner.

**Verified**: package rebuilt clean (`tsc -p tsconfig.json`, exit 0);
**21/21 tests pass** across all 5 spec files (test count unchanged — the
`toHaveLength` assertion was updated from 16 → 18, still exactly one
assertion, not a new test); smoke test re-run, still **PASS**, report
regenerated at `docs/reports/oak-task-function-compiler-readiness-v1.json`.

**Operator library is now 18 of 24 kinds populated.** Remaining
unpopulated: `FILTER`, `JOIN`, `PROJECT`, `GROUP`, `AGGREGATE`,
`VALIDATE_SCHEMA` — all six explicitly document why they aren't
verifiable yet, not left blank by oversight.

## OAK-F01 through F05 — second external audit reconciled (2026-08-31)

A third external audit round proposed `TaskReasoningFunctionV1` /
`TaskFunctionCatalogV1` / `GenericOperatorCatalogV1` /
`TaskFunctionCompilerV1` as a new "OAK-F" queue (F01-F05), having run its
own owner-check. That check predates this session's OAK-04/05/06/10 work
landing — confirmed via `rg` that the proposed concepts already exist
under this session's own names:

| Proposed (OAK-F) | Real owner | Status |
|---|---|---|
| F01 `GenericOperatorCatalogV1` | `kernel-operator-library-v1.ts` (`KernelOperatorLibraryV1`/`KernelOperatorV1`/`buildKernelOperatorV1`) | **DONE — field gap closed 2026-08-31.** Added `operatorRevision`, `parameterSchemaRef` (nullable), a new `KernelOperatorExecutorClass` 6-value enum (`DB_QUERY_EXECUTOR`/`GRAPH_TRAVERSAL_EXECUTOR`/`SEARCH_EXECUTOR`/`RANK_EXECUTOR`/`CONTEXT_BUILD_EXECUTOR`/`CLI_PROCESS_EXECUTOR`), `requiredRevisionAxes`, `allowedArtifactKinds`, and a per-operator `operatorChecksum` via a new checksum-sealing builder (mirrors the pattern every other kernel contract in this family already uses). All 15 real operator instances updated with real, per-operator values — not filled mechanically. Fixed 2 spec files broken by the now-stricter schema (both switched from raw object literals to the builder). Verified: package rebuilt clean; **21/21 tests pass** across 5 spec files (including the concurrent process's own `kernel-function-catalog-v1.spec.ts`, unaffected); smoke test re-run, still **PASS**, report regenerated at `docs/reports/oak-task-function-compiler-readiness-v1.json`. |
| F02 `TaskReasoningFunctionV1`/`TaskFunctionCatalogV1` | `kernel-function-v1.ts` + `kernel-function-catalog-v1.ts` (`AtlasKernelFunctionV1`/`AtlasKernelFunctionCatalogV1`) | **DONE — field gap closed 2026-08-31.** Added `requiredRelationTypes`, `requiredFeatureIds`, `allowedEvidenceClasses` (min 1), `graphRevisionPolicy` (`EXACT`/`QUERY_SCOPED`), and `operatorCatalogRevision` (auto-bound from the operator library passed to the builder — cannot drift from what `operatorGraph` was actually validated against). Also fixed `kernel-function-catalog-v1.ts`: it had re-declared its own inline `.strict()` copy of the function schema instead of reusing `atlasKernelFunctionV1Schema`, which silently drifted out of sync the moment this field set changed — now imports the real schema directly. **Real bug caught during validation, not just added by inspection**: the first rebuild+test pass reported 4/21 failures (`ZodError: allowedEvidenceClasses expected array, received undefined`) from 6 `buildAtlasKernelFunctionV1` call sites in `ontology-kernel-end-to-end.spec.ts` that were missed in the initial edit. Fixed, rebuilt, re-ran — **21/21 pass**, smoke test re-run, still **PASS**, report regenerated. |
| F03 `TaskFunctionCompilerV1` (registered operators only) | `buildAtlasKernelFunctionV1()` | **DONE** — throws `KERNEL_FUNCTION_UNDECLARED_OPERATOR`, tested |
| F04 compile one known repair procedure | `kernel-function-catalog-symbol-repair-v0.ts` | **DONE** — 3 functions |
| F05 execute twice, same checksum | new smoke test, see below | **DONE, PASS** |

**Smoke test run and validated**: `scripts/atlas/oak-task-function-compiler-readiness-smoke-v1.mjs`
— per the user's exact `smoke_command` spec: compiles
`fn:find_evidence_for_failed_typecheck` from the real operator library,
builds a `QueryKernelGraphV1` binding it to typed arguments, runs the
whole chain twice, compares `operatorLibraryRevision`/`catalogChecksum`/
`functionImplementationChecksum`/`queryGraphChecksum` across both runs.
**Result: PASS, identical across runs, 0 writes.** Report written to the
user's exact requested path: `docs/reports/oak-task-function-compiler-readiness-v1.json`
(includes the full ownership map above in machine-readable form).

One real hiccup during the run, fixed not worked around: the pnpm virtual
store's hardlinked snapshot of `@deeds/parent-atlas` (a `file:` dependency)
was stale relative to today's rebuilds — `packages/parent-atlas/dist/`
itself had every new file, but `node_modules/.pnpm/@deeds+parent-atlas@.../`
did not. The smoke script imports directly from the built `dist/index.js`
via `pathToFileURL()` instead, bypassing the stale link rather than
debugging pnpm's cache — worth a `pnpm install` at some point to fix the
link properly, but not necessary for this task to be valid.

**Still genuinely missing, unchanged from before**: OAK-S01
(`SchemaVerificationReceiptV1`, needs an OWL/HermiT dependency decision)
and OAK-J01 (`KernelRepairSuggestionV1`, needs real failing-task data).
OAK-K01 (manifest freeze) exists but with a simpler status enum/revision-
axis set than requested — see the report's `ownershipMap` for the precise
field gap.

## Real gaps, consolidated and prioritized (2026-08-31)

Cross-referencing this file's own build log against the external audit in
spec.md's "External audit corroboration" section. Each gap below is real
(verified absent, not assumed) and tagged with why it's ordered where it
is — achievable-now vs. genuinely-blocked, not just "hard".

| # | Gap | Blocked on | Achievable now? |
|---|---|---|---|
| 1 | `AtlasKernelFunctionV1` catalog is nearly empty (1 function) | Nothing — compiler (`kernel-function-v1.ts`) and a 15-operator library already exist and are tested | **Yes — top priority** |
| 2 | `QueryKernelGraphV1` (OAK-06) not started | Nothing — pure contract, no new identity, same pattern as OAK-02/04/05/10 | **Yes** |
| 3 | ~~9 operator kinds unmapped~~ → **6 remain** (`FILTER`/`JOIN`/`PROJECT`/`GROUP`/`AGGREGATE`/`VALIDATE_SCHEMA`) | `INTERSECT_ELIGIBILITY`, `GET_CALLEES`, `COMPARE_REVISION` resolved and added this session (real, distinct implementations — see the two "late addendum" sections below). `VALIDATE_SCHEMA` re-checked once more (2026-08-31): the live TRACE MCP `ops_validate_tool_call`/`ops_run_quality_gate`/`ops_validate_claims` tools were inspected directly (full schemas fetched, not just names) — all three validate *tool-call arguments and agent claims* (the AGENT EXECUTION INTEGRITY rules in root CLAUDE.md), not *a structured artifact against its declared schema*, so none are an honest match. Still no repo-authored `VALIDATE_SCHEMA` owner beyond Zod's own `.parse()` calls everywhere. | Partial — the SQL-primitive 5 and `VALIDATE_SCHEMA` correctly stay unmapped, not force-fit |
| 4 | ~~"ACE synthesis DAG" / "adaptive hypergraph beam search" claims unconfirmed~~ | **Resolved 2026-08-31** — both real: `ace-synthesis-graph.ts` (`AceSynthesisGraphV1`, 18-node pipeline) and `adaptive-hypergraph-chain.ts` (self-described "deterministic reference beam-search scaffold"). Root cause of the initial "not found": searched `sveltekit-frontend/src` before `packages/parent-atlas/src`, violating this change's own audit-first rule. Third/fourth near-miss of this kind this session — see spec.md. | Done |
| 5 | `KernelBoundDagPlannerV1` (OAK-07) | `parent-atlas-adaptive-dag-fabric`'s research circuit (`runLocalResearchCircuitV1`) has zero production callers — wiring a planner on top of it would build on an unwired foundation | **No** — real external blocker, not ours to clear from this change |
| 6 | OWL/HermiT verification (OAK-03) | Needs a real external reasoner dependency decision (which HermiT distribution, language bindings, licensing) | **No** — operator decision required |
| 7 | Judge + repair loop (OAK-08/09) | Needs real failing-task execution data to calibrate `OakJudgeFeedbackV1` against — none exists yet, and fabricating synthetic failures would defeat the point of a judge | **No** — needs OAK-11-style task runs first, which need a kernel that can actually execute (gap #1/#2 territory) |
| 8 | Kernel manifest reaching `FROZEN`/`PROMOTED` | Structurally gated on #6 and #7 by the manifest builder itself | **No** — correctly blocked, not a bug |
| 9 | OAK-11 benchmark (standard ReAct vs. kernel-bound ReAct) | Needs #1, #2, and #5 to exist first — nothing to benchmark yet | **No** |

**This pass's implementation targets gaps #1 and #2** — the two genuinely
unblocked ones. Gap #3's SQL-primitive operators, #4, and everything from
#5 down remain open and are not attempted here.

### Gaps #1 and #2 closed and validated (2026-08-31)

- **Mid-implementation collision, caught and reconciled**: a concurrent
  process built `kernel-function-catalog-v1.ts`
  (`AtlasKernelFunctionCatalogV1` — a checksum-sealed catalog wrapper
  around this session's own `buildAtlasKernelFunctionV1`) while this pass
  was in progress. Caught via file mtime before shipping a competing flat-
  array version; rewrote `kernel-function-catalog-symbol-repair-v0.ts` to
  consume the existing catalog builder instead. This is the audit-first
  rule (added to root `CLAUDE.md` earlier this session) working as
  intended — including catching a same-day collision, not just a stale
  file from a prior session.
- **Gap #1 (F catalog)**: `kernel-function-catalog-symbol-repair-v0.ts` —
  3 composed functions (`find_impacted_callers_for_symbol_change`,
  `trace_packet_to_symbol_to_source`, `find_evidence_for_failed_typecheck`)
  built via the (now-shared) `buildAtlasKernelFunctionCatalogV1`, all over
  the real 15-operator library.
- **Gap #2 (`QueryKernelGraphV1`)**: `query-kernel-graph-v1.ts` — binds a
  catalog function to typed `boundArguments` + `groundedResult` +
  `groundedEvidence`, checksum-sealed. Guardrails: refuses a selection
  whose function's `kernelRevision` doesn't match the query graph's own
  (`QUERY_KERNEL_GRAPH_FUNCTION_KERNEL_MISMATCH`); refuses a `SUCCEEDED`
  selection citing zero grounded evidence (the actual OaK
  evidence-grounding rule enforced structurally, not just documented) —
  while correctly allowing a `FAILED` selection to cite none, since a
  failure has nothing to ground.
- **Validated**: `packages/parent-atlas` rebuilt clean (`tsc -p
  tsconfig.json`, exit 0, including reconciliation with the concurrently-
  added file). All 4 ontology-kernel spec files run together from
  `packages/parent-atlas` (not sveltekit-frontend's scoped vitest, which
  doesn't cover this package) — **19/19 tests pass**: 8
  (`ontology-kernel-end-to-end`) + 3 (`kernel-operator-library-symbol-
  repair-v0`) + 4 (`kernel-function-catalog-symbol-repair-v0`, including a
  regression guard re-confirming the undeclared-operator throw still fires
  when routed through the catalog wrapper) + 4 (`query-kernel-graph-v1`).

## OAK-00 — create this OpenSpec change

- [x] Directory + `spec.md` + `tasks.md` created 2026-08-31. This file.

## OAK-01 — audit existing ontology/function owners (do not build duplicates)

Partial audit done at OAK-00 time (grep-verified, not assumed):

- [x] `OntologyLinkedTupleV1` — **confirmed real**, `sveltekit-frontend/
  src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`, 19 files
  reference it (Postgres persistence, cache, KAG integration, taxonomy
  producer, feature-doc enrichment, POS concept tagging).
- [x] `HyperedgeV1` — **confirmed real**, `sveltekit-frontend/src/lib/
  server/graph/hyperedge-contract.ts`, 17 files reference it (Postgres
  layer `kag-hyperedge-postgres.ts`, incidence projection, taxonomy
  candidate cross-reference).
- [x] `taxonomy-candidate-producer-v1.ts` — **confirmed real**, matches the
  candidate-not-fact discipline the user described.
- [x] `SymbolOntologyTupleV1` — **not found under this exact name** in
  `packages/parent-atlas/src`, `packages/atlas-core/src`, or
  `sveltekit-frontend/src`. Treat as a synthesized description of existing
  capability (likely `entity-concept-taxonomy-v1.ts` + the symbol registry
  from `parent-atlas-neural-prefill-encoder`), not a contract to search for
  by that literal name in future work.
- [x] Graph traversal primitives for the operator library — **confirmed
  real and already MCP-exposed**: `graph_expand_neighborhood`,
  `graph_shortest_path`, `hypergraph_expand_members`, `hypergraph_search`
  in the live TRACE MCP tool surface.
- [ ] **Not yet done**: a full inventory of every existing retrieval/AST/
  graph/validator function that should become an `AtlasKernelOperatorLibraryV1`
  wrapper (the ~24 named operators in spec.md — `FILTER`, `JOIN`,
  `LOOKUP_SYMBOL`, `SEARCH_SEMANTIC`, `RUN_TYPECHECK`, etc.). This audit
  found the *shape* is real; it did not yet map each operator name to a
  specific existing implementation file. That mapping is the actual OAK-01
  deliverable and is not complete — do not treat this partial pass as
  closing OAK-01.

## OAK-02 — `AtlasOntologyKernelSchemaV1`

- [x] **Built 2026-08-31.** `packages/parent-atlas/src/core/ontology-kernel-schema-v1.ts`
  — `entityTypes`/`relationTypes`/`constraints`/`identityRules`, checksum-
  sealed, `.strict()` Zod schema. Guardrail: `verificationStatus` defaults
  to `UNVERIFIED` and the schema itself throws if hand-set to `VERIFIED`
  (real OAK-03 verification hasn't run) — enforced by a `superRefine`, not
  just a comment. Also validates every `constraints[].appliesTo` reference
  resolves to a declared entity/relation type. Scoped narrow (proof-of-
  pattern, not the full compiled-from-`OntologyLinkedTupleV1`/`HyperedgeV1`
  schema the task originally described) — see the end-to-end spec for the
  one real task class it was exercised against
  (`symbol_change_impact_analysis`).

## OAK-03 — OWL projection + HermiT validation

- [ ] Translate the compiled schema candidate to OWL, validate with HermiT
  (class disjointness, property restrictions, domain/range consistency,
  unsatisfiable classes) → `VERIFIED` / `REJECTED`. **Deliberately not
  attempted this pass.** No HermiT integration exists in this repo, and
  adding a real OWL-reasoner dependency (language bindings, licensing,
  which HermiT distribution) is an operator decision, not something to
  improvise inside a single implementation pass. `ontology-kernel-schema-v1.ts`
  and `ontology-kernel-manifest-v1.ts` both structurally refuse to claim
  `VERIFIED`/`FROZEN` in this file's absence, so nothing downstream can
  silently pretend OAK-03 happened.

  **Research done 2026-08-31 (operator asked for options, not adoption
  yet).** Confirmed via repo grep this hasn't been attempted before
  (`OWL`/`HermiT`/`owlready`/`Pellet`/`SHACL` return zero real hits) and
  that this repo has **no JVM dependency today anywhere** — adopting any
  Java-based reasoner is a first-of-its-kind stack addition, not a drop-in.
  Real options, verified live (not from memory):
  - **HermiT itself** (what the OaK paper uses) — LGPL-3.0, ships a
    standalone `HermiT.jar`, CLI-shellable the same way this session
    already shells out to `tsc`/`vitest`. Maintenance activity unclear.
  - **owlready2** (Python) — LGPL-3.0, actively maintained, bundles
    HermiT+Pellet behind a Python API — routes through this repo's
    existing Python sidecar pattern, but still a JVM underneath.
  - **Pellet/Openllet** — ruled out: AGPL-licensed, a materially worse
    license fit for a server application than LGPL.
  - **ELK** — ruled out: restricted to the OWL 2 EL profile, likely too
    narrow for general contradiction/consistency checks.
  - **Lightweight non-OWL alternative**: `AtlasOntologyKernelSchemaV1` is
    a bounded, task-scoped concept/relation set (not open-world OWL) — a
    hand-rolled TS contradiction/cycle checker over the already-
    Zod-validated graph (same checksum-sealed-builder pattern as every
    other file in this family) could plausibly satisfy "formal
    verification" for this bounded case with zero new dependencies,
    trading weaker guarantees than real OWL DL semantics for consistency
    with the rest of this stack.

  **Follow-up research 2026-08-31 (operator asked: Apache-licensed
  option? JVM alignment with the Neo4j this repo already runs? Python
  adapter for integration?)** — this materially refined the picture, all
  claims verified live, not assumed:
  - **No Apache-2.0 full-OWL-DL reasoner exists at all** — this is a
    structural fact of the OWL-reasoner ecosystem, not a search miss.
    Apache Jena (genuinely Apache-2.0) ships only a rule-based OWL
    *subset*; its own docs say to pair it with an external DL reasoner
    (HermiT/Pellet/FaCT++) for real DL. ELK is also genuinely Apache-2.0
    (correcting ambiguity in the first pass) but stays EL-profile-only.
    Real full-DL reasoning is LGPL (HermiT) or AGPL (Pellet/Openllet) —
    no way around that trade-off.
  - **`neosemantics` (n10s) is a genuine third option, not a rehash.**
    Apache-2.0, actively maintained (latest tag `2025.06`), no
    Enterprise-edition gate found. Runs as a plugin *inside the Neo4j
    JVM this repo already operates* — zero new process, callable via the
    Cypher/HTTP connection this repo already talks to (no Python bridge
    needed at all, unlike owlready2). Ceiling: same as Jena — RDFS-level
    inferencing + SHACL validation, not OWL DL. Caution: runs inside the
    same JVM/process as Neo4j's load-bearing topology-mirror role — a
    plugin fault isn't isolated the way a separate sidecar would be.
  - **owlready2, verified precisely**: LGPL-3.0-or-later, v0.51
    (2026-06-22, PyPI-confirmed), actively maintained on Bitbucket (its
    real upstream — GitHub mirrors don't reflect real activity signal).
    One concrete risk found, not hypothetical: public forks exist
    specifically to strip a bundled `log4j.jar` for security reasons — a
    real supply-chain exposure from the bundled Java reasoners.

  **Python-adapter integration path checked concretely (2026-08-31)**:
  `owlready2`'s pattern is `Ontology(iri)` + `with onto: class X(Thing):
  pass` to build the ontology **in-memory, programmatically, from this
  repo's own `AtlasOntologyKernelSchemaV1` data** — it does not need to
  fetch or search the web at all for this use case. Internet access is
  only invoked if the ontology declares `owl:imports` against an external
  IRI Owlready2 doesn't already have a local copy of (avoidable entirely
  via `onto_path`, or simply not importing anything external, which
  OAK-S01 has no reason to). Consistency checking is `sync_reasoner()`
  (HermiT is the default reasoner Owlready2 shells out to) — confirmed:
  Owlready2's own docs state plainly "HermiT and Pellet are written in
  Java, and thus you need a Java Virtual Machine" — the JVM dependency for
  option (a) is real and unavoidable, but no network/web-search dependency
  is. Sources: [Owlready2 onto docs](https://owlready2.readthedocs.io/en/latest/onto.html),
  [Owlready2 reasoning docs](https://owlready2.readthedocs.io/en/latest/reasoning.html).

  **Three real choices now, not two** — no option is both Apache-licensed
  and full OWL DL, that combination doesn't exist in this ecosystem:
  (a) `owlready2`+HermiT — real OWL DL, LGPL, new Python-sidecar call,
  known `log4j.jar` footgun; (b) `neosemantics` inside the already-running
  Neo4j — Apache-2.0, zero new processes, Cypher/HTTP-only integration,
  but RDFS/SHACL-level only, shares fault domain with topology infra;
  (c) hand-rolled TS checker — no dependency, weakest guarantee, own
  scope definition needed. **Still no adoption — research only, per what
  was asked for both passes.**

  **Architecture correction from the operator (2026-08-31): ELK is not
  "ruled out" — it's a distinct, non-competing fast lane.** The earlier
  research framed ELK as inferior to HermiT because it's EL-profile-only;
  the operator's frozen design instead runs both, gated by declared
  profile, never one "primary" and one "challenger":
  ```
  reasonerPolicy: { EL_PROFILE: 'ELK', FULL_DL_REQUIRED: 'HERMIT' }
  ```
  ELK handles the (likely common) case where a kernel schema only needs
  EL-level checks — fast, incremental, multicore; HermiT is reserved for
  schemas that actually need full DL semantics. This is the correct
  framing; the prior research pass's "ELK ruled out" language was wrong
  to the extent it implied ELK has no role — it has a real one, just not
  as a HermiT substitute.

- [x] **OAK-03A built 2026-08-31 — OWL projection + `OntologyProfileReceiptV1`
  only, pure TypeScript, no JVM, no adoption of any reasoner.**
  `packages/parent-atlas/src/core/ontology-owl-projection-v1.ts` —
  `projectAtlasOntologyKernelSchemaToOwlV1()` deterministically compiles
  an `AtlasOntologyKernelSchemaV1` into RDF/XML OWL: entity types →
  `owl:Class`, binary relation types → `owl:ObjectProperty`, n-ary
  relation types → a reified `owl:Class` (OWL properties are inherently
  binary — this is the standard n-ary-relation pattern, not an
  approximation), `DISJOINT_CLASSES` constraints (exactly 2 members) →
  real `owl:disjointWith` axioms.

  **Honest, found-not-guessed gap**: `kernelConstraintSchema` (OAK-02)
  only carries `appliesTo: string[]` + free-text `description` for every
  constraint kind — enough for `DISJOINT_CLASSES`, not enough to build
  real `DOMAIN_RANGE`/`PROPERTY_RESTRICTION`/`CARDINALITY` axioms (no
  domain-vs-range split, no restricted-property id, no cardinality
  number in the schema today). Rather than fabricate those fields,
  those three constraint kinds project as `rdfs:comment` annotations
  only — visible and auditable, but not logically enforced by any
  reasoner. The receipt's `axiomsCovered`/`axiomsAnnotatedOnly` arrays
  make this split explicit and machine-checkable. `owlProfileHeuristic`
  is clearly labeled a heuristic (not a real OWLAPI profile check this
  repo hasn't adopted) — conservatively returns `OWL2_DL_REQUIRED`
  whenever anything had to go annotation-only, so a wrong "this is EL"
  can never silently route a DL-requiring schema to the weaker ELK lane
  once OAK-03B exists. Before `DOMAIN_RANGE`/`PROPERTY_RESTRICTION`/
  `CARDINALITY` can be genuinely reasoner-checked, `kernelConstraintSchema`
  needs real structured fields for them — that's OAK-02 surface, flagged
  here, not fixed here.

  **Verified**: package rebuilt clean; **35/35 tests pass** across 7 spec
  files (up from 27/6) — new `ontology-owl-projection-v1.spec.ts` covers
  the disjoint/annotation-only split, n-ary reification, determinism, and
  the EL-vs-DL heuristic on both a clean-EL and a DL-required schema.

- [x] **`SchemaVerificationReceiptV1` output-side contract built
  2026-08-31 — CREATED, explicitly NOT `WIRED`.**
  `packages/parent-atlas/src/core/schema-verification-receipt-v1.ts` —
  exactly the field shape the operator specified (`ontologyChecksum`,
  `ontologyRevision`, `owlProfile`, `reasoner`, `reasonerVersion`,
  `reasonerArtifactChecksum`, `consistent`, `unsatisfiableClasses`,
  `classificationChecksum`, `outputArtifactChecksum`,
  `invocationRevision`, `elapsedMs`, `writesPerformed: false` hard-typed
  as `z.literal(false)`). Guardrails, both tested: refuses
  `consistent=false` with zero named unsatisfiable classes (an
  inconsistency claim with no cited cause isn't verifiable evidence);
  refuses `consistent=true` with a non-empty `unsatisfiableClasses` list.
  Also built `selectReasonerForOwlProfile()` — a single named function
  implementing the operator's frozen policy
  (`{EL_PROFILE: 'ELK', FULL_DL_REQUIRED: 'HERMIT'}`, `UNKNOWN` routes
  conservatively to the stronger HermiT lane) so the routing decision
  isn't scattered across call sites later.

  **Checked directly before deciding not to build OAK-03B/03C**: this
  environment has **no JVM at all** — `java -version` → `command not
  found`, confirmed via direct execution, not assumed. Python exists
  (`/c/Python313/python`) but that doesn't help without a JVM underneath
  it (per the earlier research: HermiT/Pellet both need one, owlready2
  just hides it behind a Python API). **OAK-03B (ELK subprocess adapter)
  and OAK-03C (HermiT subprocess adapter) deliberately NOT attempted.**
  Writing a subprocess adapter that shells out to `java -jar` in an
  environment with no `java` binary would produce code that has never
  actually run — this repo's own status-language rules
  (`CREATED`/`WIRED`/`DRY_RUN_PROVEN`/`APPLY_PROVEN`/`NOT_PROVEN`) exist
  specifically to prevent reporting that as more than `CREATED` even if
  written. Still needs the operator's actual go-ahead on jar provenance
  (vendored into the repo vs. an operator-provisioned path vs. a
  documented manual install step) — and a JVM actually being available
  somewhere this can run — before OAK-03B/03C can move past a docstring.
  The `OntologyReasonerAdapter` Python class shape (`profile()`/
  `check_consistency()`/`classify()` → `SchemaVerificationReceiptV1`) is
  fully specified in the operator's message and ready to write the
  moment a JVM + jars are actually reachable to test against — writing
  the class body without anything to run it against would only produce
  another `NOT_PROVEN` artifact, so it's held rather than added for its
  own sake.

  **Verified**: package rebuilt clean; **43/43 tests pass** across 8 spec
  files (up from 35/7) — new `schema-verification-receipt-v1.spec.ts`
  covers both guardrails, determinism, and all three policy-routing
  cases (EL→ELK, DL→HermiT, UNKNOWN→HermiT).

## OAK-04 — `AtlasKernelOperatorLibraryV1`

- [x] **Built 2026-08-31, narrow slice.** `packages/parent-atlas/src/core/
  kernel-operator-library-v1.ts` — the full 24-name `KERNEL_OPERATOR_KIND_VALUES`
  enum from spec.md, plus `KernelOperatorV1` (operator descriptor with
  `implementationRef`/`implementationKind`/`verifiedLive`) and
  `KernelOperatorLibraryV1` (duplicate-id-checked registry). This is a
  **contract/registry**, not runtime wiring — matches the DAG-XJSON-01
  precedent (pure contract in `packages/`, actual call-site bridge in
  `sveltekit-frontend/src/lib/server/atlas/`, not built here).

- [x] **Extended 2026-08-31, same session, continuing OAK-01/OAK-04.**
  `packages/parent-atlas/src/core/kernel-operator-library-symbol-repair-v0.ts`
  — a real, populated `KernelOperatorLibraryV1` instance covering **15 of
  the 24** operator kinds (up from the initial 3): `LOOKUP_SYMBOL` →
  `atlas_symbol_registry`, `LOOKUP_PACKET` → `atlas_packets`,
  `GET_SOURCE_SPAN` → `atlas_symbol_versions`, `GET_AST_EVIDENCE` →
  `atlas_ast_nodes`, `GET_REFERENCES` → `atlas_source_refs` (all 5
  confirmed live via `to_regclass()`, not assumed), `GET_CALLERS` /
  `EXPAND_GRAPH` → `graph_expand_neighborhood`, `SHORTEST_PATH` →
  `graph_shortest_path`, `BOUNDED_BFS` → `hypergraph_expand_members`,
  `SEARCH_LEXICAL` → `search_postgres_fts`, `SEARCH_SEMANTIC` →
  `search_hybrid` (all 6 live MCP tools per the TRACE MCP surface
  confirmed earlier this session), `RERANK` → `canonical-rerank-executor.ts`,
  `BUILD_CONTEXT` → `context-assembler.ts` (both confirmed via file-
  existence check), `RUN_TYPECHECK` → `tsc --noEmit`, `RUN_TEST` →
  `vitest run` (added a new `cli_command` `implementationKind` to the
  schema for these two rather than mislabeling them as `source_file` —
  an honesty fix to the contract, not a workaround). Tested:
  `kernel-operator-library-symbol-repair-v0.spec.ts` (3 tests: exactly 15
  populated + all `verifiedLive`, every kind is a real vocabulary value, no
  duplicate ids/kinds) — **11/11 tests pass** across both spec files
  combined, confirmed via `vitest run` from `packages/parent-atlas`
  (`packages/parent-atlas` rebuilt clean first, `tsc -p tsconfig.json`,
  exit 0).
  **The remaining 9 operator kinds** (`FILTER`, `JOIN`, `PROJECT`, `GROUP`,
  `AGGREGATE`, `COMPARE_REVISION`, `VALIDATE_SCHEMA`,
  `INTERSECT_ELIGIBILITY`, `GET_CALLEES`) are explicitly left unpopulated
  in the file's own docstring, each with the specific reason it isn't
  verifiable yet (generic SQL primitives with no single owner to cite;
  no confirmed distinct implementation from `GET_CALLERS`) — not silently
  dropped, not guessed at to hit a round number.

## OAK-05 — `AtlasKernelFunctionV1`

- [x] **Built 2026-08-31, compiler primitive + catalog.** `packages/parent-atlas/src/core/
  kernel-function-v1.ts` — `buildAtlasKernelFunctionV1()` composes an
  `operatorGraph` (steps with `dependsOnStepIds`) over a supplied
  `KernelOperatorLibraryV1`. Guardrail: **throws
  `KERNEL_FUNCTION_UNDECLARED_OPERATOR:<id>` if any step references an
  operator not in the library** — this is the actual bounded-search-space
  mechanism, not a docstring claim; tested directly. Also rejects a step
  depending on itself or on an undeclared step id. One composed example
  built and tested: `find_impacted_callers_for_symbol_change`
  (`lookup_symbol` → `get_source_span` + `get_callers`), `mutationPolicy:
  READ_ONLY`. The bounded catalog now composes three read-only functions in
  `kernel-function-catalog-symbol-repair-v0.ts`; it is a registry only and
  does not execute functions.

- [x] **Catalog added 2026-08-31.** `kernel-function-catalog-v1.ts` provides a
  deterministic, checksum-sealed task-specific function catalog over the
  existing operator library. It compiles two read-only symbol-repair
  functions and rejects undeclared operators through the existing compiler.
  This closes the catalog shape, but not query-time selection/execution
  (OAK-06/OAK-07 remain open).

## OAK-06 — `QueryKernelGraphV1`

- [x] **Built 2026-08-31.** `query-kernel-graph-v1.ts` binds selected catalog
  functions to typed arguments, grounded results, and evidence references;
  rejects cross-kernel selections and successful selections with no evidence.
  It is query-time and `canonicalAuthority: false`; it creates no identity.

## OAK-07 — `KernelBoundDagPlannerV1`

**Contract prerequisite added 2026-08-31:** `AdaptiveDagPlanV1` and the
bounded `DagActionKind` catalog now exist in
`packages/parent-atlas/src/core/adaptive-dag-plan-v1.ts`. The contract is
checksum-sealed and rejects undeclared/self dependencies and mutating
`SYNTHESIZE` actions; focused tests are 3/3 and the package build passes.
This does not yet bind plans to an OaK function catalog or execute actions.
Receipt: `docs/reports/adaptive-dag-plan-contract-v1.json`.

**OAK-07 contract built 2026-08-31:** `KernelBoundDagPlannerV1` now binds
one requested function to the manifest/catalog/operator-library revisions
and lowers only its declared operators into `AdaptiveDagPlanV1`. It rejects
undeclared functions/operators, revision mismatches, and mutation policies
that require explicit apply. Package build passed and focused planner tests
are 5/5. This is contract proof only; no action execution or kernel freeze
is claimed. Receipt: `docs/reports/oak-kernel-bound-planner-v1.json`.

- [x] **Core constraint built 2026-08-31 (by the concurrent process,
  reconciled and committed this session at `e7ec116445` after full-suite
  verification — 30/30 spec files, 126/126 tests green, not just this
  change's own subset).** `planKernelBoundDagV1()` in
  `kernel-bound-dag-planner-v1.ts` does exactly what this line asks:
  given a manifest + catalog + operator library + one requested
  `functionId`, it refuses to plan anything not declared by that
  function's own `operatorGraph`, refuses a function not in the
  manifest's `functionIds`, refuses catalog/operator-library/kernel
  revision mismatches, and refuses `MUTATES_WITH_RECEIPT` functions
  outright (mutation requires an explicit separate apply step, never
  silent inside planning). Each surviving operator step lowers into one
  `AdaptiveDagPlanV1` action via a real kind mapping
  (`actionKindForOperator`) — any operator kind with no mapping throws
  `KERNEL_BOUND_PLAN_UNMAPPED_OPERATOR` rather than silently
  guessing. **This is the actual search-space reduction the operator's
  queue asked for**: the planner selects one `F` function and lowers
  only its registered operators, not the full capability surface.

  **Ownership question resolved 2026-08-31 (operator decision, recorded in
  `parent-atlas-adaptive-dag-fabric/tasks.md`): `atlas/research/*` is
  classified `EXPERIMENT` and stays parked — do not wire it, do not build
  OAK-07 against it.** `research/web-research-ingester.ts` remains the
  live `CANONICAL_OWNER` for web-research retrieval. This re-scopes, but
  does not unblock, OAK-07: the planner must now be constrained against
  whichever system actually carries `AdaptiveDagPlanV1`'s local-evidence
  branches today (`web-research-ingester.ts` for the `WEB_SEARCH`-shaped
  work; `AST_SCAN`/`FETCH_POSTGRES`/`FETCH_QDRANT`/`FETCH_FILE`/
  `GRAPH_EXPAND` routes not yet traced) rather than `atlas/research/*`.
  That tracing work is real and not yet started — OAK-07 remains
  genuinely not started, just against a corrected target.

  **Larger correction found while tracing (2026-08-31): `AdaptiveDagPlanV1`
  and `DagActionKind` do not exist as code anywhere in this repo — checked
  directly, not assumed.** `grep -rn "AdaptiveDagPlanV1\|DagActionKind"` over
  every `.ts` file in the repo returns **zero matches**. Both are
  design-only: `parent-atlas-adaptive-dag-fabric/spec.md`'s "Frozen DAG
  shape" section describes `DagActionKind` as a bounded enum
  (`FETCH_POSTGRES`, `FETCH_QDRANT`, `FETCH_FILE`, `AST_SCAN`,
  `SIMDJSON_SCAN`, `GRAPH_EXPAND`, `WEB_SEARCH`, `RERANK`,
  `BUILD_CONTEXT`, `SYNTHESIZE`) and `AdaptiveDagPlanV1` as the planner
  stage between `QueryClassificationV1` and `TypedEvidenceEnvelopeV1` — but
  neither has a `.ts` file, a Zod schema, or a builder anywhere. This means
  OAK-07 ("constrain `AdaptiveDagPlanV1` ... from `parent-atlas-adaptive-
  dag-fabric`") was scoped against a *spec description*, not an existing
  contract — a materially bigger gap than "the research circuit is
  unwired." **Corrected sequencing**: OAK-07 cannot start until
  `parent-atlas-adaptive-dag-fabric` actually builds `DagActionKind`/
  `AdaptiveDagPlanV1` as real, tested TypeScript (a task that belongs in
  that change's own tasks.md, not this one) — only then does "constrain
  the planner to the active kernel's `F`" have a real planner to
  constrain. Flagged here rather than fixed, per this repo's own
  duplication-prevention rule ("record what you found, even when you
  don't fix it") — building `AdaptiveDagPlanV1` is scope creep for this
  change and belongs to `parent-atlas-adaptive-dag-fabric` instead.

## OAK-08 — `OakJudgeFeedbackV1`

- [x] **Contract shape built 2026-08-31 — schema + fixture only, NOT a
  working judge.** `packages/parent-atlas/src/core/oak-judge-feedback-v1.ts`
  — the exact field set from spec.md (`kernelRevision`, `programRevision`
  nullable since GEPA/OAK-12 doesn't exist yet, `workflowRunId`,
  `failureClass` over the fixed 12-value vocabulary, `evidenceRefs`,
  `executionReceiptRefs`, `proposedSchemaPatch`/`proposedFunctionPatch`,
  `confidence`, `judgeRevision`, checksum, `canonicalAuthority: false`).
  Guardrails, both tested: (1) refuses a record with **no** proposed
  patch — a classification with no remediation isn't useful feedback;
  (2) refuses a record with **both** a schema and a function patch — one
  record diagnoses one layer.

  **`oak-judge-feedback-f02-fixture-v0.ts`** — ONE real, non-fabricated
  instance, grounded in this session's own actual F02 rebuild failure
  (see the "F02" row in the "OAK-F01 through F05" section above): a real
  `VALIDATOR_FAILURE` where 6 `buildAtlasKernelFunctionV1()` call sites in
  `ontology-kernel-end-to-end.spec.ts` failed real Zod validation
  (`allowedEvidenceClasses expected array, received undefined`) after the
  F02 schema extension, with the real fix that was actually applied
  recorded as `proposedFunctionPatch`. `evidenceRefs` point at this
  file's own tasks.md section and the real spec file; `executionReceiptRefs`
  cites the real "4 failed of 21" pre-fix test run. `judgeRevision:
  'human-diagnosed:not-automated:v0'` is deliberately labeled — this is
  a retrospective reconstruction of a real event, not a live judge output.

  **This is explicitly not "OAK-08 done."** No automatic failure
  classification exists; nothing observes a live test run and produces
  this record on its own. What's closed: the contract shape is real,
  tested against its own guardrails, and proven against one genuine
  (not synthetic) failure rather than an invented one — which was the
  actual blocker stated below ("fabricating synthetic failures would
  defeat the point"). Using this session's own real, already-resolved
  failure sidesteps that blocker honestly instead of waiting indefinitely
  for a live one to occur. A real automatic judge (observes execution
  receipts, classifies without a human first diagnosing the fix) remains
  open and still needs real live data — OAK-09's repair *loop* (schema
  patch → re-verify → re-evaluate, run twice) is unaffected by this and
  remains genuinely not started.

  **Verified**: package rebuilt clean; **27/27 tests pass** across 6 spec
  files (was 21/5); new `oak-judge-feedback-v1.spec.ts` covers both
  guardrails, a full-vocabulary round-trip, and the fixture's determinism
  (same checksum across two builds).

  **Correction (2026-08-31): the "GA8-style judge" pointer above was
  checked and does not hold up — do not follow it.** Read
  `openspec/changes/parent-atlas-graph-analysis-contract/tasks.md`
  directly rather than trusting the prior session's characterization.
  `GA8` there is a **per-feature retrieval-ranking ablation** (does graph
  authority add retrieval value beyond semantic similarity — still
  `NOT_STARTED`, blocked on a ground-truth-relevance methodology decision)
  and its "judge" is an **LLM relevance-labeling judge**
  (`python/build_llm_judged_relevance_set.py`, labels top-50 candidates
  per query as relevant/not, feeds a ranking sweep). Neither is a
  task/schema/function-compiler failure judge — there is no real overlap
  with `OakJudgeFeedbackV1`'s job (classify a *kernel task failure* —
  missing schema concept, missing operator, validator failure — and
  propose a schema or function patch). Checked so a future session doesn't
  re-read this same pointer and waste time chasing it a second time. This
  leaves OAK-08 exactly where it was: genuinely not started, and still
  correctly blocked on real failing-task execution data (per the table
  above) rather than merely unwritten.

## OAK-09 — kernel repair loop

- [ ] Two full construction rounds with deterministic receipts (schema
  patch or function patch → re-verify → re-evaluate). Not started, depends
  on OAK-02 through OAK-08.

## OAK-10 — `AtlasOntologyKernelManifestV1`

- [x] **Built 2026-08-31, DRAFT state only (by design).** `packages/parent-atlas/
  src/core/ontology-kernel-manifest-v1.ts` — `buildAtlasOntologyKernelManifestV1()`
  binds one schema + operator library revision + function set under one
  `kernelChecksum`. Guardrails, both tested: (1) throws
  `KERNEL_MANIFEST_REVISION_MISMATCH:<id>` if any supplied function's
  `kernelRevision` doesn't match the manifest's own — can't silently freeze
  a mismatched function set; (2) the schema itself refuses any `state`
  other than `DRAFT` — `FROZEN`/`PROMOTED`/`VERIFIED` require OAK-03 and
  OAK-08/09 to have actually run, which they haven't, so this builder
  cannot produce them. Determinism verified directly: same schema +
  library + function inputs → identical `kernelChecksum` across two
  independent builds. **This manifest can never leave `DRAFT` until OAK-03
  and OAK-08/09 exist** — that's the honest current ceiling of "frozen," not
  a bug.

### Verification (2026-08-31)

- [x] `packages/parent-atlas` rebuilt clean (`tsc -p tsconfig.json`, exit 0)
  with all 4 new files (`ontology-kernel-schema-v1.ts`,
  `kernel-operator-library-v1.ts`, `kernel-function-v1.ts`,
  `ontology-kernel-manifest-v1.ts`) plus their exports added to
  `packages/parent-atlas/src/index.ts`.
- [x] `packages/parent-atlas/src/core/ontology-kernel-end-to-end.spec.ts` —
  **8/8 tests pass** (schema guardrails, operator library, function
  composition + undeclared-operator/self-dependency rejection, manifest
  freeze + revision-mismatch rejection, cross-build determinism).
  Confirmed via `vitest run` executed directly from `packages/parent-atlas`
  (sveltekit-frontend's own vitest scope doesn't cover this package's
  `src/` — first run attempt reported "No test files found" purely from
  glob-scope mismatch, not a real failure; re-ran from the correct working
  directory and got a real result rather than assuming the first run's
  silence meant something).

## OAK-11 — benchmark: standard ReAct vs. kernel-bound ReAct

- [ ] Same Ornith, same tasks, same evidence, same tool budget — produce
  Parent Atlas's **own** frozen before/after comparison. Explicitly do not
  assume the OaK paper's TravelPlanner/CRMArenaPro/ToolQA gains (or the
  video's 27.5→83% figure) transfer to this codebase's task families. Not
  started — depends on OAK-00 through OAK-10 being real.

## OAK-12 — GEPA optimization

- [ ] Only after the OaK baseline (frozen kernel + kernel-bound ReAct)
  works and OAK-11 has a real baseline number to improve on. Not started.
  Explicitly sequenced last — do not let GEPA/program optimization work
  start before the kernel exists, per spec.md's "OaK defines what's legal,
  DSPy defines how it's used, GEPA improves how well" layering.

## Open question carried over from spec.md

`KERNEL_MODE` vs `EXPLORATION_MODE` switching logic (which task classes
get a frozen kernel vs. run the ordinary bounded DAG with candidate-only
output) is described conceptually in spec.md but has no contract shape
defined yet — first concrete design question for whoever picks up OAK-02.
