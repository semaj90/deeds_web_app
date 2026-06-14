#!/usr/bin/env node
/**
 * Phase D: Export TurboVec Corpus
 *
 * Export whole-codebase packet corpus for TurboVec sidecar indexing.
 * Output: JSONL (one packet per line)
 *
 * Each row:
 * {
 *   packet_key,
 *   source_ref,
 *   file_path,
 *   feature_id,
 *   feature_label,
 *   group_id,
 *   domain_class,
 *   summary,
 *   text_for_embedding (bounded),
 *   metadata
 * }
 *
 * Rules:
 * - include only text-safe packets
 * - truncate text_for_embedding to 8KB
 * - metadata-only for large artifacts
 * - no secrets from .env files
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');

const MAX_EMBEDDING_CHARS = 8192; // 8KB per packet
const TEXT_SAFE_EXTENSIONS = ['.ts', '.tsx', '.svelte', '.js', '.json', '.sql', '.py', '.md'];

/**
 * Read file content safely
 */
async function readFileContent(filePath, maxChars = MAX_EMBEDDING_CHARS) {
  try {
    const fullPath = path.join(REPO_ROOT, filePath);
    const content = await fs.readFile(fullPath, 'utf8');

    // Truncate to max chars
    if (content.length > maxChars) {
      return content.slice(0, maxChars) + '\n... (truncated)';
    }

    return content;
  } catch (err) {
    return null;
  }
}

/**
 * Determine if packet is text-safe
 */
function isTextSafe(source_ref) {
  const ext = path.extname(source_ref);
  return TEXT_SAFE_EXTENSIONS.includes(ext) && !source_ref.includes('.env');
}

/**
 * Export corpus to JSONL
 */
async function exportTurboVecCorpus(pool) {
  const corpus = [];

  try {
    const res = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        file_path,
        feature_id,
        feature_label,
        group_id,
        packet_universe,
        metadata
      FROM atlas_packets
      WHERE packet_universe = 'atlas'
      ORDER BY source_ref
    `);

    console.log(`[phase-d] Exporting ${res.rows.length} packets from atlas_packets\n`);

    for (const row of res.rows) {
      const textSafe = isTextSafe(row.source_ref);
      let textForEmbedding = null;

      if (textSafe) {
        textForEmbedding = await readFileContent(row.source_ref);
      }

      const packet = {
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        file_path: row.file_path,
        feature_id: row.feature_id,
        feature_label: row.feature_label,
        group_id: row.group_id,
        domain_class: row.feature_id?.split('.')[0] || 'unknown',
        summary: row.feature_label,
        text_for_embedding: textForEmbedding,
        text_safe: textSafe,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      };

      corpus.push(packet);
    }

    return corpus;
  } catch (err) {
    console.error('[error]', err.message);
    return [];
  }
}

/**
 * Write JSONL
 */
async function writeJsonL(corpus, outputPath) {
  const lines = corpus.map(packet => JSON.stringify(packet));
  const content = lines.join('\n');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content);

  console.log(`[phase-d] ✅ Wrote ${corpus.length} packets to JSONL`);
  console.log(`[phase-d] Output: ${outputPath}`);
}

/**
 * Main
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  console.log('[phase-d] Phase D: Export TurboVec Corpus');
  console.log(`[phase-d] Repo Root: ${REPO_ROOT}\n`);

  try {
    console.log('[step-1] Query atlas_packets');
    const corpus = await exportTurboVecCorpus(pool);

    console.log(`[step-2] Write JSONL`);
    const outputPath = path.join(REPO_ROOT, 'memory/exports/turbovec-corpus.jsonl');
    await writeJsonL(corpus, outputPath);

    console.log('\n[summary] ✅ TurboVec corpus export complete');
    console.log(`[summary] Next: npm run atlas:turbovec:smoke`);
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
