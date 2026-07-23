#!/usr/bin/env node
/**
 * Retired PageRank proof-of-concept.
 *
 * The previous hybrid proof implementation was invalid and is no longer used.
 * Use scripts/atlas/compute-pagerank-networkx.mjs for the Python reference
 * oracle or scripts/atlas/compute-pagerank-neo4j-v2.mjs for the fixture-only
 * Neo4j stream runner.
 */

console.error(
  'compute-pagerank-nodejs.mjs is retired. Use scripts/atlas/compute-pagerank-networkx.mjs or scripts/atlas/compute-pagerank-neo4j-v2.mjs.',
);
process.exitCode = 1;
