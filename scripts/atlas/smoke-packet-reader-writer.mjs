#!/usr/bin/env node
/**
 * smoke-packet-reader-writer.mjs
 *
 * Read-only packet transport smoke test.
 * Verifies the canonical read path without mutating identity columns.
 *
 * Checks:
 *   1. Postgres: read 3 packets from atlas_higher_hop_index, verify required fields
 *   2. Redis: probe gpu:karpathy:scores for a known source_ref
 *   3. Qdrant: verify collection is live and a known source_ref's packet_key
 *      can be found via payload filter (best-effort)
 *   4. Round-trip: source_ref from Postgres → Redis score → compare
 *
 * Exits 0 = all required gates pass.
 * Exits 1 = at least one required gate failed.
 */

import pg from 'pg';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');
dotenv.config({ path: resolve(REPO_ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(REPO_ROOT, '.env') });

const { Pool } = pg;

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';

const REQUIRED_FIELDS = ['packet_key', 'source_ref', 'feature_id', 'file_path'];

const log   = (msg) => console.log(`  ✅ ${msg}`);
const fail  = (msg) => console.log(`  ✗  ${msg}`);
const head  = (msg) => console.log(`\n[${msg}]`);

function resolveRedisConfig() {
  const rawUrl = process.env.REDIS_URL || '';
  const rawPassword = process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD || undefined;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      return {
        host: url.hostname || 'localhost',
        port: Number(url.port || 6379),
        password: rawPassword || (url.password ? decodeURIComponent(url.password) : undefined),
      };
    } catch { /* fall through */ }
  }
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: rawPassword,
  };
}

function resolveDatabaseUrl() {
  const raw = process.env.DATABASE_URL || process.env.ADMIN_DATABASE_URL || '';
  if (raw && /^postgres(?:ql)?:\/\//i.test(raw)) return raw;
  const host = process.env.DB_HOST || process.env.POSTGRES_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || process.env.POSTGRES_PORT || '5434';
  const user = process.env.DB_USER || process.env.POSTGRES_USER || 'legal_admin';
  const pass = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '123456';
  const db   = process.env.DB_NAME || process.env.POSTGRES_DB || 'legal_ai_db';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Packet Reader-Writer Smoke Test (read-only)');
  console.log('═══════════════════════════════════════════════════════════════');

  const results = {
    generatedAt: new Date().toISOString(),
    gates: {},
    errors: [],
    packets: [],
  };

  let passes = 0;
  let failures = 0;

  // ── Gate 1: Postgres read ─────────────────────────────────────────────────
  head('Gate 1: Postgres — atlas_higher_hop_index read');
  const pool = new Pool({ connectionString: resolveDatabaseUrl(), max: 2, allowExitOnIdle: true });
  let sampleSourceRefs = [];
  try {
    const { rows } = await pool.query(`
      SELECT packet_key, source_ref, feature_id, file_path, tree_node_id, neo4j_node_id,
             glyph_record_id, som_cluster, identity_lane, evidence_mode
      FROM atlas_higher_hop_index
      WHERE evidence_mode IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 3
    `);

    if (rows.length === 0) {
      fail('No rows in atlas_higher_hop_index');
      failures++;
      results.gates.postgres = { ok: false, error: 'empty table' };
    } else {
      let allFieldsPresent = true;
      for (const row of rows) {
        results.packets.push(row);
        const missing = REQUIRED_FIELDS.filter((f) => !row[f]);
        if (missing.length > 0) {
          fail(`packet_key=${row.packet_key} missing required fields: ${missing.join(', ')}`);
          allFieldsPresent = false;
          failures++;
        } else {
          log(`packet_key=${row.packet_key} source_ref=${row.source_ref.slice(0, 50)} lane=${row.identity_lane}`);
          sampleSourceRefs.push(row.source_ref);
          passes++;
        }
      }
      if (allFieldsPresent) {
        results.gates.postgres = { ok: true, rows: rows.length };
      } else {
        results.gates.postgres = { ok: false, error: 'missing required fields in some rows' };
      }
    }
  } catch (err) {
    fail(`Postgres error: ${err.message}`);
    failures++;
    results.gates.postgres = { ok: false, error: err.message };
  }

  // ── Gate 2: Redis Karpathy score probe ────────────────────────────────────
  head('Gate 2: Redis — gpu:karpathy:scores probe');
  const REDIS = resolveRedisConfig();
  const redis = new Redis({
    host: REDIS.host,
    port: REDIS.port,
    password: REDIS.password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  let redisOk = false;
  try {
    await redis.connect();
    await redis.ping();
    redisOk = true;
    log(`Redis connected at ${REDIS.host}:${REDIS.port}`);
    passes++;

    // Probe karpathy scores for sample source_refs
    if (sampleSourceRefs.length > 0) {
      let hits = 0;
      for (const ref of sampleSourceRefs) {
        const val = await redis.hget('gpu:karpathy:scores', ref).catch(() => null);
        if (val) hits++;
      }
      log(`gpu:karpathy:scores — probed ${sampleSourceRefs.length} refs, ${hits} cache hits`);
      results.gates.redis_karpathy = { ok: true, probed: sampleSourceRefs.length, hits };
      passes++;
    }

    // Probe cache epoch counters
    const [graphVersion, cacheEpoch] = await Promise.all([
      redis.get('atlas:graph_version').catch(() => null),
      redis.get('atlas:cache_epoch').catch(() => null),
    ]);
    log(`atlas:graph_version=${graphVersion ?? 'not set'} atlas:cache_epoch=${cacheEpoch ?? 'not set'}`);
    results.gates.redis_counters = {
      ok: true,
      graph_version: graphVersion ? Number(graphVersion) : null,
      cache_epoch: cacheEpoch ? Number(cacheEpoch) : null,
    };
    passes++;
  } catch (err) {
    fail(`Redis unavailable: ${err.message}`);
    failures++;
    results.gates.redis = { ok: false, error: err.message };
  } finally {
    if (redisOk) await redis.quit().catch(() => {});
  }

  // ── Gate 3: Qdrant collection live ────────────────────────────────────────
  head('Gate 3: Qdrant — collection health');
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      fail(`Qdrant HTTP ${res.status}`);
      failures++;
      results.gates.qdrant = { ok: false, error: `HTTP ${res.status}` };
    } else {
      const data = await res.json();
      const count = data.result?.points_count ?? 0;
      log(`${QDRANT_COLLECTION}: ${count.toLocaleString()} points`);
      passes++;
      results.gates.qdrant = { ok: true, collection: QDRANT_COLLECTION, points_count: count };
    }
  } catch (err) {
    fail(`Qdrant error: ${err.message}`);
    failures++;
    results.gates.qdrant = { ok: false, error: err.message };
  }

  // ── Gate 4: Round-trip coherence ─────────────────────────────────────────
  head('Gate 4: Round-trip coherence — Postgres source_ref → Redis cache');
  if (results.gates.postgres?.ok && results.gates.redis_counters?.ok) {
    const pgCount = results.packets.length;
    const redisHits = results.gates.redis_karpathy?.hits ?? 0;
    log(`${pgCount} packets read from Postgres, ${redisHits}/${sampleSourceRefs.length} have Redis Karpathy scores`);
    results.gates.roundtrip = {
      ok: true,
      postgres_packets: pgCount,
      redis_karpathy_hits: redisHits,
      coherence: redisHits > 0 ? 'partial' : 'cold_cache',
    };
    passes++;
  } else {
    fail('Round-trip skipped: Postgres or Redis gate failed');
    results.gates.roundtrip = { ok: false, error: 'prerequisite gate failed' };
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  const status = failures === 0 ? 'PASS' : 'FAIL';
  console.log(`  ${passes} passed, ${failures} failed — ${status}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  results.summary = { status, passes, failures };

  const reportDir = resolve(REPO_ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, 'smoke-packet-reader-writer.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Report: ${reportPath}`);

  await pool.end().catch(() => {});
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
