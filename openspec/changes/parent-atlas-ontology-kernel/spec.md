# Parent Atlas Ontology Kernel (OaK-derived)

## Provenance

Derived from "Toward Effective and Reliable LLM Agents via Dynamic
Ontology" (OaK — Ontology as a Kernel), submitted 2026-08-24 — extremely
recent, treat as a fast-moving external reference, not settled literature.
A companion video presentation cites a **27.5 → 83%** improvement figure
around the 15:25 mark; that number is attributed to the video's own
presentation of results (TravelPlanner / CRMArenaPro / ToolQA benchmarks
per the paper), not independently re-derived or located in a specific paper
table by this session — keep the attribution to the video until the exact
table cell is separately confirmed. **Do not assume the paper's benchmark
gains transfer to Parent Atlas** — see OAK-11 below, which exists
specifically to produce Parent Atlas's own frozen before/after comparison
rather than borrow the paper's numbers.

## Goal

Import OaK's core idea — a **frozen kernel `K = (S, F)`** where a
task-oriented schema `S` bounds what the agent can represent and a set of
typed, verified reasoning functions `F` bounds what it can compute — as the
sole channel between a ReAct-style inference agent and Parent Atlas's data.
Once frozen, the agent cannot name an undeclared concept or invoke an
undeclared computation. This is not "replace ReAct" — OaK's own inference
stage is still a ReAct controller; the change is that the controller
selects functions and binds typed arguments **through the frozen kernel**,
not from an unconstrained tool surface.

## Non-goals

- Do not build a separate OaK database or OaK-specific graph system. Per
  the audit below, Parent Atlas already has strong `S` (schema/ontology)
  and `G` (knowledge graph) infrastructure — reuse it.
- The kernel controls reasoning; it does **not** become a source identity
  authority. `canonicalAuthority: false` on every kernel-shaped contract,
  matching this repo's existing convention everywhere else (see the
  `atlas/research/*` and `ast-grep-observation-adapter.ts` contracts from
  the adaptive-DAG-fabric change).
- The judge does not directly mutate a live/frozen kernel. It produces a
  **candidate patch** (schema patch, function patch, or program patch)
  that goes through its own validation → replay → promotion path before
  becoming a new kernel revision.
- GEPA/DSPy program optimization stays **below** kernel authority: OaK
  defines what exists and what computations are legal; DSPy defines how
  the LLM uses that interface; GEPA improves how well the program uses it.
  A judge diagnosing a failure must pick the right layer — schema failure,
  function failure, or program failure — not default to "let GEPA fix it."

## The `K = (S, F)` mapping onto existing Parent Atlas infrastructure

**S (schema) — already partial, confirmed live in this repo (not assumed):**
- `OntologyLinkedTupleV1` — `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`,
  with a Postgres persistence layer (`ontology-linked-tuple-postgres.ts`)
  and cache (`ontology-linked-tuple-cache.ts`) — 19 files reference it.
  Carries identity (`packetKey`, `sourceRef`, `treeNodeId`), structure
  (`ontologyIds`, `conceptIds`, typed participants: actor/target/input/
  output/tool/symbol/workflow/evidence/cause/effect), topology/manifold/
  context, and full provenance (`sourceRevision` through `modelRevision`,
  `trust`, `confidence`, `evidenceState`).
- `taxonomy-candidate-producer-v1.ts` — confirmed real. Already implements
  an OaK-like discipline independently: ontology-linked observations
  become *candidates*, not facts; absent graph/lexical/community signal
  stays absent rather than invented; evidence is required before a
  taxonomy hypothesis is produced.

### External audit corroboration (2026-08-31, verified before accepting)

A second, independent audit against live `main` claimed `S` is a "strong
partial" via `ConceptV1`, `EntityDescriptorV1`, and `RelationshipKernelV1`,
and that Parent Atlas already has a "validated ACE synthesis DAG" and
"deterministic adaptive hypergraph beam search." Checked each claim
directly rather than accepting the table as-is — some hold up exactly,
some don't:

- ✅ **`RelationshipKernelV1`** — real, `sveltekit-frontend/src/lib/server/
  atlas/graph/relationship-kernel-neo4j-projector-v1.ts` and
  `hyper-relation-v1.ts`.
- ✅ **`ConceptV1` and `EntityDescriptorV1`** — both real, both in
  `sveltekit-frontend/src/lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.ts`
  (`ConceptV1Schema`/`EntityDescriptorV1Schema` + inferred types) — this is
  very likely the file the earlier `SymbolOntologyTupleV1` guess (OAK-01,
  above) was actually pointing at, now confirmed under its real name.
- ✅ **"ACE has REPAIR"** — real, but scoped narrower than the phrase
  suggests: `sveltekit-frontend/src/lib/server/ace/mutation-gate.ts` has a
  `PolicyAction` enum including `'repair_file'` (a code-repair action, part
  of an `ACTION_SPACE` for a retrieval/mutation policy decision) — this is
  **code repair**, not ontology/function repair. This matches, rather than
  contradicts, the external audit's own conclusion ("ACE has REPAIR, but
  not ontology/function repair — Missing OaK loop") — cited here as
  confirmation the audit's own distinction was correct, not as a new
  finding.
- ✅ **"validated ACE synthesis DAG" — confirmed real, correction to the
  earlier "not found" note above** (which searched `sveltekit-frontend/src`
  only — the file lives in `packages/parent-atlas/src/core/`, the exact
  location this change's own audit-first rule says to check first, and
  wasn't checked there in the first verification pass). `ace-synthesis-graph.ts`
  defines `AceSynthesisGraphV1` + `validateAceSynthesisGraph()` — a real,
  typed, 18-node-kind pipeline: `LOAD_SNAPSHOT → AST_RETRIEVAL →
  SEMANTIC_KNN → GRAPH_RANK → NARY_DECOMPOSITION → CONTEXT_WINDOW →
  SAMPLE_QUERY_NOMINATION → FEATURE_ALIGNMENT → EXACT_PROMOTION →
  PREFILL_CACHE_LOOKUP → PREFILL_COMPILE → PREFILL_CACHE_STORE →
  PREFILL_RESOLVE → DECODE → PLAN_PATCH → APPLY_PATCH → VALIDATE → REPAIR
  → MATERIALIZE`. Note this file's own `REPAIR` node kind is a **third**
  distinct "repair" concept in this repo, different from both
  `mutation-gate.ts`'s `PolicyAction.repair_file` (a policy action) and
  OaK's kernel/ontology repair (OAK-08/09, still missing) — this one sits
  inside a patch-synthesis pipeline (`PLAN_PATCH → APPLY_PATCH → VALIDATE →
  REPAIR → MATERIALIZE`), repairing a *patch*, not a schema or function
  set. Closer in spirit to OAK-08/09 than the policy-action one, but still
  not the same thing — do not conflate when OAK-08/09 work eventually
  starts.
- ✅ **"deterministic adaptive hypergraph beam search" — also confirmed
  real**, same root cause as the synthesis-DAG miss (searched
  `sveltekit-frontend/src` only, should have checked `packages/parent-atlas/
  src` first). `adaptive-hypergraph-chain.ts` — explicitly self-described
  in its own comment as a "Deterministic reference beam-search scaffold,"
  with `beam_width` (bounded 1-128), hop-bounded expansion, and explicit
  pruning (`beam = next.slice(0, beamWidth)`).

**Both gap-#4 claims are now fully corroborated.** The external audit's
table was accurate; this change's own first-pass search just violated its
own audit-first rule (checked `sveltekit-frontend/src` before
`packages/parent-atlas/src`) and produced two false "not found" results as
a result. Left uncorrected, that would have caused exactly the kind of
duplicate-build risk this rule exists to prevent, for the third and fourth
time this session (after the ast-grep-observation-adapter and
kernel-function-catalog-v1 near-misses). **Lesson reinforced, not just
theoretical**: `packages/parent-atlas/src/core` first, always, before
concluding something doesn't exist.
- **Correction to this file's own OAK-05 status**: the external audit
  lists "task-specific compiled F" as fully `MISSING`. That was accurate
  when the audit was likely written, but this session's OAK-05 work
  (`kernel-function-v1.ts::buildAtlasKernelFunctionV1`) is a real compiler
  primitive — it validates an `operatorGraph` against a supplied operator
  library and refuses to build a function referencing an undeclared
  operator. It is not a *catalog* yet (one composed example exists,
  `find_impacted_callers_for_symbol_change`), so "MISSING" is now more
  precisely "compiler exists, catalog is nearly empty" — a real, narrower
  gap than the audit's own table states, not a fully open one.

**G (knowledge graph) — already strong, confirmed live:**
- `HyperedgeV1` — `sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts`,
  with a Postgres layer (`kag-hyperedge-postgres.ts`) — 17 files reference
  it. Role-aware, revision-qualified, evidence-bound, deterministic;
  incidence rows are explicitly disposable while the hyperedge itself is
  authoritative — this is the n-ary graph representation OaK needs for
  relationships that don't honestly reduce to a pair.
- Real graph-expansion/traversal capability already exists and is already
  exposed as MCP tools (`graph_expand_neighborhood`, `graph_shortest_path`,
  `hypergraph_expand_members`, `hypergraph_search` per the live TRACE MCP
  tool surface) — strong candidates for the `EXPAND_GRAPH`/`SHORTEST_PATH`/
  `BOUNDED_BFS` entries in the generic operator library below.

**F (reasoning functions) — partial, missing a canonical catalog owner:**
Retrieval functions, graph functions, AST functions, and validators all
exist (confirmed piecemeal across this session's earlier audits — the
`atlas/research/*` circuit, `ast-grep-observation-adapter.ts`, the
`GA8` graph-analysis judge/validation work). **What's missing is a
canonical task-specific kernel *function catalog*** — these exist as
independently-authored capabilities, not as `AtlasKernelFunctionV1`
entries composed from a shared generic-operator library.

**Not found / not confirmed** (say so rather than assume): `SymbolOntologyTupleV1`
as an exact contract name does not exist in this repo as of this pass —
grepped `packages/parent-atlas/src`, `packages/atlas-core/src`, and
`sveltekit-frontend/src`, zero matches. Treat it as the user's synthesis of
existing capability (likely `entity-concept-taxonomy-v1.ts` combined with
the symbol registry from the neural-prefill-encoder work), not a contract
to go looking for by that literal name.

## Frozen contracts

### `AtlasOntologyKernelV1`

```
kernelId, kernelRevision, taskClass, taskRequirementsRevision
schema: { entityTypes, relationTypes, constraints, identityRules }
functions: { functionId, inputSchema, outputSchema, implementationRef,
             implementationRevision, allowedDagActions }[]
ontologyRevision, graphProjectionRevision, validatorRevision
kernelChecksum
state: DRAFT | VERIFIED | EVALUATING | REPAIR_REQUIRED | FROZEN | PROMOTED
canonicalAuthority: false
```

### `AtlasKernelOperatorLibraryV1` — generic, trusted primitives

Reuse what this repo already trusts, do not reinvent: `FILTER`, `JOIN`,
`PROJECT`, `GROUP`, `AGGREGATE`, `LOOKUP_SYMBOL`, `LOOKUP_PACKET`,
`SEARCH_LEXICAL`, `SEARCH_SEMANTIC`, `EXPAND_GRAPH`, `SHORTEST_PATH`,
`BOUNDED_BFS`, `GET_CALLERS`, `GET_CALLEES`, `GET_REFERENCES`,
`GET_SOURCE_SPAN`, `GET_AST_EVIDENCE`, `INTERSECT_ELIGIBILITY`, `RERANK`,
`VALIDATE_SCHEMA`, `RUN_TEST`, `RUN_TYPECHECK`, `COMPARE_REVISION`,
`BUILD_CONTEXT`. Each is a wrapper around an existing deterministic
implementation, not new logic — OAK-04's whole job is the wrapping, not
authoring new retrieval/graph/AST code.

### `AtlasKernelFunctionV1` — composed, task-specific

```
functionId, kernelRevision, inputs, outputs, operatorGraph,
preconditions, postconditions, requiredEvidenceKinds, mutationPolicy,
implementationChecksum
```

Composed from the operator library (e.g. `find_impacted_callers_for_symbol_change`,
`trace_packet_to_symbol_to_source`, `find_revision_consistent_semantic_neighbors`,
`find_evidence_for_failed_typecheck`, `find_related_ontology_constraints`).
Never arbitrary LLM-generated code — a composed graph over a bounded,
trusted operator set.

### `QueryKernelGraphV1` — per-query evidence graph

Grounded evidence, typed function selection, typed arguments, grounded
result. Produces **no new canonical identity** — matches this repo's
existing rule that retrieval/query-time structures never become identity
authorities.

### `KernelBoundDagPlannerV1`

The adaptive-DAG planner (`AdaptiveDagPlanV1`/`DagActionKind`, frozen in
`parent-atlas-adaptive-dag-fabric`) gets constrained: for a given task, the
planner may select **only** from the `F` surface the active kernel
declares, not the full Parent Atlas capability set. Concretely: `F_symbol_repair`
= `{resolve_symbol, fetch_exact_source, inspect_ast, inspect_references,
inspect_callers, run_typecheck, propose_patch, validate_patch}`;
`F_ontology` = `{lookup_concept, traverse_taxonomy, find_supporting_evidence,
compare_relation, propose_tuple, validate_tuple, validate_hyperedge}`. This
is the actual search-space reduction OaK provides — not a bigger tool list,
a *task-scoped* one.

### `OakJudgeFeedbackV1`

```
kernelRevision, programRevision, workflowRunId
failureClass: SCHEMA_MISSING_CONCEPT | SCHEMA_WRONG_RELATION |
              SCHEMA_CONTRADICTION | FUNCTION_MISSING |
              FUNCTION_BAD_PRECONDITION | FUNCTION_BAD_COMPOSITION |
              GRAPH_EXTRACTION_FAILURE | EVIDENCE_MISSING |
              AGENT_TOOL_SELECTION_ERROR | AGENT_ARGUMENT_BINDING_ERROR |
              EXECUTOR_FAILURE | VALIDATOR_FAILURE
evidenceRefs, executionReceiptRefs
proposedSchemaPatch, proposedFunctionPatch
confidence, judgeRevision, checksum
```

The judge's job is diagnosing **which layer** failed — schema, function,
or program (GEPA territory) — and proposing a patch, never applying one
directly.

### `AtlasOntologyKernelManifestV1` — the freeze

```
kernelRevision, schemaChecksum, functionSetChecksum, promotionReceipt
```

## Two operating modes

- **`KERNEL_MODE`** — known task family, frozen `(S, F)`, strict execution.
  No new concepts, no new relations, no new functions at inference time.
- **`EXPLORATION_MODE`** — unknown/open-world tasks. Ordinary bounded DAG,
  external evidence, web/RLM discovery. **No ontology promotion** —
  results become candidate concepts, candidate relations, candidate
  functions only. Exploration output can seed the *next* kernel
  construction round. This is the explicit answer to OaK's own "scientific
  discovery" limitation (a frozen kernel can't discover what it doesn't
  already represent) — Parent Atlas gets a second mode instead of forcing
  every task through a kernel that can't yet represent it.

## Construction loop (OAK-00 through OAK-12 in tasks.md)

```
REQUIREMENT ANALYSIS
  → SCHEMA CONSTRUCTION (+ OWL projection, HermiT formal verification)
  → KNOWLEDGE GRAPH INSTANTIATION
  → REASONING FUNCTION GENERATION (compose from operator library)
  → agent evaluation
  → JUDGE (schema vs. function vs. program failure classification)
  → repair (schema patch | function patch | GEPA program patch)
  → next round
  → FREEZE (AtlasOntologyKernelManifestV1)
```

Today, Parent Atlas has most of the *pieces* (schema fragments, graph
infrastructure, scattered functions, GA8-style judge/test/compiler/
validator infrastructure) but they were authored independently, not through
this explicit construction loop. **OAK-00 through OAK-10 make the loop
itself the deliverable**, not any single piece in isolation.
