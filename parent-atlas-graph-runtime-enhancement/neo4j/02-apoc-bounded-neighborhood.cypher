MATCH (seed:CodebaseFile {path: $seedPath})
CALL apoc.path.expandConfig(seed, {
  relationshipFilter: "IMPORTS>|<IMPORTS|TEST_COVERS_FILE>|<TEST_COVERS_FILE|BELONGS_TO_FEATURE>|<BELONGS_TO_FEATURE",
  minLevel: 1,
  maxLevel: $maxDepth,
  bfs: true,
  uniqueness: "NODE_GLOBAL",
  limit: $limit
})
YIELD path
RETURN
  [n IN nodes(path) | coalesce(n.path, n.id, elementId(n))] AS nodeKeys,
  [r IN relationships(path) | type(r)] AS relationshipTypes,
  length(path) AS hops
ORDER BY hops ASC
LIMIT $limit;
