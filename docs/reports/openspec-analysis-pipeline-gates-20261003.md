# OpenSpec Analysis Pipeline Gate Addendum

Date: 2026-10-03

## Change

Added seven unchecked gate-closure subtasks to the existing `parent-atlas-openspec-task-triage-pipeline` ledger. No parallel analysis system or new OpenSpec change was created. The sequence reuses the existing embedding model/artifact owner, CandidateEvidenceCard family, `CandidateOrdinalMapV1`, `:8095` NLP sidecar, ontology tuple tables, reviewed Workboard edges, and derived hypergraph projections.

The gates are:

1. `ANALYSIS-MODEL-RECEIPT-01`
2. `ANALYSIS-EVIDENCECARD-OWNER-01`
3. `ANALYSIS-ORDINAL-MAP-01`
4. `ANALYSIS-NLP-GROUNDING-01`
5. `ANALYSIS-ONTOLOGY-TUPLE-01`
6. `ANALYSIS-DEPENDENCY-CANDIDATE-01`
7. `ANALYSIS-HYPERGRAPH-01`

Updated the TaskCard embedding/indexing gates so the planned 55,610-vector batch cannot start until model-receipt, card-owner, and ordinal-map proof passes. Every subtask remains unchecked; no proof state was promoted.

## Implementation Progress

- The existing shared batch owner (`sveltekit-frontend/src/lib/server/grpc/embedding-client.ts`) now prepares task-mode inputs through the shared recipe adapter before transport execution, keys cache entries using the formatted input, validates batch cardinality and every 768-dimensional vector including cache hits, and returns input recipes.
- The retrieval orchestrator and TRACE `trace.kag_search` query paths now use that adapter while explicitly retaining `unprompted_legacy`; no corpus recipe was assumed or changed.
- The active `dense_768` compatibility path in `retrieval/embedding-service.ts` now also routes through the shared adapter in `unprompted_legacy` mode. Tests confirm the request text remains unchanged and the raw 768-dimension guard still fails closed.
- Remaining direct embedding callers still exist. Model-artifact identity, tokenizer revision, corpus/query recipe parity, and task-card vector/index proof remain open; do not start the 55,610-vector batch.
- Latest focused adapter/retrieval tests: 15/15 passed. Esbuild transpilation passed for the changed modules. Full TypeScript validation reported an error at `sveltekit-frontend/src/lib/server/db/schema/analysis-pass-results.ts:278` (`executionStatus` inferred as `string` instead of the declared union); that file was not part of this implementation slice.
- No live embedding request, production storage write, or Graphify run was performed.

## Validation

- `npx openspec validate parent-atlas-openspec-task-triage-pipeline --strict`: valid.
- `git diff --check` for tracked code changes: passed (line-ending notices only).
- No NLP, database, ontology, graph, vector, cache, Graphify, or archive execution was performed.

## Required Fields

likely_cause: The read-only pipeline existed, but model, card ownership, ordinal, grounded NLP, ontology mapping, reviewed dependency, and hypergraph gates were not explicitly sequenced in its task ledger.
evidence: Existing triage-pipeline `tasks.md`; shared batch adapter wiring; 15 focused tests; strict OpenSpec validation; typecheck error recorded above.
patch_targets: [`sveltekit-frontend/src/lib/server/embedding/embedding-execution-adapter-v1.ts`, `sveltekit-frontend/src/lib/server/grpc/embedding-client.ts`, `sveltekit-frontend/src/lib/server/retrieval/embedding-service.ts`, `sveltekit-frontend/src/lib/server/retrieval/__tests__/embedding-service.test.ts`, `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts`, `sveltekit-frontend/src/mcp/tools/trace-kag.tool.ts`, `openspec/changes/parent-atlas-openspec-task-triage-pipeline/tasks.md`]
safe_next_command: `rg -n "api/embeddings|/api/embed" sveltekit-frontend/src/lib/server sveltekit-frontend/src/mcp`
smoke_command: `npx vitest run src/lib/server/embedding/embedding-execution-adapter-v1.spec.ts src/lib/server/embedding/embedding-query-route-adapter-v1.spec.ts src/routes/api/embed/server.route.spec.ts`
report_path: `docs/reports/openspec-analysis-pipeline-gates-20261003.md`
