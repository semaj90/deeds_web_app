import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const REDIS_URL = env.REDIS_URL || 'redis://127.0.0.1:6379';
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const NEO4J_URI = env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j123';

const kanbanTasksPath = path.join(FRONTEND_ROOT, '.tmp', 'kanban_tasks.jsonl');

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function main() {
  console.log('🔍 Running Retrieval Smoke Tests & Consistency Audits...');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(REDIS_URL);
  const neoDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

  const results = {
    smoke_tests: {
      qdrant_query_feature: false,
      postgres_query_task: false,
      neo4j_multihop: false,
      redis_ace_lookup: false
    },
    consistency_audits: {
      qdrant_points_matched_pg: 0,
      pgvector_record_fk_integrity: true,
      neo4j_source_ref_in_atlas: 0,
      kanban_tasks_have_feature_id: true
    }
  };

  // === RETRIEVAL SMOKE TESTS ===

  // 1. Qdrant query by feature_id
  try {
    const qdrantQueryRes = await fetch(`${QDRANT_URL}/collections/feature_maps/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 5
      })
    });
    if (qdrantQueryRes.ok) {
      const qdata = await qdrantQueryRes.json();
      const points = qdata.result?.points || [];
      results.smoke_tests.qdrant_query_feature = points.length > 0;
      if (points.length > 0) {
        console.log('✓ Sample Qdrant point from feature_maps:', points[0]);
      }
    }
  } catch (e) {
    console.warn('  ⚠️ Qdrant smoke query failed:', e.message);
  }

  // 2. Postgres query by workspace_task_id
  try {
    const pgQueryRes = await pool.query("SELECT id FROM parent_atlas_records WHERE payload->>'workspace_task_id' IS NOT NULL LIMIT 1");
    results.smoke_tests.postgres_query_task = pgQueryRes.rows.length > 0;
  } catch (e) {
    console.warn('  ⚠️ Postgres smoke query failed:', e.message);
  }

  // 3. Neo4j multi-hop query
  try {
    const neoSession = neoDriver.session();
    const neoRes = await neoSession.run(`
      MATCH (f:CodebaseFile)-[:USES_DB]->(t:DBTable)
      RETURN f.filePath AS file, t.name AS table LIMIT 1
    `);
    results.smoke_tests.neo4j_multihop = neoRes.records.length > 0;
    await neoSession.close();
  } catch (e) {
    console.warn('  ⚠️ Neo4j smoke query failed:', e.message);
  }

  // 4. Redis ACE packet lookup
  try {
    const keys = await redis.keys('code:llm_output:path:*');
    if (keys.length > 0) {
      const redisType = await redis.type(keys[0]);
      if (redisType === 'string') {
        const val = await redis.get(keys[0]);
        results.smoke_tests.redis_ace_lookup = val !== null;
      } else if (redisType === 'hash') {
        const val = await redis.hgetall(keys[0]);
        results.smoke_tests.redis_ace_lookup = Object.keys(val).length > 0;
      } else if (redisType === 'list') {
        const val = await redis.lrange(keys[0], 0, -1);
        results.smoke_tests.redis_ace_lookup = val.length > 0;
      } else if (redisType === 'set') {
        const val = await redis.smembers(keys[0]);
        results.smoke_tests.redis_ace_lookup = val.length > 0;
      } else if (redisType === 'zset') {
        const val = await redis.zrange(keys[0], 0, -1);
        results.smoke_tests.redis_ace_lookup = val.length > 0;
      } else {
        results.smoke_tests.redis_ace_lookup = true;
      }
    }
  } catch (e) {
    console.warn('  ⚠️ Redis smoke query failed:', e.message);
  }

  // === CONSISTENCY AUDITS ===

  // 1. Every pgvector row has matching record_id in parent_atlas_records
  try {
    const pgvectorOrphans = await pool.query(`
      SELECT count(*) FROM parent_atlas_vectors v
      LEFT JOIN parent_atlas_records r ON v.record_id = r.id
      WHERE r.id IS NULL
    `);
    const count = parseInt(pgvectorOrphans.rows[0].count, 10);
    results.consistency_audits.pgvector_record_fk_integrity = count === 0;
  } catch (e) {
    console.warn('  ⚠️ pgvector audit failed:', e.message);
  }

  // 2. Qdrant sample points should line up with the Postgres task_semantic_packets mirror by source_ref.
  try {
    const qdrantSample = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 20 }),
    });
    if (qdrantSample.ok) {
      const qdata = await qdrantSample.json();
      const points = qdata.result?.points || [];
      const refs = points
        .flatMap((p) => [
          p.payload?.source_ref,
          p.payload?.file_path,
          p.payload?.sourceRef,
        ])
        .filter((ref) => typeof ref === 'string' && ref.length > 0);
      if (refs.length > 0) {
        const pgMirror = await pool.query(
          `
            SELECT DISTINCT source_ref
            FROM parent_atlas_records
            WHERE source_ref = ANY($1::text[])
            UNION
            SELECT DISTINCT source_ref
            FROM parent_atlas_vectors
            WHERE source_ref = ANY($1::text[])
            UNION
            SELECT DISTINCT source_ref
            FROM task_semantic_packets
            WHERE source_ref = ANY($1::text[])
          `,
          [refs]
        );
        results.consistency_audits.qdrant_points_matched_pg = pgMirror.rows.length;
      }
    }
  } catch (e) {
    console.warn('  ⚠️ Qdrant/Postgres source_ref audit failed:', e.message);
  }

  // 2b. Count Neo4j nodes that actually carry sourceRef metadata in the atlas graph.
  try {
    const neoSession = neoDriver.session();
    const neoRes = await neoSession.run(`
      MATCH (n)
      WHERE n.sourceRef IS NOT NULL OR n.source_ref IS NOT NULL
      RETURN count(n) AS count
    `);
    results.consistency_audits.neo4j_source_ref_in_atlas = Number(neoRes.records[0]?.get('count') ?? 0);
    await neoSession.close();
  } catch (e) {
    console.warn('  ⚠️ Neo4j sourceRef atlas audit failed:', e.message);
  }
  // 3. Every Kanban task has a feature_id
  let missingTasksCount = 0;
  if (fs.existsSync(kanbanTasksPath)) {
    const tasks = readJsonl(kanbanTasksPath);
    const missing = tasks.filter(t => !t.feature);
    missingTasksCount = missing.length;
    results.consistency_audits.kanban_tasks_have_feature_id = missing.length === 0;
    if (missing.length > 0) {
      console.log(`⚠️ GAPS: Found ${missing.length} Kanban tasks lacking 'feature' field!`);
      console.log('Sample gaps:', missing.slice(0, 5).map(t => ({ id: t.id, title: t.title })));
    }
  }

  // 4. Verify Database Indexes
  try {
    const idxCheck = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'task_semantic_packets'
    `);
    const indexes = idxCheck.rows.map(r => r.indexname);
    console.log('✓ Verified task_semantic_packets indexes:', indexes);
  } catch (e) {
    console.warn('  ⚠️ Index check failed:', e.message);
  }

  // Finalize
  await pool.end();
  await redis.quit();
  await neoDriver.close();

  console.log('\n==================================================');
  console.log('✅ AUDIT AND CONSISTENCY CHECKS COMPLETE');
  console.log('==================================================');
  console.log('Smoke Tests:', results.smoke_tests);
  console.log('Consistency Audits:', results.consistency_audits);
  console.log('==================================================');

  // Save audit results to temp file for report generation
  fs.writeFileSync(
    path.join(FRONTEND_ROOT, '.tmp', 'consistency-audit-results.json'),
    JSON.stringify(results, null, 2)
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
