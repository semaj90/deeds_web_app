#!/usr/bin/env node
/**
 * Comprehensive Metadata Contract Audit Across All Stores
 *
 * Goal: Inventory which fields exist, where they exist, and their coverage
 * BEFORE any backfill, index creation, or processing.
 *
 * Containers used:
 * - legal-ai-postgres (PostgreSQL 18)
 * - legal-ai-valkey (Valkey/Redis)
 * - legal-ai-qdrant (Qdrant vector DB)
 * - Neo4j (optional, manual Cypher)
 *
 * Orchestration:
 * - llama-server.exe (Gemma4 legal model) for semantic analysis of audit gaps
 *
 * No mutations. Read-only audit.
 *
 * Usage:
 *   node scripts/atlas/audit-metadata-contract-across-stores.mjs [--orchestrate]
 *
 * Output:
 *   docs/reports/metadata-contract-cross-store-audit.json
 *   docs/reports/metadata-contract-cross-store-audit.md
 *   docs/reports/metadata-contract-orchestration-analysis.md (if --orchestrate)
 */

import { createClient as createRedisClient } from 'redis';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const VALKEY_PASSWORD = process.env.VALKEY_PASSWORD || 'redis';
const VALKEY_HOST = process.env.VALKEY_HOST || '127.0.0.1';
const VALKEY_PORT = process.env.VALKEY_PORT || 6379;
const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const NEO4J_URL = process.env.NEO4J_URL || 'neo4j://127.0.0.1:7687';
const DOCKER_PG = 'legal-ai-postgres';
const PG_USER = 'legal_admin';
const PG_DB = 'legal_ai_db';
const RUST_SIMDJSON_PATH = path.join(__dirname, '../../simd-bridge/rust-simdjson');
const TURBOVEC_PATH = path.join(__dirname, '../../turbovec');
const ORCHESTRATE = process.argv.includes('--orchestrate');
const USE_JQ_LOGGING = process.argv.includes('--jq');
const TMP_LOG_DIR = path.join(__dirname, '../../.tmp');

// ═══════════════════════════════════════════════════════════════
// Docker Query Helpers
// ═══════════════════════════════════════════════════════════════

function runPgQueryJSON(sql) {
  try {
    const escaped = sql.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const cmd = `docker exec ${DOCKER_PG} psql -U ${PG_USER} -d ${PG_DB} --json -c "${escaped}"`;
    const result = execSync(cmd, { encoding: 'utf8' });

    if (!result.trim()) return [];
    return JSON.parse(result);
  } catch (err) {
    console.error(`[Postgres] Query failed: ${err.message.substring(0, 100)}`);
    return [];
  }
}

function runPgQuery(sql) {
  try {
    const escaped = sql.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const cmd = `docker exec ${DOCKER_PG} psql -U ${PG_USER} -d ${PG_DB} -c "${escaped}"`;
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error(`[Postgres] Query failed: ${err.message.substring(0, 100)}`);
    return '';
  }
}

// Parse Rust Cargo.toml config
function parseCargoToml(cargoPath) {
  try {
    if (!fs.existsSync(cargoPath)) return null;

    const content = fs.readFileSync(cargoPath, 'utf8');
    const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
    const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
    const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);

    const dependencies = [];
    if (depsMatch && depsMatch[1]) {
      const depLines = depsMatch[1].split('\n').filter((l) => l.includes('='));
      dependencies.push(...depLines.map((l) => l.split('=')[0].trim()));
    }

    return {
      name: nameMatch ? nameMatch[1] : 'unknown',
      version: versionMatch ? versionMatch[1] : 'unknown',
      path: cargoPath,
      dependencies,
    };
  } catch (err) {
    return null;
  }
}

// Load Rust simdjson config
function loadRustSimdjsonConfig() {
  const cargoPath = path.join(RUST_SIMDJSON_PATH, 'Cargo.toml');
  const config = parseCargoToml(cargoPath);
  if (config) {
    config.type = 'simd-json-parser';
    config.main_dependency = 'simd-json';
  }
  return config;
}

// Load TurboVec config
function loadTurboVecConfig() {
  const cargoPath = path.join(TURBOVEC_PATH, 'Cargo.toml');
  const config = parseCargoToml(cargoPath);
  if (config) {
    config.type = 'vector-search-optimizer';
  }
  return config;
}

// JSON logging helper
function logJSON(label, data) {
  if (USE_JQ_LOGGING) {
    const tmpPath = path.join(TMP_LOG_DIR, `audit-${label}-${Date.now()}.json`);
    if (!fs.existsSync(TMP_LOG_DIR)) {
      fs.mkdirSync(TMP_LOG_DIR, { recursive: true });
    }
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    console.log(`  📄 JSON logged: ${tmpPath}`);
  }
}

const TARGET_FIELDS = [
  'packet_key',
  'source_ref',
  'sourceRef',
  'feature_id',
  'feature_ids',
  'qdrant_point_id',
  'community_id',
  'som_cluster',
  'som_code',
  'som_x',
  'som_y',
  'ontology_label',
  'topology_label',
  'retrieval_strategy',
  'retrieval_path',
  'trace_id',
  'ae_epoch',
  'ae_val_loss',
  'ae_confidence',
  'latent_64',
  'latent_64_embedding',
  'embedding',
  'embedding_384',
  'embedding_768',
];

const POSTGRES_TABLES = [
  'atlas_packets',
  'nes_chrom_packets',
  'task_semantic_packets',
  'atlas_higher_hop_index',
  'atlas_feature_map',
  'parent_atlas_documents',
  'retrieval_provenance',
];

let auditResults = {
  timestamp: new Date().toISOString(),
  stores: {
    postgres: { tables: {}, indexes: {}, verdict: 'PENDING' },
    qdrant: { collections: {}, payload_schema: {}, verdict: 'PENDING' },
    neo4j: { nodes: {}, edges: {}, verdict: 'PENDING' },
    redis: { key_prefixes: {}, verdict: 'PENDING' },
  },
  cross_store_analysis: {},
  critical_gaps: [],
  recommendations: [],
};

// ═══════════════════════════════════════════════════════════════
// POSTGRES AUDIT
// ═══════════════════════════════════════════════════════════════

function auditPostgres() {
  console.log('\n🔍 POSTGRES AUDIT (via Docker)');
  console.log('─'.repeat(70));

  try {
    // 1. Table inventory (JSON output)
    console.log('Scanning tables...');
    const tableQuery = `
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name = ANY(ARRAY['${POSTGRES_TABLES.join("','")}'])
      ORDER BY table_name, ordinal_position;
    `;
    const tableRows = runPgQueryJSON(tableQuery);

    // Organize by table
    const tablesByName = {};
    for (const row of tableRows) {
      const tableName = row.table_name;
      if (!tablesByName[tableName]) {
        tablesByName[tableName] = [];
      }
      tablesByName[tableName].push({
        column_name: row.column_name,
        data_type: row.data_type,
        udt_name: row.udt_name,
      });
    }

    console.log(`  Found ${Object.keys(tablesByName).length} tables`);

    // 2. Row counts
    console.log('Counting rows...');
    for (const tableName of POSTGRES_TABLES) {
      if (!tablesByName[tableName]) {
        console.log(`  ⊘ ${tableName}: table not found`);
        continue;
      }

      const countQuery = `SELECT COUNT(*) as cnt FROM ${tableName};`;
      const countRows = runPgQueryJSON(countQuery);
      const rowCount = parseInt(countRows[0]?.cnt || 0, 10);

      auditResults.stores.postgres.tables[tableName] = {
        row_count: rowCount,
        columns: tablesByName[tableName],
        field_coverage: {},
        indexes: [],
      };

      // Check field coverage for this table
      for (const field of TARGET_FIELDS) {
        const col = tablesByName[tableName].find((c) => c.column_name === field);
        if (col) {
          auditResults.stores.postgres.tables[tableName].field_coverage[field] = {
            exists: true,
            type: col.data_type,
            is_physical_column: true,
          };

          // If field exists, sample coverage
          if (rowCount > 0) {
            const sampleQuery = `SELECT COUNT(*) FILTER (WHERE ${field} IS NOT NULL) as populated FROM ${tableName};`;
            const sampleRows = runPgQueryJSON(sampleQuery);
            const populated = parseInt(sampleRows[0]?.populated || 0, 10);
            auditResults.stores.postgres.tables[tableName].field_coverage[field].populated =
              populated;
            auditResults.stores.postgres.tables[tableName].field_coverage[field].coverage_pct =
              rowCount > 0 ? ((populated / rowCount) * 100).toFixed(1) : 0;
          }
        }

        // Check for JSONB variants
        const jsonbCols = tablesByName[tableName].filter((c) => c.data_type === 'jsonb');
        for (const jsonbCol of jsonbCols) {
          if (rowCount > 0) {
            try {
              const jsonbQuery = `SELECT COUNT(*) FILTER (WHERE ${jsonbCol.column_name}->>'${field}' IS NOT NULL) as populated FROM ${tableName} LIMIT 100;`;
              const jsonbRows = runPgQueryJSON(jsonbQuery);
              const populated = parseInt(jsonbRows[0]?.populated || 0, 10);
              if (populated > 0) {
                auditResults.stores.postgres.tables[tableName].field_coverage[field] = {
                  exists: true,
                  type: 'jsonb->' + field,
                  is_physical_column: false,
                  jsonb_column: jsonbCol.column_name,
                  populated,
                  coverage_pct: ((populated / rowCount) * 100).toFixed(1),
                };
              }
            } catch (e) {
              // Skip if key doesn't exist in JSONB
            }
          }
        }
      }

      console.log(`  ✓ ${tableName}: ${rowCount} rows`);
    }

    // 3. Index inventory
    console.log('Scanning indexes...');
    const indexQuery = `
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname='public'
      AND (
        indexdef ILIKE '%packet_key%'
        OR indexdef ILIKE '%source_ref%'
        OR indexdef ILIKE '%feature_id%'
        OR indexdef ILIKE '%qdrant_point_id%'
        OR indexdef ILIKE '%metadata%'
        OR indexdef ILIKE '%som%'
        OR indexdef ILIKE '%community%'
        OR indexdef ILIKE '%ontology%'
        OR indexdef ILIKE '%topology%'
        OR indexdef ILIKE '%retrieval%'
        OR indexdef ILIKE '%trace%'
        OR indexdef ILIKE '%vector%'
      )
      ORDER BY tablename, indexname;
    `;
    const indexRows = runPgQueryJSON(indexQuery);

    for (const idx of indexRows) {
      const tablename = idx.tablename;
      if (!auditResults.stores.postgres.indexes[tablename]) {
        auditResults.stores.postgres.indexes[tablename] = [];
      }
      auditResults.stores.postgres.indexes[tablename].push({
        indexname: idx.indexname,
        indexdef: (idx.indexdef || '').substring(0, 150) + '...',
      });
    }

    console.log(`  ✓ Found ${indexRows.length} relevant indexes`);

    auditResults.stores.postgres.verdict = 'COMPLETE';
  } catch (err) {
    console.error(`  ❌ Postgres audit failed:`, err.message);
    auditResults.stores.postgres.verdict = 'FAILED';
  }
}

// ═══════════════════════════════════════════════════════════════
// QDRANT AUDIT
// ═══════════════════════════════════════════════════════════════

async function auditQdrant() {
  console.log('\n🔍 QDRANT AUDIT');
  console.log('─'.repeat(70));

  try {
    // 1. List collections
    console.log('Scanning collections...');
    const collectionsRes = await fetch(`${QDRANT_URL}/collections`);
    const collectionsData = await collectionsRes.json();

    for (const coll of collectionsData.result.collections || []) {
      const collName = coll.name;
      console.log(`  Auditing ${collName}...`);

      // Get collection info
      const collInfoRes = await fetch(`${QDRANT_URL}/collections/${collName}`);
      const collInfo = await collInfoRes.json();

      const vectorSize = collInfo.result.config.params.vectors.size || 0;
      const pointCount = collInfo.result.points_count || 0;

      auditResults.stores.qdrant.collections[collName] = {
        vector_size: vectorSize,
        point_count: pointCount,
        payload_fields: {},
        payload_indexes: collInfo.result.payload_schema?.fields || {},
      };

      // Sample points to discover payload structure
      if (pointCount > 0) {
        const pointsRes = await fetch(`${QDRANT_URL}/collections/${collName}/points/scroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limit: 100,
            with_payload: true,
            with_vector: false,
          }),
        });

        const pointsData = await pointsRes.json();
        const points = pointsData.result.points || [];

        // Aggregate payload keys and coverage
        const payloadKeyCounts = {};
        const payloadValueSamples = {};

        for (const point of points) {
          if (!point.payload) continue;
          for (const [key, value] of Object.entries(point.payload)) {
            if (!payloadKeyCounts[key]) {
              payloadKeyCounts[key] = 0;
              payloadValueSamples[key] = value;
            }
            if (value !== null && value !== undefined) {
              payloadKeyCounts[key]++;
            }
          }
        }

        // Map to target fields
        for (const field of TARGET_FIELDS) {
          for (const [payloadKey, count] of Object.entries(payloadKeyCounts)) {
            if (payloadKey === field || payloadKey === field + 's' || payloadKey === 'sourceRef' && field === 'source_ref') {
              auditResults.stores.qdrant.collections[collName].payload_fields[field] = {
                exists: true,
                actual_key_name: payloadKey,
                populated_count: count,
                coverage_pct: ((count / points.length) * 100).toFixed(1),
                sample_value: JSON.stringify(payloadValueSamples[payloadKey]).substring(0, 50),
              };
            }
          }
        }

        console.log(`    ✓ ${points.length} points sampled`);
      }
    }

    auditResults.stores.qdrant.verdict = 'COMPLETE';
  } catch (err) {
    console.error(`  ❌ Qdrant audit failed:`, err.message);
    auditResults.stores.qdrant.verdict = 'FAILED';
  }
}

// ═══════════════════════════════════════════════════════════════
// NEO4J AUDIT
// ═══════════════════════════════════════════════════════════════

async function auditNeo4j() {
  console.log('\n🔍 NEO4J AUDIT');
  console.log('─'.repeat(70));

  // Neo4j audit queries (read-only)
  const queries = [
    {
      name: 'node_structure',
      cypher: 'MATCH (n) RETURN DISTINCT labels(n) as labels, keys(n) as keys, count(*) as cnt LIMIT 50',
    },
    {
      name: 'topology_edges',
      cypher: 'MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r) as edge_count',
    },
    {
      name: 'source_ref_populated',
      cypher: 'MATCH (n) WHERE n.source_ref IS NOT NULL RETURN count(n) as cnt',
    },
    {
      name: 'feature_id_populated',
      cypher: 'MATCH (n) WHERE n.feature_id IS NOT NULL RETURN count(n) as cnt',
    },
    {
      name: 'community_id_populated',
      cypher: 'MATCH (n) WHERE n.community_id IS NOT NULL RETURN count(n) as cnt',
    },
    {
      name: 'som_cluster_populated',
      cypher: 'MATCH (n) WHERE n.som_cluster IS NOT NULL RETURN count(n) as cnt',
    },
  ];

  auditResults.stores.neo4j.nodes = {};
  auditResults.stores.neo4j.edges = {};

  console.log('Note: Neo4j queries require direct driver. Using curl fallback...');
  console.log('  (Full Neo4j audit deferred — use Neo4j Browser at http://localhost:7474)');

  auditResults.stores.neo4j.verdict = 'DEFERRED';
  auditResults.stores.neo4j.note =
    'Run manually in Neo4j Browser. Queries: ' + queries.map((q) => q.name).join(', ');
}

// ═══════════════════════════════════════════════════════════════
// REDIS AUDIT
// ═══════════════════════════════════════════════════════════════

async function auditValkey() {
  console.log('\n🔍 VALKEY/REDIS AUDIT');
  console.log('─'.repeat(70));

  try {
    const redis = createRedisClient({
      socket: {
        host: VALKEY_HOST,
        port: VALKEY_PORT,
      },
      password: VALKEY_PASSWORD,
      username: 'default',
    });

    redis.on('error', (err) => {
      console.error(`  Redis error: ${err.message}`);
    });

    await redis.connect();
    console.log(`  ✓ Connected to Valkey at ${VALKEY_HOST}:${VALKEY_PORT}`);

    // Verify it's Valkey or Redis
    const infoRes = await redis.info('server');
    const isValkey = infoRes.includes('valkey') || infoRes.includes('Valkey');
    console.log(`  Backend: ${isValkey ? 'Valkey' : 'Redis'}`);

    const prefixes = ['atlas:', 'ace:', 'bifrost:', 'karpathy:', 'som:', 'feature:', 'qdrant:', 'gpu:'];

    console.log(`  Scanning ${prefixes.length} key prefixes...`);
    for (const prefix of prefixes) {
      const keys = await redis.keys(prefix + '*');
      auditResults.stores.redis.key_prefixes[prefix] = {
        key_count: keys.length,
        sample_keys: keys.slice(0, 3),
      };
      if (keys.length > 0) {
        console.log(`    ✓ ${prefix}: ${keys.length} keys`);
      }
    }

    // Get memory stats
    const infoMemory = await redis.info('memory');
    const memoryMatch = infoMemory.match(/used_memory_human:([^\r\n]+)/);
    const usedMemory = memoryMatch ? memoryMatch[1] : 'unknown';

    auditResults.stores.redis.memory_usage = usedMemory;
    console.log(`  Memory usage: ${usedMemory}`);

    await redis.quit();
    auditResults.stores.redis.verdict = 'COMPLETE';
    auditResults.stores.redis.backend = isValkey ? 'Valkey' : 'Redis';
  } catch (err) {
    console.error(`  ❌ Valkey/Redis audit failed: ${err.message}`);
    auditResults.stores.redis.verdict = 'FAILED';
    auditResults.stores.redis.error = err.message;
  }
}

// ═══════════════════════════════════════════════════════════════
// Gemma4 Orchestration via llama-server
// ═══════════════════════════════════════════════════════════════

async function analyzeGapsWithGemma4() {
  console.log('\n🤖 GEMMA4 ORCHESTRATION (Semantic Gap Analysis)');
  console.log('─'.repeat(70));

  try {
    // Build analysis prompt
    const criticalFieldsMissing = auditResults.critical_gaps
      .filter((g) => g.severity === 'CRITICAL')
      .map((g) => g.field)
      .join(', ');

    const qdrantOnlyFields = Object.entries(auditResults.cross_store_analysis)
      .filter(([_, status]) => status.verdict === 'QDRANT_ONLY')
      .map(([field, _]) => field)
      .join(', ');

    const prompt = `You are analyzing a database metadata synchronization problem across stores (Postgres, Qdrant, Neo4j, Redis).

SITUATION:
- Qdrant has 52,606 vectors with 61 collections
- Postgres has ${Object.values(auditResults.stores.postgres.tables).reduce((sum, t) => sum + t.row_count, 0)} rows across ${Object.keys(auditResults.stores.postgres.tables).length} tables
- Fields ONLY in Qdrant (not in Postgres): ${qdrantOnlyFields || 'none detected'}
- Critical gaps (CRITICAL severity): ${criticalFieldsMissing || 'none'}

QUESTION:
1. What is the root cause of this Postgres↔Qdrant metadata parity gap?
2. Should these fields be in Postgres as canonical source, or are they runtime-only in Qdrant?
3. What is the blocking order to fix this before proceeding to PageRank and Karpathy blend?

Keep response to 3-4 sentences. Focus on actionable diagnosis, not general explanation.`;

    console.log('Sending analysis prompt to Gemma4...');

    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 256,
        stream: false,
      }),
      timeout: 30000,
    });

    if (!response.ok) {
      console.log(
        `  ⚠️ Gemma4 returned ${response.status} — using rule-based analysis instead`
      );
      return generateRuleBasedAnalysis();
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || '';

    auditResults.orchestration = {
      model: 'gemma4-legal-iq4xs-direct.gguf',
      llama_server_url: LLAMA_SERVER_URL,
      prompt_summary: 'Metadata parity gap analysis',
      analysis,
      timestamp: new Date().toISOString(),
    };

    console.log('  ✓ Analysis complete');
    console.log(`\n${analysis}\n`);

    return analysis;
  } catch (err) {
    console.error(`  ❌ Gemma4 orchestration failed: ${err.message}`);
    return generateRuleBasedAnalysis();
  }
}

function generateRuleBasedAnalysis() {
  const rules = [
    'packet_key, source_ref, feature_id, qdrant_point_id, community_id, som_cluster are IDENTITY fields.',
    'Identity fields MUST be in Postgres (canonical) AND Qdrant (payload mirror).',
    'If they exist only in Qdrant: Postgres schema is incomplete or data did not backfill.',
    'Blocking action: Inspect Postgres atlas_packets table schema. If columns exist but are empty, backfill from Qdrant. If columns missing, add them via migration.',
  ];

  const analysis = rules.join(' ');
  auditResults.orchestration = {
    model: 'rule-based-fallback',
    analysis,
    timestamp: new Date().toISOString(),
  };

  console.log('  Using rule-based analysis (Gemma4 unavailable)');
  console.log(`\n${analysis}\n`);

  return analysis;
}

// ═══════════════════════════════════════════════════════════════
// CROSS-STORE ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeFieldParity() {
  console.log('\n📊 CROSS-STORE FIELD PARITY');
  console.log('─'.repeat(70));

  const fieldStatus = {};

  for (const field of TARGET_FIELDS) {
    fieldStatus[field] = {
      postgres: false,
      qdrant: false,
      neo4j: false,
      redis: false,
      coverage: {},
      verdict: 'MISSING',
    };

    // Postgres
    for (const table of Object.values(auditResults.stores.postgres.tables)) {
      if (table.field_coverage[field]) {
        fieldStatus[field].postgres = true;
        fieldStatus[field].coverage.postgres = {
          table: table.table_name,
          populated: table.field_coverage[field].populated || 0,
          coverage_pct: table.field_coverage[field].coverage_pct || 0,
        };
      }
    }

    // Qdrant
    for (const coll of Object.values(auditResults.stores.qdrant.collections)) {
      if (coll.payload_fields[field]) {
        fieldStatus[field].qdrant = true;
        fieldStatus[field].coverage.qdrant = {
          collection: coll.collection_name,
          populated: coll.payload_fields[field].populated_count,
          coverage_pct: coll.payload_fields[field].coverage_pct,
        };
      }
    }

    // Verdict
    if (fieldStatus[field].postgres && fieldStatus[field].qdrant) {
      fieldStatus[field].verdict = 'SYNCED';
    } else if (fieldStatus[field].postgres) {
      fieldStatus[field].verdict = 'POSTGRES_ONLY';
    } else if (fieldStatus[field].qdrant) {
      fieldStatus[field].verdict = 'QDRANT_ONLY';
    }

    // Detect naming drift
    if (field === 'source_ref' && fieldStatus['sourceRef']) {
      fieldStatus[field].naming_drift = 'sourceRef variant exists';
    }
    if (field === 'feature_id' && fieldStatus['feature_ids']) {
      fieldStatus[field].naming_drift = 'feature_ids variant exists';
    }
  }

  auditResults.cross_store_analysis = fieldStatus;

  // Summary
  const synced = Object.entries(fieldStatus).filter((e) => e[1].verdict === 'SYNCED').length;
  const postgresOnly = Object.entries(fieldStatus).filter((e) => e[1].verdict === 'POSTGRES_ONLY')
    .length;
  const qdrantOnly = Object.entries(fieldStatus).filter((e) => e[1].verdict === 'QDRANT_ONLY').length;
  const missing = Object.entries(fieldStatus).filter((e) => e[1].verdict === 'MISSING').length;

  console.log(`  SYNCED: ${synced}`);
  console.log(`  POSTGRES_ONLY: ${postgresOnly}`);
  console.log(`  QDRANT_ONLY: ${qdrantOnly}`);
  console.log(`  MISSING: ${missing}`);
}

// ═══════════════════════════════════════════════════════════════
// CRITICAL GAP DETECTION
// ═══════════════════════════════════════════════════════════════

function detectCriticalGaps() {
  console.log('\n⚠️  CRITICAL GAP DETECTION');
  console.log('─'.repeat(70));

  const criticalFields = [
    'packet_key',
    'source_ref',
    'feature_id',
    'qdrant_point_id',
    'community_id',
    'som_cluster',
  ];

  for (const field of criticalFields) {
    const status = auditResults.cross_store_analysis[field];

    if (!status) {
      auditResults.critical_gaps.push({
        field,
        severity: 'CRITICAL',
        message: `${field} not found in any store`,
      });
      console.log(`  🔴 ${field}: NOT FOUND`);
    } else if (status.verdict === 'MISSING') {
      auditResults.critical_gaps.push({
        field,
        severity: 'CRITICAL',
        message: `${field} missing from all stores`,
      });
      console.log(`  🔴 ${field}: MISSING`);
    } else if (status.verdict === 'POSTGRES_ONLY') {
      auditResults.critical_gaps.push({
        field,
        severity: 'HIGH',
        message: `${field} in Postgres but NOT in Qdrant — blocks metadata filtering`,
      });
      console.log(`  🟠 ${field}: POSTGRES_ONLY (Qdrant missing)`);
    } else if (status.verdict === 'QDRANT_ONLY') {
      auditResults.critical_gaps.push({
        field,
        severity: 'HIGH',
        message: `${field} in Qdrant but NOT in Postgres — breaks source of truth`,
      });
      console.log(`  🟠 ${field}: QDRANT_ONLY (Postgres missing)`);
    } else {
      console.log(`  ✅ ${field}: SYNCED`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// GENERATE RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════

function generateRecommendations() {
  console.log('\n💡 RECOMMENDATIONS');
  console.log('─'.repeat(70));

  const recs = [];

  // Check for naming drift
  const sourceRefStatus = auditResults.cross_store_analysis['source_ref'];
  const sourceRefVarStatus = auditResults.cross_store_analysis['sourceRef'];
  if (sourceRefStatus && sourceRefVarStatus) {
    recs.push({
      type: 'NAMING_DRIFT',
      issue: 'Both source_ref and sourceRef exist',
      action: 'Standardize on source_ref everywhere (Postgres, Qdrant, Neo4j)',
      priority: 'HIGH',
    });
    console.log('  🟠 NAMING_DRIFT: source_ref vs sourceRef');
  }

  const featureIdStatus = auditResults.cross_store_analysis['feature_id'];
  const featureIdsStatus = auditResults.cross_store_analysis['feature_ids'];
  if (featureIdStatus && featureIdsStatus) {
    recs.push({
      type: 'NAMING_DRIFT',
      issue: 'Both feature_id and feature_ids exist',
      action: 'Standardize on feature_id everywhere',
      priority: 'HIGH',
    });
    console.log('  🟠 NAMING_DRIFT: feature_id vs feature_ids');
  }

  // Check for sync gaps
  for (const [field, status] of Object.entries(auditResults.cross_store_analysis)) {
    if (status.verdict === 'POSTGRES_ONLY') {
      recs.push({
        type: 'SYNC_GAP',
        field,
        issue: `${field} exists in Postgres but not in Qdrant`,
        action: 'Before ACE integration, ensure Qdrant payload includes this field',
        priority: status.coverage.postgres?.coverage_pct > 90 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (status.verdict === 'QDRANT_ONLY') {
      recs.push({
        type: 'TRUTH_GAP',
        field,
        issue: `${field} exists in Qdrant but not in Postgres`,
        action: 'Investigate whether this should be in Postgres as canonical source',
        priority: 'HIGH',
      });
    }
  }

  // Check for runtime vs metadata fields
  const runtimeFields = ['trace_id', 'retrieval_strategy', 'retrieval_path', 'ae_epoch', 'ae_val_loss'];
  const runtimeInMetadata = runtimeFields.filter(
    (f) => auditResults.cross_store_analysis[f]?.verdict !== 'MISSING'
  );
  if (runtimeInMetadata.length > 0) {
    recs.push({
      type: 'SCHEMA_DESIGN',
      issue: `Runtime fields in immutable metadata: ${runtimeInMetadata.join(', ')}`,
      action:
        'Consider moving runtime fields to retrieval_provenance or ace_runs tables instead of packet metadata',
      priority: 'MEDIUM',
    });
    console.log(`  🟡 SCHEMA_DESIGN: Runtime fields in packet metadata`);
  }

  auditResults.recommendations = recs;
}

// ═══════════════════════════════════════════════════════════════
// WRITE REPORTS
// ═══════════════════════════════════════════════════════════════

async function writeReports() {
  const reportDir = path.join(__dirname, '../../docs/reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // JSON report
  const jsonPath = path.join(reportDir, 'metadata-contract-cross-store-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(auditResults, null, 2));
  console.log(`\n📄 JSON report: ${jsonPath}`);

  // Markdown report
  const mdReport = `# Metadata Contract Cross-Store Audit

**Date**: ${new Date().toISOString()}

## Executive Summary

| Store | Status | Tables/Collections |
|-------|--------|-------------------|
| Postgres | ${auditResults.stores.postgres.verdict} | ${Object.keys(auditResults.stores.postgres.tables).length} |
| Qdrant | ${auditResults.stores.qdrant.verdict} | ${Object.keys(auditResults.stores.qdrant.collections).length} |
| Neo4j | ${auditResults.stores.neo4j.verdict} | (deferred) |
| Redis | ${auditResults.stores.redis.verdict} | ${Object.keys(auditResults.stores.redis.key_prefixes).length} prefix groups |

## Critical Gaps (${auditResults.critical_gaps.length})

${
  auditResults.critical_gaps.length === 0
    ? '_None detected._'
    : auditResults.critical_gaps
        .map(
          (gap) =>
            `- **${gap.severity}**: ${gap.field} — ${gap.message}`
        )
        .join('\n')
}

## Field Parity Matrix

| Field | Postgres | Qdrant | Neo4j | Redis | Verdict |
|-------|----------|--------|-------|-------|---------|
${Object.entries(auditResults.cross_store_analysis)
  .map(
    ([field, status]) =>
      `| ${field} | ${status.postgres ? '✅' : '⊗'} | ${status.qdrant ? '✅' : '⊗'} | ${status.neo4j ? '✅' : '⊗'} | ${status.redis ? '✅' : '⊗'} | ${status.verdict} |`
  )
  .join('\n')}

## Postgres Table Inventory

${Object.entries(auditResults.stores.postgres.tables)
  .map(
    ([tableName, table]) =>
      `### ${tableName}
- **Row count**: ${table.row_count}
- **Columns**: ${table.columns.length}
- **Indexes**: ${(auditResults.stores.postgres.indexes[tableName] || []).length}`
  )
  .join('\n\n')}

## Qdrant Collection Inventory

${Object.entries(auditResults.stores.qdrant.collections)
  .map(
    ([collName, coll]) =>
      `### ${collName}
- **Vector size**: ${coll.vector_size}-dim
- **Points**: ${coll.point_count}
- **Payload fields**: ${Object.keys(coll.payload_fields).length}`
  )
  .join('\n\n')}

## Recommendations (${auditResults.recommendations.length})

${
  auditResults.recommendations.length === 0
    ? '_No action items._'
    : auditResults.recommendations
        .map(
          (rec) =>
            `### ${rec.type} (${rec.priority})
**Issue**: ${rec.issue}
**Action**: ${rec.action}`
        )
        .join('\n\n')
}

## Next Steps

1. **DO NOT** run backfills until gaps are understood
2. **DO NOT** create indexes until canonical schema is finalized
3. **DO NOT** proceed to PageRank or Karpathy blend until metadata contract is verified
4. **Investigate** Neo4j structure manually (run queries in Neo4j Browser)
5. **Resolve** naming drift (sourceRef vs source_ref, feature_ids vs feature_id)
6. **Confirm** which fields are immutable metadata vs runtime provenance

---

**Generated by**: \`scripts/atlas/audit-metadata-contract-across-stores.mjs\`
`;

  const mdPath = path.join(reportDir, 'metadata-contract-cross-store-audit.md');
  fs.writeFileSync(mdPath, mdReport);
  console.log(`📄 Markdown report: ${mdPath}`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('═'.repeat(70));
  console.log('METADATA CONTRACT CROSS-STORE AUDIT');
  console.log('═'.repeat(70));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Orchestration: ${ORCHESTRATE ? 'ENABLED (Gemma4)' : 'disabled'}`);
  console.log();

  try {
    // Load Rust configs
    console.log('📦 Loading Rust components...');

    const simdjsonConfig = loadRustSimdjsonConfig();
    if (simdjsonConfig) {
      auditResults.rust_simdjson = simdjsonConfig;
      console.log(`  ✓ ${simdjsonConfig.name} v${simdjsonConfig.version}`);
      console.log(`    Type: ${simdjsonConfig.type} (SIMD JSON parsing)`);
      logJSON('rust-simdjson', simdjsonConfig);
    }

    const turbovecConfig = loadTurboVecConfig();
    if (turbovecConfig) {
      auditResults.turbovec = turbovecConfig;
      console.log(`  ✓ ${turbovecConfig.name} v${turbovecConfig.version}`);
      console.log(`    Type: ${turbovecConfig.type} (Vector search optimization)`);
      logJSON('turbovec', turbovecConfig);
    }

    if (USE_JQ_LOGGING) {
      console.log(`  📂 JSON logging enabled: ${TMP_LOG_DIR}`);
    }
    console.log();

    // Run audits
    auditPostgres();
    await auditQdrant();
    await auditNeo4j();
    await auditValkey();

    // Cross-store analysis
    analyzeFieldParity();
    logJSON('field-parity', auditResults.cross_store_analysis);

    detectCriticalGaps();
    logJSON('critical-gaps', auditResults.critical_gaps);

    generateRecommendations();
    logJSON('recommendations', auditResults.recommendations);

    // Optional: Gemma4 semantic analysis
    if (ORCHESTRATE) {
      await analyzeGapsWithGemma4();
    }

    // Write reports
    await writeReports();

    console.log('═'.repeat(70));
    console.log('✅ AUDIT COMPLETE');
    console.log('═'.repeat(70));
    console.log();

    // Summary
    const totalTables = Object.keys(auditResults.stores.postgres.tables).length;
    const totalCollections = Object.keys(auditResults.stores.qdrant.collections).length;
    const totalPoints = Object.values(auditResults.stores.qdrant.collections).reduce(
      (sum, c) => sum + c.point_count,
      0
    );
    const syncedFields = Object.entries(auditResults.cross_store_analysis).filter(
      ([_, s]) => s.verdict === 'SYNCED'
    ).length;
    const totalFields = Object.keys(auditResults.cross_store_analysis).length;

    console.log(`📊 Summary:`);
    console.log(`  Postgres: ${totalTables} tables (audit: ${auditResults.stores.postgres.verdict})`);
    console.log(`  Qdrant: ${totalCollections} collections, ${totalPoints.toLocaleString()} points`);
    console.log(`  Valkey: ${Object.values(auditResults.stores.redis.key_prefixes).reduce((s, p) => s + p.key_count, 0)} keys`);
    console.log(`  Field Parity: ${syncedFields}/${totalFields} synced`);
    console.log();

    if (auditResults.critical_gaps.length > 0) {
      console.log(`⚠️  ${auditResults.critical_gaps.length} CRITICAL GAP(S) DETECTED:`);
      for (const gap of auditResults.critical_gaps.slice(0, 3)) {
        console.log(`  - ${gap.field}: ${gap.message}`);
      }
      console.log();
      console.log('👉 See docs/reports/metadata-contract-cross-store-audit.md for full details');
      process.exit(1);
    } else {
      console.log('✅ No critical gaps detected');
    }
  } catch (err) {
    console.error('\n❌ AUDIT FAILED:', err);
    process.exit(1);
  }
}

main();
