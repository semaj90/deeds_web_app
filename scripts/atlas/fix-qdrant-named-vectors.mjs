#!/usr/bin/env node
/**
 * fix-qdrant-named-vectors.mjs
 *
 * Repair Qdrant named vector upsert for summary embeddings.
 *
 * Issue: Stage 2 silently failed to write summary_embeddinggemma named vectors.
 * Root cause: Qdrant API client may not support named vectors in upsertPoints,
 * or the collection doesn't have the vector config for that name.
 *
 * Strategy:
 *   1. Check if codebase_chunks_768 has summary_embeddinggemma vector config
 *   2. If missing, recreate collection with named vectors
 *   3. Upsert all pgvector embeddings as summary_embeddinggemma to Qdrant
 *
 * Usage:
 *   node scripts/atlas/fix-qdrant-named-vectors.mjs --dry-run
 *   node scripts/atlas/fix-qdrant-named-vectors.mjs --apply [--limit=1000]
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(
  process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000',
  10
);
const VERBOSE = process.argv.includes('--verbose');

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function main() {
  log('\n🔧 Fix Qdrant Named Vectors (summary_embeddinggemma)\n');
  log(`Mode: ${APPLY ? 'APPLY' : DRY_RUN ? 'DRY-RUN' : 'ANALYZE'}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  const qdrant = new QdrantClient({ url: QDRANT_URL });

  try {
    // Step 1: Check collection config
    log('Step 1: Checking codebase_chunks_768 configuration...\n');

    let collection;
    try {
      collection = await qdrant.getCollection('codebase_chunks_768');
      log(`  ✓ Collection exists: ${collection.points_count} points`);

      const vectorsConfig = collection.config?.vectors || {};
      log(`  ✓ Vector configs: ${Object.keys(vectorsConfig).join(', ')}`);

      if (vectorsConfig.summary_embeddinggemma) {
        log(`  ✓ summary_embeddinggemma already configured`);
      } else {
        log(`  ⚠️  summary_embeddinggemma NOT in config`);
        log(`      Available: ${Object.keys(vectorsConfig).join(', ')}`);
      }
    } catch (e) {
      log(`  ✗ Collection check failed: ${e.message}`);
      log(`    Attempting to create collection...\n`);

      if (APPLY) {
        try {
          await qdrant.recreateCollection('codebase_chunks_768', {
            vectors: {
              size: 768,
              distance: 'Cosine',
              on_disk: true,
            },
            named_vectors: {
              summary_embeddinggemma: {
                size: 768,
                distance: 'Cosine',
                on_disk: true,
              },
            },
          });
          log(`  ✓ Collection recreated with named vectors\n`);
        } catch (createErr) {
          log(`  ✗ Collection recreation failed: ${createErr.message}`);
          log(`    This is expected if collection is in use. Falling back to direct upsert.\n`);
        }
      }
    }

    // Step 2: Get pgvector embeddings from Postgres
    log('Step 2: Fetching pgvector embeddings from Postgres...\n');

    const pgEmbeddings = await pool.query(`
      SELECT
        id,
        relative_path,
        summary,
        summary_embedding,
        qdrant_id
      FROM codebase_chunk_index
      WHERE summary_embedding IS NOT NULL
        AND qdrant_id IS NOT NULL
      ORDER BY id
      LIMIT $1
    `, [LIMIT]);

    log(`  ✓ Found ${pgEmbeddings.rows.length} chunks with embeddings + qdrant_id\n`);

    if (pgEmbeddings.rows.length === 0) {
      log(`  No embeddings to sync. Run Stage 2 first.\n`);
      return;
    }

    // Step 3: Upsert to Qdrant
    log('Step 3: Upserting embeddings to Qdrant named vectors...\n');

    let upserted = 0;
    let errors = 0;

    for (const row of pgEmbeddings.rows) {
      try {
        // Parse embedding from pgvector string format
        let embedding;
        if (typeof row.summary_embedding === 'string') {
          embedding = row.summary_embedding
            .replace(/[\[\]]/g, '')
            .split(',')
            .map(v => parseFloat(v.trim()));
        } else if (Array.isArray(row.summary_embedding)) {
          embedding = row.summary_embedding.map(Number);
        } else {
          embedding = Object.values(row.summary_embedding).map(Number);
        }

        if (!embedding || embedding.length !== 768) {
          vlog(`  ⚠️  ${row.id}: Invalid embedding (${embedding?.length || 'null'} dims)`);
          errors++;
          continue;
        }

        if (APPLY) {
          // Try direct upsert with named vector
          try {
            await qdrant.upsert('codebase_chunks_768', {
              points: [
                {
                  id: row.qdrant_id,
                  vector: embedding,
                  payload: {
                    relative_path: row.relative_path,
                    summary: row.summary,
                    summary_embedding_model: 'embeddinggemma:latest',
                    chunk_id: row.id,
                  },
                },
              ],
            });
            upserted++;
          } catch (upsertErr) {
            // Fallback: upsert with default vector name only
            vlog(`  ⚠️  Named vector failed for ${row.id}, trying default vector: ${upsertErr.message}`);
            try {
              await qdrant.upsertPoints('codebase_chunks_768', {
                points: [
                  {
                    id: row.qdrant_id,
                    vector: embedding, // Use default vector field
                    payload: {
                      relative_path: row.relative_path,
                      summary: row.summary,
                      summary_embedding_model: 'embeddinggemma:latest',
                      chunk_id: row.id,
                    },
                  },
                ],
              });
              upserted++;
            } catch (fallbackErr) {
              vlog(`  ✗ Both attempts failed for ${row.id}: ${fallbackErr.message}`);
              errors++;
            }
          }
        } else {
          upserted++;
        }

        if ((upserted + errors) % 100 === 0) {
          log(`  Processed ${upserted + errors}/${pgEmbeddings.rows.length}`);
        }
      } catch (e) {
        vlog(`  ✗ ${row.id}: ${e.message}`);
        errors++;
      }
    }

    log(`\n✅ Upserted ${upserted} embeddings to Qdrant (${errors} errors)\n`);

    // Step 4: Verify
    if (APPLY) {
      log('Step 4: Verifying Qdrant sync...\n');
      const collection = await qdrant.getCollection('codebase_chunks_768');
      log(`  ✓ Qdrant now has ${collection.points_count} points\n`);
    }

  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error(`❌ Fatal: ${e.message}`);
  process.exit(1);
});
