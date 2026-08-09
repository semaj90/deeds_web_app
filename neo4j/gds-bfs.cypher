// GR3 — GDS BFS smoke query, against the canonical 'codeTopology' projection
// (owned by ensureGdsProjection() in sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts —
// this file does not create a competing projection; it assumes the projection already exists,
// call ensureGdsProjection() first if it doesn't).
//
// IMPORTANT (learned via live smoke test, 2026-08-09): gds.bfs.stream yields ONE row per call
// with `sourceNode`, `nodeIds` (all reachable nodes, bounded by maxDepth), and a single synthetic
// `path` chaining all of them together — `length(path)` is the SIZE of that whole synthetic path,
// NOT any individual node's hop-distance from source. Do not compute per-node "depth" from
// length(path) — use nodeIds directly, and prove maxDepth's effect by comparing result size across
// two different maxDepth values (see smoke-gr2-gr3-graph-runtime.mts for the actual assertion).
//
// Params:
//   $seedPath   e.g. "src/lib/server/features/ai/ace/context-assembler.ts"
//   $maxDepth   e.g. 3
//
// Contract under test (must hold for GR3 BFS PASS):
//   - source resolves in the projection
//   - gds.bfs.stream returns a non-empty reachable-node set
//   - a smaller maxDepth yields a result size <= a larger maxDepth's result size (monotonicity
//     proof that the parameter has real effect — see the paired run in the smoke script)

MATCH (source:CodebaseFile {path: $seedPath})
CALL gds.bfs.stream('codeTopology', {
  sourceNode: source,
  maxDepth: $maxDepth
})
YIELD sourceNode, nodeIds
RETURN
  source.path AS seedPath,
  size(nodeIds) AS reachableNodeCount,
  [nodeId IN nodeIds[0..20] | gds.util.asNode(nodeId).path] AS sampleNodes;
