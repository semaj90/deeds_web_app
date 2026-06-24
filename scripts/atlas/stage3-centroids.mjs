#!/usr/bin/env node
/**
 * Stage 3: Compute Redis centroids for directory-level semantic aggregation
 * Usage: node scripts/atlas/stage3-centroids.mjs --apply [--limit=100]
 */

import pg from 'pg';
import Redis from 'ioredis';

const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100', 10);
const VERBOSE = process.argv.includes('--verbose');

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function main() {
  log(`\n🚀 Stage 3: Compute Redis Centroids (Multi-Hop Cache)\n`);
  log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  log(`Limit: ${LIMIT}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS });

  let computed = 0;
  let errors = [];

  const startTime = Date.now();

  try {
    // Get embeddings grouped by directory
    const dirs = await pool.query(`
      SELECT
        CASE
          WHEN strpos(relative_path, '/') > 0
          THEN substr(relative_path, 1, strpos(relative_path, '/') - 1)
          ELSE relative_path
        END as dir,
        count(*) as cnt
      FROM codebase_chunk_index
      WHERE summary_embedding IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT $1
    `, [LIMIT]);

    log(`Computing centroids for ${dirs.rows.length} directories\n`);

    for (const { dir, cnt } of dirs.rows) {
      try {
        // Get all embeddings for this directory
        const chunks = await pool.query(`
          SELECT summary_embedding
          FROM codebase_chunk_index
          WHERE relative_path LIKE $1 || '/%' AND summary_embedding IS NOT NULL
        `, [dir]);

        if (chunks.rows.length > 0) {
          // Compute centroid (mean of all embeddings)
          let centroid = new Array(768).fill(0);
          let count = 0;

          for (const row of chunks.rows) {
            // pgvector returns as string like "[v1,v2,...]" or array
            let emb;
            if (typeof row.summary_embedding === 'string') {
              // Parse from string: "[1.0,2.0,...]"
              emb = row.summary_embedding
                .replace(/[\[\]]/g, '')
                .split(',')
                .map(v => parseFloat(v.trim()));
            } else if (Array.isArray(row.summary_embedding)) {
              emb = row.summary_embedding.map(Number);
            } else {
              // Fallback for pgvector object representation
              emb = Object.values(row.summary_embedding).map(Number);
            }

            if (emb && emb.length === 768) {
              for (let i = 0; i < 768; i++) {
                centroid[i] += emb[i];
              }
              count++;
            }
          }

          if (count > 0) {
            // Normalize
            for (let i = 0; i < 768; i++) {
              centroid[i] /= count;
            }

            if (APPLY) {
              const key = `centroid:dir:${dir}`;
              await redis.setex(key, 86400, JSON.stringify(centroid)); // 24h TTL
            }

            computed++;
            if (computed % 10 === 0) {
              log(`  Computed ${computed} centroids`);
            }
          }
        }
      } catch (e) {
        vlog(`  ⚠️  Dir ${dir}: ${e.message}`);
        errors.push({ dir, error: e.message });
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\n✅ Stage 3 complete: ${computed} centroids computed`);
    log(`  Duration: ${duration}s, Errors: ${errors.length}\n`);

  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main();
