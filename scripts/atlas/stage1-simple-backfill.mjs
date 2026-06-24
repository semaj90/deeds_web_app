#!/usr/bin/env node
/**
 * Simple Stage 1 backfill: proven 4-parallel single-request-per-chunk with row-claim locking
 * Usage: node scripts/atlas/stage1-simple-backfill.mjs --apply [--batch=250] [--limit=2000]
 */

import pg from 'pg';
import fetch from 'node-fetch';

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '250', 10);
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '2000', 10);
const VERBOSE = process.argv.includes('--verbose');

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const GEMMA4_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const OLLAMA_URL = (() => {
  const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
  if (host.startsWith('http://') || host.startsWith('https://')) return host;
  return `http://${host}`;
})();

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function main() {
  log(`\n🚀 Stage 1 Simple Backfill (Row-Claim Locking + 4-Parallel)\n`);
  log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  log(`Batch size: ${BATCH_SIZE}, Limit: ${LIMIT}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  let processed = 0;
  let generated = 0;
  let batchCount = 0;

  const startTime = Date.now();

  try {
    while (true) {
      // Claim next batch with FOR UPDATE SKIP LOCKED
      const claimed = await pool.query(`
        WITH picked AS (
          SELECT id FROM codebase_chunk_index
          WHERE summary IS NULL OR summary = ''
          ORDER BY id
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        SELECT c.id, c.relative_path, c.content, c.line_start, c.symbol
        FROM codebase_chunk_index c
        JOIN picked p ON p.id = c.id
      `, [BATCH_SIZE]);

      if (claimed.rows.length === 0) {
        log(`\n✅ All summaries complete.\n`);
        break;
      }

      batchCount++;
      log(`Batch ${batchCount}: Processing ${claimed.rows.length} chunks...`);

      // 4-parallel single-request-per-chunk
      const CONCURRENCY = 4;
      for (let j = 0; j < claimed.rows.length; j += CONCURRENCY) {
        const parallel = claimed.rows.slice(j, j + CONCURRENCY);

        const results = await Promise.all(
          parallel.map(async (chunk) => {
            try {
              const prompt = `Summarize this code chunk in 1-2 sentences:

File: ${chunk.relative_path}
Symbol: ${chunk.symbol || 'unknown'}
Lines: ${chunk.line_start || '?'}-...
${chunk.content?.slice(0, 500) || ''}...

Summary:`;

              const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'gemma4-legal-iq4xs-direct.gguf',
                  messages: [{ role: 'user', content: prompt }],
                  temperature: 0.3,
                  max_tokens: 100,
                  stream: false,
                }),
                signal: AbortSignal.timeout(30000),
              });

              if (!res.ok) {
                return { id: chunk.id, summary: null, error: `HTTP ${res.status}` };
              }

              const data = await res.json();
              const summary = data.choices?.[0]?.message?.content?.trim() || '';
              return { id: chunk.id, summary, error: null };
            } catch (e) {
              return { id: chunk.id, summary: null, error: e.message };
            }
          })
        );

        // Apply results
        for (const r of results) {
          if (r.error) {
            vlog(`  ⚠️  ${r.id}: ${r.error}`);
          } else if (r.summary) {
            if (APPLY) {
              await pool.query(
                'UPDATE codebase_chunk_index SET summary = $1 WHERE id = $2',
                [r.summary, r.id]
              );
            }
            generated++;
          }
        }

        processed += parallel.length;
        if (processed % 40 === 0) {
          log(`  ${processed} processed, ${generated} summaries`);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\n✅ Complete: ${processed} processed, ${generated} summaries in ${duration}s`);
    log(`  Throughput: ${(processed / (Date.now() - startTime) * 1000).toFixed(1)} chunks/sec\n`);
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
