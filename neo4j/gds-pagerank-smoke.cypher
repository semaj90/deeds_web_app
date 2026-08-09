// GR3 — GDS PageRank smoke query.
//
// This file is a REFERENCE COPY for manual cypher-shell / Neo4j Browser smoke testing only.
// The canonical, actually-used-in-production owner is `runPageRankClient()` +
// `getTopPageRankClient()` in sveltekit-frontend/src/lib/server/graph/neo4j-gds-client.ts.
// Do NOT wire application code to this file directly.
//
// Params:
//   $limit   e.g. 20
//
// Contract under test (must hold for GR3 PageRank PASS):
//   - executes against the existing 'codeTopology' projection (no new projection created)
//   - returns finite (non-NaN, non-null) scores
//   - non-empty result

CALL gds.pageRank.mutate('codeTopology', {
  maxIterations: 20,
  dampingFactor: 0.85,
  mutateProperty: 'pageRankScore'
})
YIELD nodePropertiesWritten, ranIterations
RETURN nodePropertiesWritten, ranIterations;

// Then, in a separate statement, read back the top-N:
// MATCH (n)
// WHERE n.pageRankScore IS NOT NULL
// RETURN n.path AS path, n.pageRankScore AS score
// ORDER BY score DESC
// LIMIT $limit;
