# Graphify Import-Resolution Contexts — 2026-10-17

## Result

Added a pure batch-context builder to the existing `graphify-symbol-projection-v1.ts` owner. It composes the existing import parser, export inventory, and import target resolver for a frozen multi-file extraction cohort. It uses the canonical `normalizeGitSourceRefV1` policy and validates a single SHA-256 workspace revision, per-file SHA-256 source revisions, matching fabric receipts and facts, duplicate source references, and unsafe/encoded-traversal paths. Its deterministic checksum includes every file's source revision and the cohort workspace revision. Its result is explicitly non-authoritative and write-free.

The focused fixture demonstrates an import from `src/lib/example.ts` resolving to an exported symbol in `src/lib/helper.ts`, rejects mixed workspace revisions and encoded traversal, and verifies that changing a target file revision changes the cohort checksum. Resolved edge candidates now preserve target `sourceRef` and `sourceRevision`; replay checks the claimed target revision against the independently resolved revision, and packet-incidence readback rejects target source-path/revision drift. A follow-up replay review found the deterministic edge key omitted the subject `sourceRef`; it now includes that field, and admitted edges retain source ref, workspace revision, graph revision, and producer revision instead of discarding those checked bindings. Four focused suites passed, 19 tests total for that replay/endpoint/materializer subset.

## Caller and persistence boundary

Current caller inventory found `atlas-operation-runtime-v1.ts` invokes structural compilation only for an in-memory diagnostic (`canonicalAuthority=false`, `persistence=NOT_ATTEMPTED`, workspace revision authority `UNPROVEN`). The existing `graphify-symbol-writer-v1.ts` writes symbol candidates, not reference edges. No production batch caller for the multi-file projection/context path was found. Therefore this helper is `CREATED` and fixture-tested, not production `WIRED`; `graphify_edges` remains a separate missing-data/persistence gate.

The existing `graph-snapshot-materializer.ts` accepts hierarchy inputs and qualified N-ary relation candidates, but its binary edges are generated from `atlas_tree_nodes` parentage and packet-to-tree bindings. It has no input for `GraphifyEdgeProjectionCandidateV1`. A structural-edge adapter must therefore prove exact source *and target* symbol/revision-to-GraphV2-node bindings before existing snapshot materialization; passing a symbol key or same-file source revision alone is insufficient. This is the next code integration boundary, not a completed caller.

## Limits

- No production batch caller or current extraction receipt was wired or exercised.
- No edge-persistence owner was invoked or extended; the existing symbol writer does not persist reference edges.
- No live PostgreSQL read, edge persistence, source-revision write, projection, or Graphify refresh occurred.
- No claim is made that a resolved import is a canonical graph edge. Exact source spans, endpoint identities, target revision qualification, and the existing eligibility/persistence gates still apply.
- This does not establish non-empty `graphify_edges`, GraphV2 fanout, PageRank authority, final SearchRuntime Top-K, or ContextManifest admission.

## Next gate

Locate the existing bounded structural-extraction batch caller and its frozen receipt contract. Feed one read-only, exact-revision cohort through the context builder and the existing edge-eligibility report; retain unresolved imports as unresolved. Review any subsequent writer invocation separately and require its existing authorization and independent readback.

```yaml
likely_cause: Import resolution was supported by the symbol projector but no batch context builder assembled cross-file exports and bindings for its caller.
evidence: sveltekit-frontend/src/lib/server/atlas/indexing/graphify-symbol-projection-v1.ts; sveltekit-frontend/src/lib/server/atlas/indexing/graphify-edge-replay-identity-v1.ts; replay key now binds subject sourceRef and admitted values preserve workspace/graph/producer revisions; four focused suites passed 19/19.
patch_targets:
  - sveltekit-frontend/src/lib/server/atlas/indexing/graphify-symbol-projection-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/indexing/graphify-edge-replay-identity-v1.ts
  - sveltekit-frontend/src/lib/server/atlas/indexing/graphify-edge-replay-identity-v1.spec.ts
  - sveltekit-frontend/src/lib/server/atlas/indexing/graphify-symbol-projection-v1.spec.ts
  - openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md
  - docs/reports/graphify-import-resolution-contexts-20261017.md
safe_next_command: rg -n "compileGraphifyStructuralIntelligence|mapStructuralFabricToGraphifyProjectionV1|importResolutionContextBySourceRef" scripts/atlas sveltekit-frontend/src/lib/server/atlas/indexing
smoke_command: cd sveltekit-frontend && npx vitest run src/lib/server/atlas/indexing/graphify-edge-replay-identity-v1.spec.ts src/lib/server/atlas/indexing/graphify-packet-incidence-endpoint-resolver-v1.spec.ts src/lib/server/atlas/indexing/graphify-packet-incidence-materializer-v1.spec.ts src/lib/server/atlas/indexing/graphify-packet-incidence-projection-v1.spec.ts --reporter=dot --pool=forks --poolOptions.forks.singleFork=true
report_path: docs/reports/graphify-import-resolution-contexts-20261017.md
```
