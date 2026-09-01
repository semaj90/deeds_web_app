import { buildKernelOperatorLibraryV1, buildKernelOperatorV1, type KernelOperatorV1, type KernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';

const PRODUCER_REVISION = 'kernel-operator-library:symbol-repair:v0:2026-08-31';
const OPERATOR_REVISION = 'op-rev:symbol-repair:v0';

/**
 * Concrete, populated `AtlasKernelOperatorLibraryV1` instance for the
 * `symbol_change_impact_analysis` task class (OAK-01/OAK-04 continuation).
 *
 * Every `implementationRef` below was verified against this repo directly
 * during this pass (file existence checks, live Postgres `to_regclass`
 * checks, or citation of an already-live MCP tool from the TRACE MCP tool
 * surface confirmed earlier this session) — none are guessed. 18 of the 24
 * `KERNEL_OPERATOR_KIND_VALUES` entries are populated here.
 *
 * `executorClass`/`requiredRevisionAxes`/`allowedArtifactKinds` (added
 * 2026-08-31, closing the "F01 field set thinner than requested" gap from
 * `docs/reports/oak-task-function-compiler-readiness-v1.json`): assigned
 * per-operator based on what the cited real implementation actually does
 * (a Postgres lookup is `DB_QUERY_EXECUTOR` bound to `workspaceRevision`;
 * a live MCP graph tool is `GRAPH_TRAVERSAL_EXECUTOR` bound to
 * `graphRevision`; etc.) — not filled in mechanically to satisfy the
 * schema.
 *
 * The remaining 6 (`FILTER`, `JOIN`, `PROJECT`, `GROUP`, `AGGREGATE`,
 * `VALIDATE_SCHEMA`) are deliberately left unpopulated: the first 5 are
 * generic relational-algebra primitives with no single owner to cite
 * honestly (every table query in this repo composes them ad hoc); the 6th
 * has no repo-specific implementation to point at either — schema
 * validation here is done inline via Zod's own `.parse()`/`.strict()`
 * calls (a library, not a repo-authored capability), and the one
 * repo-specific schema-verification pass (OWL/HermiT, OAK-S01) is
 * explicitly still unbuilt. Do not fill these in without the same
 * verification standard applied to the 18 below.
 *
 * `GET_CALLEES` (17th operator, added 2026-08-31): confirmed distinct from
 * `GET_CALLERS` — `GET_CALLERS` is a live MCP graph traversal
 * (`graph_expand_neighborhood`), while `GET_CALLEES` here is a
 * ts-morph-derived, per-file stored property (`callees: string[]`,
 * `codebase-scanner-v2.ts` lines ~256-301) mirrored onto the Neo4j
 * `CodebaseFile.callees` property by `codebase-neo4j-sync.ts`, itself
 * called from two live routes (`codebase-index/orchestrate`,
 * `codebase-index/graph-sync`) — a genuinely different implementation, not
 * the same tool relabeled.
 *
 * `COMPARE_REVISION` (18th operator, added 2026-08-31): backed by
 * `verifyGraphSnapshotRevisionV1`/`assertGraphSnapshotRevisionMatchesHashes`
 * in `graph-snapshot-revision-v1.ts` — a real, tested, deterministic
 * revision-comparison function (throws `GRAPH_REVISION_MISMATCH:<id>` /
 * `GRAPH_SNAPSHOT_REVISION_HASH_MISMATCH` on mismatch), not a guess.
 *
 * `INTERSECT_ELIGIBILITY` (16th operator, added 2026-08-31): confirmed by
 * reading `feature-promotion-eligibility-v1.ts` directly, not just its
 * name — `buildFeaturePromotionEligibilityV1()` gates a classified
 * candidate through abstention/evidence-presence/source-revision checks
 * and returns `ELIGIBLE`/`BLOCKED_*`, which is exactly what
 * `INTERSECT_ELIGIBILITY` needs. Added a 7th `executorClass` value,
 * `IN_MEMORY_COMPUTE_EXECUTOR`, since this operator is pure computation
 * over already-fetched data — none of the original 6 values fit honestly.
 */
export function buildSymbolRepairOperatorLibraryV0(): KernelOperatorLibraryV1 {
  const operators: KernelOperatorV1[] = [
    buildKernelOperatorV1({
      operatorId: 'op:lookup_symbol', operatorRevision: OPERATOR_REVISION, kind: 'LOOKUP_SYMBOL',
      inputSchemaId: 'input:qualified_name', outputSchemaId: 'output:stable_symbol_id',
      parameterSchemaRef: null, executorClass: 'DB_QUERY_EXECUTOR',
      requiredRevisionAxes: ['workspaceRevision'], allowedArtifactKinds: ['symbol_registry_row'],
      implementationRef: 'atlas_symbol_registry', implementationKind: 'postgres_table',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:lookup_packet', operatorRevision: OPERATOR_REVISION, kind: 'LOOKUP_PACKET',
      inputSchemaId: 'input:packet_key', outputSchemaId: 'output:packet_row',
      parameterSchemaRef: null, executorClass: 'DB_QUERY_EXECUTOR',
      requiredRevisionAxes: ['workspaceRevision'], allowedArtifactKinds: ['packet_row'],
      implementationRef: 'atlas_packets', implementationKind: 'postgres_table',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:get_source_span', operatorRevision: OPERATOR_REVISION, kind: 'GET_SOURCE_SPAN',
      inputSchemaId: 'input:symbol_version_id', outputSchemaId: 'output:byte_span',
      parameterSchemaRef: null, executorClass: 'DB_QUERY_EXECUTOR',
      requiredRevisionAxes: ['sourceRevision'], allowedArtifactKinds: ['symbol_version_row'],
      implementationRef: 'atlas_symbol_versions', implementationKind: 'postgres_table',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:get_ast_evidence', operatorRevision: OPERATOR_REVISION, kind: 'GET_AST_EVIDENCE',
      inputSchemaId: 'input:tree_node_id', outputSchemaId: 'output:ast_node_row',
      parameterSchemaRef: null, executorClass: 'DB_QUERY_EXECUTOR',
      requiredRevisionAxes: ['sourceRevision'], allowedArtifactKinds: ['ast_node_row'],
      implementationRef: 'sveltekit-frontend/src/lib/server/atlas/integration/atlas-ast-evidence-reader-v1.ts#readAtlasAstEvidenceV1', implementationKind: 'source_file',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:get_references', operatorRevision: OPERATOR_REVISION, kind: 'GET_REFERENCES',
      inputSchemaId: 'input:source_ref', outputSchemaId: 'output:source_ref_row',
      parameterSchemaRef: null, executorClass: 'DB_QUERY_EXECUTOR',
      requiredRevisionAxes: ['workspaceRevision'], allowedArtifactKinds: ['source_ref_row'],
      implementationRef: 'atlas_source_refs', implementationKind: 'postgres_table',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:get_callers', operatorRevision: OPERATOR_REVISION, kind: 'GET_CALLERS',
      inputSchemaId: 'input:stable_symbol_id', outputSchemaId: 'output:stable_symbol_id_list',
      parameterSchemaRef: 'param:graph-hop-bound', executorClass: 'GRAPH_TRAVERSAL_EXECUTOR',
      requiredRevisionAxes: ['graphRevision'], allowedArtifactKinds: ['graph_edge'],
      implementationRef: 'graph_expand_neighborhood', implementationKind: 'mcp_tool',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:expand_graph', operatorRevision: OPERATOR_REVISION, kind: 'EXPAND_GRAPH',
      inputSchemaId: 'input:graph_node_key', outputSchemaId: 'output:neighborhood',
      parameterSchemaRef: 'param:graph-hop-bound', executorClass: 'GRAPH_TRAVERSAL_EXECUTOR',
      requiredRevisionAxes: ['graphRevision'], allowedArtifactKinds: ['graph_edge'],
      implementationRef: 'sveltekit-frontend/src/lib/server/atlas/graph/graph-expansion-adapter.ts#expandAtlasGraph', implementationKind: 'source_file',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:shortest_path', operatorRevision: OPERATOR_REVISION, kind: 'SHORTEST_PATH',
      inputSchemaId: 'input:node_pair', outputSchemaId: 'output:path',
      parameterSchemaRef: null, executorClass: 'GRAPH_TRAVERSAL_EXECUTOR',
      requiredRevisionAxes: ['graphRevision'], allowedArtifactKinds: ['graph_path'],
      implementationRef: 'graph_shortest_path', implementationKind: 'mcp_tool',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:bounded_bfs', operatorRevision: OPERATOR_REVISION, kind: 'BOUNDED_BFS',
      inputSchemaId: 'input:canonical_ids', outputSchemaId: 'output:oak_kag_neighbor_receipt',
      parameterSchemaRef: 'param:graph-hop-bound', executorClass: 'GRAPH_TRAVERSAL_EXECUTOR',
      requiredRevisionAxes: ['graphRevision'], allowedArtifactKinds: ['hyperedge_member'],
      implementationRef: 'sveltekit-frontend/src/lib/server/atlas/integration/kag-hypergraph-reader-v1.ts#readKagHypergraphNeighborsStrictV1', implementationKind: 'source_file',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:search_lexical', operatorRevision: OPERATOR_REVISION, kind: 'SEARCH_LEXICAL',
      inputSchemaId: 'input:query_text', outputSchemaId: 'output:ranked_chunks',
      parameterSchemaRef: 'param:top-k', executorClass: 'SEARCH_EXECUTOR',
      requiredRevisionAxes: ['workspaceRevision'], allowedArtifactKinds: ['ranked_chunk'],
      implementationRef: 'sveltekit-frontend/src/lib/server/search/postgres-fts.ts#searchCodeLexicalStrictV1', implementationKind: 'source_file',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:search_semantic', operatorRevision: OPERATOR_REVISION, kind: 'SEARCH_SEMANTIC',
      inputSchemaId: 'input:semantic_768_query', outputSchemaId: 'output:oak_semantic_qdrant_receipt',
      parameterSchemaRef: 'param:top-k', executorClass: 'SEARCH_EXECUTOR',
      requiredRevisionAxes: ['embeddingRevision'], allowedArtifactKinds: ['ranked_chunk'],
      implementationRef: 'sveltekit-frontend/src/lib/server/search/qdrant-search.ts#searchQdrantCodeStrictV1', implementationKind: 'source_file',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:rerank', operatorRevision: OPERATOR_REVISION, kind: 'RERANK',
      inputSchemaId: 'input:candidate_list', outputSchemaId: 'output:ranked_candidate_list',
      parameterSchemaRef: null, executorClass: 'RANK_EXECUTOR',
      requiredRevisionAxes: [], allowedArtifactKinds: ['ranked_chunk'],
      implementationRef: 'sveltekit-frontend/src/lib/server/retrieval/canonical-rerank-executor.ts', implementationKind: 'source_file',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:build_context', operatorRevision: OPERATOR_REVISION, kind: 'BUILD_CONTEXT',
      inputSchemaId: 'input:evidence_set', outputSchemaId: 'output:context_manifest',
      parameterSchemaRef: 'param:token-budget', executorClass: 'CONTEXT_BUILD_EXECUTOR',
      requiredRevisionAxes: [], allowedArtifactKinds: ['context_manifest'],
      implementationRef: 'parent-atlas.context-manifest.ace.v1', implementationKind: 'source_file',
      verifiedLive: true, deterministic: false, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:run_typecheck', operatorRevision: OPERATOR_REVISION, kind: 'RUN_TYPECHECK',
      inputSchemaId: 'input:changed_source_refs', outputSchemaId: 'output:typecheck_diagnostics',
      parameterSchemaRef: null, executorClass: 'CLI_PROCESS_EXECUTOR',
      requiredRevisionAxes: ['sourceRevision'], allowedArtifactKinds: ['typecheck_diagnostics'],
      implementationRef: 'tsc --noEmit', implementationKind: 'cli_command',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    buildKernelOperatorV1({
      operatorId: 'op:run_test', operatorRevision: OPERATOR_REVISION, kind: 'RUN_TEST',
      inputSchemaId: 'input:spec_file_ref', outputSchemaId: 'output:test_run_result',
      parameterSchemaRef: null, executorClass: 'CLI_PROCESS_EXECUTOR',
      requiredRevisionAxes: ['sourceRevision'], allowedArtifactKinds: ['test_run_result'],
      implementationRef: 'vitest run', implementationKind: 'cli_command',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    // 16th operator, added 2026-08-31 — confirmed real by reading the
    // implementation directly (not just the file name): gates a
    // classified candidate against abstention, evidence presence, and
    // source-revision match, producing an ELIGIBLE/BLOCKED_* status.
    buildKernelOperatorV1({
      operatorId: 'op:intersect_eligibility', operatorRevision: OPERATOR_REVISION, kind: 'INTERSECT_ELIGIBILITY',
      inputSchemaId: 'input:feature_classification', outputSchemaId: 'output:feature_promotion_eligibility',
      parameterSchemaRef: null, executorClass: 'IN_MEMORY_COMPUTE_EXECUTOR',
      requiredRevisionAxes: ['sourceRevision'], allowedArtifactKinds: ['feature_promotion_eligibility'],
      implementationRef: 'packages/parent-atlas/src/core/feature-promotion-eligibility-v1.ts', implementationKind: 'source_file',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    // 17th operator, added 2026-08-31 — distinct from op:get_callers: a
    // ts-morph-derived stored property, not a live graph traversal.
    buildKernelOperatorV1({
      operatorId: 'op:get_callees', operatorRevision: OPERATOR_REVISION, kind: 'GET_CALLEES',
      inputSchemaId: 'input:source_ref', outputSchemaId: 'output:callee_identifier_list',
      parameterSchemaRef: null, executorClass: 'GRAPH_TRAVERSAL_EXECUTOR',
      requiredRevisionAxes: ['sourceRevision', 'graphRevision'], allowedArtifactKinds: ['callee_identifier'],
      implementationRef: 'sveltekit-frontend/src/lib/server/graph/codebase-scanner-v2.ts', implementationKind: 'source_file',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
    // 18th operator, added 2026-08-31 — real, tested, deterministic
    // revision-comparison function; not the same as any lookup above.
    buildKernelOperatorV1({
      operatorId: 'op:compare_revision', operatorRevision: OPERATOR_REVISION, kind: 'COMPARE_REVISION',
      inputSchemaId: 'input:graph_snapshot_revision_pair', outputSchemaId: 'output:revision_comparison_result',
      parameterSchemaRef: null, executorClass: 'IN_MEMORY_COMPUTE_EXECUTOR',
      requiredRevisionAxes: ['graphRevision'], allowedArtifactKinds: ['graph_snapshot_revision'],
      implementationRef: 'packages/parent-atlas/src/core/graph-snapshot-revision-v1.ts', implementationKind: 'source_file',
      verifiedLive: true, deterministic: true, producerRevision: PRODUCER_REVISION,
    }),
  ];

  return buildKernelOperatorLibraryV1({ libraryRevision: 'operator-library:symbol-repair:v0', operators });
}
