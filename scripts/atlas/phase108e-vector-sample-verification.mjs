import fetch from 'node-fetch';
import { Pool } from 'pg';
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

// Sample 100 random points from Qdrant with vectors
async function sampleQdrantPoints(limit = 100) {
  console.log(`📍 Sampling ${limit} points from Qdrant with vectors...`);
  
  const res = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit,
        with_payload: true,
        with_vector: true
      })
    }
  );

  if (!res.ok) {
    throw new Error(`Qdrant scroll failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  const points = data.result?.points ?? [];
  console.log(`   ✅ Fetched ${points.length} points with vectors`);
  return points;
}

// Fetch corresponding Postgres vectors
async function fetchPostgresVectors(postgresIds) {
  console.log(`📚 Fetching ${postgresIds.length} vectors from Postgres...`);
  
  const placeholders = postgresIds.map((_, i) => `$${i + 1}`).join(',');
  const res = await pool.query(
    `SELECT id, content_embedding::text AS embedding_text
     FROM codebase_chunk_index
     WHERE id IN (${placeholders})
     ORDER BY id`,
    postgresIds
  );

  const vectorMap = new Map(res.rows.map(r => [r.id.toString(), r.embedding_text]));
  console.log(`   ✅ Loaded ${vectorMap.size} Postgres vectors`);
  return vectorMap;
}

// Parse halfvec text format
function parseHalfvec(text) {
  if (typeof text !== 'string') throw new Error(`Expected string, got ${typeof text}`);
  const arr = JSON.parse(text.trim());
  if (!Array.isArray(arr)) throw new Error('Parsed halfvec is not an array');
  return arr;
}

// Calculate max absolute difference
function maxAbsDifference(a, b) {
  if (a.length !== b.length) return Infinity;
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    max = Math.max(max, Math.abs(a[i] - b[i]));
  }
  return max;
}

// Main verification
async function main() {
  try {
    const qdrantPoints = await sampleQdrantPoints(100);
    const postgresIds = qdrantPoints.map(p => p.payload.postgres_id);
    const postgresVectors = await fetchPostgresVectors(postgresIds);

    console.log('\n🔍 Vector Parity Verification:');
    
    let validCount = 0;
    let dimensionErrors = 0;
    let finiteErrors = 0;
    let payloadErrors = 0;
    let parityErrors = 0;

    const differences = [];

    for (const point of qdrantPoints) {
      const pgId = String(point.payload.postgres_id);
      const qdrantVec = point.vector.content;
      const postgresText = postgresVectors.get(pgId);

      if (!postgresText) {
        console.error(`   ❌ Postgres vector not found for ID ${pgId}`);
        payloadErrors++;
        continue;
      }

      // Check vector dimension
      if (qdrantVec.length !== 768) {
        console.error(`   ❌ Dimension mismatch for ${pgId}: got ${qdrantVec.length}, expected 768`);
        dimensionErrors++;
        continue;
      }

      // Check finite values
      if (!qdrantVec.every(v => Number.isFinite(v))) {
        console.error(`   ❌ Non-finite values in vector ${pgId}`);
        finiteErrors++;
        continue;
      }

      // Parse Postgres vector
      let postgresVec;
      try {
        postgresVec = parseHalfvec(postgresText);
      } catch (err) {
        console.error(`   ❌ Failed to parse Postgres vector ${pgId}: ${err.message}`);
        payloadErrors++;
        continue;
      }

      // Check parity
      const diff = maxAbsDifference(qdrantVec, postgresVec);
      differences.push({ pgId, diff });

      if (diff > 0.001) {
        console.error(`   ❌ Vector parity error for ${pgId}: max diff = ${diff.toFixed(6)}`);
        parityErrors++;
      } else {
        validCount++;
      }
    }

    // Summary
    console.log(`\n📊 Results:`);
    console.log(`   Valid samples: ${validCount}/${qdrantPoints.length}`);
    console.log(`   Dimension errors: ${dimensionErrors}`);
    console.log(`   Finite value errors: ${finiteErrors}`);
    console.log(`   Payload errors: ${payloadErrors}`);
    console.log(`   Parity errors (diff > 0.001): ${parityErrors}`);

    if (differences.length > 0) {
      const sorted = differences.sort((a, b) => b.diff - a.diff);
      console.log(`\n   Max difference: ${sorted[0].diff.toFixed(6)}`);
      console.log(`   Min difference: ${sorted[sorted.length - 1].diff.toFixed(6)}`);
      console.log(`   Mean difference: ${(sorted.reduce((s, x) => s + x.diff, 0) / sorted.length).toFixed(6)}`);
    }

    if (validCount === qdrantPoints.length) {
      console.log('\n✅ VECTOR SAMPLE VERIFICATION PASSED');
      await pool.end();
      process.exit(0);
    } else {
      console.log('\n❌ VECTOR SAMPLE VERIFICATION FAILED');
      await pool.end();
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

main();
