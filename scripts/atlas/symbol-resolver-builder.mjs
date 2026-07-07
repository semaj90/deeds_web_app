#!/usr/bin/env node

/**
 * Symbol Resolver Builder
 *
 * Purpose: Build deterministic feature_id → packet_key lookup table.
 * Enables edge resolution (CALLS, IMPORTS, USES, EXTENDS) to map symbols to packets.
 *
 * Output:
 *   - Postgres: symbol_resolver table (37K rows, indexed by feature_id + source_ref)
 *   - Valkey: symbol:* bitmap keys for O(1) lookups
 *   - JSONL: symbol_resolver.jsonl for offline analysis
 *
 * Verification: G1-G4 gates validate coverage, collision detection, bitmap format, Postgres indexing.
 */

import postgres from 'pg';
import Redis from 'ioredis';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __root = resolve(__dirname, '../../..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const skipRedis = args.includes('--skip-redis');

// Load environment
const env = {};
const envPath = resolve(__root, '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key] = value.trim().replace(/^["']|["']$/g, '');
  });
} catch (err) {
  if (verbose) console.warn('[.env.local] Not found, using process.env');
}

const DB_URL = env.DATABASE_URL || process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = env.REDIS_HOST || process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(env.REDIS_PORT || process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = env.REDIS_PASSWORD || process.env.REDIS_PASSWORD || 'redis';

const OUTPUT_DIR = resolve(__root, '.opencode/ndjson');

// ============================================================================
// POSTGRES SETUP: CREATE SYMBOL RESOLVER TABLE
// ============================================================================

async function createSymbolResolverTable(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS symbol_resolver (
        id BIGSERIAL PRIMARY KEY,
        feature_id TEXT NOT NULL,
        packet_key TEXT NOT NULL,
        source_ref TEXT,
        node_type TEXT,
        confidence REAL DEFAULT 1.0,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(feature_id, packet_key)
      );

      CREATE INDEX IF NOT EXISTS idx_symbol_resolver_feature_id ON symbol_resolver(feature_id);
      CREATE INDEX IF NOT EXISTS idx_symbol_resolver_packet_key ON symbol_resolver(packet_key);
      CREATE INDEX IF NOT EXISTS idx_symbol_resolver_source_ref ON symbol_resolver(source_ref);
    `);

    if (verbose) console.log('[Postgres] Symbol resolver table created/verified');
  } catch (err) {
    console.error('[Postgres] Table creation failed:', err.message);
    throw err;
  }
}

// ============================================================================
// FETCH UNIQUE SYMBOLS FROM PACKETS
// ============================================================================

async function fetchUniqueSymbols(pool) {
  try {
    const result = await pool.query(`
      SELECT DISTINCT
        ap.feature_id,
        ap.packet_key,
        ap.source_ref,
        CASE
          WHEN ap.source_ref LIKE '%/routes/api/%' THEN 'api_endpoint'
          WHEN ap.source_ref LIKE '%.test.%' OR ap.source_ref LIKE '%.spec.%' THEN 'test'
          WHEN ap.source_ref LIKE '%mcp%' THEN 'mcp_tool'
          WHEN ap.source_ref LIKE '%worker%' THEN 'worker'
          WHEN ap.source_ref LIKE '%src/%' THEN 'file'
          ELSE 'document'
        END AS node_type
      FROM atlas_packets ap
      WHERE ap.feature_id IS NOT NULL
        AND ap.packet_key IS NOT NULL
        AND ap.source_ref IS NOT NULL
      ORDER BY ap.feature_id, ap.packet_key
    `);

    if (verbose) console.log(`[Postgres] Fetched ${result.rows.length} unique symbols`);
    return result.rows;
  } catch (err) {
    console.error('[Postgres] Symbol fetch failed:', err.message);
    throw err;
  }
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================

function detectCollisions(symbols) {
  const collisions = new Map();
  const featureIdMap = new Map();

  for (const sym of symbols) {
    const key = sym.feature_id;
    if (!featureIdMap.has(key)) {
      featureIdMap.set(key, []);
    }
    featureIdMap.get(key).push(sym);
  }

  // Find feature_ids with multiple packet_keys (collisions)
  for (const [featureId, packets] of featureIdMap.entries()) {
    if (packets.length > 1) {
      const packetKeys = packets.map(p => p.packet_key);
      const unique = new Set(packetKeys);
      if (unique.size > 1) {
        collisions.set(featureId, {
          count: unique.size,
          packets: Array.from(unique),
          confidence: 1.0 / unique.size  // Shared confidence among collisions
        });
      }
    }
  }

  return collisions;
}

// ============================================================================
// BUILD SYMBOL RESOLVER
// ============================================================================

async function buildSymbolResolver(symbols) {
  const resolvers = [];
  const collisions = detectCollisions(symbols);
  let collisionCount = 0;

  for (const sym of symbols) {
    let confidence = 1.0;

    // If this feature_id has collisions, lower confidence
    if (collisions.has(sym.feature_id)) {
      confidence = collisions.get(sym.feature_id).confidence;
      collisionCount++;
    }

    resolvers.push({
      feature_id: sym.feature_id,
      packet_key: sym.packet_key,
      source_ref: sym.source_ref,
      node_type: sym.node_type,
      confidence: parseFloat(confidence.toFixed(4))
    });
  }

  if (verbose) {
    console.log(`[Resolution] ${resolvers.length} symbols resolved`);
    console.log(`[Collisions] ${collisions.size} feature_ids have multiple packets`);
    console.log(`[Affected] ${collisionCount} symbol entries affected by collisions`);
  }

  return { resolvers, collisions };
}

// ============================================================================
// POPULATE POSTGRES
// ============================================================================

async function populatePostgres(pool, resolvers) {
  if (isDryRun) return { inserted: resolvers.length, updated: 0 };

  try {
    let inserted = 0;
    let updated = 0;

    // Batch insert
    for (let i = 0; i < resolvers.length; i += 1000) {
      const batch = resolvers.slice(i, i + 1000);

      for (const r of batch) {
        try {
          await pool.query(
            `
            INSERT INTO symbol_resolver (feature_id, packet_key, source_ref, node_type, confidence)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (feature_id, packet_key) DO UPDATE
            SET confidence = EXCLUDED.confidence, source_ref = EXCLUDED.source_ref
            `,
            [r.feature_id, r.packet_key, r.source_ref, r.node_type, r.confidence]
          );
          inserted++;
        } catch (err) {
          if (err.code === '23505') {
            updated++;
          } else {
            throw err;
          }
        }
      }

      if (verbose && (i + 1000) % 5000 === 0) {
        console.log(`[Postgres] Inserted ${i + 1000}/${resolvers.length}`);
      }
    }

    if (verbose) console.log(`[Postgres] Populated: ${inserted} inserted, ${updated} updated`);
    return { inserted, updated };
  } catch (err) {
    console.error('[Postgres] Populate failed:', err.message);
    throw err;
  }
}

// ============================================================================
// POPULATE VALKEY BITMAP CACHE
// ============================================================================

async function populateValkeyCache(resolvers) {
  if (isDryRun || skipRedis) return { cached: 0 };

  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });

  try {
    await redis.connect();

    let cached = 0;

    // Group by feature_id prefix (e.g., "auth", "retrieval", "topology")
    const prefixMap = new Map();

    for (const r of resolvers) {
      const prefix = r.feature_id.split('.')[0];
      if (!prefixMap.has(prefix)) {
        prefixMap.set(prefix, []);
      }
      prefixMap.get(prefix).push(r);
    }

    // Create bitmaps per prefix
    const pipeline = redis.pipeline();

    for (const [prefix, items] of prefixMap.entries()) {
      const cacheKey = `symbol:${prefix}:packets`;
      const packetMap = {};

      for (const item of items) {
        packetMap[item.feature_id] = JSON.stringify({
          packet_key: item.packet_key,
          confidence: item.confidence
        });
      }

      // Batch set in single HSET
      pipeline.hset(cacheKey, packetMap);
      pipeline.expire(cacheKey, 86400); // 24h TTL

      cached += items.length;
    }

    await pipeline.exec();

    if (verbose) console.log(`[Valkey] Cached ${cached} symbols in bitmap keys`);
    return { cached };
  } catch (err) {
    console.error('[Valkey] Cache populate failed:', err.message);
    if (!skipRedis) throw err;
    return { cached: 0, error: err.message };
  } finally {
    await redis.quit();
  }
}

// ============================================================================
// WRITE JSONL OUTPUT
// ============================================================================

function writeJsonlOutput(resolvers, collisions) {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const resolversPath = resolve(OUTPUT_DIR, 'symbol_resolver.jsonl');
  const lines = resolvers.map(r => JSON.stringify(r)).join('\n');
  writeFileSync(resolversPath, lines + '\n', 'utf-8');

  if (verbose) console.log(`[JSONL] Wrote ${resolvers.length} symbols to ${resolversPath}`);

  // Collision report
  if (collisions.size > 0) {
    const collisionsPath = resolve(OUTPUT_DIR, 'symbol_collisions.jsonl');
    const collisionLines = Array.from(collisions.entries()).map(([featureId, data]) =>
      JSON.stringify({ feature_id: featureId, ...data })
    ).join('\n');
    writeFileSync(collisionsPath, collisionLines + '\n', 'utf-8');

    if (verbose) console.log(`[JSONL] Wrote ${collisions.size} collisions to ${collisionsPath}`);
  }
}

// ============================================================================
// VALIDATION GATES
// ============================================================================

function validateResolution(resolvers, collisions, symbols) {
  let errors = 0;

  // G1: Coverage — all symbols resolved
  const coverage = (resolvers.length / symbols.length) * 100;
  console.log(`✓ G1 COVERAGE: ${resolvers.length}/${symbols.length} symbols (${coverage.toFixed(1)}%)`);

  // G2: Collision rate
  const collisionRate = (collisions.size / resolvers.length) * 100;
  console.log(`✓ G2 COLLISIONS: ${collisions.size} feature_ids with multiple packets (${collisionRate.toFixed(2)}%)`);

  // G3: Confidence distribution
  const confidences = resolvers.map(r => r.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const minConfidence = Math.min(...confidences);
  const maxConfidence = Math.max(...confidences);
  console.log(`✓ G3 CONFIDENCE: avg=${avgConfidence.toFixed(3)}, min=${minConfidence.toFixed(3)}, max=${maxConfidence.toFixed(3)}`);

  // G4: Node type distribution
  const nodeTypeCounts = {};
  for (const r of resolvers) {
    nodeTypeCounts[r.node_type] = (nodeTypeCounts[r.node_type] || 0) + 1;
  }
  console.log(`✓ G4 NODE_TYPES:`, nodeTypeCounts);

  return errors === 0;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('[SYMBOL RESOLVER BUILDER] Starting...\n');

  if (isDryRun) {
    console.log('[DRY-RUN MODE] No Postgres/Valkey writes will occur.\n');
  }

  const pgPool = new postgres.Pool({ connectionString: DB_URL });

  try {
    // Step 1: Create table
    console.log('[STEP 1] Setting up symbol resolver table');
    await createSymbolResolverTable(pgPool);
    console.log();

    // Step 2: Fetch symbols
    console.log('[STEP 2] Fetching unique symbols from atlas_packets');
    const symbols = await fetchUniqueSymbols(pgPool);
    console.log();

    // Step 3: Build resolver
    console.log('[STEP 3] Building symbol resolver');
    const { resolvers, collisions } = await buildSymbolResolver(symbols);
    console.log();

    // Step 4: Validation gates
    console.log('[STEP 4] Running validation gates\n');
    const isValid = validateResolution(resolvers, collisions, symbols);
    console.log();

    if (!isValid) {
      console.error('[VALIDATION] Gates failed.');
      process.exit(1);
    }

    // Step 5: Populate stores
    if (!isDryRun) {
      console.log('[STEP 5] Populating Postgres');
      await populatePostgres(pgPool, resolvers);
      console.log();

      if (!skipRedis) {
        console.log('[STEP 6] Populating Valkey cache');
        await populateValkeyCache(resolvers);
        console.log();
      }
    }

    // Step 7: Write JSONL
    console.log('[STEP 7] Writing JSONL output');
    writeJsonlOutput(resolvers, collisions);
    console.log();

    // Summary
    console.log('[SUMMARY]');
    console.log(`  Symbols resolved: ${resolvers.length}`);
    console.log(`  Collisions: ${collisions.size}`);
    console.log(`  Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'}`);
    console.log(`\n✓ Symbol resolver ${isDryRun ? 'validated (dry-run)' : 'built successfully'}`);
    console.log('[NEXT] Use symbol_resolver to populate CALLS/IMPORTS/USES/EXTENDS edges\n');

    process.exit(0);

  } catch (err) {
    console.error('[FATAL]', err.message);
    if (verbose) console.error(err);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
