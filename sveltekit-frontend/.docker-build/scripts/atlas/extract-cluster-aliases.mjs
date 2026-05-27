#!/usr/bin/env node
/**
 * scripts/atlas/extract-cluster-aliases.mjs
 * 
 * Maps cluster IDs to human-readable aliases and persists them to 
 * Redis (ace:cluster-alias:{alias}) and a local JSON mapping.
 */

import { createClient } from 'redis';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REDIS_URL = process.env.REDIS_URL;
const ALIASES_OUT = resolve(process.cwd(), 'docs/graph/cluster-aliases.json');

const ALIAS_MAP = {
  "72": { alias: "ace_context", topic: "ACE context assembly and retrieval policy" },
  "73": { alias: "retrieval_graph", topic: "retrieval ranking, graph context, legal PageRank" },
  "94": { alias: "redis_cache", topic: "cache services, Redis, ACE packets" },
  "25": { alias: "redis_cache", topic: "cache services, Redis, ACE packets" },
  "32": { alias: "langextract_services", topic: "LangExtract extraction services and tooling" },
  "47": { alias: "legal_corpus_routes", topic: "legal corpus, statutes, citations" },
  "92": { alias: "evidence_upload_ui", topic: "evidence upload UI and upload components" },
  "82": { alias: "grpc_mcp_tools", topic: "gRPC, MCP tool clients, internal tool routing" },
  "20": { alias: "webgpu_similarity", topic: "WebGPU similarity and GPU graph operations" },
  "23": { alias: "gpu_topology", topic: "WebGPU manifold and GPU graph topology" },
  "80": { alias: "gpu_topology", topic: "WebGPU manifold and GPU graph topology" },
  "57": { alias: "gpu_topology", topic: "WebGPU manifold and GPU graph topology" },
  "55": { alias: "db_schema", topic: "Drizzle schema, database tables, migrations" },
  "95": { alias: "db_schema", topic: "Drizzle schema, database tables, migrations" },
  "91": { alias: "db_schema", topic: "Drizzle schema, database tables, migrations" },
  "88": { alias: "db_schema", topic: "Drizzle schema, database tables, migrations" },
  "48": { alias: "db_schema", topic: "Drizzle schema, database tables, migrations" }
};

async function main() {
  if (!REDIS_URL) throw new Error('REDIS_URL is required');
  console.log('🚀 Atlas: Extracting and Caching Cluster Aliases...');

  const client = createClient({ url: REDIS_URL });
  await client.connect();

  console.log(`🧹 Clearing old aliases...`);
  const keys = await client.keys('ace:cluster-alias:*');
  if (keys.length > 0) {
    await client.del(keys);
  }

  console.log(`📥 Persisting ${Object.keys(ALIAS_MAP).length} aliases...`);
  for (const [id, data] of Object.entries(ALIAS_MAP)) {
    // Both by alias and by ID for lookup flexibility
    await client.set(`ace:cluster-alias:${data.alias}`, id);
    await client.set(`ace:cluster-meta:${id}`, JSON.stringify(data));
  }

  writeFileSync(ALIASES_OUT, JSON.stringify(ALIAS_MAP, null, 2));
  console.log(`✅ Saved aliases to ${ALIASES_OUT}`);
  
  await client.disconnect();
}

main().catch(err => {
  console.error(`❌ Alias Extraction Error: ${err.message}`);
  process.exit(1);
});
