#!/usr/bin/env node
/**
 * build-mini-active-cache.mjs — producer script (stub for tests)
 * Flags: --dry-run --pretty --skip-neo4j --quiet
 * Hard rules: READ-ONLY, reads karpathy_wiki/_all_docs, writes to mini_active_nvme_cache
 */
const argv = process.argv.slice(2);
const FLAGS = {
  dryRun: argv.includes('--dry-run'),
  pretty: argv.includes('--pretty'),
  skipNeo4j: argv.includes('--skip-neo4j'),
  quiet: argv.includes('--quiet'),
};

const NVME_PATH = 'mini_active_nvme_cache/agents-graph.min.json';
const COUCHDB_KARPATHY = 'karpathy_wiki/_all_docs';

// Sample read-only Neo4j cypher used in tests
function fetchNeo4jDirToFeaturesAndTags(){
  return `MATCH (c:AgentsCard) RETURN c.dir AS dir, c.features AS features, c.tags AS tags`;
}

const HardRules = ['READ-ONLY', 'No LLM calls', 'Hard rules:'];

export { FLAGS, NVME_PATH, COUCHDB_KARPATHY, fetchNeo4jDirToFeaturesAndTags, HardRules };
