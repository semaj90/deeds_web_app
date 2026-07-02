#!/usr/bin/env node
/**
 * Phase 7: Simple Batch Summarizer
 *
 * Direct approach: fetch unsummarized chunks, call Gemma4, write back to Postgres
 * No RabbitMQ complexity, just sequential processing with progress tracking
 *
 * Usage:
 *   node phase7-simple-summarizer.mjs --limit=100 --batch-size=10
 *   node phase7-simple-summarizer.mjs --limit=40000 --batch-size=50
 */

import pg from 'pg';
import fetch from 'node-fetch';

const { Pool } = pg;

// Config
const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const GEMMA4_MODEL = 'gemma4-legal-iq4xs-direct.gguf';

// Args
const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? parseInt(limitArg) : 1000;
const batchSizeArg = process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1];
const batchSize = batchSizeArg ? parseInt(batchSizeArg) : 50;

console.log(`\n📝 Phase 7 Simple Summarizer`);
console.log(`  Limit: ${limit} chunks`);
console.log(`  Batch size: ${batchSize}`);
console.log(`  Gemma4: ${GEMMA4_URL}\n`);

const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });

async function summarizeChunk(content) {
  try {
    const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMMA4_MODEL,
        messages: [
          { role: 'system', content: 'Summarize in 1-2 sentences. Be concise.' },
          { role: 'user', content: content.slice(0, 1500) }
        ],
        temperature: 0.3,
        max_tokens: 120,
        stream: false,
        reasoning: false
      }),
      timeout: 45000
    });

    if (!res.ok) return null;

    const data = await res.json();
    let summary = data.choices?.[0]?.message?.content?.trim() || '';

    // Strip thinking blocks
    if (summary.includes('<|channel>')) {
      const match = summary.match(/<\|channel\|>.*/s);
      if (match) {
        summary = summary.substring(match.index + 13).trim();
      }
    }

    return summary || null;
  } catch (err) {
    return null;
  }
}

async function main() {
  try {
    // Fetch unsummarized chunks
    const result = await pool.query(`
      SELECT id, relative_path, content
      FROM codebase_chunk_index
      WHERE summary IS NULL OR summary = ''
      ORDER BY id
      LIMIT $1
    `, [limit]);

    const chunks = result.rows;
    console.log(`  Found ${chunks.length} unsummarized chunks\n`);

    let processed = 0;
    let written = 0;

    // Process in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}: ${batch.length} chunks`);

      for (const chunk of batch) {
        const summary = await summarizeChunk(chunk.content);

        if (summary) {
          await pool.query(
            `UPDATE codebase_chunk_index SET summary = $1, updated_at = NOW() WHERE id = $2`,
            [summary, chunk.id]
          );
          written++;
        }

        processed++;

        // Progress indicator every 25 items
        if (processed % 25 === 0) {
          process.stdout.write(`    ✓ ${processed}/${chunks.length} processed (${written} written)\n`);
        }
      }
    }

    console.log(`\n  ✅ Complete: ${written} summaries written\n`);

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
