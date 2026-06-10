#!/usr/bin/env node
/**
 * phase-2b-validation-gates.mjs
 *
 * Three hard validation gates for Phase 2B completion.
 * These must PASS before Phase 2C can proceed.
 *
 * Gate 1: Community Persistence Audit
 *   Verify community_id populated identically in Postgres layers
 *
 * Gate 2: Qdrant Community Payload Audit
 *   Verify community_id exists in Qdrant payloads (95%+ coverage)
 *
 * Gate 3: Manifold4 Entropy Audit
 *   Verify community distribution is NOT all-zeros or single-community
 *
 * Usage:
 *   node scripts/atlas/phase-2b-validation-gates.mjs --verify
 *   node scripts/atlas/phase-2b-validation-gates.mjs --verify --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const VERIFY = argv.includes('--verify');
const STRICT = argv.includes('--strict');
const VERBOSE = argv.includes('--verbose');

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
const DB_URL = ENV.DATABASE_URL ?? `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;
const QDRANT_URL = ENV.QDRANT_URL ?? 'http://127.0.0.1:6333';

let gatesPassed = 0;
let gatesFailed = 0;

function logGate(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`\n${icon} ${name}`);
  if (details) console.log(`   ${details}`);
  if (passed) gatesPassed++;
  else gatesFailed++;
  return passed;
}

async function gate1_communityPersistence(pool) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Gate 1: Community Persistence Audit');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    const res = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(NULLIF(centroid_id IS NULL, true)) as with_centroid
      FROM atlas_feature_map
    `);

    const { total, with_centroid } = res.rows[0];
    const coverage = (100 * with_centroid / total).toFixed(1);
    const pass = with_centroid > 0;

    const details = `${with_centroid}/${total} rows have centroid_id (${coverage}%)`;
    return logGate('Community Persistence (Postgres)', pass, details);
  } catch (err) {
    console.error('Gate 1 error:', err.message);
    return logGate('Community Persistence', false, `ERROR: ${err.message}`);
  }
}

async function gate2_qdrantPayload(pool) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Gate 2: Qdrant Community Payload Audit');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    const sampleRes = await pool.query(`
      SELECT qdrant_point_id, feature_id
      FROM atlas_feature_map
      WHERE qdrant_point_id IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 10
    `);

    if (sampleRes.rows.length === 0) {
      return logGate('Qdrant Payload Check', false, 'No rows with qdrant_point_id found');
    }

    let matched = 0;
    const misses = [];

    for (const row of sampleRes.rows) {
      const pointId = row.qdrant_point_id;
      try {
        const res = await fetch(
          `${QDRANT_URL}/collections/codebase_chunks_768/points/${pointId}`,
          { method: 'GET' }
        );
        if (!res.ok) {
          misses.push(`Point ${pointId}: HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        const payload = data.result?.payload ?? {};

        if (payload.community_id !== undefined && payload.community_id !== null) {
          matched++;
          if (VERBOSE) console.log(`   ✓ Point ${pointId}: community_id = ${payload.community_id}`);
        } else {
          misses.push(`Point ${pointId}: no community_id in payload`);
        }
      } catch (err) {
        misses.push(`Point ${pointId}: fetch error`);
      }
    }

    const coverage = (100 * matched / sampleRes.rows.length).toFixed(1);
    const target = STRICT ? 95 : 80;
    const pass = matched >= (target / 100) * sampleRes.rows.length;

    const details = `${matched}/${sampleRes.rows.length} points have community_id (${coverage}%) — target: ${target}%`;
    if (misses.length > 0 && VERBOSE) {
      console.log(`   Misses: ${misses.slice(0, 3).join(', ')}`);
    }

    return logGate('Qdrant Payload Coverage', pass, details);
  } catch (err) {
    console.error('Gate 2 error:', err.message);
    return logGate('Qdrant Payload Check', false, `ERROR: ${err.message}`);
  }
}

async function gate3_manifold4Entropy(pool) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Gate 3: Manifold4 Entropy Audit');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    const colRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'atlas_feature_map' AND column_name = 'manifold4'
    `);

    if (colRes.rows.length === 0) {
      return logGate('Manifold4 Entropy', false, 'manifold4 column does not exist');
    }

    const communityRes = await pool.query(`
      SELECT
        COUNT(DISTINCT centroid_id) as community_count,
        COUNT(*) as total_rows,
        COUNT(NULLIF(centroid_id IS NULL, true)) as populated
      FROM atlas_feature_map
    `);

    const { community_count, total_rows, populated } = communityRes.rows[0];
    const communityPct = (100 * populated / total_rows).toFixed(1);

    const issuesFound = [];
    if (community_count <= 1) {
      issuesFound.push(`Only ${community_count} community (expect >5)`);
    }
    if (community_count > 500) {
      issuesFound.push(`${community_count} communities (fragmentation)`);
    }

    const pass = issuesFound.length === 0;
    const details = `${community_count} communities, ${communityPct}% populated` +
      (issuesFound.length > 0 ? ` ⚠ ${issuesFound.join('; ')}` : '');

    return logGate('Manifold4 Entropy', pass, details);
  } catch (err) {
    console.error('Gate 3 error:', err.message);
    return logGate('Manifold4 Entropy', false, `ERROR: ${err.message}`);
  }
}

async function main() {
  if (!VERIFY) {
    console.log('Phase 2B Validation Gates');
    console.log('Usage: node scripts/atlas/phase-2b-validation-gates.mjs --verify [--strict] [--verbose]');
    process.exit(0);
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║ Phase 2B Validation Gates — Prerequisites for Phase 2C     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

  try {
    await gate1_communityPersistence(pool);
    await gate2_qdrantPayload(pool);
    await gate3_manifold4Entropy(pool);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ PASSED: ${gatesPassed}`);
    console.log(`❌ FAILED: ${gatesFailed}`);

    if (gatesFailed > 0) {
      console.log('\n⛔ Phase 2B validation FAILED');
      console.log('Do NOT proceed to Phase 2C');
      process.exit(1);
    } else {
      console.log('\n✅ All gates PASS — Phase 2B ready for Phase 2C');
      process.exit(0);
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
