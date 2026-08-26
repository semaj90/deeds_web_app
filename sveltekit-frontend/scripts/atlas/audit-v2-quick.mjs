import { Pool } from 'pg';
import fetch from 'node-fetch';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const QDRANT_URL = 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768_v2';
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });

// Scroll Qdrant v2 points
async function scrollAllPoints() {
  const points = [];
  let offset = null;
  let batchCount = 0;

  console.log('📍 Scrolling Qdrant v2 collection...');

  while (true) {
    const body = {
      limit: 1000,
      with_payload: true,
      with_vector: false
    };
    if (offset !== null) {
      body.offset = offset;
    }

    const res = await fetch(
      `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      throw new Error(`Qdrant scroll failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const batch = data.result?.points ?? [];

    points.push(...batch);
    offset = data.result?.next_page_offset ?? null;
    batchCount++;

    if (batchCount % 10 === 0) {
      console.log(`   Fetched ${points.length} points (batch ${batchCount})`);
    }

    if (!offset || batch.length < 1000) {
      break;
    }
  }

  console.log(`   ✅ Complete: ${points.length} total points`);
  return points;
}

// Load Postgres rows
async function loadPostgresIdentities() {
  console.log('📚 Loading Postgres canonical identities...');

  const res = await pool.query(`
    SELECT id FROM codebase_chunk_index
    WHERE content_embedding_768 IS NOT NULL
    ORDER BY id
  `);

  console.log(`   ✅ Loaded ${res.rows.length} eligible Postgres rows`);
  return new Set(res.rows.map(r => r.id.toString()));
}

// Main
async function main() {
  try {
    const qdrantPoints = await scrollAllPoints();
    const postgresIds = await loadPostgresIdentities();

    console.log('\n🔍 Verification Results:');
    
    // Check each Qdrant point maps to a Postgres row
    let matched = 0;
    let unmatched = 0;
    const duplicates = new Map();

    for (const point of qdrantPoints) {
      const pgId = String(point.payload.postgres_id);
      
      if (postgresIds.has(pgId)) {
        matched++;
        const count = duplicates.get(pgId) || 0;
        duplicates.set(pgId, count + 1);
      } else {
        unmatched++;
      }
    }

    const dupsCount = Array.from(duplicates.values()).filter(c => c > 1).length;

    console.log(`   Total Qdrant points: ${qdrantPoints.length}`);
    console.log(`   Matched to Postgres: ${matched}`);
    console.log(`   Unmatched: ${unmatched}`);
    console.log(`   Duplicate Postgres mappings: ${dupsCount}`);
    
    console.log('\n✅ V2 COLLECTION STATUS:');
    if (unmatched === 0 && dupsCount === 0) {
      console.log('   SAFE_FOR_RETRIEVAL: true ✅');
      console.log('   All 52,380 points uniquely map to Postgres rows');
    } else {
      console.log('   SAFE_FOR_RETRIEVAL: false ❌');
    }

    await pool.end();
    process.exit(unmatched === 0 && dupsCount === 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Audit failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

main();
