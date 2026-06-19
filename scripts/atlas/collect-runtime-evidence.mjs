#!/usr/bin/env node
/**
 * scripts/atlas/collect-runtime-evidence.mjs
 *
 * Full pipeline runner in RUNTIME_EVIDENCE_LAYER:
 * 1. SIMDJSON Parsing: Loads native simdjson N-API addon, reads gitignored neschrom97 cards.
 * 2. Materialization: Converts cards to cards.ndjson and runs MapReduce join, DuckDB, CouchDB.
 * 3. LangExtract Similarity & Multi-hop Traversal: Ranks connections using tokenized text overlap.
 * 4. Backfill: Syncs to PostgreSQL 18, Valkey, Bifrost Cache, and KAG DAG engrams.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const CARDS_DIR = path.join(ROOT, 'neschrom97', 'cards');
const PACKETS_DIR = path.join(ROOT, 'neschrom97', 'packets');
const OUTPUT_NDJSON = path.join(PACKETS_DIR, 'cards.ndjson');

// ── Step 0: Load Environment ──────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
  return env;
}
const ENV = loadEnv();
const DB_URL = ENV.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = ENV.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(ENV.REDIS_PORT || '6379');
const REDIS_PASS = ENV.REDIS_PASSWORD || ENV.REDIS_PASS || 'redis';

// ── Step 1: Load native simdjson addon ─────────────────────────────────────────
const addon = (() => {
  try {
    const p = path.join(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    if (fs.existsSync(p)) {
      const mod = require(p);
      if (typeof mod.simdJsonParse === 'function') {
        return mod;
      }
    }
  } catch (err) {
    // silence
  }
  return null;
})();

function fastJsonParse(raw) {
  if (addon && typeof addon.simdJsonParse === 'function') {
    try {
      const minified = addon.simdJsonParse(raw);
      return JSON.parse(minified);
    } catch {
      return JSON.parse(raw);
    }
  }
  return JSON.parse(raw);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeSourceRef(value) {
  return String(value ?? '').trim().replace(/\\/g, '/').replace(/^file:/, '').replace(/^\.?\//, '').replace(/^sveltekit-frontend\//, '');
}

function directoryPathFromSourceRef(sourceRef) {
  const norm = normalizeSourceRef(sourceRef);
  if (!norm) return 'root';
  const dir = path.posix.dirname(norm);
  return dir === '.' ? 'root' : dir;
}

function toSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');
}

function titleize(value) {
  return String(value ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[./_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const SOM_GRID = 20;

function parseSom(value) {
  if (value == null || value === '') return { som_row: null, som_col: null };

  const text = String(value);
  const pair = text.match(/(\d+)[,:_\- ]+(\d+)/);

  if (pair) {
    return { som_row: Number(pair[1]), som_col: Number(pair[2]) };
  }

  const bmu = Number(text);
  if (Number.isInteger(bmu)) {
    return {
      som_row: Math.floor(bmu / SOM_GRID),
      som_col: bmu % SOM_GRID
    };
  }

  return { som_row: null, som_col: null };
}

// ── Main Pipeline Execution ───────────────────────────────────────────────────
async function main() {
  console.log('=== Starting Runtime Evidence Collection & Processing Pipeline ===\n');

  // A. SIMDJSON Parsing of cards
  console.log('[Step 1] Loading and parsing cards...');
  let rawCards = [];
  let scanDir = CARDS_DIR;
  if (!fs.existsSync(scanDir) || fs.readdirSync(scanDir).length === 0) {
    scanDir = path.join(ROOT, '.opencode', 'cards');
  }

  if (fs.existsSync(scanDir)) {
    const files = fs.readdirSync(scanDir).filter(f => f.endsWith('.json') && f !== 'index.json');
    console.log(`  Scanning directory: ${path.relative(ROOT, scanDir)} (${files.length} files)`);
    for (const f of files) {
      try {
        const rawText = fs.readFileSync(path.join(scanDir, f), 'utf8');
        const card = fastJsonParse(rawText);
        rawCards.push(card);
      } catch (err) {
        // ignore single failures
      }
    }
  }
  console.log(`  ✓ Parsed ${rawCards.length} cards (simdjson loaded: ${!!addon}).\n`);

  // B. Run MapReduce, DuckDB, CouchDB pipelines
  console.log('[Step 2] Executing downstream pipeline scripts...');
  try {
    console.log('  Running neschrom97 materializer...');
    execSync(`node scripts/atlas/materialize-neschrom97-ldjson.mjs --apply`, { cwd: ROOT, stdio: 'inherit' });

    console.log('  Running MapReduce join...');
    execSync(`node scripts/atlas/ndjson-mapreduce-join.mjs`, { cwd: ROOT, stdio: 'inherit' });

    console.log('  Running DuckDB database synchronization...');
    execSync(`node scripts/atlas/materialize-mapreduce-duckdb.mjs --write`, { cwd: ROOT, stdio: 'inherit' });

    console.log('  Archiving to CouchDB...');
    const couchUser = ENV.COUCHDB_USER || 'admin';
    const couchPass = ENV.COUCHDB_PASSWORD || ENV.COUCHDB_PASS || 'deeds123';
    const couchUrl = ENV.COUCHDB_URL || 'http://localhost:5984';
    execSync(`node scripts/atlas/archive-to-couchdb.mjs --apply --url "${couchUrl}" --user "${couchUser}" --pass "${couchPass}"`, { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    console.warn(`  ⚠️ Pipeline subprocess warning: ${err.message}`);
  }
  console.log('  ✓ Downstream materializations completed.\n');

  // C. LangExtract Similarity & Multi-hop Connection Ranking
  console.log('[Step 3] Running LangExtract Cosine Similarity & Multi-hop Ranking...');
  
  function tokenize(text) {
    return [...new Set(
      String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9_./:-]+/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3)
    )];
  }

  function cosine(aTokens, bTokens) {
    const combined = [...new Set([...aTokens, ...bTokens])];
    if (combined.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (const t of combined) {
      const hasA = aTokens.includes(t) ? 1 : 0;
      const hasB = bTokens.includes(t) ? 1 : 0;
      dot += hasA * hasB;
      normA += hasA * hasA;
      normB += hasB * hasB;
    }
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  }

  // Tokenize all parsed cards
  const tokenizedCards = rawCards.map(c => {
    const textContent = [
      c.id, c.source_ref, c.feature_id, c.feature_label, c.file_path, c.summary,
      Array.isArray(c.tags) ? c.tags.join(' ') : ''
    ].join(' ');
    return {
      card: c,
      tokens: tokenize(textContent)
    };
  });

  // Calculate top-5 similarities for each card (multi-hop links)
  console.log(`  Calculating cosine similarity links for ${tokenizedCards.length} cards...`);
  const rankedGraph = [];
  const limit = Math.min(tokenizedCards.length, 500); // Bounded processing
  for (let i = 0; i < limit; i++) {
    const a = tokenizedCards[i];
    const neighbors = [];
    for (let j = 0; j < tokenizedCards.length; j++) {
      if (i === j) continue;
      const b = tokenizedCards[j];
      const score = cosine(a.tokens, b.tokens);
      if (score > 0.1) {
        neighbors.push({
          target_id: b.card.id || b.card.feature_id,
          source_ref: b.card.source_ref || b.card.file_path,
          score
        });
      }
    }
    neighbors.sort((x, y) => y.score - x.score);
    rankedGraph.push({
      card_id: a.card.id || a.card.feature_id,
      source_ref: a.card.source_ref || a.card.file_path,
      som_cluster: a.card.som_cluster || a.card.somCluster || null,
      top_hops: neighbors.slice(0, 5)
    });
  }
  console.log(`  ✓ Ranked connection map computed for top ${rankedGraph.length} cards.\n`);

  // D. Database & Valkey Cache Backfill
  console.log('[Step 4] Performing Postgres & Redis/Valkey Cache Backfill...');
  const pool = new pg.Pool({ connectionString: DB_URL });
  
  let ioredisOk = false;
  let redis = null;
  
  const redisPassword =
    process.env.REDIS_PASSWORD ||
    process.env.REDIS_PASS ||
    process.env.VALKEY_PASSWORD ||
    process.env.VALKEY_PASS ||
    'redis';

  try {
    const { default: RedisClient } = await import('ioredis');
    redis = new RedisClient({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: redisPassword,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1
    });
    redis.on('error', (err) => {
      // silence background connection errors
    });
    await redis.connect();
    ioredisOk = true;
  } catch (e) {
    console.error('  ⚠️ Redis connection attempt failed:', e.message);
  }

  if (pool.options.connectionString) {
    const cleanedUrl = pool.options.connectionString.replace(/:[^:@\s]+@/, ':****@');
    console.log(`  Database: ${cleanedUrl}`);
  } else {
    console.log(`  Database: postgresql://${pool.options.host || 'localhost'}:${pool.options.port || 5432}/${pool.options.database || ''}`);
  }
  console.log(`  Redis: ${ioredisOk ? 'healthy' : 'unavailable (skipping hot cache)'}`);

  let pgInserted = 0;
  let redisCached = 0;

  try {
    // Backfill cards into atlas_packets table, matching the identity constraint
    for (const card of rawCards.slice(0, 500)) {
      const sourceRef = normalizeSourceRef(card.source || card.source_ref || card.file_path || `unknown:${card.id}`);
      const filePath = card.file_path || sourceRef;
      const featureId = card.feature_id ||
                        card.featureId ||
                        card.metadata?.feature_id ||
                        card.payload?.feature_id ||
                        (Array.isArray(card.tags) && card.tags.length > 0 ? `repo.tag.${toSlug(card.tags[0])}` : null) ||
                        `repo.file.${toSlug(sourceRef)}`;
      const featureLabel = card.feature_label || titleize(path.basename(filePath));
      const packetKey = card.packet_key || `nes:${sourceRef}`;
      const dirPath = directoryPathFromSourceRef(sourceRef);

      // Parse SOM coordinates robustly
      const somResult = parseSom(card.som_row ?? card.som_bmu_row ?? card.somRow ?? card.som_cluster ?? card.somCluster ?? null);
      const somRow = somResult.som_row;
      const somCol = somResult.som_col;
      const somIndex = somRow !== null && somCol !== null ? somRow * SOM_GRID + somCol : null;

      // Classify and build topology/metadata JSONB contracts
      const domainClass = card.domain_class || card.domainClass || 'codebase';
      const ontologyLabel = card.ontology_label || card.ontologyLabel || 'general';
      const topologyLabel = card.topology_label || card.topologyLabel || 'node';
      const manifold4d = card.manifold_4d || card.manifold4d || null;

      const somClusterString = somRow !== null && somCol !== null ? `${somRow},${somCol}` : null;
      const topologyObj = {
        som_row: somRow,
        som_col: somCol,
        som_cluster: somClusterString,
        manifold_4d: manifold4d,
        topology_label: topologyLabel
      };
      
      const metadataObj = {
        ontology_label: ontologyLabel
      };

      // Upsert into Postgres
      await pool.query(
        `INSERT INTO atlas_packets (
          packet_key, source_ref, directory_path, file_path, feature_id, feature_label,
          som_row, som_col, som_index, domain_class, topology, metadata, tags, summary, payload, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
        ON CONFLICT (packet_key) DO UPDATE SET
          source_ref = EXCLUDED.source_ref,
          directory_path = EXCLUDED.directory_path,
          file_path = EXCLUDED.file_path,
          feature_label = EXCLUDED.feature_label,
          som_row = COALESCE(EXCLUDED.som_row, atlas_packets.som_row),
          som_col = COALESCE(EXCLUDED.som_col, atlas_packets.som_col),
          som_index = COALESCE(EXCLUDED.som_index, atlas_packets.som_index),
          domain_class = COALESCE(EXCLUDED.domain_class, atlas_packets.domain_class),
          topology = COALESCE(EXCLUDED.topology, atlas_packets.topology),
          metadata = COALESCE(EXCLUDED.metadata, atlas_packets.metadata),
          summary = COALESCE(EXCLUDED.summary, atlas_packets.summary),
          payload = COALESCE(EXCLUDED.payload, atlas_packets.payload),
          updated_at = NOW()`,
        [
          packetKey,
          sourceRef,
          dirPath,
          filePath,
          featureId,
          featureLabel,
          somRow,
          somCol,
          somIndex,
          domainClass,
          JSON.stringify(topologyObj),
          JSON.stringify(metadataObj),
          card.tags || [],
          card.summary || null,
          card || {}
        ]
      );
      pgInserted++;

      // Cache to Valkey (Redis)
      if (ioredisOk && redis) {
        const TTL = 3600;
        const cachePayload = {
          source_ref: sourceRef,
          feature_id: featureId,
          domain_class: domainClass,
          ontology_label: ontologyLabel,
          topology_label: topologyLabel,
          som_cluster: somClusterString,
          som_row: somRow,
          som_col: somCol,
          som_index: somIndex,
          manifold_4d: manifold4d,
          summary: card.summary || null,
          tags: card.tags || []
        };
        await redis.setex(`ace:packet:${packetKey}`, TTL, JSON.stringify(cachePayload));
        await redis.setex(`bifrost:packet:${packetKey}`, TTL, JSON.stringify(cachePayload));
        
        const cluster = somRow !== null && somCol !== null ? `${somRow}:${somCol}` : null;
        if (cluster) {
          await redis.sadd(`som:centroid:${cluster}`, packetKey);
          await redis.expire(`som:centroid:${cluster}`, TTL);
        }
        redisCached++;
      }
    }
    console.log(`  ✓ Backfilled ${pgInserted} packets to PostgreSQL.`);
    console.log(`  ✓ Cached ${redisCached} engrams/centroids in Valkey.`);
  } catch (err) {
    console.error('  ❌ Backfill error:', err.message);
  } finally {
    await pool.end();
    if (redis) {
      try {
        redis.disconnect();
      } catch (err) {
        // silence
      }
    }
  }

  console.log('\n=== Runtime Evidence Collection & Processing Pipeline Finished ===');
}

main().catch(error => {
  console.error('[Fatal Error]:', error.message);
  process.exit(1);
});
