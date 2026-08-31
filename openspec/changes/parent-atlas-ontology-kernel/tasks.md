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
- [ ] **22/24 operators mapped to a real, grep-verified implementation (2026-08-31)** — still not
  closing OAK-01: 2 remain genuinely unmapped, and every mapping below is a *candidate* pointer
  found by inventory, not yet wired into `kernel-operator-library-v1.ts`'s actual executor
  dispatch (that wiring is a separate, still-open step).

  | Operator | Candidate implementation | Verified how |
  |---|---|---|
  | `FILTER`, `JOIN`, `PROJECT`, `GROUP`, `AGGREGATE` | Drizzle ORM query-builder primitives (`.where()`, `.innerJoin()`/`.leftJoin()`, `.select({...})`, `.groupBy()`, `sql`/`count()`/`sum()`) | Generic — these 5 aren't single named functions, they're `drizzle-orm`'s own query-builder API, used throughout `db/client.ts` consumers |
  | `LOOKUP_SYMBOL` | `atlasSymbolRegistry` (`db/schema/atlas-structural-intelligence.ts:13`) | Already confirmed in `ontology-kernel-end-to-end.spec.ts`; re-verified table exists |
  | `LOOKUP_PACKET` | `atlasPackets` (`db/schema/atlas-packets.ts:30`) | `pgTable('atlas_packets', ...)` confirmed |
  | `SEARCH_LEXICAL` | `runRgSearchAtlas()` (`rg-atlas/run.ts:22`) | Already imported live in `src/mcp/server.ts` |
  | `SEARCH_SEMANTIC` | `searchCodebaseAnn()` (`search/qdrant-search.ts:252`) | Exported function confirmed |
  | `EXPAND_GRAPH` | `graph_expand_neighborhood` MCP tool / `expandGraphBounded()` (`graph/graph-retrieval-adapter.ts:32`) | Both confirmed real; the MCP tool is likely a thin wrapper over `expandGraphBounded` |
  | `SHORTEST_PATH` | `graph_shortest_path` MCP tool (referenced in `ai/mcp-tool-dispatch.ts`, `ai/tool-shim.ts`) | Confirmed real via grep, matches the LLAMA_TO_MCP map in `scripts/atlas/runtime-mcp-tool-selector.mjs` |
  | `BOUNDED_BFS` | `expandGraphBounded()` (`graph/graph-retrieval-adapter.ts:32`) | Same underlying function as `EXPAND_GRAPH` — shared implementation, hop-bounded by design (matches `graph-contract.ts`'s `maxHops` schema field, min 1 max 3) |
  | `GET_CALLERS` | `graph_expand_neighborhood` MCP tool | Already confirmed in `ontology-kernel-end-to-end.spec.ts` |
  | `GET_CALLEES` | **NOT MAPPED** | Checked `ts-morph-semantic-enrichment.ts`, `mcp-tool-dispatch.ts`, `tool-shim.ts`, the `atlas-tools-mcp.mjs` script — no direct callee-direction-specific function found. May share `graph_expand_neighborhood` with a reversed edge direction, but that reversal wasn't confirmed to exist as a callable option — do not assume it does |
  | `GET_REFERENCES` | **NOT MAPPED** | Same search, same result — genuinely not found |
  | `GET_SOURCE_SPAN` | `atlasSymbolVersions` (`db/schema/atlas-structural-intelligence.ts:48`) | Already confirmed in `ontology-kernel-end-to-end.spec.ts` |
  | `GET_AST_EVIDENCE` | `adaptAstGrepMatches()` (`packages/parent-atlas/src/core/ast-grep-observation-adapter.ts:55`) | Exported function confirmed |
  | `INTERSECT_ELIGIBILITY` | `assertSemantic768()` (`embedding/embedding-contract-768.ts:103`) | Confirmed real; gates representation ACTIVE/VERIFIED eligibility per the Phase 110 registry model referenced elsewhere in this repo (`api/retrieval/dual-lane`) |
  | `RERANK` | `rerankCanonicalFeatureEnvelopes()` (`retrieval/canonical-rerank-executor.ts:690`) | Confirmed real; this is the repo's own designated canonical reranker (see CLAUDE.md's "14 reranker files" duplication-audit finding — this one is the confirmed-canonical owner) |
  | `VALIDATE_SCHEMA` | Zod `.parse()`/`.safeParse()` | Generic — every `*V1Schema` in this repo already uses this; no single dedicated wrapper exists or is needed |
  | `RUN_TEST` | `npm run test` (`vitest`, `package.json:16`) | External process invocation, not a TS function — confirmed script exists |
  | `RUN_TYPECHECK` | `npm run check` (`svelte-check`, `package.json:15`) | Same — external process invocation, confirmed |
  | `COMPARE_REVISION` | `assertFanoutBundleRevisions()` (`atlas/context/fanout-evidence-bundle-v1.ts:85`) | Confirmed real; asserts revision consistency across an evidence bundle — closest real match to "compare revisions" semantics |
  | `BUILD_CONTEXT` | `assembleACEContext()` / `buildACEPromptCached()` (`features/ai/ace/context-assembler.ts:1443,4578`) | Already confirmed in `ontology-kernel-end-to-end.spec.ts` |

  **Still not OAK-01-complete**: (1) `GET_CALLEES`/`GET_REFERENCES` have no confirmed implementation
  — either a real gap in this repo's tooling, or an existing function under a name this audit
  didn't think to search for; (2) none of the 22 candidate mappings above have actually been wired
  into `kernel-operator-library-v1.ts`'s executor dispatch yet — this is an inventory, not a build.

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

**OAK-07 replay proof 2026-08-31:** the focused planner suite now replays
the same manifest, catalog, function, arguments, and evidence twice and
requires identical action and plan checksums (`6/6` focused tests). This is
deterministic contract proof only; no action execution, schema inspection,
or kernel freeze is claimed. The next gate is the read-only schema-ledger
canary.

**OAK-CANARY-01 readiness 2026-08-31:** live schema inspection is healthy,
but the read-only migration checks block any schema-ledger canary. The live
database migration maximum is `0` while the Drizzle journal reaches `41`;
`107` SQL files are outside the journal, `feature_registry` is missing from
the migration-owner manifest, and migration hash/latest-applied parity is
unproven. No migration or schema write was performed. Receipt:
`docs/reports/oak-schema-ledger-canary-readiness-v1.json`. The next action is
migration-owner and ledger reconciliation, not applying a new migration.

**Migration reconciliation follow-up 2026-08-31:** `npm run audit:drizzle`
confirmed the live database is reachable and checked eight contract mirrors:
`3` are statically and live aligned, `feature_registry` is live-missing, and
the remaining blockers are explicit static/live column or index mismatches on
`kanban_tasks`, `task_semantic_packets`, `atlas_packets`,
`nes_chrom_packets`, `parent_atlas_documents`, and `route_runtime_packets`.
The audit performed no writes. Do not apply a feature-registry or Kanban
migration until one migration owner and a reconciled ledger are selected.
Evidence: `docs/reports/postgres-contract-mirrors-report.json`.

**Live object correction 2026-08-31:** a direct read-only PostgreSQL catalog
check confirms `kanban_tasks`, `kanban_task_dependencies`,
`kanban_task_comments`, `kanban_task_events`, and `kanban_task_attempts` are
present. Therefore Kanban is not a missing-table migration target; its
remaining issue is static index/schema reconciliation. `feature_registry`
remains the genuinely absent live table. This supersedes older summaries
that described all `kanban_*` tables as absent; no database writes were made.

**Feature-registry owner trace 2026-08-31:** the canonical Drizzle owner is
already `src/lib/server/db/schema/feature-registry.ts`, with the base table
defined by journaled migrations `0024_nebulous_mongoose.sql` and
`0025_yellow_tony_stark.sql`. The separate
`manual/0048_feature_registry_queries.sql` file owns only
`feature_registry_queries` and must not be used to create `feature_registry`.
The live mirror remains `LIVE_TABLE_MISSING`; therefore the next safe step is
to reconcile why the journaled `0024/0025` history is absent from the live
migration ledger, not to author a duplicate feature-registry migration.

**Ledger direct readback 2026-08-31:** the configured local connection is
`legal_ai_db`, schema `public`; `drizzle.__drizzle_migrations` exists but has
zero rows. The same read-only query confirms `public.feature_registry` is
absent while `public.kanban_tasks` is present. This rules out a populated
ledger hidden under the wrong database and keeps migration repair blocked
until the operator reconciles the empty ledger against the existing live
objects and journal history.

**Pre-apply guard hardening 2026-08-31:** `scripts/atlas/schema/pre-apply-
check.mjs` now loads repository environment files and performs a read-only
live-ledger sanity check. It correctly blocks with
`MIGRATION_LEDGER_UNRECONCILED` when the Drizzle ledger has `0` rows while
`4` known public schema objects exist. The guard syntax check passed; no
migration was attempted. Receipt: `docs/reports/schema/pre-apply-check.json`.

**Drizzle consistency follow-up 2026-08-31:** `drizzle-kit check` passes,
showing the journal is internally parseable. The migration SQL safety lint
remains blocked across historical and manual SQL (`160` BLOCKs, `347` WARNs,
`318` notes), including destructive or lock-sensitive statements. This is
not a reason to repair old files in bulk or apply them; migration ownership
and live-ledger reconciliation remain prerequisites for any new migration.
Receipt: `docs/reports/schema/migration-safety-report.json`.

**ONTO-PY-04A 2026-08-31:** added the deterministic NetworkX snapshot
boundary at `python/parent_atlas_ontology/networkx_snapshot.py`. It assigns
derived GraphOrdinal values from sorted node identities, preserves n-ary
relations as reified relation nodes, canonicalizes node/edge records, and
proves two-run projection replay parity. Focused test: `1/1`. This is a CPU
oracle/projection proof only; cuGraph parity, OWL reasoning, and all writes
remain unperformed. Receipt: `docs/reports/oak-python-networkx-projection-v1.json`.

**ONTO-PY-04B capability probe 2026-08-31:** the current Windows Python
runtime has `torch` installed but neither `cudf` nor `cugraph`. cuGraph parity
was therefore not attempted and no RAPIDS installation was performed. The
NetworkX projection remains `NETWORKX_ORACLE_PROVEN`; GPU parity requires the
configured WSL/Linux RAPIDS runtime.

**WSL RAPIDS follow-up 2026-08-31:** the configured WSL2 runtime was also
probed read-only. `cudf`, `cugraph`, and `torch` are unavailable there, and
the RAPIDS service at `127.0.0.1:8098` is unreachable. GPU parity therefore
remains open; no packages, services, or containers were started or changed.

**ONTO-PY-04A BFS extension 2026-08-31:** the NetworkX CPU oracle now emits
a revision-bound, depth-limited BFS receipt with deterministic GraphOrdinal
distances and predecessors. The bounded traversal preserves path
reconstruction while remaining derived and read-only. GPU parity is still
open because cuGraph is unavailable. Receipt:
`docs/reports/oak-python-networkx-projection-v1.json`.

**ONTO-PY-04A validation 2026-08-31:** the broader semantic ontology
projection suite passed `7` tests with `1` optional RDFLib test skipped because
RDFLib is not installed; the dedicated snapshot/BFS suite passed `2/2`.
NetworkX multigraph, n-ary reification, PageRank derivation, provenance
identity, and bounded BFS behavior are validated. RDF interchange and
cuGraph execution remain separate availability gates.

**ONTO-PY-04 canonical-path validation 2026-08-31:** the existing
`python/parent_atlas_ontology/graph_projection.py` contract was replayed with
the real ontology fixture. `ONTO-PY-04` passed all bounded checks: one
reified relation node, three externally-resolved participant edges, one
explicitly skipped participant, no participant clique edges, stable role
codes, and identical checksums across two runs. That existing path remains
the canonical Python projection contract; snapshot/BFS helpers are derived
serialization and traversal supplements only.
Receipt: `docs/reports/ontology-linked-tuple-graph-projection-parity-v1.json`.

**ONTO-PY-02 capability probe 2026-08-31:** the current Python environment
does not provide `rdflib`, `owlrl`, or `pyshacl`. RDF/JSON-LD interchange,
OWL-RL closure, and SHACL validation remain unavailable optional lanes; no
dependency installation was performed. The NetworkX CPU projection remains
independently proven.

**Historical-note correction:** older text below that says OAK-07 was not
started predates the now-built adaptive plan and kernel-bound planner. The
current status is contract + deterministic replay proven; action execution,
schema-ledger canary, and kernel freeze remain open.

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

## ONTO-PY — Python execution/interoperability layer for `OntologyLinkedTupleV1`

Separate from the OAK-XX kernel-construction queue above (this is about
adding a Python-side adapter for an *existing* contract, not building any
part of the kernel), but recorded in this file since it was scoped in the
same conversation and touches adjacent territory (Python + reasoners).

**Boundary, stated explicitly per the operator's design**: Postgres +
`sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`
remain the sole semantic owner of `OntologyLinkedTupleV1`. This package is
a typed VIEW/adapter only — it creates no new identity, no new envelope,
and (checked directly in `models.py`'s own docstring) deliberately omits
`create_identity()`/`mint_tuple_id()`/`guess_symbol()`/
`resolve_canonical_id_from_embedding()`-shaped functions, since those are
Parent Atlas authority operations, not adapter operations.

**Located first, per the operator's `safe_next_command`, before writing
any Python (audit-first discipline, same as everywhere else this
session)**: the real schema is
`sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`
(`OntologyLinkedTupleV1Schema`, `buildOntologyLinkedTupleId`,
`buildOntologyLinkedTuplesFromClassification`,
`buildOntologyLinkedTuplesFromFeatureRow`), and the real Postgres writer
is `ontology-linked-tuple-postgres.ts`'s `persistOntologyLinkedTuples()`
against `atlas_ontology_linked_tuples`
(`drizzle/manual/20260825_atlas_ontology_linked_tuples.sql`) — confirmed
live, not assumed.

### ONTO-PY-01 — TS fixture → Python typed representation → checksum parity — **DONE 2026-08-31**

- [x] **Fixture generator**: `scripts/atlas/generate-ontology-linked-tuple-fixture-v1.mts`
  imports the REAL `OntologyLinkedTupleV1Schema` directly (not a hand-
  copied shape) and validates one fixture through `.parse()` before
  writing it — so the fixture can never silently drift from the
  canonical contract. Per the operator's explicit instruction, it's a
  **genuine 4-participant n-ary relation** (`cause`/`effect`/`evidence`/
  `tool` roles over real schema-legal `entityKind` values), not a
  trivial binary edge — exactly the shape a naive pairwise-edge
  flattening would lose information on. Written to
  `docs/reports/fixtures/ontology-linked-tuple-fixture-v1.json`.
- [x] **Python typed model**: `python/parent_atlas_ontology/models.py` —
  frozen dataclasses mirroring every real field name from the TS schema
  (not the operator's simplified illustrative shape — the actual full
  field set, so nothing here can drift from what Postgres persists).
  `participants` stays a Python tuple for its immutability, but its
  members are `OntologyParticipantV1` instances with named
  `entityId`/`entityKind`/`role`/`label` fields — not positional values,
  per the operator's own "position silently becomes semantics" warning.
- [x] **Checksum parity**: `python/parent_atlas_ontology/checksum.py`
  mirrors the exact stable-JSON + sha256 algorithm every TS file in
  `packages/parent-atlas/src/core/` already uses (recursive key-sort,
  then hash). **Stated normalization, not hidden**: keys with `None`
  values are dropped before hashing on both sides, because Zod's
  `.optional()` (non-nullable) fields are entirely absent from
  `JSON.stringify` output when unset, while Python's `to_dict()` always
  emits every field — dropping `None` keys makes the two sides compare
  as the correct semantic equivalent, and `checksum.py`'s docstring says
  this is a normalization, not a byte-identical-JSON claim.
  `onto_py_01_parity_check.py` round-trips the fixture through
  `from_dict()`/`to_dict()` and asserts 8 checks, all passing: tuple id
  preserved, participant count/roles/order/entityIds preserved (the
  specific n-ary-losing-information risk), evidence refs preserved,
  confidence preserved, provenance preserved, and canonical checksum
  parity. **Result: PASS, 8/8 checks.** Report at
  `docs/reports/ontology-linked-tuple-python-adapter-parity-v1.json`
  (exact path the operator specified).

**Run it**:
```bash
cd sveltekit-frontend && npx tsx ../scripts/atlas/generate-ontology-linked-tuple-fixture-v1.mts
cd .. && python python/parent_atlas_ontology/onto_py_01_parity_check.py
```

### Review fix (2026-08-31): class boundary + real validation

The operator reviewed ONTO-PY-01/03 against the original spec and found
two real gaps (not style nitpicks):
1. The spec'd one `OntologyLinkedTupleAdapter` class
   (`validate()`/`to_rdf()`/`to_arrow()`/`to_graph_projection()`); the
   session had built separate module-level functions instead.
2. `models.py`'s `from_dict()` was structural-only — it trusted every
   enum value (`labelKind`, `role`, `entityKind`, `evidenceState`, etc.)
   was already valid because the fixture was TS-validated first. A raw
   dict from anywhere else would have sailed through with a bad enum
   value or an out-of-range `confidence` and nothing would have caught
   it — a real gap against Zod's `.parse()` enforcement on the TS side,
   not a hypothetical one.

**Both fixed 2026-08-31**:
- [x] **`enums.py`** — every enum value set copied verbatim from the real
  TS `z.enum([...])` literals (cited by file/line in the docstring), not
  approximated. States its own limitation honestly: no shared codegen
  step exists between the two languages yet, so this file must be
  re-synced by hand if the TS enums ever change.
- [x] **`validation.py`** — `validate_ontology_linked_tuple()` performs
  real enforcement: every enum field checked against its real value set,
  `confidence` range-checked, `tokenIndex`/`evidenceSpan.start` range-
  checked, `evidenceSpan.end >= start` checked, all five array-length
  caps checked (`ontologyIds`≤32, `conceptIds`≤32, `participants`≤16,
  `evidenceRefs`≤32, `provenance.sourceTables`≤12), every participant's
  `entityKind`/`role` checked individually. **Collects every issue found
  and raises once** (`OntologyLinkedTupleValidationError`), mirroring
  Zod's multi-issue reporting rather than failing on the first problem.
- [x] **`adapter.py`** — `OntologyLinkedTupleAdapter` class, exact method
  shape from the spec. `validate()`/`to_arrow()` are real. `to_rdf()`/
  `to_graph_projection()` **raise `RuntimeError` with a clear reason**
  (rdflib not installed; NetworkX projection not implemented) rather than
  silently no-opping or returning a fake success — the same
  CREATED/NOT_PROVEN discipline applied everywhere else this session.
  Confirmed both actually raise via direct execution, not assumed.
- [x] **`onto_py_validation_check.py`** — proves the validator actually
  rejects bad data, not just accepts good data (accepting the fixture
  alone can't distinguish real validation from a no-op). **5/5 checks
  pass**: valid fixture passes unchanged; bad top-level enum rejected;
  out-of-range confidence rejected; bad *nested* participant-role enum
  rejected; three simultaneous issues all reported in one raise (not
  just the first). Report at
  `docs/reports/ontology-linked-tuple-python-validation-check-v1.json`.
- [x] Re-ran ONTO-PY-01 and ONTO-PY-03's parity checks after adding
  `adapter.py` (which imports `arrow_adapter.py`) — both still **PASS**,
  confirming the new class layer didn't disturb the existing modules.

**Run it**: `python python/parent_atlas_ontology/onto_py_validation_check.py`

### Real duplication found and reconciled (2026-08-31): `atlas_semantic_ontology_projection.py`

While extending ONTO-PY-04, discovered a concurrent process had
independently built `python/atlas_semantic_ontology_projection.py`
(615 lines, own test suite, 7/7 passing) — a more general
`SemanticAssertion`/`NarySemanticRelation` substrate doing the SAME
"relation node, never a pairwise clique" NetworkX projection design as
this session's own `graph_projection.py`, plus real RDFLib projection
(closing ONTO-PY-02), PageRank, OWL-RL closure, SHACL validation, and an
`owlready_reasoning_plan()`. Confirmed via grep that nothing bridged the
two systems and neither referenced the other — a genuine, unresolved
duplication, not a false alarm. A test file
(`test_networkx_snapshot_replay.py`) had also been placed *inside* this
session's own `parent_atlas_ontology/` package while importing from the
*other* module — a real signal something needed reconciling, not
something to silently work around.

**Did not resolve this unilaterally** — presented the two systems to the
operator directly rather than guessing which should win, per this
change's own "when ownership can't be established, stop and record the
ambiguity" discipline (already used for the JVM and rdflib decisions).
**Operator decision: layer `OntologyLinkedTupleV1` on top of the shared
substrate.** `atlas_semantic_ontology_projection.py` becomes the general
projection substrate; `OntologyLinkedTupleV1` converts into its types
and delegates, instead of `graph_projection.py` re-implementing the same
projection logic a second time.

**Built**:
- `semantic_bridge.py` — `ontology_linked_tuple_to_nary_relation()`
  converts `OntologyLinkedTupleV1` → `NarySemanticRelation`. Field
  mappings stated explicitly, not silently guessed (a genuinely
  ambiguous two-schema mapping): `relation_id`←`tupleId` (exact),
  `relation_type`←`label` (closest fit), `source_revision`←
  `provenance.sourceRevision` falling back to `relationRevision` falling
  back to `"unknown"` (their schema requires non-empty; ours is fully
  optional — a real gap-filling choice, documented as such), `domain_class`
  left `None` (no honest mapping exists — using `labelKind` would have
  been a guess, not a mapping).
- `adapter.py` updated: `to_rdf()` and `to_graph_projection()` now
  delegate to `atlas_semantic_ontology_projection.py`/
  `networkx_snapshot.py` via the bridge. `to_rdf()`'s signature changed
  (list of tuples, not one) and still correctly raises (from inside the
  shared substrate now, not a local stub) since `rdflib` remains
  uninstalled. `to_graph_projection()`'s signature changed too — no more
  externally-supplied `ordinal_map`; the shared substrate self-assigns
  dense ordinals from sorted node-identity strings.
- `graph_projection.py` **kept, not deleted** — marked superseded as the
  adapter's default path in its own docstring, but still real, tested,
  and it surfaced a genuine still-open finding worth keeping on record
  (no `relation:` prefix in `GraphNodeKeyV1` yet). Its own standalone
  test (`onto_py_04_graph_projection_check.py`) was fixed to call
  `project_to_graph()` directly instead of through the now-redirected
  adapter method — preserving the concurrent process's own extension to
  that test (`operational_projection_has_one_coordinate_universe`) rather
  than breaking or silently discarding it. **Still 9/9 checks pass.**
- **`onto_py_04b_delegated_networkx_check.py`** (new) — proves the
  delegation actually works end to end against the real fixture, not
  just that the bridge type-checks: bridge preserves relation id/type/
  all 4 participants in order/roles/evidence refs; the delegated snapshot
  reifies exactly 1 relation node with exactly 4 participant-incidence
  edges (never `C(4,2)=6` pairwise edges); deterministic across two
  calls; `canonical_authority`/`writes_performed` both `false`.
  **Result: PASS, 11/11.** Notably, delegation resolves **all 4**
  participants (including the `tool_call` one `graph_projection.py`'s
  ordinal_map-bound design had to skip) — a genuine improvement, not
  just a lateral move, since the shared substrate doesn't need an
  externally pre-resolved ordinal.

**Full sweep re-verified together** after reconciliation: all 5 ONTO-PY
check scripts (01/03/validate/04/04b) plus both pytest suites
(`test_atlas_semantic_ontology_projection.py`,
`test_networkx_snapshot_replay.py`) — **9 passed, 1 skipped** (the skip
is real and pre-existing, an optional-dependency guard inside the other
module's own test suite, not something this reconciliation touched).

### ONTO-PY-02, and 05 — remaining, updated status

- **ONTO-PY-02** (tuple → RDFLib → RDF, deterministic replay): the
  *code path* now exists — `adapter.to_rdf()` delegates to
  `atlas_semantic_ontology_projection.build_rdflib_dataset()` (see
  reconciliation section above) — but is still genuinely **NOT_PROVEN**:
  **`rdflib` is not installed** in this environment — checked directly
  (`import rdflib` → `ModuleNotFoundError`), not assumed, and re-
  confirmed still true after the reconciliation. `pyarrow` (21.0.0) and
  `networkx` (3.3) ARE already installed, confirmed the same way. Held
  rather than silently `pip install`ing a new dependency without
  checking this repo's existing per-feature `python/requirements-*.txt`
  convention first (`requirements-atlas-live-graph.txt`,
  `requirements-langextract.txt`, etc. already exist as precedent for
  scoped Python capability deps) — a `requirements-ontology-adapter.txt`
  should follow that pattern, but adding the dependency itself wasn't
  done without flagging it first, matching the same discipline applied
  to the OAK-03B/03C JVM decision above. Once `rdflib` is actually
  installed, `to_rdf()` should already work with zero further code
  changes — the delegation is real, only the dependency is missing.
- ~~**ONTO-PY-03** (tuple → Arrow IPC round-trip)~~ — **DONE 2026-08-31.**
  `python/parent_atlas_ontology/arrow_adapter.py` — the nested-struct
  Arrow schema the operator specified (`participants` as
  `list<struct<entityId, entityKind, role, label>>`, one atomic nested
  column rather than four parallel positional lists — the same
  "position silently becomes semantics" risk this whole package exists
  to avoid). `onto_py_03_arrow_parity_check.py` round-trips the same
  fixture through REAL Arrow IPC bytes (`pa.ipc.new_stream`/
  `open_stream`, not just an in-memory `Table` — the actual wire format
  a Go/GPU consumer would read), and asserts 9 checks, all passing:
  row count, tuple id, participant count/roles/order/entityIds, evidence
  refs, confidence, evidence span, and canonical checksum parity.
  **Result: PASS, 9/9.** Report at
  `docs/reports/ontology-linked-tuple-arrow-parity-v1.json`. Run:
  `python python/parent_atlas_ontology/onto_py_03_arrow_parity_check.py`.
- ~~**ONTO-PY-04** (NetworkX projection)~~ — **NetworkX half DONE
  2026-08-31, cuGraph half NOT built.** `python/parent_atlas_ontology/
  graph_projection.py` — `project_to_graph()` projects one **relation
  node per tuple** connected to every ordinal-resolvable participant
  (`relation:{tupleId} -> ordinal:{N}` edges), **never pairwise
  participant-to-participant edges** — exactly the operator's design,
  verified by an explicit test (`no_pairwise_participant_to_participant_edges`).

  **Real gap found while designing this** (checked directly against
  `graph-node-key-v1.ts`'s actual regex, not assumed): a relation node
  cannot be assigned a real, canonical `GraphNodeKeyV1` today — the
  regex is `^(symbol|packet|chunk|occurrence):.+$`, no `relation:`
  prefix exists. So relation nodes get their own **separate, local,
  non-canonical** dense ordinal space (sorted-by-tupleId, same
  determinism style as the real `buildGraphOrdinalMapV1`), clearly
  documented as executor-local — not silently smuggled into the
  canonical ordinal space. This is real, unattempted TS-side scope
  (adding a `relation:` prefix, or an equivalent decision) flagged for
  whoever owns `graph-node-key-v1.ts`, not fixed here.

  `ordinal_map` is deliberately opaque and externally supplied — this
  module never derives `entityKind → GraphNodeKeyV1` mappings itself
  (that would be guessing at identity resolution that belongs on the
  TS/Postgres side, the exact thing every adapter file in this package
  is built to avoid). Participants whose `entityId` isn't in the
  supplied map are **skipped and reported**, not crashed on and not
  fabricated an ordinal for — verified with a real negative case, not
  just a happy path: the fixture's 4th participant
  (`tool_call:typecheck-run-42`) has no defined `GraphNodeKeyV1`
  derivation, deliberately left out of the test's `ordinal_map`, and the
  check confirms it's reported in `skippedParticipants` rather than
  silently dropped or causing a crash.

  Also built the compact GPU ABI the operator specified
  (`GraphEdgeProjectionV1`: `sourceOrdinal`/`destinationOrdinal`/
  `relationOrdinal`/`roleCode`), with `roleCode` a stable integer
  encoding derived from the real `PARTICIPANT_ROLE_VALUES` set (sorted,
  so deterministic across runs/versions).

  `onto_py_04_graph_projection_check.py` — **8/8 checks pass**: exactly
  one relation node, exactly 3 of 4 participants resolved (the 4th
  correctly skipped), no participant-to-participant edges exist, edge
  roles match the original tuple's roles, role codes are stable/distinct,
  destination ordinals match the supplied map, and the whole projection
  is deterministic (identical checksum across two independent runs).
  Report at `docs/reports/ontology-linked-tuple-graph-projection-parity-v1.json`.
  Run: `python python/parent_atlas_ontology/onto_py_04_graph_projection_check.py`.

  **cuGraph parity NOT attempted**: a separate, heavier GPU-library
  dependency question, same category as the JVM/rdflib decisions already
  held pending operator input this session — not silently added.

- **ONTO-PY-05** (same semantic payload → `AtlasPassEnvelopeV2` →
  checksum/revision replay): **audit done 2026-08-31 — confirmed absent,
  not just unverified.** `AtlasPassEnvelopeV2` (and every close-name
  variant: `PassEnvelope`, `AtlasPassEnvelope`) does not exist anywhere
  in this repo — checked `packages/parent-atlas`, `sveltekit-frontend/
  src`, and `openspec/` (the only hit there is this file's own prior
  note about it). No TS code, no Python, no other design doc.

  **Deliberately not built here.** The operator's own field list for it
  (`workspaceRevision`, `sourceRevision`, `graphRevision`,
  `producerRevision`, `inputChecksum`, `outputChecksum`,
  `idempotencyKey`) describes a general-purpose EXECUTION envelope
  meant to wrap the output of any pass/adapter across this repo, not
  something scoped to `OntologyLinkedTupleV1` specifically — inventing
  it unilaterally from inside a Python-adapter task would mean deciding
  a cross-cutting, repo-wide contract shape without operator sign-off,
  the same category of decision this session has held for the JVM
  (OAK-03B/03C) and rdflib (ONTO-PY-02) choices rather than making
  silently. Same pattern as the earlier `AdaptiveDagPlanV1` finding this
  session (also confirmed absent, then later built for real by the
  concurrent process, then reconciled) — flagged here so whoever builds
  `AtlasPassEnvelopeV2` for real (TS side, most likely, given every
  other cross-cutting envelope contract in this repo lives there) knows
  this Python adapter is a ready, waiting consumer.

## Architectural correction (2026-08-31): OaK is the agent-control pattern, OWL/HermiT is one construction-time validator inside it

The operator corrected the framing this whole change had drifted toward:
OWL/HermiT is not the center of the OaK work — it's one validator used
*while building* the kernel schema `S`. OaK itself is `K=(S,F)`: schema +
typed executable reasoning functions, frozen at inference time so a
ReAct agent can only operate through them. Recorded the full mapping
table (OaK concept → Parent Atlas contract) and the operator's updated
9-item implementation queue in the conversation transcript — not
duplicated verbatim here to avoid this file drifting out of sync with
the source; read the transcript's "Updated implementation queue" if
picking this up fresh. Two concrete corrections already actioned below
(`OAK-PROJECTION-01`); the rest
(`SYMBOL-SEMANTIC-BRIDGE-01`/`OAK-KERNEL-01`/`OAK-GPU-01`/
`OAK-BFS-PARITY-01`/`OAK-REPAIR-01`/`DSPY-PROGRAM-01`/`GEPA-SHADOW-01`)
are not started — several are blocked the same way as OAK-03B/C and
ONTO-PY-02 (real external dependency decisions: `cudf`/`cugraph`/`dspy`
all confirmed **not installed** in this environment via direct `import`
checks, not assumed, same category as the JVM/rdflib holds already on
record).

## OAK-PROJECTION-01 — `ProjectionNodeKeyV1` + `ProjectionOrdinalMapV1` — **DONE 2026-08-31**

The operator's exact correction to this session's own earlier
`GraphNodeKeyV1`-gap finding (in the "Real duplication found" section
above): OaK query-graph nodes (relation/tuple/tool/evidence) do **not**
extend the durable `GraphNodeKeyV1`/`GraphOrdinal` coordinate space —
they get their own, separate, non-canonical coordinate space instead.

- [x] **TS contract**: `packages/parent-atlas/src/core/projection-
  ordinal-map-v1.ts` — `ProjectionNodeKeyV1` (regex-prefixed,
  `entity|tuple|hyperedge|tool|evidence:`), `ProjectionOrdinalMapV1`
  (rows sorted + dense-ordinal-assigned, same determinism convention as
  the durable `GraphOrdinalMapV1`), `buildProjectionOrdinalMapV1()`.
  Guardrails, all tested: only `ENTITY` rows may cross-reference a real
  `GraphNodeKeyV1`/`graphOrdinal` (non-`ENTITY` rows claiming durable
  identity are refused); `TUPLE`/`HYPEREDGE` rows require their id field;
  `projectionNodeKey` prefix must match `nodeClass`; duplicate keys and
  missing revisions refused. **6/6 tests pass.** Whole-suite re-verified
  after adding this: **31/31 spec files, 133/133 tests** (up from 30/126).
- [x] **Python side migrated**: `python/parent_atlas_ontology/
  projection_ordinal_map.py` — field-for-field mirror of the TS builder
  (same validation rules, same sort/dense-ordinal convention), plus
  `projection_ordinal_map_from_networkx_snapshot()` which converts the
  shared substrate's NetworkX snapshot output into this coordinate
  space, replacing `graph_projection.py`'s old ad-hoc `relation:{id}`/
  `ordinal:{N}` labels for anything going through the adapter's
  delegated path. `NARY_RELATION` node_kind → `TUPLE`; `ENTITY` →
  `ENTITY`; `LITERAL_ASSERTION` is honestly **not mapped** (no fit among
  the 5 classes) — skipped and reported, not force-fit, matching this
  package's existing skip-and-report discipline. The real fixture never
  produces `LITERAL_ASSERTION` nodes, so this is a documented future gap,
  not something exercised or hidden.

  **Rough edge found and left on record, not silently smoothed**: the
  resulting `TUPLE` row's `projectionNodeKey` comes out as
  `tuple:relation:<tupleId>` — double-labeled, because the underlying
  NetworkX node id from the shared substrate is already `relation:{id}`.
  Still a valid, correctly-prefixed key per the regex, just redundant;
  worth a small cleanup later (strip the `relation:` sub-prefix before
  applying `tuple:`) but not a correctness bug blocking this gate.

  `onto_py_05_projection_ordinal_map_check.py` — **10/10 checks pass**
  against the real ONTO-PY-01 fixture through the full delegated chain
  (fixture → adapter → shared substrate → this new coordinate space):
  correct schema, `canonicalAuthority: false`, exactly 1 `TUPLE` row + 4
  `ENTITY` rows (matching the fixture's 1 tuple / 4 participants), rows
  sorted with dense ordinals, deterministic checksum across two
  independent conversions, zero unexpectedly-skipped nodes, and both
  guardrail-rejection cases (non-`ENTITY` claiming durable identity;
  `TUPLE` missing `tupleId`) mirrored from the TS spec and confirmed to
  raise the same way in Python. Report at
  `docs/reports/ontology-linked-tuple-projection-ordinal-map-v1.json`.

  **Run it**: `python python/parent_atlas_ontology/oak_projection_01_check.py`
  (renamed from an earlier `onto_py_05_...` filename that collided with
  the existing ONTO-PY-05/`AtlasPassEnvelopeV2` item above — caught and
  fixed before committing, not left as drift.)

## "Where does it get indexed?" — real answer found, 2026-08-31

Operator asked where an `OntologyLinkedTupleV1`-derived graph actually
gets created/upserted/indexed in this repo. Checked directly rather than
guessing: the real destination is Postgres —
`atlas_graph_snapshots_v2`/`atlas_graph_nodes_v2`/`atlas_graph_edges_v2`
(`sveltekit-frontend/src/lib/server/db/schema/graph-authority-v2.ts`),
materialized via `graph-snapshot-materializer.ts`. Neo4j is a downstream
mirror from there, not a separate write target — matches this repo's
Postgres-is-truth rule.

**Real find**: that schema's own `graph-snapshot.ts` already ships a
`relation_event` `GraphNodeType` + `GraphRelationEventSchema`/
`GraphRelationParticipantSchema` (`PARTICIPATES_IN` edge type) — an
n-ary-relation representation nearly identical in spirit to this
session's own `ProjectionOrdinalMapV1` work, confirmed to already exist
rather than assumed absent (the audit-first discipline paying off again).

**Built**: `packages/parent-atlas/src/core/
ontology-tuple-to-graph-relation-v1.ts` — `projectOntologyTupleToGraphRelationV1()`,
a pure projection from `OntologyLinkedTupleV1` shape into that real
schema's row shapes (`relationNode`/`participantNodes`/`relationEvent`/
`participants`). Deliberately scoped tight given remaining context
budget this session: **does NOT** perform the live Postgres write,
create a snapshot, or compute a real `topologyHash` (needs the whole
snapshot's edge set — a `PLACEHOLDER_NOT_REAL_TOPOLOGY_HASH`-prefixed
stand-in is used, clearly labeled so nobody mistakes it for real). That
orchestration (snapshot lifecycle, hash policy, actual `db.insert()`
calls) is a bigger, more consequential piece than this pass safely
allows — not attempted, not guessed at.

**Honest gap found while building**: `GraphNodeTypeSchema` doesn't cover
most of `OntologyLinkedTupleParticipantKindSchema`'s values (`tool_call`,
`citation`, `screenshot`, etc.) — only `ast_symbol`→`symbol`,
`packet`→`packet`, `concept`/`topic`→`concept` have an honest mapping.
Unmapped participants still get a real `GraphRelationParticipant` row
(participation doesn't require a typed node), but are NOT also forced
into a wrong `GraphNode` type — reported in `unmappedNodeKinds` instead.

**Verified**: package rebuilds clean; **6/6 tests pass** (one relation
node never a pairwise clique; all 4 participants preserved in order/
role; 3 of 4 correctly mapped to real `symbol` nodes; the 4th honestly
reported unmapped; evidenceSpan correctly serialized to the schema's
required string shape; deterministic). Caught and fixed a real test-
fixture bug in the same pass: an invalid placeholder UUID
(`11111111-1111-1111-...`) failed Zod's strict RFC4122 variant-nibble
check — not a bug in the production code, but worth recording since it's
exactly the kind of thing that's easy to wave off as "just a test."

**Next step for whoever continues this**: wire the actual snapshot
orchestration — decide whether ontology-tuple relation graphs share the
SAME `atlas_graph_snapshots_v2` snapshot as the packet/tree-node graph
or get their own, then compute a real `topologyHash`, then call
`db.insert()` against `graphNodesV2`/`graphEdgesV2` (or the relation-
event-specific tables if they're separate — not checked this pass).

## Continued 2026-08-31 (same session, "continue here carefully" after context-budget check-in)

**Real, hard FK constraint found**: `atlas_graph_relation_participants_v2.nodeFk`
requires a participant's `nodeKey` to already exist as a real
`atlas_graph_nodes_v2` row in the same snapshot. `projectOntologyTupleToGraphRelationV1()`
updated accordingly: participants with no honest `GraphNodeType` mapping
(`tool_call` etc.) are now EXCLUDED from the write-eligible
`participants`/`participantNodes` sets entirely (writing a row that
violates the FK isn't an option; inventing a new node type unilaterally
isn't either), reported fully in `unmappedNodeKinds`, never silently
dropped. The placeholder `topologyHash` is now a REAL sha256 over the
actual write-eligible content. **7/7 tests pass** (up from 6, added a
determinism + a hash-changes-with-content-changes check).

**Real graph-authority tables were also found and used, not two dedicated
tables assumed to not exist**: `atlas_graph_relation_events_v2`/
`atlas_graph_relation_participants_v2` (`graph-authority-v2.ts` schema)
— the exact real destination for the relation-event/participant shape,
confirmed by reading the schema directly rather than guessing.

**Writer built, extending the real existing repository, not a new
competing file**: found `createGraphAuthorityV2Repository()` in
`sveltekit-frontend/src/lib/server/db/graph-authority-v2.ts` (an
established, already-used factory taking `database` as a dependency-
injected param) — added `writeOntologyTupleRelationGraphV2()` to it
rather than starting a separate writer file. Upserts node rows (relation
node + FK-eligible participant nodes), the relation event row, then the
participant rows, all via the same `onConflictDoUpdate` pattern the rest
of that file already uses.

**Deliberately NOT_PROVEN against a live database.** Real,
type-consistent code — not a stub — but not executed here. Writing to a
live/shared Postgres instance under session context pressure, without
being able to carefully verify the target environment first, is exactly
the kind of consequential action this repo's own instructions say to
slow down for. **Next step for whoever picks this up**: run
`writeOntologyTupleRelationGraphV2()` against a real dev database (needs
a real `atlas_graph_snapshots_v2` row created first — `createGraphSnapshotV2()`
already exists in the same repository), inspect the rows it actually
writes, and only then promote it from `CREATED` to `DRY_RUN_PROVEN`.

## DRY_RUN_PROVEN — 2026-08-31 (same session, continued after user "yes continue")

Ran the deferred next step above. Confirmed live via `docker exec legal-ai-postgres psql \d`
(not the Drizzle schema file) that `atlas_graph_snapshots_v2`/`atlas_graph_nodes_v2`/
`atlas_graph_relation_events_v2`/`atlas_graph_relation_participants_v2` match this session's
implementation exactly, including the `nodeFk` chain and `atlas_graph_snapshots_v2_status_check`
(`BUILDING`/`VALIDATED`/`SUPERSEDED`/`FAILED`) — no drift found.

**New proof script**: `scripts/atlas/prove-ontology-tuple-graph-write-v1.mts`. Follows the exact
low-dependency convention of the existing `prove-exact-promotion-live-dry-run.mts` — raw `pg.Pool`
+ `loadAtlasEnv()`, not the `$lib/server/db/client` SvelteKit import (which drags in Langfuse
observability + drizzle-cache unnecessarily for a one-off proof). Imports the real
`projectOntologyTupleToGraphRelationV1()` from `packages/parent-atlas/src/index.js`, creates a
real `BUILDING` snapshot row (confirmed via reading `graph-authority-v2.ts` that
`writeOntologyTupleRelationGraphV2()` has no status precondition — only `persistGraphAuthorityRunV2`
requires `VALIDATED`), performs the exact same upsert sequence as
`writeOntologyTupleRelationGraphV2()` (node rows -> relation event row -> participant rows, same
`ON CONFLICT ... DO UPDATE` semantics), reads every row back independently, asserts 6 checks, then
deletes everything it wrote in FK-safe dependency order.

**Result: `DRY_RUN_PROVEN`, 6/6 assertions passed** (`docs/reports/ontology-tuple-graph-write-dry-run.json`):
- `node_count_matches_projection` — 4 nodes written (relation node + 3 FK-eligible participants)
- `relation_event_row_written` — 1 row
- `relation_event_topology_hash_matches` — the written row's `topology_hash` matches the real
  sha256 the pure projection computed, byte for byte
- `participant_count_is_3_fk_safe_not_4` — the `tool_call` participant was correctly excluded from
  the write set (no honest `GraphNodeType` mapping — would have violated `nodeFk`)
- `tool_call_participant_excluded_from_write` — confirmed absent from the written rows
- `participant_roles_in_original_order` — `[cause, effect, evidence]`, ordinals preserved

**Cleanup verified independently**, not just trusted from the script's own report: a separate
`docker exec ... psql` count query against `atlas_graph_snapshots_v2` for the proof's snapshot_id
after the run returned `0` — the dev database carries zero residue from this proof.

**Status update**: `writeOntologyTupleRelationGraphV2()` and
`projectOntologyTupleToGraphRelationV1()` are now `DRY_RUN_PROVEN` (were `CREATED`/`NOT_PROVEN`).
Not yet `APPLY_PROVEN` — that would mean wired into a live pipeline call site (e.g. invoked from
wherever `OntologyLinkedTupleV1` rows are actually produced), which is a separate, larger piece of
work (needs a decision on whether ontology-tuple relation graphs share the canonical packet/
tree-node snapshot lifecycle or get their own — still not decided, flagged earlier in this file).
**Next step for whoever continues this**: wire a real call site, or explicitly scope this as a
standalone/on-demand capability rather than an always-on pipeline stage — that's a product decision,
not a technical one, and shouldn't be made unilaterally.

## SYMBOL-SEMANTIC-BRIDGE-01 — investigated, NOT implemented: real 4-way symbol-identity fragmentation found

Started auditing this (the one item from the operator's 9-item queue not blocked by a missing
dependency) before writing anything, per this repo's own "audit before you build" / "One Canonical
Runtime Owner Per Capability" rules. The audit surfaced a real, live, unreconciled fragmentation —
bigger than the single gap `ontology-tuple-to-graph-relation-v1.ts`'s docstring currently names —
so implementation stopped here and this is recorded instead, per this repo's explicit instruction:
*"If ownership can't be established, stop and record the ambiguity in an OpenSpec change — don't
implement past that point."*

**Four incompatible schemes for "the identity of an AST symbol node," all live/reachable, none
reconciled with each other:**

1. **`atlas_symbol_registry.stable_symbol_id`** (Postgres, confirmed live, **10,310 real rows**) —
   format `stable-symbol:<sha256hex-64chars>`, produced by
   `scripts/atlas/promote-ast-symbols-to-registry.mjs::stableSymbolIdFor(canonicalKey)`. This is
   the real, populated authority — has FK-referencing tables (`atlas_symbol_aliases`,
   `atlas_symbol_versions`, `atlas_structural_reference_resolutions`).
2. **`packages/parent-atlas/src/core/symbol-registry-repository.ts::canonicalStableSymbolId()`** —
   format `symbol:<sha256hex-sliced-to-40chars>`. Different prefix, different hash length, from a
   different hash input shape, than #1. **Confirmed DEAD**: `createSymbolRegistryRepository`
   (the only exported factory in this file) has exactly **one reference in the whole repo — its
   own definition**. Zero callers anywhere (`grep -rn createSymbolRegistryRepository` across all
   `.ts` files → 1 hit total). A real, load-bearing-looking module (has a symbol-resolution SQL
   query, promotion logic, a `SymbolRegistryReadbackReceiptV1` schema) that nothing calls.
3. **`packages/parent-atlas/src/core/graph-node-key-v1.ts::deriveGraphNodeKeyV1({symbolVersionId})`**
   — format `symbol:<symbolVersionId>` (where `symbolVersionId` is meant to come from
   `canonicalSymbolVersionId()`, itself only reachable from the dead #2 path). This is what this
   session's own `GraphNodeKeyV1`/`ProjectionOrdinalMapV1`/`ontology-tuple-to-graph-relation-v1.ts`
   work has been implicitly assuming is "the" durable symbol key format — it is a real, tested,
   exported function, but nothing in the live write path (see #4) actually calls it with a real
   `symbolVersionId` sourced from anywhere live.
4. **`graph-snapshot-materializer.ts`'s actual live writer of `atlas_graph_nodes_v2` rows with
   `node_type = 'symbol'`** (confirmed by reading the real materializer, not assumed) — keys every
   symbol-type node as **`tree:${treeNode.nodeId}`** (line ~322), sourced from tree-sitter parse
   output (`TREE_NODE_TYPE_MAP`), gated by `classifyCanonicalGraphEligibility()`'s real provenance
   checks (`extractionMethod === 'tree_sitter'`, `structuralTruth === true`, rejects the
   `batch-a-structural-materializer` heuristic producer — this file's own docstring records that
   146,655 heuristic 'symbol' nodes were previously let in at full trust and are now excluded).
   **This is the actual canonical `atlas_graph_nodes_v2` write path for symbol nodes** — and its
   key format (`tree:<treeNodeId>`) matches **none** of #1, #2, or #3.

**No reconciliation link found anywhere** (`grep`-checked, not assumed):
`stable_symbol_id`↔`tree:<treeNodeId>`, `symbol_version_id`↔`node_key` — zero hits in
`sveltekit-frontend/src`. A `tree:<treeNodeId>` node in the canonical graph snapshot and a
`stable-symbol:<hash>` row in the real, 10,310-row-populated symbol registry describing the exact
same physical function/class/interface have no queryable path between them today.

**Consequence for `projectOntologyTupleToGraphRelationV1()`** (this session's own function): its
docstring's `ast_symbol -> 'symbol'` mapping is honest about the `GraphNodeType` question but was
silently assuming scheme #3 for what a "real" symbol `entityId` looks like. Given the actual live
writer uses scheme #4, an `OntologyLinkedTupleV1` participant whose `entityId` happens to be a real
`stable-symbol:<hash>` (scheme #1, the one an ontology/NLP extraction pipeline would most plausibly
produce, since it's the one live, populated table) would **still fail to line up with any real node
already in a canonical `atlas_graph_nodes_v2` snapshot** — it would write a new, disconnected
`'symbol'` node keyed by the registry's id, coexisting in the same table as real tree-sourced
`tree:<treeNodeId>` symbol nodes with completely incompatible keys. Not a bug in the code written
this session (it does exactly what its own contract says — projects, doesn't invent identity), but
a real blocker for ever making this bridge meaningful.

**Not fixed here — this is a cross-cutting identity-authority decision, same category as every
other schema-owner call held open this session.** Candidate resolutions (not chosen, listed only
so whoever picks this up doesn't have to re-derive them):
- (a) Make `stable_symbol_id` (#1, the real populated registry) the one canonical symbol identity,
  and change `graph-snapshot-materializer.ts` to key symbol nodes by it instead of
  `tree:<treeNodeId>` — highest-value fix (unifies the *actual* live write path) but touches a
  file this repo's own governance treats as sensitive (real provenance-eligibility gating logic).
- (b) Add a mapping/join table (`tree_node_id -> stable_symbol_id`) rather than changing either
  writer — additive, lower-risk, but adds a permanent reconciliation-maintenance burden.
- (c) Archive #2/#3 (`symbol-registry-repository.ts`, and `deriveGraphNodeKeyV1`'s
  `symbolVersionId` branch specifically) as `DEAD`/`COMPATIBILITY` per this repo's own
  classification vocabulary, since neither is reachable from any live write path today — smallest,
  safest immediate action, doesn't require picking a winner between #1 and #4.
- (d) Do nothing yet; `OntologyLinkedTupleV1` production for `ast_symbol` participants doesn't
  exist as a live pipeline stage yet either (per the still-open `APPLY_PROVEN` gap above) — this
  whole question may be moot until that producer exists and its own author picks a scheme.

**Recommended immediate action if anyone wants a small, safe win here**: (c) — flag
`symbol-registry-repository.ts` `DEAD` in whatever runtime-ownership registry/audit this repo
already maintains (`docs/architecture/runtime-ownership-registry.json` /
`runtime-ownership-baseline.json`, referenced in root CLAUDE.md's "One Canonical Runtime Owner"
section) — pure bookkeeping, zero behavior change, zero risk. Not done in this pass since it's
still a real decision (confirming zero callers is not the same as confirming zero *intended future*
callers) and the operator hasn't been asked.

## OAK/DSPY/GEPA integration verification — 2026-08-31

Status is intentionally split by the validation contract:

| Lane | Status | Evidence |
|---|---|---|
| OaK Python adapter | **CREATED** | `python/atlas_oak_kernel.py`, `python/miniforge_nlp_sidecar_oak.py` |
| DSPy repair adapter | **CREATED** | `python/parent_atlas_dspy_repair.py`, `python/parent_atlas_dspy_community.py` |
| FastAPI availability | **PROVEN** | `fastapi 0.104.1` imports from the current environment |
| OaK/DSPy contract tests | **PROVEN_BOUNDED** | `python -m pytest -q python/test_atlas_oak_kernel.py python/tests/test_parent_atlas_dspy_repair.py python/tests/test_parent_atlas_dspy_community.py` → 8 passed |
| Python syntax | **PROVEN_BOUNDED** | `python -m py_compile` over the four adapter modules passed |
| Live oaklib backend | **BLOCKED** | `oaklib` is not installed in the current environment |
| Live DSPy program | **BLOCKED** | `dspy` is not installed in the current environment |
| Live GEPA optimizer | **BLOCKED** | `gepa` is not installed in the current environment |
| Production self-modification | **FORBIDDEN** | no promotion or mutation path was added |

The copied adapters therefore provide a fail-closed contract and bounded tests, but they are
not yet a live OaK 2026 ontology executor or a live DSPy/GEPA self-prompt repair loop. Do not
mark OAK-08/OAK-09/OAK-11/OAK-12 complete from these results. Installation, model configuration,
real execution receipts, deterministic replay, and promotion evidence remain required.

The ownership boundary remains unchanged: OaK controls frozen kernel/function constraints, the
existing bounded executor controls scheduling, DSPy/GEPA may propose offline program candidates,
and PostgreSQL/Parent Atlas validators retain canonical authority. No SQLite ontology store, new
identity scheme, or direct GEPA mutation is introduced by this verification.

## Live sidecar verification — 2026-08-31

The existing `miniforge-nlp-sidecar` container was checked without rebuilding or mutating
PostgreSQL, Qdrant, Neo4j, or Valkey:

| Gate | Status | Evidence |
|---|---|---|
| 8095 base health | **PROVEN_LIVE** | `GET http://127.0.0.1:8095/health` returned 200 and reported `langextract`, Tree-sitter, `treesitter-chunker`, and `ast-grep-py` active |
| OAK health | **PROVEN_LIVE** | `GET http://127.0.0.1:8095/oak/health` returned `available:true`, `oaklibVersion:0.7.4`, `adapterConfigured:false`, `READ_ONLY_SHADOW` |
| OaK kernel descriptor | **PROVEN_LIVE** | `GET http://127.0.0.1:8095/oak/kernel` returned the four frozen read-only functions and `canonicalAuthority:false` |
| OAK adapter execution | **BLOCKED_SAFELY** | no `ATLAS_OAK_ADAPTER` configured; lookup/search/traverse must remain unavailable rather than downloading ontology state |
| Live DSPy | **BLOCKED** | container import probe reports `dspy` unavailable |
| Live GEPA | **BLOCKED** | container import probe reports `gepa` unavailable |
| Container rebuild | **NOT_REQUIRED_FOR_OAK** | current image already contains `oaklib==0.7.4`; no rebuild was run |

This proves the OAK/OaK FastAPI control surface is live in shadow mode, not that ontology
lookup is configured and not that DSPy/GEPA self-prompt optimization is available. The next
safe integration step is an explicit, revision-qualified read-only adapter locator followed by
lookup/search replay. DSPy/GEPA remain an offline worker gate and must not be added to the 8095
request path until their dependency pair and bounded evaluation receipt are available.

### Adapter configuration census — 2026-08-31

A repository-wide artifact search found no checked-in `.owl`, `.obo`, `.obob`, or ontology
SQLite artifact suitable for configuring `ATLAS_OAK_ADAPTER`. The OaK sidecar therefore remains
correctly health-only: no implicit ontology download, no SQLite fallback, and no guessed adapter
locator. This is **BLOCKED_ON_EXPLICIT_ONTOLOGY_ARTIFACT**, not an implementation failure.

The next required input is an operator-selected, checksum-recorded ontology artifact or a
read-only PostgreSQL adapter implementation that reuses an existing Parent Atlas ontology owner.
Until then, OAK health/kernel discovery is proven live, while lookup/search/traverse execution
and deterministic ontology replay remain unproven.

### OAK-PG-ADAPTER implementation — 2026-08-31

`python/atlas_oak_kernel.py` now supports an explicit PostgreSQL locator in
`ATLAS_OAK_ADAPTER` (`postgres://` or `postgresql://`) without routing ontology persistence
through OAK's SQLite convenience adapters. The adapter uses existing PostgreSQL owners:

- `atlas_ontology_concepts` for bounded label/alias lookup and lexical search;
- `atlas_ontology_relations` for bounded ancestor/descendant traversal;
- the existing Parent Atlas tuple tables remain available for the next grounded-evidence
  extension and are not duplicated.

Each PostgreSQL request uses a read-only transaction, a bounded statement timeout, parameterized
queries, explicit traversal depth limits, and stable input/output checksums. Responses retain
`canonicalAuthority:false`; no mutation method was added.

| Gate | Status | Evidence |
|---|---|---|
| Adapter code | **WIRED** | `AtlasPostgresOntologyAdapter` selected only for explicit PostgreSQL locator |
| Host syntax | **PROVEN_BOUNDED** | `python -m py_compile python/atlas_oak_kernel.py` |
| Existing OaK tests | **PROVEN_BOUNDED** | `python -m pytest -q python/test_atlas_oak_kernel.py` → 2 passed |
| Live PostgreSQL adapter request | **PENDING_IMAGE_REFRESH** | running container still uses the pre-adapter image |
| Live lookup/search/traverse replay | **PENDING_IMAGE_REFRESH** | requires one controlled sidecar rebuild/restart after review |
| Canonical writes | **FORBIDDEN** | adapter is read-only shadow only |

Follow-up verification: the running container bind-mounts the repository's `python/` directory,
so the adapter source is available without rebuilding the image. An ephemeral container replay
using the mounted source and an explicit PostgreSQL locator did not complete within 90 seconds and
was stopped. This is recorded as **BLOCKED_ON_CONTAINER_TO_POSTGRES_REACHABILITY**; it is not
evidence that the adapter query or PostgreSQL schema is invalid. The host-side adapter syntax and
contract tests remain green, and no writes occurred.

### PostgreSQL 18 OaK backend census — 2026-08-31

Live read-only schema inspection confirms that PostgreSQL is the available durable OaK backend;
no new ontology table is required for this integration:

| Existing owner | Relevant lineage/evidence | OaK use |
|---|---|---|
| `atlas_ontology_tuples` | `source_ref`, `source_revision`, `workspace_revision`, `feature_revision`, `graph_revision`, `ontology_revision`, `evidence_refs`, `provenance` | primary read-only ontology tuple query source |
| `atlas_ontology_linked_tuples` | `packet_key`, `source_ref`, `tree_node_id`, `evidence_span`, `ontology_ids`, `concept_ids`, `producer_revision` | grounded evidence lookup and span readback |
| `atlas_ontology_concepts` | labels, aliases, namespace, schema version | bounded term lookup/search source |
| `atlas_ontology_relations` | subject/object concepts, predicate, evidence, extractor version | bounded relation/traversal source |

The PostgreSQL 18 AIO/bitmap capability remains an executor/planner optimization. The OaK
adapter must issue bounded parameterized queries and record `EXPLAIN` evidence when performance
is evaluated; it must not create an application-level AIO abstraction or claim that a physical
bitmap plan is required for correctness.

Current gate: **OAK-PG-ADAPTER-NEXT**. Implement or bind a read-only `AtlasOakPostgresAdapterV1`
against these existing owners, return typed revision-qualified results, and replay one lookup,
one search, and one bounded traversal twice. Until that adapter exists, the live 8095 OAK
health/kernel endpoints are proven but ontology data operations remain unproven.

### OAK-PG-ADAPTER live convergence update — 2026-08-31

The sidecar was attached to the external `deeds-web-app_legal-ai-network` so it can reach the
existing PostgreSQL 18 container. The source-only `/app/python` bind mount was verified in an
ephemeral container and the previously reported `find_occurrence_positions` import error did not
reproduce once the mount was visible. The sidecar is healthy after restart.

| Gate | Status | Evidence |
|---|---|---|
| PostgreSQL network attachment | **PROVEN_LIVE** | container has `deeds-web-app_legal-ai-network` plus its default network |
| Mounted OaK source import | **PROVEN_BOUNDED** | `atlas_structural_provenance.find_occurrence_positions` imports from `/app/python` |
| OaK adapter configuration | **PROVEN_LIVE** | `/oak/health` reports `adapterConfigured:true`, `adapterType:postgresql` |
| Read-only lexical request | **PROVEN_LIVE** | `/oak/search` completed with bounded `limit=3`; current concept table returned zero matches |
| Deterministic replay | **PROVEN_BOUNDED** | two identical `/oak/search` requests returned the same output checksum `5c0ec8292fe8f32e71d655baf1cb04e2d3e10cb6b16984d24b463c63b4627eda` |
| Existing ontology data | **EMPTY_LIVE_OWNER** | `atlas_ontology_concepts`, `atlas_ontology_relations`, `atlas_ontology_tuples`, and `atlas_ontology_linked_tuples` each currently contain 0 rows |
| Lookup/traversal positive-data proof | **BLOCKED_ON_EMPTY_DATA** | no canonical ontology rows are available for a positive lookup or relation traversal |
| Canonical writes | **FORBIDDEN** | no inserts, migrations, projections, or ontology downloads performed |

The adapter is now live and reachable, but the empty existing ontology owners mean this proves
the bounded no-result path and replay determinism, not positive ontology semantics. Do not seed
ontology rows as part of this integration. The next gate is an operator-authorized, separately
audited ontology population/readback or a fixture-only adapter test; production promotion remains
blocked while the durable ontology owner is empty.

### OAK-PG-ADAPTER endpoint replay — 2026-08-31

The configured sidecar also completed the remaining bounded no-result operations against the live
PostgreSQL adapter:

| Operation | Status | Evidence |
|---|---|---|
| `/oak/lookup` | **PROVEN_LIVE_EMPTY** | nonexistent entity returned `label:null` and a stable output checksum |
| `/oak/traverse` | **PROVEN_LIVE_EMPTY** | bounded ancestor traversal (`limit=3`, `max_depth=2`) returned zero rows and a stable output checksum |
| Mutation surface | **PROVEN_FORBIDDEN** | no mutation endpoint exists in the router; live write count remains zero |
| Positive ontology semantics | **NOT_PROVEN** | all four existing ontology owners remain empty |

The live adapter gate is therefore complete for connectivity, configuration, bounded empty-result
behavior, and replay determinism. It is not complete for positive lookup/search/traversal until
canonical ontology data exists or an isolated fixture is explicitly approved.

### OAK-PG-ADAPTER fixture validation — 2026-08-31

Added isolated adapter tests using a mocked query boundary. The fixture proves positive label and
alias lookup, bounded lexical search, ancestor traversal parameter binding, mutation-free SQL
intent, and request-level depth/limit rejection. It does not contact or mutate PostgreSQL.

| Gate | Status | Evidence |
|---|---|---|
| Positive adapter lookup/search/traversal fixture | **PROVEN_BOUNDED** | `python/test_atlas_oak_kernel.py` |
| Bounds validation | **PROVEN_BOUNDED** | invalid `max_depth=5` and `limit=101` rejected by Pydantic |
| Read-only SQL intent | **PROVEN_BOUNDED** | fixture rejects INSERT/UPDATE/DELETE statements |
| Focused test suite | **PROVEN_BOUNDED** | `4 passed` |
| Live positive ontology semantics | **OPEN** | requires separately authorized populated data |

### OAK governance validation — 2026-08-31

Repository-wide governance validation was run after the adapter fixture update. The Master TOC
replay passed and the OpenSpec workboard regenerated successfully. The broader document-governance
validator remains blocked by 56 incomplete task ledgers across unrelated changes; those findings
must not be reclassified as OaK implementation failures.

| Gate | Status | Evidence |
|---|---|---|
| Master TOC replay | **PROVEN_BOUNDED** | `npm run atlas:docs:toc:check` |
| OpenSpec workboard regeneration | **PROVEN_BOUNDED** | 58 changes, 4,228 tasks, 1,924 open |
| Repository document governance | **BLOCKED_EXTERNAL_LEDGER** | `document-governance-validation-v1.json`, 56 `UNCHECKED_TASKS` findings |
| OaK change closure | **OPEN** | positive live ontology semantics and broader governance closure remain pending |
