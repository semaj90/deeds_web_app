// CORRECTED 2026-08-09 — live smoke test (openspec/changes/parent-atlas-graph-runtime-enhancement
// GR3) proved the original version of this file wrong. gds.bfs.stream yields ONE row with
// sourceNode + nodeIds (the full reachable set bounded by maxDepth) + a single synthetic `path`
// chaining ALL discovered nodes together in visitation order. length(path) is the SIZE of that
// whole synthetic chain — NOT any individual node's hop-distance from source. The original query
// below returned `traversalLength: 37` against `maxDepth: 3` on a real seed, which is what exposed
// the bug (a per-node depth read from length(path) would have silently been wrong, not merely
// absent).
//
// CANONICAL runtime lives in sveltekit-frontend/src/lib/server/graph/ + scripts/atlas/ — this
// bundle is REFERENCE material only. See openspec/changes/parent-atlas-graph-runtime-enhancement/
// tasks.md T-GR2-GR3-RECONCILE for the full writeup.
//
// Per-node BFS hop distance (a future FeatureRow `bfsHops` column) is NOT_PROVEN by this query or
// its corrected form below — gds.bfs.stream's output shape does not carry it. If a real per-node
// hop-distance is needed, use a traversal that explicitly emits a distance/level per node (a
// frontier-by-frontier BFS, or gds.allShortestPaths with a suitable weight), not this procedure.
//
// Params:
//   $sourcePath   e.g. "src/lib/server/features/ai/ace/context-assembler.ts"
//   $maxDepth     e.g. 3
//   $graphName    e.g. "codeTopology" (the canonical projection name — see PROJECTION_NAME in
//                 sveltekit-frontend/src/lib/server/graph/neo4j-gds-client.ts)
//
// What this DOES prove (source resolves, non-empty reachable set, monotonic effect of maxDepth):
//   run once with $maxDepth=1, once with $maxDepth=3 (or your two values of interest), and assert
//   reachableCount(maxDepth=1) <= reachableCount(maxDepth=3). See
//   scripts/atlas/smoke-gr2-gr3-graph-runtime.mts for the actual paired-run assertion.

MATCH (source:CodebaseFile {path: $sourcePath})
CALL gds.bfs.stream($graphName, {
  sourceNode: source,
  maxDepth: $maxDepth
})
YIELD sourceNode, nodeIds
RETURN
  source.path AS sourcePath,
  size(nodeIds) AS reachableNodeCount,
  [nodeId IN nodeIds[0..20] | gds.util.asNode(nodeId).path] AS sampleNodes;
