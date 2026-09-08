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

## OAK-03 — OWL projection, SHACL, and profile validation

- [ ] Translate the compiled schema candidate to OWL, validate projection
  completeness, and run the Python-owned OWLAPI profile-check boundary before
  selecting any formal reasoner. **Deliberately not completed this pass.** No
  live OWLAPI, ELK, or HermiT integration exists in this repo. `UNKNOWN` must
  route to `NONE`; no reasoner may be selected from a heuristic label.
  `ontology-kernel-schema-v1.ts` and `ontology-kernel-manifest-v1.ts` both
  structurally refuse to claim `VERIFIED`/`FROZEN` until the required receipts
  exist, so nothing downstream can silently pretend OAK-03 happened.

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

**OAK EXEC BIND 00 contract proof 2026-09-01:** added the runtime-only
`KernelDagExecutionBindingV1` bridge in
`packages/parent-atlas/src/core/kernel-dag-execution-binding-v1.ts`. It
restores executable bound arguments, carries `functionId`, `stepId`,
`operatorId`, `operatorKind`, and `implementationRef`, and rejects missing or
mismatched parameter checksums plus output-schema drift. Focused tests are
`3/3` and the package build passes. This does not change `AdaptiveDagPlanV1`,
does not execute actions, and does not claim live-handler or replay proof.
Receipt: `docs/reports/kernel-dag-execution-binding-v1.json`.

**OAK EXEC BIND 01 remains open:** the runtime registry must be keyed by
`implementationRef`/operator coordinates, with `DagActionKind` retained only
for coarse scheduling. Real AST, graph, Qdrant, Postgres, and context handler
registration plus zero-write replay remain separate gates.

**OAK EXEC BIND 01 contract proof 2026-09-01:** the existing package registry
now resolves adapters by `implementationRef`, verifies operator ID/kind and
output-schema coordinates, and requires a checked binding for every action.
The shared read-only executor accepts those bindings without becoming a new
scheduler. Focused binding/registry/executor tests are `7/7` and the package
build passes. This is package contract proof only; no live runtime owner,
database, Qdrant, graph, or production handler was invoked. Receipt:
`docs/reports/kernel-dag-runtime-registry-v1.json`.

**OAK EXEC BIND 02 remains open:** register real read-only AST, graph, Qdrant,
Postgres, and context owners, then run the frozen plan twice and compare
normalized action/evidence checksums.

**OAK EXEC BIND 02 owner trace 2026-09-01:** AST, graph, Qdrant logical ANN,
and ContextManifest boundaries were found in the existing runtime. Postgres
still needs a strict typed read seam because the current KAG reader is
fail-open; `FETCH_FILE` remains blocked pending a confined,
source-revision-aware reader. No runtime owner was invoked in this census.
Receipt: `docs/reports/kernel-dag-owner-trace-v2.json`.

**OAK EXEC BIND 03 strict Postgres seam 2026-09-01:** added additive
`readKagHypergraphNeighborsStrictV1()` while preserving the existing
fail-open `readKagHypergraphNeighborsV1()` behavior for current retrieval
callers. The strict seam is read-only and propagates database failures for
governed action receipts. Runtime DAG registration and live replay remain
open.

**OAK EXEC BIND 02 Svelte adapter proof 2026-09-01:** the existing bounded
Svelte adapter now requires `KernelDagExecutionBindingV1` and resolves
handlers by `implementationRef`; focused tests pass `2/2`. Broad
`svelte-check` remains blocked by an unrelated nested web UI config missing
`mdsvex`. Receipt: `docs/reports/kernel-bound-dag-svelte-adapter-v2.json`.

**OAK EXEC BIND 02 input-schema proof 2026-09-01:** added revision-qualified
input schemas for AST, graph, Postgres, Qdrant, and ContextManifest owners.
The schemas enforce graph lineage and exactly `768` search dimensions but do
not invoke any owner. Focused schema tests are `2/2`; live registration and
zero-write replay remain open.

**OAK EXEC BIND 02 operator-owner reconciliation 2026-09-01:** the current
operator library contains implementation references that do not all map
one-to-one to current runtime owners. `GET_AST_EVIDENCE` points to persisted
`atlas_ast_nodes` while the available structural provider is Tree-sitter;
semantic search can select multiple executors; context ownership is split
between ACE assembly and manifest compilation. Real handler registration is
blocked until these mappings are explicitly resolved. Receipt:
`docs/reports/kernel-dag-operator-owner-reconciliation-v1.json`.

**OAK EXEC BIND 02 AST read-owner proof 2026-09-01:** confirmed that
`atlas_ast_nodes` is a real persisted schema/table with `tree_node_id`,
`source_revision`, source content hash, parser language, and byte-span fields.
Added the bounded strict read owner
`sveltekit-frontend/src/lib/server/atlas/integration/atlas-ast-evidence-reader-v1.ts`.
It requires an exact source revision, caps requests at 100 node IDs, validates
the returned shape with Zod, and is unconditionally read-only. Focused tests:
`3/3` passed. Live DAG registry wiring and zero-write replay remain open.
Do not remap `GET_AST_EVIDENCE` to the Tree-sitter producer or invent a second
AST identity table.

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
  adapter path.

**Strict GPU admission correction — 2026-09-01:** added
`ontology_linked_tuple_to_nary_relation_strict_v1()`. The compatibility bridge
continues to support historical fixtures, but governed graph/GPU execution now
requires `provenance.sourceRevision` and rejects `SOURCE_REVISION_UNPROVEN`;
`relationRevision` and `unknown` cannot substitute for source authority.
The delegated NetworkX proof passed with the strict-source check included.
The tuple-specific cuDF/cuGraph replay remains open, and the live sidecar
renumbering mode must be reported explicitly before that gate can be promoted.
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

### OaK paper-faithful construction gates — 2026-09-01

The 2026 OaK paper defines a construction lifecycle of task-schema creation,
formal OWL/HermiT verification, graph instantiation, executable typed-function
testing, judge feedback, bounded repair, and freezing of `S` and `F` before
inference. Parent Atlas now has the contracts and a proven WSL2 cuGraph
execution lane, but those facts do not by themselves prove a frozen OaK kernel.

| Gate | Status | Evidence / next proof |
|---|---|---|
| OAK-LIVE-01A revision-bound live execution | **OPEN** | exact live Postgres/Qdrant bindings and immutable source/candidate/representation revisions required |
| OAK-LIVE-01B graph-inclusive live execution | **READY_FOR_REPLAY** | WSL2 RAPIDS FastAPI and NetworkX/cuGraph parity proven; graph revision-bound action inputs still required |
| OAK-FUNC-COVERAGE-01 executable function coverage | **OPEN** | add a receipt for every function admitted to task-scoped frozen `F`; repository presence is not executable proof |
| OAK-OWL-VERIFY-01 HermiT verification | **OPEN** | existing deterministic OWL projection is proven; real HermiT reasoner receipt is still required |
| OAK-JUDGE-LOOP-01 live judge feedback | **OPEN** | `OakJudgeFeedbackV1` contract exists; live execution failure classification and proposal-only repair remain unproven |
| OAK-FREEZE-01 DRAFT → VERIFIED → FROZEN | **BLOCKED_BY_ABOVE** | require OWL, function coverage, replay, validator, and judge predicates; no manual promotion |
| OAK-EXECUTION-GPU-01 WSL2 graph executor | **PROVEN_BOUNDED** | `docs/reports/graph-ordinal-cpu-gpu-parity-v1.json`, zero writes, canonical authority false |

The WSL2 graph result therefore upgrades graph execution to
`READY_FOR_REVISION_BOUND_REPLAY`; it does not promote ontology verification,
function coverage, judge repair, or kernel freeze.

### Ontology semantics correction — 2026-09-01

The current `kernelConstraintSchema` stores `kind`, `appliesTo`, and prose
description. The OWL projector therefore emits only the two-class
`DISJOINT_CLASSES` case as a logical axiom; `DOMAIN_RANGE`,
`PROPERTY_RESTRICTION`, and `CARDINALITY` are currently annotation-only.
Annotations do not contribute to OWL logical meaning. Consequently,
`OWL2_DL_REQUIRED` in the current receipt is a conservative projection gap,
not evidence that the intended ontology genuinely requires HermiT.

The dependency order is now frozen as:

```text
OAK-CONSTRAINT-SCHEMA-01
  structured discriminated constraint union
        ↓
OAK-OWL-AXIOM-PROJECTION-02
  real domain/range/restriction/cardinality axioms or explicit rejection
        ↓
OAK-SHACL-01
  RDF/application data-shape validation where appropriate
        ↓
OAK-PROFILE-CHECK-01
  actual OWL profile checker
        ↓
OWL2_EL → ELK       OWL2_DL/non-EL → HermiT
```

| Gate | Status | Boundary |
|---|---|---|
| OAK-CONSTRAINT-SCHEMA-01 structured constraints | **OPEN** | replace prose-only constraint payloads with a discriminated, reference-checked union |
| OKF-DOMAIN-ONTOLOGY-MAP-01 | **OPEN** | classifier labels are evidence signals; only an admitted revisioned mapping may yield ontology IDs |
| ONTOLOGY-TUPLE-PARITY-01 | **OPEN** | TypeScript/Zod remains schema owner; Python tuple model is a validated execution mirror |
| OAK-OWL-AXIOM-PROJECTION-02 | **OPEN** | no claimed logical constraint may silently downgrade to an annotation |
| OAK-SHACL-01 | **DEFERRED** | shape/cardinality/application invariants are separate from OWL logical consistency |
| OAK-PROFILE-CHECK-01 | **OPEN** | current `owlProfileHeuristic` is not a formal profile checker |
| OAK-ELK-01 / OAK-HERMIT-01 | **BLOCKED_BY_PROFILE_CHECK** | select only after structured axiom projection and actual profile detection |

This ontology lane remains separate from the active workstation lineage gate;
it must not bypass unresolved source/chunk identity or revision ownership.

### Projection completeness receipt — 2026-09-01

The current census is recorded in
`docs/reports/oak-owl-projection-completeness-v1.json`.
It is **INCOMPLETE**: the actual OWL profile is **UNKNOWN** and the reasoner
route is **NONE**. The existing `OWL2_DL_REQUIRED` value remains a heuristic
for annotation-only projection gaps, not a HermiT requirement. ELK/HermiT
installation and invocation remain blocked until structured constraint fields,
complete axiom projection, and a real profile check are proven.

Validation recorded by the receipt: focused OWL/kernel tests **16/16 PASS**,
Parent Atlas package build **PASS**, database writes **NO**, production writes
**NO**, canonical authority **false**.

The additive structured contract is now implemented and proven separately in
`packages/parent-atlas/src/core/ontology-kernel-constraint-v2.ts` with report
`docs/reports/oak-constraint-schema-coverage-v1.json`. This closes only the
contract sub-gate (**3/3 focused tests PASS**); V1 OWL projection remains
unchanged and incomplete until the OWL and SHACL compiler gates are completed.

The additive V2 OWL projection path is now implemented and proven for
structured domain/range and property-restriction axioms. It emits
`COMPLETE`/`INCOMPLETE` receipts and rejects unsupported type references rather
than converting claimed logical constraints into comments. It does not replace
the V1 projector, does not perform profile checking, and does not invoke a
reasoner. SHACL projection remains a parallel open gate.

The SHACL lane now has an additive projector at
`packages/parent-atlas/src/core/ontology-shacl-projection-v1.ts`. It emits
W3C SHACL 2017 cardinality shapes for `DATA_SHAPE`/`BOTH` constraints and
records unsupported shape mappings explicitly. Focused tests are **2/2 PASS**;
runtime RDF validation and broader shape coverage remain open. See
`docs/reports/oak-shacl-shape-coverage-v1.json`.

Combined OWL/SHACL accounting is now implemented at
`packages/parent-atlas/src/core/ontology-projection-completeness-v1.ts`.
It proves that each structured constraint has an explicit logical-axiom or
data-shape destination, or is reported as unsupported. The focused combined
test passed (**5/5 total in the projection tranche**). Profile checking remains
explicitly false and reasoner routing remains `NONE`; see
`docs/reports/oak-projection-completeness-v1.json`.

The profile boundary follows the verified OWLAPI sequence: parse RDF/XML into
`OWLOntology`, then run `OWL2ELProfile.checkOntology()` and
`OWL2DLProfile.checkOntology()`. This is profile checking, not inference. The
receipt records that parser stage, but the checker remains unavailable until
an isolated OWLAPI runtime is configured.

Runtime-owner audit recorded in
`docs/reports/oak-profile-runtime-owner-audit-v1.json`: no existing OWLAPI
profile checker, JAR, or dedicated Java ontology service was found. The Java
Neo4j procedure module is unrelated and must not host OWLAPI. No dependency was
downloaded; the profile adapter remains safely unconfigured.

The Python-owned status surface is now exposed as `GET /oak/profile` through
the existing `miniforge_nlp_sidecar_oak.py` 8095 composition. It reports the
OWLAPI parser/profile boundary as unavailable, profile `UNKNOWN`, route `NONE`,
and explicitly disables implicit downloads and reasoning. The Python OAK
tests passed **5/5**; no new service or dependency was introduced.

The reasoner-free profile-check adapter is now present at
`packages/parent-atlas/src/core/ontology-profile-check-v1.ts`. It accepts only
an injected OWLAPI profile result; without an isolated checker it returns
`UNAVAILABLE`, profile `UNKNOWN`, and route `NONE`. Focused tests passed
(**3/3**). No ELK/HermiT installation was performed. See
`docs/reports/oak-profile-check-v1.json`.

The Python boundary is now exercised through the existing 8095 OAK sidecar:
`GET /oak/profile-check/capabilities` advertises the unavailable
`OWLAPI_SUBPROCESS` implementation owned by `PYTHON_FASTAPI_8095`, and
`POST /oak/profile-check` returns a typed `UNAVAILABLE`/`UNKNOWN`/`NONE`
result with `reasoningPerformed: false` and `writesPerformed: false`. Python
tests passed **7/7** and `py_compile` passed. No Java or OWLAPI artifact was
downloaded.

`OAK-PROFILE-PY-02` and `OAK-PROFILE-PY-03` are now proven: the Python
`OwlProfileChecker` protocol, `UnavailableOwlProfileChecker`, and FastAPI
dependency-injection seam are implemented. The default routes remain
`UNAVAILABLE`/`UNKNOWN`/`NONE`; injected fixtures cannot perform reasoning or
writes. Python tests passed **8/8**, `py_compile` passed, and strict OpenSpec
validation passed.

Route registration was independently verified on the existing OAK router:
`/oak/profile`, `/oak/profile-check`, and
`/oak/profile-check/capabilities` are present. This proves the Python API
boundary is wired, not that an OWLAPI checker is live; OAK-03E remains open.

### Current OWLAPI profile-check correction — 2026-09-01

The authoritative current sequence supersedes older OAK-03 wording:

| Gate | Current status |
|---|---|
| OAK-03A ConstraintV2 → OWL V2 | **PROVEN** |
| OAK-03B SHACL projection | **PROVEN, initial cardinality scope** |
| OAK-03C combined projection completeness | **PROVEN** |
| OAK-03D OWLAPI profile-check boundary | **IMPLEMENTED** |
| OAK-03E live OWLAPI parser/profile execution | **OPEN** |
| OAK-03F formal reasoner owner selection | **BLOCKED_ON_PROFILE_RESULT** |
| OAK-03G formal reasoning | **NOT_STARTED** |

Until OAK-03E produces a real profile result, `UNKNOWN` MUST route to `NONE`
and MUST NOT select HermiT. No Java executable, OWLAPI runtime, or profile-check
service is configured for the Parent Atlas boundary. This does not claim that
unrelated Neo4j infrastructure has no JVM. OAK/lib remains ontology access,
not formal OWL reasoning. No ELK, HermiT, ROBOT, Jena, or Owlready2 dependency
is adopted by this change.

### Python adapter alignment — 2026-09-01

The intended live integration owner is the existing Python 8095 NLP/OAK
FastAPI sidecar. `oaklib==0.7.4` remains the Python ontology-access layer.
`FormalProfileClientV1` may later invoke an explicitly provisioned OWLAPI Java
subprocess for RDF/XML parsing and profile checks, but no JVM, JAR, ELK, or
HermiT dependency is currently installed. TypeScript owns the artifact and
receipt contracts; Neo4j does not host OWLAPI.

The Python protocol/injection tranche is now fully regression-proven: the
existing 8095 FastAPI sidecar exposes the unavailable checker through an
injected `OwlProfileChecker` dependency, while the TypeScript contract remains
reasoner-free. Python tests passed **8/8**, TypeScript profile/completeness
tests passed **3/3**, and strict OpenSpec validation passed. The default
implementation remains fail-closed with `UNAVAILABLE`, profile `UNKNOWN`,
route `NONE`, `reasoningPerformed: false`, and `writesPerformed: false`.
See `docs/reports/oak-profile-python-boundary-v1.json`.

This proves the Python-owned boundary and its injection seam only. It does not
prove OWLAPI parsing, an OWL profile result, ELK/HermiT reasoning, or any
database/production mutation. OAK-03E remains the next live gate.

### ONTO-PY-GPU-01 — tuple projection to RAPIDS parity — 2026-09-01

- [x] Reused the existing `ProjectionOrdinalMapV1` and
  `OperationalGraphEdgeV1` output to build an isolated typed Parquet fixture.
- [x] Proved direct NetworkX → cuDF/cuGraph PageRank parity through the live
  8098 sidecar: 5 nodes, 4 incidence edges, identical ordering, maximum
  absolute error `1.395151487670887e-7`, `renumbered: false`, and zero unknown
  ordinals.
- [x] Confirmed `writesPerformed: false` and `canonicalAuthority: false`.
  This is a bounded tuple fixture proof only; full domain-classification
  admission, larger topology cohorts, and production graph promotion remain
  separate gates.

Evidence: `scripts/atlas/prove-ontology-linked-tuple-cugraph-parity-v1.py` and
`docs/reports/ontology-linked-tuple-cugraph-parity-v1.json`.

### ONTO-PY-GPU-02 — bounded tuple BFS — 2026-09-01

- [x] Added the read-only `/v1/graph/bfs` route to the existing revision-aware
  RAPIDS graph manager with bounded `depthLimit` and explicit ordinal receipts.
- [x] Live RTX/cuGraph execution returned the relation node at distance `0`
  and four participant nodes at distance `1`, with `renumbered: false`.
- [x] Preserved `writesPerformed: false` and `canonicalAuthority: false`.
  Larger cohorts, undirected/multi-hop policy, and promotion remain separate
  gates.

Evidence: `python/atlas_rapids_graph_runtime.py`, live `/v1/graph/bfs` response,
and `python/tests/test_atlas_rapids_graph_runtime.py` (5/5 retained).
- [x] ONTO-PY-DOMAIN-01 — add a revisioned, read-only `DomainOntologyMappingV1` admission boundary for classifier labels; known labels/aliases resolve to declared `atlas:` classes, unknown labels fail closed, and no classifier label dynamically mints ontology identity. Proven by `scripts/atlas/prove-domain-ontology-admission-v1.py` and `docs/reports/domain-ontology-admission-v1.json`; this is an admission proof, not ontology promotion or a database/graph write.

### ONTO-PY-DOMAIN-02 — classifier taxonomy wiring — SUPERSEDED

> Superseded 2026-09-03 by `openspec/changes/parent-atlas-search-classifier-sidecar/tasks.md` task 5
> ("Taxonomy hookup"), which extends `domain_mapping.py`'s catalog to cover this exact taxonomy
> (`classify-domain-ontology.mjs`'s 15 labels: `agent_orchestration`, `rag_retrieval`,
> `graph_topology`, etc.) and keeps unmapped labels fail-closed per the rule below. Track further
> progress there, not here.


- [x] Reconcile the classifier taxonomy emitted by
  `scripts/atlas/classify-domain-ontology.mjs` (15 labels, including
  `agent_orchestration`, `rag_retrieval`, and `graph_topology`) with the
  explicit, revisioned `DomainOntologyMappingV1` catalog. The current audit
  reports 15 admitted and 0 unresolved labels with mapping revision
  `sha256:b1fe99ea1b85f0ad0deecbe359f6565a28f1dd435008f260e0d52d2f03595a0e`.
- [ ] Keep unmapped labels fail-closed; do not treat 100% `domain_class`
  population in the readiness audit as ontology admission.
- [x] Prove one read-only classifier-label → admitted ontology-class →
  `OntologyLinkedTupleV1` fixture path before any graph materialization.

Progress: all 15 current classifier labels now map unambiguously to existing
broad classes and are covered by the read-only taxonomy audit. This is mapping
coverage only: it does not make classifier labels ontology IDs, populate the
ontology registry, or authorize tuple/graph/cache writes. Any future label
without an explicit mapping remains fail-closed.
The strict fixture signal path now also records `classificationRevision`,
`mappingRevision`, `sourceNamespace`, `sourceRevision`, and zero direct
classifier bypass counters. Live classifier-producer adoption remains open.
The current classifier reads only `packet_id`, `packet_key`, `source_ref`, and
`feature_id`, then writes `domain_class` directly when `--apply` is used; it
does not yet supply `sourceRevision`/`sourceNamespace` or invoke the strict
tuple bridge. Keep live adoption blocked until that producer boundary is
revision-qualified and dry-run validated.

Current evidence: `docs/reports/domain-classification-readiness-audit.json`
shows classifier coverage but does not prove ontology admission. The existing
`scripts/atlas/prove-domain-ontology-admission-v1.py` proves only the smaller
known-label mapping catalog. No database, graph, or canonical writes are
authorized by this task.

Read-only lineage follow-up (2026-09-01): `scripts/atlas/audit-source-lineage-model-v1.mjs`
confirmed `graphify_files` as the available source-version observation owner,
with 885 source refs, 885 content hashes, 885 source revisions, and 373
workspace revisions. Only 778 of 61,660 `atlas_packets` rows currently join
to a source revision, and 111 join to the observed workspace revision. The
classifier therefore cannot be promoted to live tuple wiring yet: its current
`atlas_packets`-only query lacks the revision-qualified join and source
namespace admission required by the strict bridge. Evidence is recorded in
`docs/reports/source-lineage-model-v1.json`; no database, graph, or canonical
writes occurred.

Classifier producer coverage audit (2026-09-01):
`scripts/atlas/audit-domain-classifier-lineage-v1.mjs` ran in a read-only
transaction and found 3,294 classifier rows, only 78 source-revision-qualified
joins, 0 declared source namespaces, 78 `graphify_files.workspace_id`
namespace candidates, and 3,216 rows without a `graphify_files` join. It emitted
`docs/reports/domain-classifier-lineage-v1.json` and invoked
neither the classifier apply path nor any tuple/graph writer. Keep live
`DomainOntologyMappingV1` → `OntologyLinkedTupleV1` adoption blocked until a
declared source-namespace owner and complete revision-qualified cohort are
available.

Interim policy: `sourceNamespace` may remain `null` while the Parent Atlas
Workstation binding is unresolved. Do not derive it from the Windows host,
VS Code workspace path, `process.cwd()`, Git state, or
`atlas_packets.repository_id`. A missing namespace must fail closed to no
admitted tuple and no graph projection. `graphify_files.workspace_id` remains
diagnostic until its stable workspace-to-namespace meaning is independently
proven.

### ONTO-PY-DOMAIN-03 — ontology owner declarations — BLOCKED

- [ ] Declare the unresolved domain classes in the authoritative Atlas kernel
  schema (or identify an existing declared parent class) before adding further
  classifier aliases.
- [ ] Record class owner, ontology revision, and mapping revision together;
  classifier taxonomy names alone are not ontology identity.

Current owner search found classifier/runtime references but no authoritative
`atlas:*Domain` declarations for the unresolved labels. Keep them unmapped until
this contract is approved.

Repeatable audit: `scripts/atlas/audit-domain-ontology-taxonomy-v1.py` writes
`docs/reports/domain-ontology-taxonomy-audit-v1.json` and currently reports
`DOMAIN_ONTOLOGY_TAXONOMY_PROVEN` for mapping coverage only. ONTO-PY-DOMAIN-03,
live source-lineage qualification, ontology-registry ownership, and canonical
tuple promotion remain blocked and must not be inferred from this audit.

### ONTO-PY-GPU-02 — shared incidence algorithm parity — 2026-09-01

- [x] Built one shared, revision-qualified `NARY_INCIDENCE` projection from seven
  tuples covering a four-participant relation, shared-participant relations,
  disconnected groups, and a two-hop relation chain.
- [x] Proved NetworkX ↔ cuGraph BFS node/distance parity, normalized connected
  component partition parity, and PageRank node-set parity through live 8098.
- [x] Confirmed dense `[0,V)` projection ordinals, `renumbered: false`, seven
  source-qualified tuples, zero synthetic/unproven revisions, and zero unknown or
  missing GPU ordinals. Writes and canonical authority remain false.

Evidence: `scripts/atlas/prove-ontology-linked-tuple-cugraph-algorithm-parity-v1.py`
and `docs/reports/ontology-linked-tuple-cugraph-algorithm-parity-v1.json`.
The replay rotated the fixture to projection revision `...-v3` after the
resident 8098 process correctly returned its existing `...-v2` graph as
reused; the fresh load then proved `renumbered: false` again.
This closes only the bounded projection/executor proof; canonical relationship
promotion, GRAPH-06D, FI-13C2, FI-14, and FI-16I remain blocked.

### ONTO-PY-GPU-03 — deterministic Leiden replay — 2026-09-01

- [x] Reused the same shared 21-vertex/16-edge undirected incidence artifact
  through the existing quarantined RAPIDS community sidecar.
- [x] Replayed Leiden twice with fixed `randomState: 17`, `resolution: 1.0`,
  `maxIterations: 100`, and `theta: 1.0`; input/output hashes and normalized
  member partitions matched, with projection revision preserved.
- [x] Kept `writesPerformed: false` and `canonicalAuthority: false`. Community
  labels remain executor output and are not durable identity or promotion evidence.

Evidence: `scripts/atlas/prove-ontology-linked-tuple-leiden-replay-v1.py` and
`docs/reports/ontology-linked-tuple-leiden-replay-v1.json`.

### RESIDENT-GRAPH-IDENTITY-01 — revision/checksum admission — PROVEN_BOUNDED

- [x] Resident status exposes projection, node-table, edge-table, graph-kind,
  direction, counts, and `renumbered: false` identity fields.
- [x] Algorithm requests bind `projectionRevision` and `projectionChecksum`
  before execution; mismatched checksums fail closed.
- [x] Sequential GPU-01/GPU-02 replays pass with the same resident identity.
- [x] Add and require a real `ordinalMapChecksum` for algorithm admission;
  the fixture checksum is derived from sorted `graphNodeKey → gpuNodeId`
  bindings and is not synthesized from the node-table checksum.

Evidence: `python/atlas_rapids_graph_runtime.py` and
`docs/reports/resident-graph-identity-v1.json`. Concurrent proof jobs must not
share the single-resident 8098 slot; a 409 during a revision swap is expected
coordination behavior and is not parity evidence.

### ONTO-PY-CONCEPT-INTEGRATION-01 — end-to-end concept and classifier alignment — OPEN

This tranche makes the existing concept surfaces usable together. It does not
create a second ontology registry, promote Neo4j concepts to canonical status,
or authorize bulk graph/model writes.

Current audit evidence (2026-09-02):

- The packet/Neo4j dry-run found 50,000 packets with `concept_ids`, 17,457
  unique raw concept labels, and approximately 189,400 possible
  `USED_CONCEPT` edges.
- The live PostgreSQL counts for `concept_records`,
  `atlas_ontology_concepts`, and `atlas_ontology_relations` are all zero.
- `scripts/atlas/audit-grounded-concept-taxonomy-v1.mjs` reports
  `NO_GROUNDED_CANDIDATES_TO_CLASSIFY`.
- Existing `DomainOntologyMappingV1` admits only explicitly declared classes;
  unresolved labels remain fail-closed.

Ownership is frozen as:

```text
LangExtract / NLP sidecar
  -> grounded observations with source spans
DomainClassificationSignalV1
  -> DomainOntologyMappingV1 admission
Atlas ontology registry in PostgreSQL
  -> OntologyLinkedTupleV1 / canonical evidence
Neo4j Concept projection
  -> derived traversal only
NetworkX
  -> CPU graph reference
cuGraph/RAPIDS
  -> bounded GPU graph executor
KMeans/SOM/manifold coordinates
  -> derived features only
XGBoost/PyTorch classifier
  -> revisioned prediction proposal, never ontology identity
```

- [ ] **CONCEPT-01 — inventory and normalize raw labels (read-only).** Audit
  packet `concept_ids`, trace `selected_concepts`, Redis concept indexes, and
  existing Neo4j `:Concept` nodes. Produce normalized labels, source counts,
  aliases, unmapped labels, and ambiguous labels. Do not merge or delete
  concepts during the census.

  Partial implementation: `scripts/atlas/audit-raw-concept-labels-v1.mjs`
  now inventories and normalizes packet/trace labels read-only, producing
  `docs/reports/raw-concept-label-inventory-v1.json`. The Redis/Neo4j census
  and authority comparison remain open; the 19,445 normalized labels are raw
  evidence and are not admitted ontology classes.

  Follow-up census (2026-09-02): Neo4j reachability is proven read-only with
  19,698 `:Concept` nodes, 173,158 `USED_CONCEPT` edges, 59,692 packets, and
  13,290 features (`docs/reports/concept-reachability-check.json`). The
  Valkey ontology cache is reachable but currently empty (zero tuple, token-map,
  blocked-hash, and HLL keys); `audit-ontology-cache-usage.mjs` reports the
  cache population step as still pending. This proves projection reachability,
  not canonical ontology alignment or cache adoption.

  KAG persistence audit (2026-09-02) reports `READY_FOR_MATERIALIZATION`:
  `atlas_hyperedges` contains 62,802 rows and
  `atlas_hyperedge_members` contains 125,604 rows, while
  `atlas_ontology_tuples` contains 0 rows. Both KAG schemas are active and
  structurally complete, but no ontology-linked tuple materialization is
  currently available for concept admission. Evidence:
  `docs/reports/atlas-kag-persistence-v1.json`.

  Contract repair (2026-09-02): added
  `packages/parent-atlas/src/core/concept-admission-v1.ts` with explicit raw
  label, admission decision, and integration receipt schemas. An admitted
  decision requires an explicit class ID, ontology revision, source revision,
  and evidence refs; rejected decisions cannot carry a class ID. Neo4j and
  Valkey projection permissions are hard-coded false until canonical admission
  is proven. Focused contract tests pass 2/2 and the package build passes.

  Vocabulary alignment audit (2026-09-02) found a second declared vocabulary
  that must not be silently merged with the Python `atlas:*Domain` catalog:
  `DOC_DOMAIN_CLASSES`/`DOC_ONTOLOGY_CLASSES` in
  `packages/parent-atlas/src/core/external-doc-knowledge-fabric.ts` are the
  external-document extraction vocabulary (`retrieval`, `graph`, `MODEL`,
  `RELATIONSHIP`, etc.). They are valid typed document fields, but they are
  not yet a revisioned mapping to `DomainOntologyMappingV1` class IDs. Additive
  cross-vocabulary mapping is therefore required before document labels can
  become admitted ontology concepts. Keep the vocabularies distinct until
  that mapping and its checksum are explicitly approved.
- [ ] **CONCEPT-02 — align only to declared ontology classes.** Join normalized
  labels through `DomainOntologyMappingV1` and the PostgreSQL
  `atlas_ontology_concepts` registry. A classifier label is evidence, not an
  ontology ID. Missing, ambiguous, namespace-mismatched, or revisionless
  mappings must be rejected.

  Partial implementation: `scripts/atlas/audit-raw-concept-admission-v1.py`
  previews the raw inventory through the existing Python mapping owner. The
  current preview contains 19,445 labels: 18 explicit mapping matches, 0
  ambiguous matches, and 19,427 unmapped labels. Because the PostgreSQL
  ontology registry is empty and raw rows lack source revisions, no preview
  result is eligible for tuple, Neo4j, or Valkey materialization. Evidence:
  `docs/reports/raw-concept-admission-v1.json`.

  Cross-vocabulary contract (2026-09-02): added
  `packages/parent-atlas/src/core/ontology-vocabulary-map-v1.ts` and focused
  tests (2/2). It requires the source vocabulary, explicit target class,
  mapping revision, ontology revision, and evidence refs, and rejects mixed
  external-document domain/ontology vocabularies. This defines the mapping
  boundary; it does not approve any concrete class mapping or perform writes.

  External-document vocabulary audit (2026-09-02):
  `scripts/atlas/audit-external-doc-vocabulary-admission-v1.py` compared the
  declared 17-label `DOC_DOMAIN_CLASSES` list with the existing Python mapping
  owner. Five labels match explicitly, 12 are unmapped, and none are
  ambiguous. The matches remain diagnostic until an ontology revision and
  evidence refs are attached; no document tuple, Neo4j node, or Valkey entry
  was created. Evidence:
  `docs/reports/external-doc-vocabulary-admission-v1.json`.

  Ontology revision owner audit (2026-09-02):
  `scripts/atlas/audit-ontology-revision-owners-v1.mjs` found producer labels
  such as `okf-ontology-v1` and classifier/source revisions, but no
  checksum-sealed canonical ontology revision owner. The existing tuple
  contract has an optional `ontologyRevision` field, while the admission
  contract correctly requires it for admitted decisions. Therefore the five
  external-vocabulary matches remain diagnostic and cannot enter the registry,
  Neo4j, or Valkey. Evidence:
  `docs/reports/ontology-revision-owner-audit-v1.json`.

  Revision-binding contract (2026-09-02): added
  `packages/parent-atlas/src/core/ontology-revision-binding-v1.ts`. It requires
  explicit checksum-shaped `ontologyRevision` and `mappingRevision`, binds
  them to a schema artifact and evidence references, rejects producer labels
  such as `okf-ontology-v1`, and always keeps `canonicalAuthority: false`.
  This is a declared binding contract, not proof of an ontology owner or a
  registry write. Focused tests pass 2/2 and the package build passes.

  Revision manifest contract (2026-09-02): added
  `packages/parent-atlas/src/core/ontology-revision-manifest-v1.ts`. It
  deterministically derives an explicit ontology revision from the schema
  checksum, mapping revision, admitted class IDs, and producer revision.
  Class ordering is canonicalized; the result remains `DECLARED` with
  `canonicalAuthority: false` until a separate owner/evidence gate approves
  it. Focused tests pass 2/2; this does not seed the PostgreSQL registry.

  Grounded fixture composition (2026-09-02): added
  `packages/parent-atlas/src/core/ontology-concept-admission-fixture-v1.spec.ts`.
  It composes two explicitly mapped labels with the declared ontology
  revision, exact source revisions, and evidence references. The receipt keeps
  Neo4j/Valkey projection permissions and writes disabled. This proves the
  contract boundary only; it is not live classifier adoption or registry
  population.
  **CONCEPT-SCHEMA-01 / CONCEPT-SEED-DRY-01 — real-time duplicate-owner collision found and
  self-corrected (2026-09-03, same day, two sessions working this repo in parallel)**: this
  session began from the operator's own separate "PARENT ATLAS CONCEPT FABRIC 01" instruction and
  independently built `sveltekit-frontend/src/lib/server/atlas/contracts/concept-fabric-v1.ts` —
  a `ConceptDefinitionV1`/`TermObservationV1`/`ConceptRecognitionV1` Zod contract — plus 17 passing
  fixture tests and a `build-concept-seed-dry-v1.mts` producer script, all before checking whether
  a concurrent session was doing the same thing. **Before committing, `git status` surfaced that a
  concurrent session had, the same day, ALREADY built a materially more complete answer**:
  `sveltekit-frontend/src/lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.ts`, defining its
  own `ConceptV1`/`TermObservationV1`/`ConceptRecognitionV1` (near-identical `kind`/`matchMethod`
  enum values — both sessions were evidently working from the same underlying field list) PLUS a
  working deterministic resolver (`recognizeConceptV1()`), and canonical-promotion wiring
  (`promoteTaxonomyAssignmentV1()`, `createConceptBroaderThanV1()`, `createConceptPartOfV1()`
  reusing the existing `HyperedgeV1` relation owner rather than inventing a new one) — none of
  which my version had. Their own `scripts/atlas/concept-seed-dry-v1.mts` (note:
  `sveltekit-frontend/scripts/atlas/`, not repo-root `scripts/atlas/`) and
  `docs/reports/concept-seed-dry-01.json` / `docs/reports/concept-fabric-capability-alignment-v1.json`
  / `docs/reports/concept-vocabulary-authority-01.json` are already real, live-run deliverables for
  exactly this task.

  **Resolution, per this file's own Duplication-Prevention hard rule**: did NOT commit my
  `concept-fabric-v1.ts` / `.spec.ts` / `build-concept-seed-dry-v1.mts` — left them uncommitted,
  local-only, not part of this repo's history, to avoid two competing `TermObservationV1`/
  `ConceptRecognitionV1` schema owners under the same schema-version literal strings.
  `entity-concept-taxonomy-v1.ts` is the real answer to CONCEPT-SCHEMA-01 — cite it, not this
  paragraph's abandoned file, in any future work. Two things from the abandoned exploration ARE
  genuinely additive, not covered by the concurrent session's version, and worth recording as open
  follow-up rather than silently lost with the discarded file:
  1. **A real, live-run finding**: mechanically deriving concept proposals from
     `domain_mapping.py`'s 7 `atlas:*Domain` classes (the same source CONCEPT-02 above already
     reads) alongside `domain-taxonomy.ts`'s 9 coarse domains found **3 direct label collisions**
     — `retrieval`/`database`/`graph` are simultaneously a `domain-taxonomy.ts` coarse-domain
     canonical label AND a `domain_mapping.py` `atlas:*Domain` `domainLabel`. This is new,
     concrete evidence beyond what `concept-vocabulary-authority-01.json`'s census currently
     covers (that report's `authorities[]` list doesn't yet include this pairing). Worth a
     follow-up run of the concurrent session's own `concept-seed-dry-v1.mts`, extended to also
     read `domain_mapping.py` and the two live DB CHECK constraints
     (`atlas_ontology_relations.predicate`, `atlas_ontology_concepts.concept_type`) as additional
     owners, to get this finding onto the canonical file/report pair instead of an abandoned one.
  2. `entity-concept-taxonomy-v1.ts`'s `ConceptV1` has no `conceptType` enum (matching the live
     `atlas_ontology_concepts.concept_type` CHECK constraint) or `status` lifecycle
     (ACTIVE/PROPOSED/DEPRECATED) — both present in the abandoned `ConceptDefinitionV1`. Whether
     those are worth folding into the canonical `ConceptV1` is an open, unresolved question for
     whoever owns that file next — not decided here.
- [ ] **CONCEPT-03 — establish a grounded admission fixture.** Use the existing
  LangExtract/grounded observation contract and require exact `sourceRef`,
  source revision, character interval, mapping revision, ontology revision,
  and `OntologyLinkedTupleV1` checksum. No tuple or graph projection is
  admitted from an ungrounded decoder label.

  Python bridge audit (2026-09-02):
  `python/parent_atlas_ontology/domain_tuple_bridge.py` already enforces
  classification revision, mapping revision, source namespace, and tuple
  source revision, and `python/test_domain_tuple_bridge.py` passes. It does
  not yet require the declared ontology revision or evidence references at
  the strict wire boundary. Therefore the bridge remains fixture-proven, not
  live grounded admission. The next repair is contract parity with the
  TypeScript admission boundary; do not reuse the legacy fixture's
  non-checksum ontology label as proof.
  Python parity repair (2026-09-02): `DomainClassificationSignalV1` and the
  strict wire path now require a checksum-shaped `ontologyRevision`, matching
  tuple provenance, and non-empty evidence references. Legacy values such as
  `ontology-kernel:v0` fail with `ONTOLOGY_REVISION_UNPROVEN`. Python focused
  tests pass 9/9; this remains fixture-proven and does not enable persistence.

  Proof refresh (2026-09-02): updated
  `scripts/atlas/prove-domain-ontology-tuple-wire-v1.py` for the stricter
  signal contract. It now supplies a checksum-shaped ontology revision and
  evidence reference, preserves tuple identity, rejects an unknown label, and
  reports `DOMAIN_ONTOLOGY_WIRE_PROVEN` with writes and canonical authority
  false. This is still a controlled fixture proof, not live classifier
  adoption.
  Chunk adapter (2026-09-02): added
  `build_domain_classification_signal_from_chunk` to the Python bridge. It
  derives a grounded `chunk:<id>:<start>-<end>` evidence reference and
  requires caller-supplied source namespace, source revision, mapping
  revision, and ontology revision. Focused Python tests pass 12/12. This
  closes the contract adapter gap but does not claim live classifier adoption.

  OKF producer audit (2026-09-02): `python/atlas_okf_docs_pipeline.py` and
  `python/atlas_external_docs.py` provide `ChunkRecord.source_revision`,
  document/chunk checksums, source URL, and exact character offsets. The
  pipeline does not yet invoke the strict admission bridge, and
  `SourceConfig` has no authoritative `sourceNamespace`. Do not derive that
  namespace from `source_id`, URL, or filesystem path. Live wiring remains
  blocked until the caller supplies the approved namespace and declared
  ontology manifest revision.
  The pipeline now exposes optional `SourceConfig.source_namespace` and
  carries it into source-artifact metadata, defaulting to `null` for existing
  manifests. This makes the missing authority observable without deriving a
  namespace or enabling admission. Focused pipeline/bridge tests pass 11/11.
  Live PostgreSQL lineage audit (2026-09-02):
  `scripts/atlas/audit-domain-classifier-lineage-v1.mjs` found 3,295 classifier
  rows, 3,294 with source refs, only 78 with source revisions, zero with an
  authoritative source namespace, 78 workspace-id namespace candidates, and
  3,217 missing Graphify joins. Status is `CLASSIFIER_LINEAGE_BLOCKED`.
  `workspace_id` remains a diagnostic candidate, not an admitted namespace.
  Evidence: `docs/reports/domain-classifier-lineage-v1.json`.
  PostgreSQL source-owner follow-up (2026-09-02): the live registry audit
  found `graphify_files` has 885 rows with `source_revision`, 373 with
  `workspace_revision`, but zero with `source_revision_authority` populated.
  `atlas_source_refs` has 22,604 rows, zero populated fragments, and only six
  commit hashes. PostgreSQL supplies revision observations, but not yet an
  approved source-authority namespace/evidence owner for live admission.
  Broader lineage audit (2026-09-02):
  `scripts/atlas/audit-live-source-lineage-tables.mjs` reports
  `SOURCE_LINEAGE_OWNER_SCHEMA_READY`, but `atlas_source_revisions` is only a
  two-row web-ingestion revision table keyed by `web_source_id`; it does not
  define the code/workspace namespace required by the classifier bridge.
  It is therefore not a substitute source-authority owner. The audit was
  read-only and reports `canonicalWrites: false`.
  Source-lineage model audit (2026-09-02):
  `scripts/atlas/audit-source-lineage-model-v1.mjs` confirms stable source
  identity and Graphify-backed source-version observations are available, but
  reports `IDENTITY_AND_VERSION_LAYERS_AVAILABLE_BINDING_LAYER_MISSING`.
  It finds 22,604 stable source refs, 885 Graphify source revisions, 111
  current workspace bindings, and 768 Graphify refs missing from the stable
  registry. This keeps live classifier admission blocked until the binding
  layer is approved and reconciled.
  Source-authority contract (2026-09-02): added
  `python/parent_atlas_ontology/source_authority.py`. It requires explicit
  namespace, source/workspace revisions, content digest, and evidence refs;
  it rejects missing authority and cannot grant canonical authority or enable
  writes. Focused Python checks pass 14/14. This defines the missing binding
  boundary but does not populate it from live rows.
  Bounded source cohort follow-up (2026-09-02):
  `scripts/atlas/audit-current-source-cohort-lineage-v1.mjs` found a clean
  111-row cohort with one current workspace revision, 111 Graphify matches,
  111 workspace-source bindings, and zero missing, mismatched, or ambiguous
  rows. This cohort is eligible for a future read-only classifier preview
  after its source namespace is explicitly bound; it does not repair or admit
  the remaining classifier population.
  Join normalization correction (2026-09-02): a diagnostic query that joined
  raw `canonical_source_ref` and `graphify_files.source_ref` returned zero
  matches because it omitted the repository's slash, separator, and case
  normalization. Re-running the same read-only comparison with normalized
  references produced 111/111 exact matches, with no prefix fallback required.
  The zero-match diagnostic is therefore not evidence of missing Graphify
  lineage and must not be used to downgrade the bounded cohort receipt.
  Cohort capability check (2026-09-02): the 111-row lineage artifact contains
  source paths, source revisions, and workspace revision only; it contains no
  source text or classifier output. It therefore cannot drive a genuine
  classifier admission preview yet. File-name or path classification would
  be an ungrounded substitute and remains prohibited.
  Read-only OKF admission preview (2026-09-02): added
  `preview_domain_ontology_admission` to the Python pipeline. It consumes
  existing `ChunkRecord` classifications, invokes the strict chunk adapter,
  and fails closed when `source_namespace` or `ontology_revision` is absent.
  With both explicitly supplied it reports admitted/rejected counts and
  grounded evidence references, while keeping tuple construction, Neo4j,
  Valkey, and all writes disabled. Focused pipeline/bridge tests pass 12/12.
  Cross-language signal parity (2026-09-02): added the shared fixture
  `docs/reports/fixtures/domain-classification-admission-v1.json`, the
  TypeScript `DomainClassificationSignalV1` schema/checksum contract, and the
  Python contract parser/checksum. Python parity tests pass 2/2, TypeScript
  parity tests pass 2/2, and the Parent Atlas package build passes. The first
  parity run caught Python omitting `source_namespace` from the canonical
  checksum; that drift was corrected before promotion. Mapping revision,
  ontology revision, and evidence-reference fields now hash identically.
  Legacy symbolic revisions are rejected as
  `ONTOLOGY_REVISION_LEGACY_REJECTED`. Real classifier admission, live
  evidence resolution, and all persistence remain open and write-disabled.
  Real classifier admission probe (2026-09-02):
  `scripts/atlas/prove-real-domain-classifier-admission-v1.py` classified the
  actual repository file `__tests__/data-hashing.spec.ts` as `database` and
  verified its content hash exactly matches the bound `sourceRevision`. The
  strict producer then rejected the signal with `SOURCE_NAMESPACE_UNPROVEN`
  because the authoritative workspace binding has no source namespace. This
  is the intended fail-closed result: direct classifier-to-ontology and
  direct classifier-to-tuple counts remain zero, with no persistence or
  projection attempted. The real admission gate remains open pending an
  approved source-namespace owner.
  Source-evidence hydration audit (2026-09-02): added
  `scripts/atlas/audit-current-source-evidence-hydration-v1.mjs` and
  `docs/reports/current-source-evidence-hydration-v1.json`. Across the 111
  lineage-clean sources, Graphify source revisions match exactly 111/111,
  but safe content hydration is 0/111, authoritative namespaces are 0/111,
  and evidence-span readiness is 0/111. The existing chunk owner has content
  for 68 sources but no source-revision field, while 43 sources have no
  matching canonical chunk owner. The audit uses no working-tree fallback and
  performs no writes; classifier-ready count remains 0 until a revision-bound
  content/span owner and authoritative source namespace are identified.
  Owner-resolution result (2026-09-02): the existing source registry and
  workspace binding tables provide identity/revision metadata but no content or
  byte spans; `graphify_files` provides source revisions but no content or
  spans; and `codebase_chunk_index` provides content/content hashes for 68
  cohort sources but no source-revision or byte-span binding. The remaining 43
  sources have no matching canonical chunk owner. No existing table therefore
  satisfies `GroundedSourceEvidenceV1`; creating a parallel source-text table
  is not authorized by this audit.
  AST-owner follow-up (2026-09-02): `atlas_ast_nodes` has schema support for
  source revisions and byte spans, but the 111-source intersection returned
  zero AST candidate rows and zero revision-qualified AST spans. It is
  therefore a potential existing producer boundary, not current hydration
  evidence. Classifier admission remains blocked until that owner is populated
  from the same source snapshot and an authoritative namespace is bound.
- [ ] **CONCEPT-04 — populate canonical registry only through an explicitly
  authorized migration/seed.** The existing `atlas_ontology_concepts` and
  `atlas_ontology_relations` schema is the target. Do not create a new JSONB
  taxonomy table, bitmap table, or parallel Neo4j authority. This task remains
  blocked while the global Drizzle migration baseline is unresolved.
- [ ] **CONCEPT-05 — project admitted concepts to Neo4j.** Reuse the existing
  packet/trace `USED_CONCEPT` projection only after PostgreSQL admission. Store
  `concept_id` plus ontology and mapping revisions on derived nodes/edges where
  the existing projection contract permits. Verify readback; keep
  `canonicalAuthority: false` for this tranche.
- [ ] **CONCEPT-06 — build one shared graph artifact.** Materialize one
  revision-qualified concept/relation projection with `ProjectionNodeKeyV1`,
  dense `ProjectionOrdinalMapV1`, typed edges, `projectionChecksum`, and
  `ordinalMapChecksum`. NetworkX, cuGraph, KMeans, and SOM must consume this
  same artifact rather than independently rebuilding topology.
- [ ] **CONCEPT-07 — derive graph and geometry features.** Compute bounded
  degree/PageRank/community, KMeans membership, 20x20 SOM coordinates, and the
  existing four-dimensional topology/manifold fields. These remain derived
  feature columns and may not become ontology identity, canonical labels, or
  extra retrieval votes.
- [ ] **CONCEPT-08 — create a revisioned classifier snapshot.** Assemble only
  admitted, source-revision-qualified rows with stable `CandidateOrdinal` or
  concept identity, mapping/schema/model revisions, feature checksum, label
  checksum, and train/evaluation split checksum. Split by source/workspace
  revision to prevent source leakage.
- [ ] **CONCEPT-09 — train an XGBoost baseline first.** Use the existing Go
  Retrieval/feature-serving boundary for inference metadata only; keep model
  training in the existing Python/GPU lane. Serialize JSON/UBJSON with the
  feature schema and category mapping. Record held-out accuracy, macro-F1,
  calibration, abstention, unknown-label rate, and deterministic replay.
- [ ] **CONCEPT-10 — add PyTorch only as a challenger.** A learned encoder or
  multilabel classifier may consume the same frozen snapshot, but must not
  replace the XGBoost baseline or alter ontology mappings without a separate
  promotion receipt. Record model, dataset, seed, device, and artifact checksums.
- [ ] **CONCEPT-11 — keep reinforcement learning deferred.** Judge feedback may
  rank proposals or select additional evidence, but it cannot mint ontology
  classes, rewrite canonical labels, or directly mutate Neo4j/PostgreSQL.
- [ ] **CONCEPT-12 — end-to-end read-only replay.** Replay the chain twice and
  require equal source/mapping/ontology revisions, tuple IDs, projection and
  ordinal checksums, normalized graph features, classifier input checksum, and
  prediction checksum. Require `writesPerformed: false` and
  `canonicalAuthority: false`.

The tranche cannot be marked complete until the canonical registry has declared
classes, the grounded admission fixture passes, the Neo4j projection reads back
from admitted PostgreSQL concepts, and the classifier replay is deterministic.
Raw Neo4j concepts, KMeans/SOM coordinates, and model predictions remain
non-canonical until those gates pass.

Evidence reviewed: `scripts/atlas/write-used-concept-edges-from-packets.mjs`,
`scripts/atlas/audit-grounded-concept-taxonomy-v1.mjs`,
`python/parent_atlas_ontology/domain_mapping.py`,
`sveltekit-frontend/drizzle/schema.ts`,
`services/topology-gpu/manifold.py`, and the existing RAPIDS parity reports.

## Session handoff (2026-09-02, ended on context budget — not blocked)

**Scope note**: this session's work is embedding/retrieval infrastructure, not
OaK/ontology-kernel proper — it started from reviewing this file's own
priority list and diverged into a separate, real track. Recorded here only
because this is the tasks.md the session was anchored to; no OaK gate status
above changed.

**Done and proven live, in order**:
1. `taxonomy_nodes`/`taxonomy_edges` added to canonical Drizzle schema
   (`schema-postgres.ts`) + 3 targeted metadata expression indexes
   (`drizzle/manual/20260902_taxonomy_nodes_metadata_param_indexes.sql`),
   applied live.
2. `TaxonomyOrdinalMapV1` (`packages/parent-atlas/src/core/
   taxonomy-ordinal-map-v1.ts`) — contract-only dense-ordinal/sort-key
   scaffold for taxonomy nodes, proven against all 5,527 live rows
   (`docs/reports/taxonomy-ordinal-map-v1.json`). Found and fixed a real
   `.localeCompare()` vs plain-`.sort()` divergence bug, also fixed in the
   sibling `projection-ordinal-map-v1.ts`.
3. Taxonomy wired into retrieval as a post-fetch filter
   (`SearchMetadataFilter.taxonomyNodeKeys` → `SearchFilter.include_source_refs`,
   resolved via new `taxonomy-retrieval-filter-v1.ts`) — no new lane.
4. `taxonomy_nodes_768` Qdrant collection — live, 5,527/5,527 real vectors,
   query-tested (semantic search for "authentication and login routes"
   correctly surfaces `loginSchema`/`auth.ts`).
5. **`EMBED-PROVIDER-CONVERGENCE-01`** — new single-owner resolver
   `sveltekit-frontend/src/lib/server/embedding/embedding-provider-v1.ts`
   (`resolveEmbeddingProviderV1()`, `checkVectorShapeV1()`,
   `checkEmbeddingReceiptV1()`). Wired into `/api/embed`,
   `embedding-client.ts` Tier-1, `embed-chunks.mjs`. Found and fixed a real
   bug: stale `EMBEDDING_PROVIDER=ollama` env var was overriding correct
   `:8081` URL evidence, silently mislabeling the resolved provider.
6. `PG18-AIO-OBSERVE-01` — read-only, no changes.
   `io_method=worker, io_workers=3, io_max_concurrency=64`. No restart.
7. **Root cause of the embed-server "12.75% failure rate" found and fixed**:
   not a concurrency/capacity issue — `:8081`'s `EMBED_UBATCH_SIZE=128` was
   silently rejecting any input over ~128 tokens (`HTTP 500 "input too
   large"`), identical 255/2000 failures at every concurrency level 1–20.
   Restarted `:8081` with `EMBED_UBATCH_SIZE=2048`/`EMBED_BATCH_SIZE=2048`
   (matches EmbeddingGemma's real 2048-token capacity). Reran
   `SEM768-8081-CAPACITY-01` (`docs/reports/sem768-8081-capacity-01.json`):
   **2000/2000 success at every concurrency level 1–20, zero failures**.
   Efficient operating point: concurrency=8 (throughput plateaus ~200 req/s
   past that).
8. `onnxruntime-node@1.29.0` proven clean in an isolated probe
   (`tmp/ort-probe-1.29/`, not installed in the main app) — P0–P4 all pass
   against the real model file, including 10x repeat inference, zero
   crashes. Main lockfile untouched. The live app still runs `1.14.0`,
   which crashes `InferenceSession.create()` at the native level (confirmed
   reproducible, isolated-child-process-confirmed) — reclassify as
   `EXECUTOR_RUNTIME_UNPROVEN`, not "failed": per the operator's correction,
   the ORT 1.14→1.29 pass/crash matrix points at an old-runtime-package
   problem, not a proven Node-22 ABI incompatibility.

**Explicitly NOT done this session** (next gates, in the operator's stated
order):
- `SEM768-EXECUTOR-BENCH-01B` — batching (`input: [...]` array) vs request
  fan-out on the now-fixed `:8081`; llama.cpp's `/slots` endpoint not yet
  used to distinguish real capacity limits from queueing.
- `ORT-CPU-RUNTIME-01` — audit-first (installed version, Node ABI,
  `availableExecutionProviders`, tokenizer checksum, 32-row cosine-parity
  fixture against the proven `:8081` output) before any main-app ORT
  upgrade or before ONNX CPU re-enters the executor bench.
- `SEM768-STORAGE-OWNER-01` — read-only: resolve
  `codebase_chunk_index.content_embedding` vs `.content_embedding_768` vs
  `semantic_768` ownership (which callers, which HNSW index, which model)
  before any new persistence contract.
- `SEM768-REPRESENTATION-CONTRACT-01` / `SEM768-CANONICAL-PERSIST-01` —
  `SemanticRepresentationV1` (packetKey/canonicalChunkId/sourceRevision/
  workspaceRevision/representationId/representationRevision/modelId/
  modelRevision/tokenizerRevision/executorId/executorRevision/dimensions/
  vectorChecksum/inputChecksum) — explicitly NOT started; do not begin the
  55,169-row backfill before `SEM768-STORAGE-OWNER-01` resolves which table
  is canonical.
- `GraphSnapshotV1`/`GraphFeatureReceiptV1` (NetworkX/cuGraph durable
  persistence) — flagged mid-session as likely already covered by
  `StructuralGraphSnapshotV1` + `graph_snapshot_parity_cugraph_oracle.py` +
  `graph-analysis-runner.ts`'s existing Postgres writers
  (`graph_community_assignments`/`graph_communities`/`graph_node_metrics`);
  not reconciled, don't build a second owner without checking first.

**Live server state left running**: `:8081` GGUF/CUDA embed server up with
`EMBED_UBATCH_SIZE=2048`/`EMBED_BATCH_SIZE=2048` (was default 128) — this is
a runtime env var override via the launch invocation, not yet persisted into
`scripts/launch-embed-server.ps1`'s own default or `.env`. If the server
restarts through the normal `npm run dev:gpu` path without that override, it
reverts to the 128 default and the fixed failure mode returns.

## CONCEPT-FABRIC-GLOSSARY-LINKS-01 (2026-09-03, additive UI wiring)

- [x] Existing glossary corpus-definition links remain document-backed through
  `/library/{docId}`.
- [x] HTTP(S) values already present in `legal_glossary.sources` are exposed as
  safe external links; non-URL source labels remain plain text.
- [x] No Firecrawl fetch, ontology promotion, embedding, or datastore write was
  added. Firecrawl/acquisition remains an upstream evidence owner and `.okf`
  remains schema/receipt input, not direct glossary authority.
- [ ] Add a revision-qualified external evidence join for Firecrawl content
  before presenting provider, content hash, or freshness claims in the glossary.

## CONCEPT-FABRIC-CORPUS-DEFINITION-LINKS-01 (2026-09-03, additive)

- [x] Corpus-extracted definitions now expose the existing
  `library_documents.official_url` as a validated external `Official source`
  link when it is an HTTP(S) URL.
- [x] Internal document links remain available through `/library/{docId}`.
- [x] No Firecrawl request, schema migration, ontology promotion, embedding,
  or datastore write was performed.
- [ ] Firecrawl capture identity, content hash, evidence revision, and `.okf`
  receipt binding remain a separate evidence-admission gate.

## CONCEPT-FABRIC-EXTERNAL-ACQUISITION-OWNER-01 (2026-09-03, audit)

- [x] Reuse the existing Python OKF acquisition owner:
  `python/atlas_okf_docs_pipeline.py` provides bounded Firecrawl V2 crawling,
  domain allowlisting, source revisions, normalized/raw checksums, outgoing
  links, and BeautifulSoup fallback.
- [x] Reuse `scripts/docs-atlas/crawl-okf-dev-docs.mts` only for the existing
  `.okf` development corpus path; it already chains Firecrawl, the local
  BeautifulSoup adapter, and bounded HTTP fallback with Zod validation.
- [x] Do not add Crawl4AI: no repository implementation or proven caller was
  found, and no distinct browser-rendering gap has been admitted.
- [ ] Glossary ingestion must consume revisioned evidence artifacts from these
  owners rather than calling a crawler from the glossary route.

## CONCEPT-FABRIC-OKF-TUPLE-RETRIEVAL-ALIGNMENT-01 (2026-09-03, bounded fixture)

- [x] Added a fixture-only alignment test for the existing fetch receipt,
  external-document chunk, n-ary ontology tuple, and retrieval-plan schemas.
- [x] Proves source-revision and normalized-document-checksum continuity,
  tuple degree/participant alignment, evidence-span binding, and one semantic
  retrieval lane with exact source promotion required.
- [x] Proves deterministic replay checksum for the same canonical fixture.
- [x] Keeps all four artifacts non-canonical; no crawl, index, promotion, or
  datastore write was performed.
- [ ] Live Firecrawl acquisition, concept admission, and retrieval execution
  remain separate gates.

## HYPERGRAPH-ARITY-CENSUS-01 (2026-09-07, read-only, live production DB)

A separate conversation proposed a `HYPERGRAPH_NARY_MATERIALIZE_01` gate on the premise that the
live `atlas_hyperedges`/`atlas_hyperedge_members` corpus is "mostly binary taxonomy material
wrapped in a hyperedge schema" rather than genuine n-ary HyperGraphRAG facts. Ran the census
against live production Postgres before accepting that premise — it's not just directionally
right, it's exact:

```sql
SELECT arity, count(*) FROM (
  SELECT hyperedge_id, count(*) AS arity FROM atlas_hyperedge_members GROUP BY hyperedge_id
) t GROUP BY arity;
-- arity=2: 62,802 hyperedges (100% — zero rows at arity 3+)
```

- `atlas_hyperedges`: 62,802 rows. `atlas_hyperedge_members`: 125,604 rows (exactly 2 per
  hyperedge, confirming the row counts cited in the proposing conversation were accurate, not
  approximated).
- `relation_type` breakdown: `CONCEPT_PART_OF` (57,751), `CONCEPT_BROADER_THAN` (5,051) — a
  binary taxonomy shape, not the cited `IS_A`/`INHERITS_FROM`/`PART_OF` exact labels, but the
  same taxonomic concept.
- `atlas_ontology_tuples`: 0 rows — confirms the "tuple materialization was empty" claim exactly.
- Real index/schema shape also confirmed exactly as cited:
  `symbol_resolver` has `feature_id`/`packet_key`/`source_ref` with indexes
  `idx_symbol_resolver_feature_id`, `idx_symbol_resolver_packet_key`,
  `idx_symbol_resolver_source_ref`; `atlas_hyperedge_members`'s PK is
  `(hyperedge_id, member_id, member_role)` with `idx_ahem_member_id` on `member_id` and
  `idx_ahem_member_type_role` on `(member_type, member_role)` — matches the proposing
  conversation's cited index names verbatim.

**Conclusion**: this repo's populated hypergraph corpus is currently, precisely, **100% binary**
— every stored hyperedge has exactly 2 members. `HYPERGRAPH_NARY_MATERIALIZE_01` (turning
role-labelled n-ary facts — e.g. one `EVENT` hyperedge with `actor`/`action`/`object`/`tool`/
`requirement`/`evidence` participants — into real stored hyperedges, rather than only binary
taxonomy edges) is a genuine, verified gap, not a speculative one.

**One correction to the proposing conversation's framing**: it characterized
`src/routes/api/admin/atlas/hyperrag/+server.ts` as "an older HyperRAG implementation" calling
embed/cluster/Qdrant/CouchDB/wiki-enrichment/CUDA-synthesis. Read the actual file — its own
docstring says otherwise: *"Legacy HyperRAG compatibility wrapper. The route keeps the old admin
surface alive, but retrieval and fusion now come from the canonical packet RPC / SearchRuntime
spine."* It already calls `hyperragPacketRpc()` (the canonical spine), not an old
embed/cluster/Qdrant/CouchDB pipeline — the backend has already been modernized. What's actually
stale is the **frontend**: `src/routes/(app)/admin/atlas/+page.svelte`'s `HyperRAGResult` type
still declares `phaseLatency: { embed, cluster, qdrant, couchdb }` and renders those specific
phase-timing fields in its HyperRAG tab — fields the modernized backend route doesn't populate
with real values from the new pipeline. So the alignment gap is real, but it's a **frontend
display artifact showing a defunct phase model**, not a backend architecture problem — a
narrower, more precise fix than "replace an old HyperRAG implementation."

Not built in this pass: `HYPERGRAPH_NARY_MATERIALIZE_01` itself, the bounded incidence-lookup
traversal, or the Studio tab rewrite. This is a census + one correction only.

## HYPERGRAPH_NARY_MATERIALIZE_01 — first bounded slice, fixture-proven (2026-09-07)

Investigated what this gate would actually need before writing anything, per this repo's
Duplication Prevention rule. Two genuinely good findings, neither anticipated going in:

1. **The contract and schema are already n-ary capable — nothing to build there.**
   `HyperedgeV1Schema` (`sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts`) declares
   `participants: z.array(HyperedgeParticipantV1Schema).min(2)` — no maximum — and its own
   docstring already says *"Build a deterministic role-aware n-ary fact/event."*
   `createHyperedgeV1()` already throws only on fewer than 2 participants, never on more. Checked
   the live Postgres schema directly (`pg_constraint` on `atlas_hyperedges`/
   `atlas_hyperedge_members`): only `NOT NULL`, a `lifecycle` enum check, a checksum-format check,
   and FK constraints exist — **zero arity-limiting constraints anywhere**. The 100%-binary
   population found in `HYPERGRAPH-ARITY-CENSUS-01` above is purely a fact about what's been
   *written* (`populate-hyperedges-from-taxonomy-edges-v1.mts`, which only ever derives from
   binary `taxonomy_edges` rows), not a limitation of the contract or the database.
2. **A genuinely n-ary evidence source already exists, unwired.**
   `ApiContractObservationV1` (`src/lib/server/atlas/language/api-contract-observation-v1.ts`) —
   already schema'd, already spec-tested — naturally carries `route` + `handlerSymbol` +
   `inputSchemaRefs[]` + `outputSchemaRefs[]` + `authRequirements[]` per observation, i.e. a
   single API-route fact already has 3-6+ distinct role-labelled participants. Its own fields
   `requiresCanonicalPromotion: true` / `canonicalWritesAllowed: false` show it was explicitly
   designed as an evidence input awaiting a promotion step — exactly this gate. Checked its
   producer, `sveltekit-api-contract-observer-v1.ts`: real, schema-valid, spec-tested, but **zero
   live callers anywhere in `src/` or `scripts/`** (confirmed via grep) — an unwired-but-real
   scaffold per [[feedback_no_delete_unwired_scaffolds]], not dead code.

**Built and fixture-proven**: `sveltekit-frontend/src/lib/server/atlas/graph/
hypergraph-nary-materialize-v1.ts` — `materializeApiContractObservationAsHyperedgeV1()` converts
one `ApiContractObservationV1` into a genuine `HyperedgeV1` (roles: `route`, `handler`,
`inputSchema`, `outputSchema`, `authRequirement`), reusing `createHyperedgeV1()` completely
unchanged. Fails closed (returns `null`, does not fabricate a binary fact) for non-HTTP
transports with no route, and for routes with only route+handler known (arity would be 2, which
defeats this gate's whole point). 5/5 tests pass (deterministic identical-input replay, arity
verification, both fail-closed paths, schema-validation pass-through), zero compiler diagnostics
on the two new files. Full receipt: `docs/reports/hypergraph-nary-materialize-v1.json`.

**Zero writes, zero schema changes, zero contract changes** — this is a pure fixture-input
conversion function. Explicitly NOT done in this slice: wiring the observer to a real scanning
caller (so `ApiContractObservationV1` rows come from live source, not only test fixtures), and a
Postgres write path for the resulting `HyperedgeV1` (the only existing writer precedent,
`populate-hyperedges-from-taxonomy-edges-v1.mts`, only ever writes arity-2 facts and would need
extending or a sibling script). Both are real, separate, un-started next gates.

## DEFINITION-LINEAGE-AUDIT-01 (2026-09-07, read-only)

The complete cross-plane review is recorded in
`docs/reports/parent-atlas-lineage-definition-audit-v1.json`. It confirms that the OKF/YAML
definitions, TypeScript/Python ontology contracts, 8095 providers, Postgres FTS/GIN boundary,
and hypergraph schemas exist, but their live admission chain is not closed.

- [x] Domain taxonomy mapping proof: 15/15 labels admitted, zero unresolved labels, no writes.
- [x] Hypergraph currentness census: 62,802 live hyperedges, 125,604 members, all arity 2;
      `atlas_ontology_tuples` remains empty.
- [x] Classifier lineage audit: 3,352 rows, only 148 revision-qualified Graphify joins,
      zero declared Graphify source namespaces, and 3,204 missing Graphify joins.
- [x] Current source cohort audit: 52/52 source-revision matches, 0/52 current workspace
      revision matches.
- [ ] Resolve Graphify source namespace and revision-qualified classifier coverage before
      ontology tuple admission.
- [ ] Reconcile current source cohort with `atlas_workspace_source_bindings` and the latest
      completed Graphify run.
- [ ] Complete 8095 observation → revisioned registry → Viterbi/ACE → CandidateFeatureMatrix
      replay with exact UTF-8 span readback.
- [ ] Materialize current grounded `OntologyLinkedTupleV1` facts under the existing promotion
      gate; taxonomy mapping alone is not tuple materialization.
- [ ] Wire the existing n-ary API-contract materializer to a real observer and explicit writer;
      do not replace the existing hyperedge schema or create a second graph store.
- [ ] Capture a production-shaped read-only Postgres FTS/GIN `EXPLAIN (ANALYZE, BUFFERS,
      SETTINGS)` receipt. PostgreSQL 18 AIO/bitmap behavior remains planner telemetry, not an
      application contract.
- [ ] Demonstrate one validated, canonical-serialized, checksummed `.okf`/YAML artifact
      flowing into each consuming boundary; registry navigation alone does not prove admission.

No schema, datastore, projection, or canonical ontology writes were performed by this audit.

### LEXICAL-IDENTITY-REPLAY-01 (2026-09-07, read-only)

The existing PostgreSQL FTS/GIN owner was replayed through its canonical identity audit. The
receipt is `docs/reports/postgres-fts-canonical-coverage-v2.json`.

- [x] Native `tsvector`/GIN candidate retrieval and `ts_rank_cd` executed for 8 frozen queries.
- [x] No query timed out; no database writes occurred.
- [x] 53,461 chunks have both `source_ref` and `content_hash`, but only 408 exact hash-qualified
      joins bind to `atlas_packets`.
- [x] The existing exact-canonical bridge recovered 18 additional replay hits; 353 were
      unresolved and 1 was ambiguous.
- [ ] Resolve packet/content-hash lineage before promoting the lexical result set to canonical
      ontology or ACE evidence.
- [ ] Capture the bounded query plan with `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)`; PostgreSQL 18
      AIO/bitmap behavior remains performance telemetry, not an application identity contract.

The hash join and exact-canonical bridge are alternative identity-resolution paths inside one
lexical lane. They must not be counted as separate retrieval votes.

### PACKET-HASH-BACKFILL-PREFLIGHT-01 (2026-09-07, read-only)

- [x] Re-ran `scripts/atlas/atlas-packets-content-hash-backfill-v1.mjs --dry-run`.
- [x] The selector found 21 uniquely eligible pending packet rows; selected 21, updated 0,
      and performed no Postgres/Qdrant/Neo4j/Valkey writes.
- [x] Obtain explicit authorization before `--apply-bounded`; authorization was supplied for
      the local non-production database. Readback passed; replay checksum parity remains open.
- [ ] Do not treat the bounded 21-row repair as closure: the current workspace packet/chunk
      audit still reports 111 binding rows and 0 exact joins.

#### Apply result (2026-09-07)

- [x] Explicit authorization was supplied for the local non-production database.
- [x] `--apply-bounded` updated 21 rows; independent readback matched all 21 expected hashes.
- [x] Follow-up replay attempted a second pass and changed 0 rows.
- [ ] Replay checksum parity remains open: the replay selector excludes already-populated rows,
      so its empty-selection checksum cannot be compared to the original frozen selection.
- [ ] Re-run the current workspace packet/chunk audit and resolve the remaining 111 binding-row
      mismatch before claiming full lineage closure.

### GRAPHIFY-CURRENT-OWNER-RECHECK-01 (2026-09-07, read-only)

- [x] Workspace-bound Graphify owner audit: the only current row is `RUNNING`, with no completed
      owner and no completion timestamp.
- [x] Previous completed run readback: 23,758 source rows; 23,532 content matches, 220 content
      mismatches, and 6 unavailable sources.
- [ ] Wait for or produce a completed Graphify-bound run, then re-run packet/chunk and classifier
      lineage against that exact workspace revision.
- [ ] Keep the previous run diagnostic-only; it is not a valid current source snapshot for
ontology tuple, n-ary hyperedge, semantic, or ACE promotion.

### NLP-SIDECAR-DIRECT-HEALTH-01 (2026-09-07, read-only)

- [x] Direct `:8095/health` returned `status: ok` and reported Tree-sitter, ast-grep, LangExtract,
      and NetworkX capabilities.
- [x] Direct `:8095/analyze` returned structured provider revision, text hash, and paragraph
      evidence without canonical writes.
- [x] Direct `:8095/ast/chunk` returned `atlas.ast.evidence.v1` with byte spans and the supplied
      source revision.
- [ ] Complete the higher-level ACP proof; its prior run connected to Postgres but exceeded the
      command window before producing a final receipt.

### INFRA-OBSERVABILITY-SWEEP-01 (2026-09-07, mixed read-only + applied fixes — session handoff)

Context: a disk-full incident (`C:` drive 931GB/931GB used, 0 bytes free) blocked `graphify:daily`
mid-run (`ENOSPC` in `materialize-addressable-packets.mjs`). Chasing that down surfaced a chain of
real, independently-verified infra/observability findings, several already fixed. Recording all of
it here for handoff — this thread does not cleanly belong to any single existing openspec change,
so it's parked here alongside the day's other ontology/OKF findings rather than left undocumented.

**Disk space — resolved.**
- [x] Root cause: `C:` drive genuinely full (931G/931G, 0 avail). Not a repo-local issue — verified
      via `df -h` and a full `AppData`/home-directory breakdown (PowerShell `Get-ChildItem -Recurse`,
      faster than bash `du` over NTFS in this environment).
- [x] Cleared confirmed-safe, pure-cache/duplicate items only (no experiments, no `.tmp/` scratch
      touched per explicit user correction — see feedback memory
      `feedback_dont_equate_blocked_status_with_abandoned`): npm-cache (5.45GB→0.04GB, `_npx` +
      `_cacache`), ~438 stale Windows Temp items (7.78GB, mostly empty MSIX installer-extraction
      leftovers from repeated app updates), WSL `~/.cache/pip` (8GB→8.7MB via `pip cache purge`),
      and two redundant WSL LiteRT-LM model copies (HF cache + `~/.litert-lm`, 6.4GB combined —
      confirmed duplicate of `models/gemma4-e2b-rotorquant-iq4xs/*.gguf` already in the project,
      from an abandoned LiteRT-LM-JS exploration 5 months stale).
- [x] Compacted the WSL `ext4.vhdx` via `wsl --shutdown` + `diskpart compact vdisk` — freed ~6GB on
      the Windows side despite the VHDX's logical size not changing (sparse-file behavior).
- [x] Net result: 0 bytes → ~29-32GB free (fluctuates with active pipeline writes).
- [ ] NOT done: Docker's own 153GB VHDX was never pruned/compacted — user explicitly declined
      `docker system prune` mid-session ("don't prune right now") after a broad "yes continue" had
      been given for the surrounding thread. Saved as feedback
      (`feedback_verify_before_disk_cleanup`'s existing point, reconfirmed live). Do not re-attempt
      without a fresh, specific confirmation for that exact command.
- [ ] `.tmp/atlas-gemma-rank-onnx` (2.4GB, the AGMR ONNX export attempt CLAUDE.md documents as "not
      usable yet") was flagged then explicitly protected — user confirmed these are active
      implementation artifacts, not abandoned. Do not flag CLAUDE.md's "not proven"/"blocked"
      status language as a deletion signal for any `.tmp` content going forward.

**Docker Desktop backend — resolved, side-effect of the WSL compaction above.**
- [x] `wsl --shutdown` (run for the VHDX compaction) also stopped Docker Desktop's own backend WSL
      VM (`docker-desktop`), which did not auto-recover — `docker ps` hung indefinitely, Postgres
      (`:5434`) became unreachable, breaking `graphify:daily`'s lifecycle-open step.
- [x] Fixed via a full process kill (`Get-Process docker*,Docker Desktop | Stop-Process -Force`,
      not just the tray app) + relaunch of `Docker Desktop.exe`. All 24 containers came back
      healthy within ~2 minutes. Verified `docker-desktop` WSL state = Running, Postgres reachable
      both via `docker exec ... psql` and a raw TCP check on `:5434`.
- [ ] Lesson not yet applied anywhere durable: any future WSL-shutdown-based compaction procedure
      for this repo should explicitly warn that it also takes down Docker Desktop's backend, and
      that a full process kill (not just quitting the tray icon) may be needed to recover it.

**`graphify:daily` — now runs clean end-to-end after the above two fixes.**
- [x] Third attempt (first two failed on `ENOSPC` then `ECONNREFUSED`) completed with exit code 0.
      Full 11-step `phase8-fanout` chain ran (langextract → summary-index-rank → summary-envelopes
      → envelope-queue → feature-envelopes → phase16 latent/SOM/GDS → bitfrost-warm →
      centroids-warm → graphify-draft), plus downstream embedding-plan/adaptive-sampling steps
      (some correctly `DEFERRED_*`, not errors).
- [x] Real, live-verified side effects: Redis/Valkey keyspace 276→10,570 keys; `bitfrost:*` keys
      0→**4,827** (exact match to CLAUDE.md's own documented figure, confirming the doc was
      correct, just describing a cache that had gone cold); `centroid:*` keys 0→66 (real
      population — CLAUDE.md's "centroid:* pattern returns zero matches, aspirational" caveat is
      now stale in the *other* direction and should be revised next time that section is touched).
      `gpu:karpathy:*` stayed 0 — expected, that's the separate manual `npm run karpathy:gpu` step,
      not part of this chain.
- [x] Real, incidentally-surfaced finding (not new, cross-references existing work): 58/61,718
      packets were quarantined during `summary-envelopes:build` for `title_id: required but
      missing or empty` — live confirmation that the already-tracked title_id stub gap
      (`parent-atlas-pass-fabric/tasks.md`) actually rejects real production packets.
- [ ] `npm run karpathy:gpu` (or equivalent) still needs a manual run if fresh Karpathy attention
      scores are wanted — not part of `graphify:daily`.

**Valkey/Redis config — corrected (not just diagnosed).**
- [x] Live-verified before touching anything: `maxmemory` = 2GB (matches docs), `maxmemory-policy`
      was `noeviction` (does NOT match CLAUDE.md's own documented `allkeys-lru` recommendation).
      TTL on a fresh `bitfrost:*` key: 603,740s ≈ 6.99 days (effectively the documented 7-day TTL).
- [x] First correction: set `allkeys-lru` (matching the stale docs) — but this was **itself wrong**
      and caught before it mattered: a live Lua `SCAN`+`TTL` sweep (single round-trip, not 10K
      individual `docker exec` calls — much faster) found **exactly 170 real non-expiring keys**
      (`bull:*` keys from the isolated `claude-mem` BullMQ runtime, plus `drizzle:tbl:*`/`drizzle:ct:*`
      schema cache) that `allkeys-lru` could evict under memory pressure since it evicts *any* key
      regardless of TTL.
- [x] Final, correct fix applied and persisted: `maxmemory-policy` = **`volatile-lru`** (only
      evicts TTL'd keys, never the 170 non-expiring ones), both live via `CONFIG SET` and durably
      in `docker/docker-compose.gpu.yml`'s `valkey` service (`command: ["valkey-server",
      "--maxmemory", "2gb", "--maxmemory-policy", "volatile-lru"]` — previously no `command:`
      override existed at all, so this policy was coming from the image default and was silently
      lost on every container recreate).
- [ ] `used_memory` is only ~21MB of the 2GB cap right now — this fix has no observable effect yet,
      it's a correctness fix for future memory pressure, not an active bug today.

**671MB `logs/embed-server/launch-2026-09-02T10-40-30.err` — real bug, root cause corrected.**
- [x] Confirmed NOT an error log: 7.4M lines of llama-server's default-verbosity per-request
      slot-cache debug output (`srv update: - prompt ... tokens, checkpoints...`), not failures.
- [x] Read `scripts/launch-embed-server.ps1` directly: it passes **zero** verbosity flags
      (`-m --host --port -ngl --embedding --pooling -c -b -ub -t`, optionally
      `--embd-normalize`) — so "remove `--verbose`" (an externally-suggested fix) does not apply,
      there is nothing to remove.
- [x] It also already writes a **new timestamped `.err` file per launch** (`launch-$stamp.err`),
      so "add rotation across launches" doesn't describe the real problem either.
- [x] Real cause, confirmed by the filename timestamp: **one single llama-server process has been
      running continuously since 2026-09-02** (5 days — this matches the EG-GGUF proof server
      noted in prior-session memory as "left running on :8081"), logging default verbosity the
      whole time with no way to reduce it since no `--log-verbosity`-style flag was ever set.
- [x] Identified via live `--help`: `-lv, --verbosity, --log-verbosity N` (env
      `LLAMA_LOG_VERBOSITY`), values `0=generic output, 1=error, 2=warning, 3=info` (threshold —
      higher-verbosity messages above N are ignored). Applied `--log-verbosity 0` to
      `scripts/launch-embed-server.ps1`'s arg list (after `-t $threads`), parse-checked via
      PowerShell's tokenizer (no execution). Not yet re-launched/tested live this session.
- [x] **Fully closed, live-verified.** Corrected an earlier assumption: `:8081`'s process
      (`PID 9168`) had actually started that same morning (2026-09-07 08:29), not 5 days earlier —
      the 671MB file was an orphaned leftover from an already-exited prior instance, not something
      the live process was actively appending to. Also corrected an earlier note calling this a
      "throwaway proof server" — `src/lib/server/embedding/canonical-embed.ts` and
      `embedding-provider-v1.ts` both default `EMBED_SERVER_URL`/`baseUrl` to
      `http://127.0.0.1:8081`, i.e. this is the real canonical embedding server, load-bearing.
      Verified `Get-Process -Id 9168` was genuinely `llama-server` before touching it, killed it
      cleanly, relaunched via the now-fixed `scripts/launch-embed-server.ps1 -Detached` (healthy,
      new PID, fresh log at `logs/embed-server/launch-2026-09-07T20-45-22.err`), sent a real
      `POST /v1/embeddings` request (HTTP 200), and confirmed the new log has **5 lines total**
      (startup only, zero per-request spam) versus 7.4M lines/671MB before. Deleted the old
      orphaned 671MB file. Net: root cause found, fix applied, restarted, verified with a real
      request, cleanup done — nothing deferred on this thread anymore.

**Graph-freshness `UserPromptSubmit` hook — confirmed broken as a Graphify-currentness proxy.**
- [x] The hook (`.claude/settings.json`'s `UserPromptSubmit` command) checks the mtime of
      `sveltekit-frontend/docs/graph/codebase-graph.json` specifically (NOT the repo-root
      `docs/graph/codebase-graph.json` — those are two different paths; an earlier check in this
      same session against the wrong one was a real self-caught mistake, corrected before
      reporting).
- [x] That file is real and genuinely last modified 2026-08-30 — the reported "11891min stale" is
      arithmetically correct for that file. But today's successful, thorough `graphify:daily` run
      (see above) never touches it — confirmed via 10+ files that reference this path, none of
      which were in the executed chain.
- [x] **Fully closed — no new receipt needed, one already existed.** Before building a new
      `CurrentGraphSnapshotV1` from scratch, checked whether `graphify:daily` already produces
      something equivalent (Duplication Prevention rule) — it does:
      `docs/reports/graphify-daily-lifecycle-v1.json` already carries `runId`, `repositoryRevision`
      (git SHA), `workspaceRevision` (sha256), `status: COMPLETED`, `completedAt` — everything the
      proposed receipt needed, and it was freshly written by this session's own
      `graphify:daily` run. Edited `.claude/settings.json`'s `UserPromptSubmit` hook (item 2 of its
      3-part check) to read this file's `completedAt`/`status`/`runId` instead of
      `sveltekit-frontend/docs/graph/codebase-graph.json`'s raw mtime, with a >24h staleness
      threshold (vs. the old 2h threshold, appropriate for a full daily pipeline vs. a quick index
      refresh). Verified `.claude/settings.json` is still valid JSON, then ran the **entire**
      embedded hook script standalone (all 3 checks: audit gates, graphify currentness, service
      health) exactly as it will fire on the next prompt — real output:
      `"graphify:daily: completed 174min ago (run 6c9d9642) | Services UP: turbo, bifrost, mcp |
      Services DOWN: sveltekit"`. Genuinely fixed and live-verified, not just diagnosed.

**Triton duplication follow-up — corrected, real mistake caught and retracted same-session.** A
later pass concluded `triton-trt-llm/model-repositories/` (2.9GB) was "orphaned" (no script in
`scripts/atlas/` writes to it) and proposed archiving it. That was wrong: `triton-trt-llm/` is a
**self-contained workspace** (its own `README.md`, `MANIFEST.json`, `scripts/`, `models/`,
`reports/` — including local copies of `materialize-gemma4-onnx-triton-repo.mjs` and
`start-gemma4-onnx-triton.ps1` distinct from the same-named files in `scripts/atlas/`), and its own
README already explicitly labels it `Status: scaffolded / experimental` (ONNX lane) /
`Status: future lane` (TensorRT-LLM). Same failure mode as the AGMR-ONNX mistake earlier this
session (see `feedback_dont_equate_blocked_status_with_abandoned`) — "no caller found in one
directory" was treated as "orphaned" without checking whether the target directory is itself a
scoped sub-project with its own callers. **Not archived. Do not revisit this specific 2.9GB as a
cleanup target without first re-reading `triton-trt-llm/README.md`.**

**Follow-up, now decisively resolved**: `triton-trt-llm/README.md`'s own documented command
(`npm run atlas:gemma4:onnx:triton:repo`) was traced to `sveltekit-frontend/package.json:626` →
`node ../scripts/atlas/materialize-gemma4-onnx-triton-repo.mjs --apply` — the **root-level**
script (writes to `triton-model-repository/`), NOT the nested
`triton-trt-llm/scripts/materialize-gemma4-onnx-triton-repo.mjs` copy. So the workspace's own
official tooling bypasses its nested materializer entirely. Final classification:
- `sveltekit-frontend/static/gemma4_e2b_onnx/` = ACTIVE_EXECUTOR (browser/client ONNX, keep)
- `triton-model-repository/` (repo root) = CANONICAL_ARTIFACT_OWNER (what the documented command
  and `scripts/start-gemma4-onnx-triton.ps1` actually use, keep)
- `triton-trt-llm/model-repositories/gemma4-onnx-q4f16/` (2.9GB) = **SUPERSEDED** — its would-be
  producer isn't in the workspace's own call path. Safe to archive **only this specific
  model-repository subdirectory**, not the `triton-trt-llm/` workspace itself (which stays — real,
  active, experimental, per its own README). Not yet archived this session — next actual step if
  picked up.

**Triton-on-Windows deprecation — new blocker for the whole Triton lane, found via live web
search, not yet checked against this repo's actual Triton version.** NVIDIA dropped Windows
support for Triton Inference Server entirely in a recent 2026 release ("dropped the Windows server
build and removed Windows from the core build and documentation" — `rel-26-06` release notes).
This machine is Windows 10 Home.

**Resolved, non-issue for this repo**: `grep`-confirmed the actual pinned image is
`nvcr.io/nvidia/tritonserver:24.11-py3` (`start-gemma4-onnx-triton.ps1`) and
`:24.11-trtllm-python-py3` (`start-triton-trtllm-engine.sh`), launched via `docker run` — a Linux
container image, never a native Windows binary. NVIDIA's Windows-support removal only affects
native-Windows Triton binaries; Docker Desktop's Linux container runtime is what actually executes
this image, same as every other service in this stack. The 24.11 pin (Nov 2024) also predates the
deprecation. Nothing to fix here. (The SUPERSEDED-directory archival was executed separately and
successfully — see the follow-up entry above; not gated on this check after all.)

CUDA version note (same search pass, for context, not an action item): 13.4.0 is a Developer
Preview (July 2026, bleeding edge); 13.3.1 is the current mainstream stable (June 2026); 12.9.x is
an older still-patched line. This repo's three CUDA environments (native Windows cu128, WSL2
RAPIDS at 13.0, WSL2 cuTile at 13.2) are all intentionally below latest — consistent with, not a
violation of, this file's own `DEPENDENCY-CAPABILITY-GUARD-01` no-version-chasing rule.

**ACE-GROUNDING-FAILCLOSED-01 (new P0, root cause located and independently verified in code).**
Follow-up to the ACE-staleness finding below: the root defect is now pinpointed, not just
observed as bad output. In `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`,
`buildAgenticRagContext()` computes `admissionStatus` (line 475: `revisionStatus === 'PRESENT' &&
freshnessStatus !== 'EXPIRED'`) but **returns `promptPacket` unconditionally regardless of that
status** (line 480) — independently confirmed via direct grep, not just asserted. Downstream,
`agentic-recommendation-workflow.mjs`'s L6 synthesis stage unconditionally injects
`aceContext.promptPacket` into the model prompt with no admission check at all, and the model's
resulting invented explanation then flows into `buildRecommendation()`'s `likely_cause` field
without being checked against the evidence it's supposedly grounded in. Chain: unrelated cached
ACE cards -> model invents explanation -> explanation becomes `errorSummary` ->
`build_recommendation()` -> `likely_cause` -> unrelated evidence attached beside it -> appears
grounded. This is a precise, code-verified instance of the evidence-laundering pattern this file's
own AGENT EXECUTION INTEGRITY section warns against, located inside `atlas-tools-mcp.mjs` itself.
**Proposed fix (not yet implemented — real engineering work, correctly deferred)**: gate
`promptPacket`/cards behind a real `ADMITTED_FOR_QUERY` state (query-checksum match + current
workspaceRevision + evidence-revision admissibility + relevance threshold + supported-evidence
count > 0), add an `EvidenceAdmissionV1` abstention state before any Ornith call
(`INSUFFICIENT_RELEVANT_EVIDENCE` etc. -> `{status:"ABSTAINED"}`, no LLM call), and apply the same
query-binding requirement to the separate `activeContext`/`atlas_get_active_context` path, which
has the identical unbound-ambient-context problem. Patch targets: `atlas-tools-mcp.mjs`,
`agentic-recommendation-workflow.mjs`. Smoke test to add: an ACE fixture where every cached card is
unrelated to the query, asserting zero admitted cards and zero LLM calls.

**Revised priority queue (supersedes any earlier informal ordering in this file)**:
P0 `ACE-GROUNDING-FAILCLOSED-01` (above) | P0 `CURRENT-SOURCE-EVIDENCE-HYDRATION-01` (the existing
235-mismatch/7-unavailable source-byte audit — classify mismatches by cause, e.g.
CRLF/worktree-vs-git-blob, encoding, stale revision — before assuming corruption; never rewrite
hashes just to go green) | P0/P1 `ACE-CONTEXT-QUERY-BINDING-01` | P1 `GRAPH-CONTEXT-CURRENTNESS-01`
(already closed above) | P1 `LEXICAL-APPLY-CANARY-01` (gated behind the source-evidence audit, not
independent) | P1 `ONTOLOGY-TUPLE-MATERIALIZE-01` / `NARY-MATERIALIZE-CANARY-01` (infra proven,
zero live data — do not build more hypergraph infrastructure, populate the infra that exists) |
P2 `CENTROID-REVISION-PUBLISH-01`, `NLP-SIDECAR-OWNER-01` (resolve the base/_v2/_oak 3-way split
found in the earlier subsystem sweep), `OKF-SCHEMA-PARITY-01`, `XGBOOST-OBJECTIVE-COMPARE-01` |
P3 topology-4D/AE/RLM harness (derived optimization, after the truth path is trustworthy).
Lexical scorer semantics (PG `ts_rank_cd`, correctly NOT literal BM25 per Postgres's own docs) are
CLOSED locally — leave `/search/bm25`/`Bm25ObservationV1` names as compatibility debt, not a
correctness bug. Next concrete local action if picked up:
`node scripts/atlas/audit-current-source-evidence-hydration-v1.mjs` (read-only) run in parallel
with building the zero-write ACE fail-closed smoke test described above.

**ACE-packet synthesis pipeline — demonstrated unreliable for fresh/novel queries, evidence-laundering
pattern caught live.** Ran `scripts/atlas/agentic-recommendation-workflow.mjs --query "..."` (the
real, wired ACE-packet-builder + recommendation pipeline established earlier this session) with a
query about today's actual findings (binary-only hyperedges, empty `atlas_ontology_linked_tuples`,
stale Karpathy scores). Result: `build_agentic_rag_context` returned a **stale cached packet
entirely unrelated to the query** (`.opencode/ace-packet.json`'s cached `PACKET_IDENTITY`/
`OKF_SOURCE`/`TOPOLOGY_ROUTING` reconciliation snapshot from an unconnected earlier investigation —
the tool does keyword-overlap scoring against whatever's cached, it does not re-derive fresh
evidence per query). The synthesis stage then **fabricated a plausible-sounding bridge** between
that irrelevant evidence and the actual query: `"likely_cause": "AtlasGraphCanvas.svelte renders
the Atlas knowledge-graph visualization surface..."` with justification "...so it is where the
binary-only corpus, empty ontology_linked_tuples, and stale Karpathy scores would surface as
visible rendering gaps" — zero real grounding, a confident hallucinated connection. This is a live
instance of the exact `AUDIT_STATUS_FORCED_WITHOUT_EVIDENCE`/evidence-laundering pattern this
file's own "AGENT EXECUTION INTEGRITY" rules warn against, occurring inside the tool itself, not
just something an LLM agent might do on top of it. **Do not trust this pipeline's
`structured_recommendation.likely_cause`/`proposed_fix` fields for novel queries without
independently verifying every cited sourceRef actually relates to the query** — treat its output as
a starting search hint at best, never as grounded synthesis, until `.opencode/ace-packet.json` is
confirmed regenerated fresh per-query rather than served from a stale cache.

**8-item subsystem breadth sweep (domain classification / OKF / Mastra / XGBoost / ontology tuples
/ neural decoder / PCA-SVD) — see the parallel `parent-atlas-best-fit-score-fabric` and this file's
existing OKF-collision entries for detail; not re-duplicated here. One new fact from that sweep
worth recording in this file specifically: `atlas_ontology_linked_tuples` (the real, live-code
table — distinct from the also-empty `atlas_ontology_tuples`) has a reader module
(`ontology-linked-tuple-postgres.ts`) and a `search-runtime.ts` comment referencing it as a future
read path, but zero live executing queries actually read it into a classifier — confirmed
write-target-only, same category as the hyperedge n-ary gap already tracked above.**

**Not independently re-verified this session** (surfaced via an externally-pasted technical
review, partially checked): XGBoost's exact CUDA-version/UBJSON-default claims, Zod's precise
JSON-Schema-experimental status, Mastra's specific workflow-graph feature set, PyTorch's exact
custom-op/`opcheck` authoring guidance. One related claim (llama.cpp `cache_prompt` correctness
risk) found real, adjacent support via a live web search — GitHub issue `ggml-org/llama.cpp#4902`,
"Cache and system prompt on server makes output non-deterministic" — supports the general point
even though the original phrasing ("alters logprobs") wasn't a verbatim match to that issue.

## HYPERGRAPH-NARY-EVIDENCE-SOURCE-SURVEY-01 (2026-09-07, read-only, live production DB)

Follow-up to `HYPERGRAPH-ARITY-CENSUS-01`/`HYPERGRAPH_NARY_MATERIALIZE_01` above, prompted by a
steer toward checking graphify-run identity (`runId`/timestamp/`workspaceId`) and domain-
classification/`.okf` schema as alternative n-ary evidence sources, rather than only the
`ApiContractObservationV1` path those two entries already cover. Revision-bound the arity census
first (`ATLAS_EXPECTED_GRAPH_REVISION=taxonomy-edges-v1-2026-05-08
ATLAS_EXPECTED_WORKSPACE_REVISION=git:0084288f26 node
scripts/atlas/audit-hypergraph-current-arity-census-v1.mjs`) — fresh receipt now reports
`currentBindingProven: true`, same 100%-binary arity numbers as before (this only proves the
existing census ran against the revision it claims to describe; it changes no data).

Surveyed six additional table families live (row counts, schema, and populated-predicate
diversity — not just existence) to see whether any already holds real, populated, naturally
3+-participant facts:

| Table | Rows | Shape found |
|---|---|---|
| `graphify_executions` / `graphify_execution_files` | 9 / 27 | **Real, genuinely multi-role** (`execution_id` × `workspace_id`/`workspace_revision` × `source_ref` × `code_source_revision` × `content_hash` co-occur per row), but canary-scale only — every row's `trigger_kind = 'BOUNDED_COMMITTED_CANARY'`, matching the migration's own stated proof-gate step, not production traffic. Migration file (`drizzle/manual/20260903_graphify_execution_ledger_v1.sql`) says explicitly not yet promoted to a production coordinator. |
| `ontology_domain_tuples` | 61,659 | SPO-shaped (`subject`/`predicate`/`object` + `domain_class` + `packet_key`), but **degenerate**: 100% of rows use the single predicate `classified_as` (`packet:X classified_as domain:Y`) — isomorphic to a flat 2-column table wearing a triple-store schema. |
| `feature_domain_facts` | 91,658 | Flat packet→domain classification fact (`packet_key`, `source_ref`, `domain_class`, jsonb `evidence`/`domain_probabilities`), 100% `classifier_kind='legacy-backfill'` — real and richer metadata than `ontology_domain_tuples`, but still one participant (packet) per row, not a multi-entity relationship. |
| `atlas_relationships` / `atlas_relationship_members` | 603 / 1,206 | **Schema is fully ternary/nary-capable** (`relationship_degree_kind` CHECK constraint literally includes `'ternary'`/`'nary'`, plus `participant_count`/`relationship_degree`/`source_revision`/`producer_revision` columns) — but populated data is 100% `binary` degree, single `relationship_type = 'USES_CONCEPT'`, exactly 2 members every row (1206/603). |
| `atlas_feature_relationships` | 4,097 | Plain old binary edge table (`source_feature_id`/`target_feature_id`), no hyperedge shape at all. 4 relationship types (`sibling` 3,890, `related_by_error` 98, `child` 57, `parent` 52). |
| `atlas_relationship_cardinality` / `atlas_relationship_embeddings` / `concept_records` | 0 / 0 / 0 | Empty. `concept_records` being 0 rows is itself a correction to `.okf/concepts/concept-edge-ledger-gap.yaml`'s own evidence note (below) which claims "concept_records exists... nodes exist" — that claim is stale/wrong as of today. |

**The real finding is in `.okf/` (repo root), not previously connected to this thread.** It's a
genuine, substantial directory — "OpenSpec Knowledge Framework (OKF)", `manifest.yaml` version 2,
`concepts/domains/indexes/languages/pipelines/predicates/runbooks/systems/tools` subdirs. Two
things in it directly bear on the n-ary gap:

1. **`.okf/predicates/feature-relationships.yaml`** is a versioned, active (`status: active`)
   predicate registry that already defines exactly the `canonical_relationship` contract
   `atlas_relationships` implements (`required_fields: relationship_id, relationship_type,
   participants, participant_count, relationship_degree, relationship_degree_kind, source_ref,
   source_revision, relationship_revision, producer_revision` — matches the live table schema
   field-for-field), including an explicit `degree_semantics` block (`unary:1, binary:2,
   ternary:3, nary:">=4"`) and a predicate, **`authorized_resource_mutation`**, whose
   `allowed_degree` is `[ternary, nary]` ONLY (not binary) with `required_entity_types: [feature,
   route, database_policy]` and `recommended_entity_types: [service, table, column, test]`.
   **Zero producers reference this predicate anywhere** (`git grep -l
   "authorized_resource_mutation" -- 'scripts/*'` → no matches; `atlas_relationship_members` is
   referenced by exactly 3 scripts, all of which only ever write the binary `USES_CONCEPT` fact).
2. `manifest.yaml` declares `predicates/ontology.yaml` as a schema but the file **does not exist**
   on disk (only `feature-relationships.yaml` is present in that dir) — a manifest-vs-reality
   drift, separate from the n-ary gap itself, flagged not fixed.
3. `manifest.yaml`'s own `index_policy.semantic_lane.executors` already lists `pgvector_ivfflat`
   explicitly (alongside `pgvector_exact`, `pgvector_hnsw`, `qdrant`, `cuvs_cagra`) — this directly
   answers the "is IVFFlat relevant here" question from earlier in this thread: **yes, it's
   already a declared semantic-search-lane executor**, but it has nothing to do with the
   relationship/hyperedge structural-membership problem — GIN (`atlas_relationships` already has
   `atlas_relationships_metadata_gin_idx gin(metadata jsonb_path_ops)`) is the real existing
   pattern for that. This also corroborates, rather than duplicates, `LEXICAL-IDENTITY-REPLAY-01`
   and `DEFINITION-LINEAGE-AUDIT-01` above, which already concluded "PostgreSQL 18 AIO/bitmap
   behavior remains planner telemetry, not an application contract" — nothing found in this survey
   contradicts that; AIO/bitmap simply never came up as relevant to relationship storage.

**Conclusion — a narrower, lower-effort next gate than the `ApiContractObservationV1` path.**
That path (`HYPERGRAPH_NARY_MATERIALIZE_01` above) already has a fixture-proven converter but
still needs BOTH a live observer wired to a real scanning caller AND a new Postgres write path.
By contrast, `atlas_relationships`/`atlas_relationship_members` **already has its writable schema
and contract in production** (proven by the 603 real `USES_CONCEPT` rows) — the only missing piece
for a first real ternary fact is a producer that emits `authorized_resource_mutation` relationships
(3 participants: a `feature`, a `route`, a `database_policy`) from data this repo already has
elsewhere (route→feature mapping exists per `src/lib/server/atlas/route-feature-map.ts` referenced
in project CLAUDE.md; auth/route-guard metadata exists per the G4/G5 audit findings in the root
CLAUDE.md). **Not built in this pass** — this is a survey, per the bounding plan for this step; the
producer itself is real, separate, unstarted work, and should reuse the existing
`atlas_relationships`/`atlas_relationship_members` schema and `feature-relationships.yaml`
`quality_gates` (`reject_declared_degree_mismatch`, `reject_duplicate_cardinality_role`,
`reject_unknown_cardinality_role`, `require_revision_qualified_source`,
`require_relationship_id_on_pairwise_projection`) rather than inventing new validation rules.

### PostgreSQL 18 AIO / "bitmap" follow-up — is either actually a table/index migration? (2026-09-07)

Direct follow-up: does this repo's AIO/bitmap story involve any real `CREATE`/`ALTER TABLE`
migration, and if so has it been applied? Checked live, not assumed from the `.okf` spec text
alone.

**AIO is genuinely live on this Postgres instance** — `SHOW io_method` → `worker` (PG18's async-IO
backend; `io_workers=3`, `io_max_concurrency=64`, `io_combine_limit=16` [128KB]), confirmed on
`legal-ai-postgres` right now. This is a real, active PG18 feature, not just a version-number bump.
**But it is correctly modeled as non-migratable**: `.okf/domains/parent-atlas-execution.yaml`
(`storage.postgres18.aio_role`) and `.okf/indexes/feature-intelligence.yaml`
(`bitmap_planner`/`postgres18_aio`, both explicitly `canonical_index_type: false`) already state
AIO and Postgres's automatic bitmap-heap/index-scan are transparent storage-engine execution
optimizations — there is nothing to `ALTER TABLE` for either one, and no migration in this repo
attempts to. This corroborates (does not duplicate) the "planner telemetry, not an application
contract" conclusion already recorded in `LEXICAL-IDENTITY-REPLAY-01`/`DEFINITION-LINEAGE-AUDIT-01`
above.

**A separate, unrelated "bitmap" DOES involve real migrations**: two sibling manual migrations
model an application-level explicit `bit(16)` flag column (a caller-defined compact filter mask,
nothing to do with Postgres's planner-level bitmap scan):
- `drizzle/manual/20260824_graphify_file_search_bitmap_v1.sql` (file-level) — **not applied**
  (table doesn't exist live); `sidecar-migrations.json` correctly tracks this as `manual_sidecar`,
  "unapplied until export, schema, and rollback proofs pass." Its own sibling migration's header
  comment explains why: a `GENERATED ALWAYS AS ... STORED` column calls `array_to_string()`, which
  Postgres marks `STABLE` not `IMMUTABLE` — "generation expression is not immutable," confirmed
  live against PG18.4 — a real blocking bug, not just caution.
- `drizzle/manual/20260826_atlas_class_search_index_v1.sql` (class-level) — **applied and live**:
  `atlas_class_search_index_v1` exists with 3,675 real rows (AST-grep class-node extraction). It
  deliberately fixes the sibling's bug via an `IMMUTABLE` wrapper function
  (`atlas_immutable_array_to_string`) before reusing the same generated-tsvector pattern. Its own
  `class_bitmap bit(16)` column is 100% still the default `B'0000000000000000'` across all 3,675
  rows — **by design, not a defect**: the file's own header comment says it's "reserved for future
  caller-defined flags; no meaning assigned yet."

**One real, small hygiene gap found**: despite being applied and live, `20260826_atlas_class_search_
index_v1.sql` has **zero entry anywhere in `drizzle/sidecar-migrations.json`** — its sibling
(`20260824`) is correctly tracked there as unapplied, but the one that actually ran is simply
absent from the tracking manifest (verified via direct `git grep` for both the exact filename and
the table name — no match either way; a naive substring check on the whole JSON blob for the date
`20260826` alone false-positives against two unrelated same-day migrations,
`20260826_restore_nes_chrom_packets_v1.sql` and `20260826_atlas_hyperedges_gate_alignment_v1.sql`
— worth remembering as its own small lesson: substring-matching a date prefix across a JSON blob is
not equivalent to confirming a specific migration is tracked). Not a data-safety issue (the
migration is additive/`IF NOT EXISTS` per the Drizzle Safety Rule, and the table is real and
correct) — just a documentation-tracking omission, flagged not fixed.

**Net answer to "table add/alter/indexing migrated? updated?"**: AIO — nothing to migrate, already
live via Postgres config, correctly documented as non-canonical. Bitmap-as-planner-behavior —
same, nothing to migrate. Bitmap-as-stored-column — one sibling migration applied and live (table
+ column exist, column intentionally unpopulated placeholder), one sibling still blocked on a real
immutability bug and correctly marked unapplied; the applied one is just missing from the tracking
manifest. No further action taken — this is a status resolution, not a new build.

### Schema-validation deep audit: are the 5 named `.okf` quality_gates actually enforced? (2026-09-07)

Direct follow-up to `feature-relationships.yaml`'s five named `quality_gates`
(`reject_declared_degree_mismatch`, `reject_duplicate_cardinality_role`,
`reject_unknown_cardinality_role`, `require_revision_qualified_source`,
`require_relationship_id_on_pairwise_projection`). First check: do any of these 5 exact identifiers
(or an obvious camelCase form) appear anywhere in application code? **Zero matches**, either form,
across `sveltekit-frontend/src` and `scripts` (`git grep`, both spellings). Read that as "nothing
enforces these" and it would have been **wrong** — checked further and found real enforcement,
just under different names:

- **`reject_declared_degree_mismatch` — genuinely enforced, live, correctly implementing a subtle
  spec detail.** `atlas_validate_relationship(p_relationship_id)` is a real Postgres function
  (confirmed via `pg_proc.prosrc`) that checks, per relationship: `participant_count = COUNT(*) of
  members`, `relationship_degree = COUNT(DISTINCT entity_type)`, and `relationship_degree_kind`
  matches the unary/binary/ternary/nary mapping of that same distinct-entity-type count. This
  exactly implements `feature-relationships.yaml`'s own `degree_semantics` block
  (`participant_count_is_degree: false` — degree is distinct-entity-TYPE count, not raw
  participant count) — a correct, non-obvious implementation detail that's easy to get wrong, and
  it's right. It's called from `packages/parent-atlas/src/core/feature-intelligence-repository.ts`
  inside `persistRelationship()` (`SELECT atlas_validate_relationship($1) AS valid` — throws on
  `false`), live-proven end-to-end by
  `scripts/atlas/rel-fi-01-feature-relationship-persistence-live-proof-v1.mts`. **Caveat**: this is
  an application-invoked function, not a database trigger/constraint — it protects callers that go
  through `persistRelationship()`, not a hypothetical direct-SQL writer bypassing that repository
  method (confirmed zero triggers exist on `atlas_relationships`/`atlas_relationship_members` —
  `information_schema.triggers` returned 0 rows for both tables).
- **`reject_duplicate_cardinality_role` — partially enforced by an incidental constraint.**
  `atlas_relationship_members_relationship_id_role_entity_type_key` (a plain composite UNIQUE
  constraint on `(relationship_id, role, entity_type, entity_id)`) prevents the exact-duplicate
  case, but it exists as an ordinary uniqueness key, not because it was designed to satisfy this
  named gate — and it wouldn't catch a role-level cardinality violation across two *different*
  `entity_id`s in the same role (e.g., a role the cardinality registry marks max-1 being violated
  by two distinct entities). That finer check depends on the next item.
- **`reject_unknown_cardinality_role` — real, wired, currently unexercised (not broken).**
  `atlas_relationship_cardinality` (0 rows, flagged empty above) is not dead — `persistRelationship()`
  genuinely writes to it (`INSERT INTO atlas_relationship_cardinality ...` for each entry in a
  caller-supplied `relationship.cardinality` array) and reads it back (`findRelationshipsForEntities`
  joins it in). Zero rows simply means all 603 real `USES_CONCEPT` writes supplied an empty
  cardinality array — an unused *input*, not a broken feature. Confirmed via direct source read of
  `feature-intelligence-repository.ts`.
- **`require_revision_qualified_source` — enforced, plainly.** `atlas_relationships.source_revision`
  is a real `NOT NULL` column (confirmed via `\d atlas_relationships` — no `.okf`-referencing
  comment ties it to this gate name, but the effect is the same).
- **`require_relationship_id_on_pairwise_projection` — not yet applicable, not violated.** No
  pairwise graph-edge projection of `atlas_relationships` data exists yet anywhere in this repo
  (matches the earlier finding that only 3 scripts touch `atlas_relationship_members`, all
  persistence-proof/replay scripts, none a graph-projection step) — the gate is vacuously satisfied
  because its precondition (a projection exists) hasn't happened yet, not because it was checked
  and passed.

**Correction to how I was framing this pattern earlier in this thread**: the `authorized_resource_
mutation` predicate genuinely has zero producers (confirmed, real gap). It would have been wrong
to generalize that into "the whole `.okf` quality-gate layer is declarative-only" — this specific
audit shows real, correct, live enforcement for 3 of the 5 gates (one exact, two by-incidental
constraint/effect), one genuinely unexercised-but-wired, and one not-yet-applicable. Predicate-
vocabulary diversity (which predicates get used) and degree/cardinality validation (whether a used
predicate's shape is internally consistent) are two independent problems in this schema — this
repo has solved the second one correctly while the first remains open.

**Addendum**: `featureRelationshipSchema`'s own Zod `.superRefine` (`packages/parent-atlas/src/
core/feature-intelligence.ts` lines 96-143) independently re-implements `reject_declared_degree_
mismatch` AND `reject_duplicate_cardinality_role`/`reject_unknown_cardinality_role`
(`cardinality role ${role} is not a relationship participant` / `is duplicated`) client-side, on
top of the Postgres-side `atlas_validate_relationship()` function — genuine defense-in-depth, not
duplication; the TS layer rejects before a write is attempted, the Postgres layer catches anything
that bypasses `persistRelationship()`.

## PRODUCE-AUTHORIZED-RESOURCE-MUTATION-01 — first real producer, DRY_RUN_PROVEN (2026-09-07)

Direct implementation follow-up to the two survey/audit sections above: built the producer that was
missing (`scripts/atlas/produce-authorized-resource-mutation-relationships-v1.mjs`) rather than
leaving the gap as record-only. Evidence source is reused, not re-derived: the 19 real
authenticated-mutating-route findings already in root CLAUDE.md's "G5 open finding" section
(2026-09-01 `/deep-audit`, each row already citing a live-grepped auth-guard literal) — per this
repo's Duplication Prevention rule, this session did not re-scan the route tree (a first attempt
to source `feature`/`route` participants from `route-feature-map.ts` was abandoned immediately —
that auto-generated file has zero auth/service data, every entry literally `service: 'unknown'`).

For each of the 19 routes, built a ternary `authorized_resource_mutation` candidate with
participants `{role: feature}` / `{role: route}` / `{role: database_policy}` (the OKF spec's exact
`required_entity_types`), the `database_policy` entity_id classified from the literal auth-guard
string (`requireAdmin`/`role !== 'admin'` → `policy:admin-only`; guards including
`DEV_BYPASS_AUTH` → `policy:authenticated-user-dev-bypass`; plain `locals.user` → `policy:
authenticated-user`), via `buildFeatureRelationship()` (auto-derives `relationship_degree`/
`relationship_degree_kind` from distinct participant entity types — reused unchanged, not
reimplemented).

**Result**: `docs/reports/authorized-resource-mutation-dry-run-v1.json` —
`status: "DRY_RUN_PROVEN"`, 19/19 candidates Zod-valid, 19/19 correctly classified `ternary`
(3 participants, 3 distinct entity types), `postgresWritesPerformed: false`. **No Postgres
connection was made** — validation is entirely client-side (mirrors, does not invoke,
`atlas_validate_relationship()`'s semantics), consistent with this repo's DRY_RUN_PROVEN-before-
APPLY_PROVEN status-language convention.

**Not done in this pass, deliberately**: a `--apply` path that actually calls `persistRelationship()`
and writes real rows to `atlas_relationships`/`atlas_relationship_members`. This would be the first
ternary fact ever written to production for this table family (currently 100% binary, 603 rows) —
that's a real state change warranting its own explicit authorization step, not something to fold
into a dry-run producer's first pass. When authorized: reuse `persistRelationship()` unchanged
(same function the 603 real binary rows already went through), and re-verify against
`atlas_validate_relationship()` live post-write, not just the client-side Zod pass already proven
here.

### Documentation fix: `20260826_atlas_class_search_index_v1.sql` sidecar-tracking gap (2026-09-07)

Closed the small hygiene gap found in the AIO/bitmap follow-up above: added the missing entry to
`sveltekit-frontend/drizzle/sidecar-migrations.json` for this migration (applied and live, 3,675
rows, previously untracked) — additive JSON-only edit, re-validated as well-formed JSON after the
edit, no schema or data touched.

## Read-only combined owner census: semantic_768 / feature_registry / task_semantic_packets / views (2026-09-07)

Per a specific steer to run a bounded, read-only census across five objects before any new
migration — **no migration was applied, no table was altered, no data was written**. Every finding
below is from live `\d`/`information_schema`/`pg_views` queries or direct source reads.

### 1. SEMANTIC768 PHYSICAL OWNER — resolved, not a new contradiction

```
content_embedding      halfvec(768)  55,169 populated rows  HNSW (halfvec_cosine_ops)
content_embedding_768   vector(768)   1,386 populated rows  HNSW (vector_cosine_ops)
```

This is not a fresh ambiguity — it's an exact re-confirmation of this same file's (CLAUDE.md)
already-published Embedding Dimensions Policy resolution, which explicitly names
`content_embedding_768` as "a much smaller, separate column — do not confuse the two" and
`content_embedding` (55,169 rows) as canonical. Live numbers today match that doc exactly.
**Freeze**: `content_embedding` is the physical owner of `semantic_768`. `content_embedding_768`
is LEGACY/minority — real, indexed, but not canonical, not touched by this census.

### 2. FEATURE REGISTRY OWNER — table absent, two dormant (not actively-run) writers found

`feature_registry` does not exist in `information_schema.tables` — confirmed absent, matching the
premise. Bounded search (4 real hits, not a broad grep) found:
- `scripts/atlas/prove-feature-registry-disposable-postgres.mjs` — already did exactly the right
  thing: proves the historical `0024_nebulous_mongoose.sql` + `0025_yellow_tony_stark.sql` DDL is
  internally valid inside an **isolated, disposable** Postgres container (never touches
  `legal_ai_db`), and its own `remainingBlocker` field explicitly says: *"Live migration-ledger/
  baseline reconciliation remains required before any local feature_registry apply. This proof
  does not authorize drizzle-kit migrate."* — i.e., someone already reached the same conclusion
  this census was asked to reach, and correctly stopped short of applying it.
- `scripts/atlas/extract-md-checkbox-features.ts` and `scripts/atlas/rlm-condense-index.ts` — both
  contain real `INSERT INTO feature_registry (...)` statements that **would fail** against this
  live database (table doesn't exist). Checked whether either is an active dependency: **neither
  appears in `package.json` (root or `sveltekit-frontend/`) or `.vscode/tasks.json`** — they are
  standalone, unwired scripts, not part of any automated pipeline. Classification: **not
  `BROKEN_DEPENDENCY` in the sense of something currently running and failing** — closer to
  dormant/orphaned writer code that would break only if someone manually ran it. Do not resurrect
  the table to "fix" these; if anything, they're candidates for the same archive-or-fix review as
  other dormant scripts found earlier this session.

### 3. TASK SEMANTIC PACKET WRITER CENSUS — real drift found, in both directions, plus one serious open question

Live table (`\d task_semantic_packets`) has exactly the 16 columns the steer predicted: `id,
packet_key, source_ref, feature_id, feature_label, alias_id, qdrant_score, cluster_score,
topological_score, fusion_score, metadata, semantic_vector, validation_status, error_message,
created_at, updated_at`.

The Drizzle schema (`sveltekit-frontend/src/lib/server/db/schema/tasks.ts`,
`taskSemanticPackets`) declares **40+ columns** — `point_kind, qdrant_point_id, workspace_id,
workspace_task_id, canonical_source_ref, source_ref_hash, file_path, semantic_path,
related_feature_ids, related_task_ids, related_file_paths, cluster_id, centroid_id,
parent_centroid_id, community_id, community_source, community_confidence, tags, summary,
summary_llm, summary_model, next_action, summary_hash, confidence, lineage_version, ledger_type,
canonical, payload_backfilled_at, domain_class, som_row, som_col, som_index, kmeans_cluster,
status, agent_pickup_ready, observed_at, valid_from, valid_to, deleted`, etc. — **none of which
exist on the live table** — confirming the predicted "static schema accumulated a superset" pattern
exactly.

**But it goes further than a harmless static superset.** `sveltekit-frontend/src/lib/server/
tasks/semantic-packets.ts` (the real repository module, not a stale reference) contains an active
`db.insert(taskSemanticPackets).values({ point_kind: 'task_summary', qdrant_point_id, workspace_id,
workspace_task_id, ... })` call (lines 425-457) that explicitly writes to columns absent from the
live table. **Found the matching migration**: `drizzle/manual/20260606_task_semantic_packets_live_
alignment.sql` (`ADD COLUMN IF NOT EXISTS` for every one of those fields) — despite its name
implying it aligns the table *to* live reality, it actually proposes the opposite: bringing the
live table up to the Drizzle/code's expectation. **This migration is untracked in
`sidecar-migrations.json`** (no entry found, same class of gap as the `20260826_atlas_class_search_
index_v1.sql` one fixed above) and **not applied** to this live database (confirmed by the 16-column
`\d` output).

**Resolved, same session**: option (c) — **this is a live, currently-broken write path, not dead
code.** Traced the call chain: `createTaskSemanticPacket()` is only called from
`runTaskSemanticPacketLifecycle()` (same file, line 815), which is reachable from two real,
live-wired call sites — `src/routes/api/tasks/packets/workflow/+server.ts` (a real API route,
`POST` handler, `runTaskSemanticPacketLifecycle(parsed.data.taskId)` at line 267) and
`src/lib/server/ai/mcp-tool-dispatch.ts` (an MCP tool handler, line 934). Both wrap the call in a
real `try/catch` that logs and returns HTTP 500 on failure — **not a silent swallow**.
`runTaskSemanticPacketLifecycle()` itself has no cache-check short-circuit before calling
`createTaskSemanticPacket()` — every invocation of either call site hits the broken INSERT.
**Conclusion**: `POST /api/tasks/packets/workflow` (with `dryRun` false and no prior cached
record) and the equivalent MCP tool call would fail with HTTP 500 today against this live
database. This is the same severity class as this repo's own "UI bugs are HOT — never deferred"
rule (a reachable, currently-broken path), just in an API/MCP surface rather than a UI button.
**Not fixed in this pass** — per the standing "no new migration yet" instruction — but this
specific case is a stronger candidate for the unapplied `20260606_task_semantic_packets_live_
alignment.sql` migration than ordinary speculative schema drift: the need is now *proven* by a
live broken reachable path, not merely inferred from a Drizzle/live column mismatch.

### 4. VIEW OWNER RECONCILIATION — one correction to the object classification

```sql
SELECT table_schema, table_name, table_type FROM information_schema.tables
WHERE table_name IN ('feature_registry','task_semantic_packets','parent_atlas_documents','route_runtime_packets');
-- route_runtime_packets   BASE TABLE
-- task_semantic_packets   BASE TABLE
-- parent_atlas_documents  VIEW
-- feature_registry        (absent)
```

**Correction**: only `parent_atlas_documents` is actually a view. `route_runtime_packets` is a
real `BASE TABLE`, not a view — it must not be routed through `CREATE OR REPLACE VIEW`
reconciliation; any drift there is ordinary table-schema reconciliation. Captured
`parent_atlas_documents`'s live `pg_get_viewdef`-equivalent definition (`pg_views.definition`): it
projects `packet_key AS id`, `directory_path AS rel_path`, several `payload->>'...'` JSONB
extractions (`line_count`, `is_route`, `is_svelte_comp`, `has_zod`, `has_auth`), several
`jsonb_array_elements_text` unnests (`drizzle_refs`, `imports`, `exports`, `related_feature_ids`,
`route_handlers`), `kmeans_cluster AS cluster_id`, `som_cluster AS centroid_id`, all `FROM
atlas_packets WHERE source_ref IS NOT NULL` — i.e., it's a pure read-projection over the already-
canonical `atlas_packets` table, no separate storage. Any drift here should be resolved by
comparing this definition against its TypeScript consumer contract and, if needed, a
`CREATE OR REPLACE VIEW` (which must preserve existing output column names/order/types) — never an
`ALTER TABLE`. Not attempted in this pass — this was the object-classification proof only.

**Net**: no migration applied, no table altered. Two concrete follow-ups are now correctly scoped
rather than guessed at: (1) whether `semantic-packets.ts`'s insert path is live/dead/misdirected
before deciding on the unapplied `20260606` migration, and (2) whether `parent_atlas_documents`'s
view definition still matches its TypeScript consumer's expected shape.

**Follow-up, same session — item 3's open question resolved**: traced the call chain.
`createTaskSemanticPacket()` is only invoked from `runTaskSemanticPacketLifecycle()` (no
cache-check short-circuit), which is reachable from two real, live-wired call sites —
`POST /api/tasks/packets/workflow` (`+server.ts` line 267, real `try/catch` → HTTP 500, not a
silent swallow) and an MCP tool dispatch handler (`mcp-tool-dispatch.ts` line 934). **This is a
live, currently-broken write path**, not dead code — the same severity class as this repo's own
"UI bugs are HOT" rule, just on an API/MCP surface. Not fixed here (no new migration yet, per
standing instruction), but this specific case is a stronger candidate for the unapplied
`20260606_task_semantic_packets_live_alignment.sql` migration than ordinary speculative drift: the
need is now *proven* by a live broken reachable path, not inferred from a column diff.

### `npm run audit:drizzle` re-run — confirms, sharpens, and finds two stale `repairClass` values

Re-ran the existing `scripts/atlas/audit-postgres-contract-mirrors.mjs` (queue item 8) rather than
re-deriving everything by hand. Fresh result: **identical top-line split to the 2026-08-31 run**
(8 tables checked, 3 static-aligned, 3 live-aligned, 1 live-missing, 0 live-unavailable) — state has
not drifted since. Full report: `docs/reports/postgres-contract-mirrors-report.json`.

- **`atlas_packets`**: the schema-vs-live `columnDiffs.onlyInA` (declared but missing live) is
  **exactly one column: `source_revision`** — everything else Drizzle declares already exists live,
  and live has ~80 additional real columns Drizzle doesn't know about (a one-directional superset,
  not two-way drift). This sharply confirms the queue's own framing: `atlas_packets.source_revision`
  is a single, isolated, well-understood gap — correctly gated behind `CURRENT-SOURCE-EVIDENCE-
  HYDRATION-01`'s unresolved 235-mismatch/7-unavailable lineage question, not something to apply
  just because the column is "only" one field away. `repairClass` here already correctly reports
  `NEEDS_REVIEW` (not an auto-apply suggestion) — the script's own heuristic gets this one right.
- **`parent_atlas_documents`**: confirms something worse than a column mismatch. The Drizzle schema
  module (`src/lib/server/db/schema/parent-atlas-documents.ts`) models it as if it were an
  ordinary **table** with its own `id`, `created_at`, `updated_at`, `payload`, `alias_id`,
  `centroid_id`, etc. columns — but live reality (confirmed earlier this session via
  `pg_views.definition`) is a pure **view**: `SELECT packet_key AS id, source_ref, directory_path
  AS rel_path, ... FROM atlas_packets WHERE source_ref IS NOT NULL`, no independent storage at all.
  The Drizzle file's mental model is wrong, not just its column list. `repairClass` here also
  correctly reports `NEEDS_REVIEW` — good, matches the queue's explicit warning not to route this
  through `ALTER TABLE`. The real fix (not attempted here) is correcting the TypeScript schema
  module to model this as a view-backed read projection, then reconciling via
  `CREATE OR REPLACE VIEW` only if the view's own query needs to change.
- **Two stale `repairClass` values found, exactly matching the queue's warning about "the old
  connected snapshot's generated report had repair_class APPLY_EXISTING_SQL"**: `feature_registry`
  and, more surprisingly, **`route_runtime_packets`** both still report `repairClass:
  "APPLY_EXISTING_SQL"`. For `feature_registry` this is the already-known-stale prescription (this
  file's own 2026-08-31 notes plus today's disposable-container re-proof both say don't apply it
  yet). For `route_runtime_packets` the label makes even less sense: it's a real, existing, live
  base table (confirmed via `information_schema.tables` — `BASE TABLE`, not a view or absence) with
  its own rich real column set (`som_row`, `community_id`, `domain_class`, etc.) — "apply existing
  SQL" as a repair suggestion for a table that already exists and already has data is a genuine
  script defect, not just a stale value. **Not fixed in this pass** — flagging the script's
  `repairClass` heuristic itself (likely treats any live column-diff mismatch as "needs a CREATE/
  ALTER applied" without first checking whether the object already fully exists) as a real, small,
  separate bug worth a future fix, distinct from any table's own data/schema state.

## OKF-REGISTRY-REFERENCE-PARITY-01 (2026-09-08, read-only)

Located "the registry" referenced earlier in this thread: `docs/.okf/registry.yaml` (+ sibling
`docs/.okf/schema.yaml`). Confirmed this is a **genuinely different, non-duplicative** directory
from the root `.okf/` (concepts/domains/predicates knowledge base explored earlier this session) —
`docs/.okf/README.md` states explicitly it's a pure navigation layer ("points at the live owners
without moving or duplicating them"), and `schema.yaml`'s own header already self-corrects a past
fabrication (an earlier version cited a nonexistent external OKF spec repo, confirmed 404 at the
time; the real Google Cloud OKF spec and this repo's own root `.okf/` are both named correctly now).
Two `.okf` directories existing is not itself a problem here — they serve different, already-
documented purposes.

**Validated `registry.yaml`'s reference parity, live:**
- **16/16 `contracts[].owner` file paths exist on disk** — zero missing (checked every one
  directly, not sampled).
- **7/7 `fabric.owners` type identifiers resolve to a real, live contract** — `structural:
  StructuralObservationV2`, `tensors: RepresentationArtifactV1`, `features:
  CandidateFeatureMatrixV1`, `graph: StructuralGraphSnapshotV1` all match exactly.
  `semantic: semantic-packet-v2` and `vectors: vector-manifest-v1` resolve to real artifacts
  (`packages/semantic-contracts/schemas/semantic-packet.schema.json`, titled "Semantic Packet
  v2.0.0"; `packages/semantic-contracts/src/vector-manifest.ts`, exporting `VectorManifest`/
  `VectorManifestSchema`) with reasonable naming correspondence, not an exact string match — fine.
  **One real naming mismatch found**: `identity: CanonicalEnvelopeV1` — no file or export anywhere
  in the repo is literally named `CanonicalEnvelopeV1`. The real, live owner is
  `sveltekit-frontend/src/lib/server/db/canonical-feature-envelope.ts`, exporting
  `CanonicalFeatureEnvelopeSchema`/`CanonicalFeatureEnvelope`/`buildCanonicalFeatureEnvelope()`/
  `validateCanonicalEnvelope()` — a real, live, correct owner, just under a different name than the
  registry declares. Small, precise doc-drift, not a missing-contract problem.
- **Provider spot-check**: `sidecar: treesitter-chunker-8095` — confirmed real, matches the
  already-documented `:8095` NLP sidecar (`NLP-SIDECAR-DIRECT-HEALTH-01` above: live `/health` and
  `/ast/chunk` checks, Tree-sitter/ast-grep/LangExtract/NetworkX capabilities). Not a stale
  reference.
- **No circular authority**: the 7 `fabric.owners` (identity/structural/semantic/vectors/tensors/
  features/graph) each name one distinct, non-overlapping real contract file — no owner's contract
  references another owner's contract as its own authority.

**Fixed, same session** (user asked to continue with actual fixes, not just flag them): both of
this section's own findings were safe, additive, non-database edits, so both were applied:

1. `docs/.okf/registry.yaml`'s `identity` owner corrected from the nonexistent
   `CanonicalEnvelopeV1` to the real, live `CanonicalFeatureEnvelope` (with a dated comment
   explaining why) — re-parsed the YAML afterward to confirm it's still valid.
2. `scripts/atlas/audit-postgres-contract-mirrors.mjs`'s `repairClassForTable()` no longer returns
   `APPLY_EXISTING_SQL` for a table that already exists live with declared-but-missing columns —
   that label is now reserved for the genuine `LIVE_TABLE_MISSING` case (e.g. `feature_registry`,
   confirmed still correct after the fix). A table that exists but is missing some declared
   columns/indexes now gets `ADD_MISSING_COLUMNS_VERIFY_WRITERS` /
   `ADD_MISSING_INDEXES_VERIFY_QUERIES` instead — names chosen to force a writer-check step (the
   same lesson this session already learned the hard way on `task_semantic_packets`) rather than
   implying a blind column add. Re-ran `npm run audit:drizzle` after the fix to confirm: `route_
   runtime_packets` now correctly reports `ADD_MISSING_COLUMNS_VERIFY_WRITERS` (was wrongly
   `APPLY_EXISTING_SQL`); `feature_registry` correctly still reports `APPLY_EXISTING_SQL`
   (genuinely missing table); no other table's `repairClass` changed. Script-only edit — no
   Postgres table, index, or data was touched by fixing the audit script itself.
