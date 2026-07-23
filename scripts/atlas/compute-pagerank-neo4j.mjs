#!/usr/bin/env node
/**
 * Retired legacy Neo4j PageRank materializer.
 *
 * It projected SIMILAR_TOPOLOGY and used Neo4j paths as durable identity before
 * writing legacy authority surfaces. That is incompatible with the Parent Atlas
 * V2 graph snapshot contract, so this entrypoint is intentionally non-runnable.
 *
 * Fixture parity only:
 *   node scripts/atlas/compute-pagerank-neo4j-v2.mjs --json
 *
 * Production authority promotion remains disabled until a validated PostgreSQL
 * snapshot, persisted NetworkX/GDS parity artifact, and promotion gate exist.
 */

console.error(
  'compute-pagerank-neo4j.mjs is retired: path-based legacy authority materialization is disabled. Use compute-pagerank-neo4j-v2.mjs for fixture parity only.',
);
process.exitCode = 1;
