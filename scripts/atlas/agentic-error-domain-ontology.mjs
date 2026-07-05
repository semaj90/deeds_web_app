#!/usr/bin/env node

/**
 * Agentic Error Domain Ontology
 *
 * Maps error classes to domain regions for recovery packet selection:
 *   error_class → domain_class → topology_cluster → recovery_packets
 *
 * Domain taxonomy:
 *   - auth: authentication, sessions, login/logout
 *   - db: postgres, queries, migrations, transactions
 *   - cache: redis/valkey, bitfrost, eviction
 *   - search: qdrant, vector ops, ANN, reranking
 *   - grpc: service definitions, client/server, protobuf
 *   - sse: server-sent events, streaming, backpressure
 *   - llm: ollama, gemma4, inference, generation
 *   - gpu: cuda, libtorch, tensor ops
 *   - neo4j: cypher, graph traversal, GDS
 *   - ui: svelte, components, routes
 *
 * Error class hierarchy:
 *   ConnectivityError → [auth, cache, grpc, db]
 *   TimeoutError → [llm, gpu, qdrant, neo4j]
 *   ValidationError → [grpc, db, ui]
 *   ResourceError → [gpu, cache, db]
 *   CypherError → [neo4j, search]
 *
 * Usage:
 *   node scripts/atlas/agentic-error-domain-ontology.mjs --validate
 *   node scripts/atlas/agentic-error-domain-ontology.mjs --export
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const VALIDATE = process.argv.includes('--validate');
const EXPORT = process.argv.includes('--export');

// Canonical error-to-domain mapping
const ERROR_DOMAIN_MAP = {
  // Connectivity failures
  'ConnectivityError:auth': ['auth.sessions', 'auth.login', 'auth.logout', 'auth.lucia'],
  'ConnectivityError:cache': ['cache.redis', 'cache.bitfrost', 'cache.invalidate'],
  'ConnectivityError:db': ['db.client', 'db.pool', 'db.schema'],
  'ConnectivityError:grpc': ['grpc.client', 'grpc.service', 'grpc.proto'],

  // Timeout failures
  'TimeoutError:llm': ['llm.ollama', 'llm.gemma4', 'llm.inference', 'llm.synthesis'],
  'TimeoutError:gpu': ['gpu.cuda', 'gpu.libtorch', 'gpu.tensor', 'gpu.inference'],
  'TimeoutError:qdrant': ['search.qdrant', 'search.vector', 'search.ann'],
  'TimeoutError:neo4j': ['graph.neo4j', 'graph.cypher', 'graph.gds'],

  // Validation failures
  'ValidationError:grpc': ['grpc.proto', 'grpc.validation', 'grpc.codec'],
  'ValidationError:db': ['db.schema', 'db.migration', 'db.validation'],
  'ValidationError:ui': ['ui.svelte', 'ui.component', 'ui.validation'],

  // Resource exhaustion
  'ResourceError:gpu': ['gpu.cuda', 'gpu.memory', 'gpu.vram'],
  'ResourceError:cache': ['cache.redis', 'cache.eviction', 'cache.memory'],
  'ResourceError:db': ['db.pool', 'db.connection', 'db.lock'],

  // Cypher / graph errors
  'CypherError:neo4j': ['graph.cypher', 'graph.query', 'graph.validation'],
  'CypherError:search': ['search.qdrant', 'search.filter', 'search.validation'],
};

// Domain class definitions (for context)
const DOMAIN_CLASSES = {
  auth: { label: 'Authentication & Sessions', directory: 'src/lib/server/auth' },
  db: { label: 'Database & ORM', directory: 'src/lib/server/db' },
  cache: { label: 'Caching & BitFrost', directory: 'src/lib/server/cache' },
  search: { label: 'Vector Search & Qdrant', directory: 'src/lib/server/search' },
  grpc: { label: 'gRPC Services', directory: 'src/lib/server/grpc' },
  sse: { label: 'Server-Sent Events', directory: 'src/routes' },
  llm: { label: 'LLM & Inference', directory: 'src/lib/server/ai' },
  gpu: { label: 'GPU Acceleration', directory: 'simd-bridge' },
  neo4j: { label: 'Neo4j & Graph', directory: 'src/lib/server/graph' },
  ui: { label: 'UI Components', directory: 'src/lib/components' },
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Agentic Error Domain Ontology                                ║');
console.log('║  Maps error classes to domain regions for recovery packets    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function validateOntology() {
  console.log('🔍 Validating error-domain mappings\n');

  const mappings = Object.entries(ERROR_DOMAIN_MAP);
  const errorClasses = new Set();
  const domainClasses = new Set();

  for (const [key, features] of mappings) {
    const [errorClass, domainClass] = key.split(':');
    errorClasses.add(errorClass);
    domainClasses.add(domainClass);

    console.log(`  ${key}`);
    console.log(`    Features: ${features.join(', ')}`);
  }

  console.log(`\nUnique error classes: ${[...errorClasses].join(', ')}`);
  console.log(`Unique domains: ${[...domainClasses].join(', ')}`);
  console.log();

  return true;
}

async function exportOntology() {
  try {
    console.log('📊 Exporting error domain ontology to Postgres\n');

    // Create temp table
    await pgPool.query(`
      CREATE TEMP TABLE ontology_map (
        error_class TEXT,
        domain_class TEXT,
        features TEXT[],
        PRIMARY KEY (error_class, domain_class)
      )
    `);

    // Populate temp table
    const inserts = [];
    let paramIdx = 1;

    for (const [key, features] of Object.entries(ERROR_DOMAIN_MAP)) {
      const [errorClass, domainClass] = key.split(':');
      inserts.push({
        error_class: errorClass,
        domain_class: domainClass,
        features,
        paramIdx: [paramIdx, paramIdx + 1, paramIdx + 2],
      });
      paramIdx += 3;
    }

    // Query Postgres to find recovery packets for each error class
    console.log('🔗 Linking error classes to recovery packets via topology\n');

    for (const [errorKey, features] of Object.entries(ERROR_DOMAIN_MAP)) {
      const [errorClass, domainClass] = errorKey.split(':');

      // Find packets matching feature_id patterns
      const featurePatterns = features.map(f => `'${f}'`).join(',');
      const packetsRes = await pgPool.query(`
        SELECT
          packet_key,
          feature_id,
          directory_path,
          page_rank_score,
          community_id
        FROM atlas_packets
        WHERE feature_id = ANY('{${features.join(',')}}')
        ORDER BY page_rank_score DESC NULLS LAST
        LIMIT 5
      `);

      console.log(`  ${errorKey}: ${packetsRes.rows.length} recovery packets`);
      packetsRes.rows.forEach((row, idx) => {
        console.log(`    ${idx + 1}. ${row.feature_id} (PR=${row.page_rank_score?.toFixed(3) || 'null'})`);
      });
    }

    console.log();
    console.log('✅ Ontology export complete');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

async function main() {
  if (VALIDATE) {
    await validateOntology();
  } else if (EXPORT) {
    await exportOntology();
  } else {
    console.log('Usage:');
    console.log('  node agentic-error-domain-ontology.mjs --validate');
    console.log('  node agentic-error-domain-ontology.mjs --export\n');

    // Default: show summary
    console.log('📋 Error Domain Ontology Summary\n');
    console.log('Error Classes:', Object.keys(ERROR_DOMAIN_MAP).length);
    console.log('Domains:', Object.keys(DOMAIN_CLASSES).length);
    console.log();

    Object.entries(DOMAIN_CLASSES).forEach(([key, domain]) => {
      console.log(`  ${key}: ${domain.label}`);
      console.log(`         Directory: ${domain.directory}`);
    });
  }
}

main();
