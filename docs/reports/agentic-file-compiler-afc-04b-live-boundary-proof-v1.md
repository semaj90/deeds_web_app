# AFC-04B Live Boundary Proof v1

Date: 2026-09-06

## Result

`AFC-04B` remains open because the production worker's full multi-turn,
checkpointed execution is not proven. The bounded PromptPlan-to-Ornith seam is
implemented and proven.

## Changes verified

- `PromptPlanV1.tokenizerRevision` is required at the adapter boundary.
- The adapter recomputes `checksumSha256` using the existing Atlas canonical
  encoding fields and rejects field tampering before model discovery or POST.
- LangGraph's bounded synthesis graph executes only supplied compiled plans.
- The existing Kanban LangGraph builder now retains typed node names through
  edge construction and compiles with the installed LangGraph types.
- The unused legacy block-reference planner now emits
  `atlas.agentic-file-compiler.block-plan.v1`; it no longer collides with the
  canonical revisioned `atlas.prompt-plan.v1` wire identity.
- The live `/api/search/hyperrag` front door now emits the deterministic
  `QueryClassificationV1` control observation after request validation; it
  does not change SearchRuntime retrieval or fusion ownership.
- Revision-qualified HyperRAG requests now compile the existing
  `RetrievalPlanV1`, apply only its bounded candidate budget, and return the
  plan as control metadata. Requests without `workspaceRevision` remain
  plan-less rather than receiving a synthetic revision.
- No adapter path persists hidden thoughts, KV state, tensors, evidence, or
  datastore state.

## Validation

- Focused Vitest: 3 files, 8 tests passed.
- Legacy block-plan compatibility test: 1 test passed via the repository-root
  Vitest runner. The frontend-local runner remains environment-blocked by a
  missing existing `@rollup/plugin-node-resolve` package.
- Query classifier and HyperRAG route tests: 6 tests passed.
- Retrieval-plan/front-door bridge tests: 7 tests passed.
- Frontend `svelte-check` could not load the existing Svelte config because the
  shared install is missing `@rollup/plugin-node-resolve`; this is an
  environment dependency failure, not a reported diagnostic in the changed
  route.
- Targeted TypeScript check: passed, including the exported LangGraph index.
- LangGraph index runtime import: `LANGGRAPH_INDEX_IMPORT_OK`.
- Strict OpenSpec validation: `parent-atlas-agentic-file-compiler` passed.
- Live bounded graph against `http://127.0.0.1:8090`: two checksum-valid
  turns completed with `error: null` and `turn: 2`.
- `git diff --check`: passed; only normal line-ending warnings were emitted.

## Not proven

- Full production `buildAgentGraph` multi-turn execution through retrieval and
  trace nodes.
- LangGraph checkpoint/restart parity.
- Production SearchRuntime front-door wiring for AFC-04B.
- Semantic quality or deterministic wording of Ornith output.

## Ownership

The frontend PromptPlan builder and canonical hash contract remain the source
owners. The Atlas-core adapter only verifies and executes an already compiled
plan. PostgreSQL, Qdrant, Valkey, Neo4j, and hidden model state remain outside
this execution seam.
