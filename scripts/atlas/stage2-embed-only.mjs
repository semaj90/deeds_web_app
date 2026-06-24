#!/usr/bin/env node
/**
 * Stage 2 only: Embed summaries with EmbeddingGemma → pgvector + Qdrant named vectors
 * Usage: node scripts/atlas/stage2-embed-only.mjs --apply [--limit=600]
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';

const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '600', 10);
const VERBOSE = process.argv.includes('--verbose');

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

// Properly construct Ollama URL
const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1:11434';
const OLLAMA_URL = OLLAMA_HOST.startsWith('http') ? OLLAMA_HOST : `http://${OLLAMA_HOST}`;

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function main() {
  log(`\n🚀 Stage 2: Embed Summaries (EmbeddingGemma) + Qdrant Named Vectors\n`);
  log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  log(`Limit: ${LIMIT}`);
  log(`Ollama URL: ${OLLAMA_URL}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  const qdrant = new QdrantClient({ url: QDRANT_URL });

  let embedded = 0;
  let pgvectorWritten = 0;
  let qdrantTagged = 0;
  let errors = [];

  const startTime = Date.now();

  try {
    // Get summaries to embed
    const toEmbed = await pool.query(`
      SELECT id, relative_path, summary, qdrant_id
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND summary != ''
        AND summary_embedding IS NULL
      ORDER BY id
      LIMIT $1
    `, [LIMIT]);

    log(`Found ${toEmbed.rows.length} chunks to embed\n`);

    for (const chunk of toEmbed.rows) {
      try {
        // Embed summary with EmbeddingGemma via Ollama
        const embedRes = await fetch(`${OLLAMA_URL}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'embeddinggemma:latest',
            input: chunk.summary,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!embedRes.ok) {
          throw new Error(`Embed failed: HTTP ${embedRes.status}`);
        }

        const embedData = await embedRes.json();
        const embedding = embedData.embedding || embedData.embeddings?.[0];

        if (!Array.isArray(embedding)) {
          throw new Error('No embedding returned from Ollama');
        }

        if (embedding.length !== 768) {
          throw new Error(`Expected 768-dim embedding, got ${embedding.length}`);
        }

        if (APPLY) {
          // Store in pgvector (halfvec(768)) as vector literal string
          const vectorLiteral = `[${embedding.join(',')}]`;
          await pool.query(
            'UPDATE codebase_chunk_index SET summary_embedding = $1::halfvec WHERE id = $2',
            [vectorLiteral, chunk.id]
          );
          pgvectorWritten++;

          // Store in Qdrant as named vector (not in payload)
          if (chunk.qdrant_id) {
            try {
              await qdrant.upsertPoints('codebase_chunks_768', {
                points: [{
                  id: chunk.qdrant_id,
                  vector: {
                    'summary_embeddinggemma': embedding
                  },
                  payload: {
                    summary: chunk.summary,
                    summary_embedding_model: 'embeddinggemma:latest',
                  }
                }]
              });
              qdrantTagged++;
            } catch (e) {
              vlog(`  ⚠️  Qdrant upsert failed for ${chunk.id}: ${e.message}`);
              // Don't fail the whole stage if Qdrant fails; it's a mirror
            }
          }
        }

        embedded++;

        if (embedded % 50 === 0) {
          log(`  Embedded ${embedded}/${toEmbed.rows.length} chunks`);
        }
      } catch (e) {
        vlog(`  ⚠️  Chunk ${chunk.id}: ${e.message}`);
        errors.push({ chunk_id: chunk.id, error: e.message });
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\n✅ Stage 2 complete: ${embedded} embedded, ${pgvectorWritten} to pgvector, ${qdrantTagged} to Qdrant`);
    log(`  Duration: ${duration}s, Errors: ${errors.length}\n`);

  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
