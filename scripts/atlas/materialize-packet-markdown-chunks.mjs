#!/usr/bin/env node
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

function chunkText(text, maxChars = 800, overlap = 100) {
  if (!text) return [];
  const paragraphs = text.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if ((currentChunk + '\n\n' + paragraph).length <= maxChars) {
      if (currentChunk) currentChunk += '\n\n';
      currentChunk += paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      if (paragraph.length > maxChars) {
        let start = 0;
        while (start < paragraph.length) {
          const end = Math.min(start + maxChars, paragraph.length);
          chunks.push(paragraph.slice(start, end));
          start += maxChars - overlap;
        }
        currentChunk = '';
      } else {
        currentChunk = paragraph;
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}

async function main() {
  const e = loadRepoEnv(process.env);
  const dbUrl = resolveDatabaseUrl(e);
  const pool = new pg.Pool({ connectionString: dbUrl });

  console.log('Fetching packets from database...');
  try {
    const { rows: packets } = await pool.query(`
      SELECT packet_key, summary, payload 
      FROM nes_chrom_packets
    `);

    console.log(`Loaded ${packets.length} packets.`);
    console.log('Clearing existing chunks...');
    await pool.query('DELETE FROM packet_markdown_chunks');

    let totalChunks = 0;
    console.log('Segmenting and inserting chunks...');
    for (const packet of packets) {
      const parts = [];
      if (packet.summary) parts.push(packet.summary);
      
      const payload = packet.payload || {};
      if (payload.why) parts.push(payload.why);
      if (payload.query) parts.push(payload.query);
      if (payload.title) parts.push(payload.title);
      if (payload.sourceRefFirstSummary) parts.push(payload.sourceRefFirstSummary);

      const combinedText = parts.join('\n\n').trim();
      if (!combinedText) {
        // Fallback to basic file info if no text is available
        const sourceRef = payload.source_ref || payload.sourceRef || '';
        const featureId = payload.feature_id || payload.featureId || '';
        if (sourceRef || featureId) {
          parts.push(`Packet ${packet.packet_key} for file ${sourceRef} in feature ${featureId}`);
        }
      }

      const textToChunk = parts.join('\n\n').trim();
      if (!textToChunk) continue;

      const chunks = chunkText(textToChunk);
      for (let i = 0; i < chunks.length; i++) {
        await pool.query(`
          INSERT INTO packet_markdown_chunks (packet_key, chunk_index, markdown_content, ts_vector)
          VALUES ($1, $2, $3, to_tsvector('english', $3))
          ON CONFLICT (packet_key, chunk_index) DO UPDATE 
          SET markdown_content = EXCLUDED.markdown_content, 
              ts_vector = EXCLUDED.ts_vector
        `, [packet.packet_key, i, chunks[i]]);
        totalChunks++;
      }
    }

    console.log(`Materialized ${totalChunks} chunks into packet_markdown_chunks.`);
  } catch (err) {
    console.error('Materialization failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
