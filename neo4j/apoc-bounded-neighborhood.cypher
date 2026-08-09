// GR2 — APOC bounded neighborhood expansion smoke query.
// Run via cypher-shell / Neo4j Browser / driver session.run() with params:
//   $seedPath        e.g. "src/lib/server/features/ai/ace/context-assembler.ts"
//   $maxDepth        e.g. 3
//   $limit           e.g. 50
//   $relTypes        e.g. ["IMPORTS", "CALLS", "REFERENCES"]
//
// Contract under test (must hold for GR2 PASS):
//   - seed resolves to exactly one node
//   - every returned node's distance <= $maxDepth
//   - result count <= $limit
//   - every relationship traversed is in $relTypes (apoc.path.expandConfig enforces this
//     via relationshipFilter, but we also verify it structurally below)

MATCH (seed:CodebaseFile {path: $seedPath})
CALL apoc.path.expandConfig(seed, {
  relationshipFilter: apoc.text.join([r IN $relTypes | r], '|'),
  minLevel: 1,
  maxLevel: $maxDepth,
  uniqueness: 'NODE_GLOBAL',
  limit: $limit
})
YIELD path
WITH seed, path, last(nodes(path)) AS node, length(path) AS depth
RETURN
  seed.path AS seedPath,
  node.path AS nodePath,
  labels(node) AS nodeLabels,
  depth,
  [r IN relationships(path) | type(r)] AS relTypesInPath
ORDER BY depth ASC
LIMIT $limit;
