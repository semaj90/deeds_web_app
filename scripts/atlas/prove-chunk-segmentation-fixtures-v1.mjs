#!/usr/bin/env node
/**
 * CHUNK_PRODUCER_03 Segmentation Fixtures Comparison (v1)
 *
 * Compares stored database chunks for context-assembler.ts against:
 * 1. Current chunkLargeTextAtSourceV1 (smart logical / AST-aware windowing)
 * 2. Uniform fixed window chunking (fixed size 1000, overlap 200)
 * 3. Line-based windowing
 *
 * Validates which segmentation strategy generated the stored chunks.
 *
 * Enforces:
 * - readOnly: true
 * - writesPerformed: false
 * - canonicalAuthority: false
 * - admissionAuthorized: false
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { chunkLargeTextAtSourceV1 } from './lib/source-span-aware-chunk-metadata-v1.mjs';

function chunkText(text, size = 1000, overlap = 200) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += size - overlap;
  }
  return chunks;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SCHEMA_V1 = 'atlas.chunk-segmentation-fixtures.v1';
export const GATE_NAME = 'CHUNK_PRODUCER_03';

export function sha256Hex(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function compareStoredAgainstGenerated(storedChunks, currentSourceText) {
  const normSource = String(currentSourceText).replace(/\r\n/g, '\n');

  // Generator 1: Smart chunkLargeTextAtSourceV1
  const smartChunks = chunkLargeTextAtSourceV1(normSource, { size: 1000, overlap: 200, maxChunks: 100 });

  // Generator 2: Uniform fixed character chunkText
  const uniformChunks = chunkText(normSource, 1000, 200);

  // Generator 3: Uniform 500-char chunks
  const smallUniformChunks = chunkText(normSource, 500, 100);

  const comparisons = [];

  for (const stored of storedChunks) {
    const storedText = String(stored.content ?? '').replace(/\r\n/g, '\n').trim();
    const storedSha = sha256Hex(storedText);

    let matchedStrategy = null;
    let matchedIndex = -1;

    const getText = (c) => String(c?.text ?? c ?? '').replace(/\r\n/g, '\n').trim();

    // Check generator 1
    const sIdx = smartChunks.findIndex((c) => getText(c) === storedText);
    if (sIdx >= 0) {
      matchedStrategy = 'SMART_CHUNK_LARGE_TEXT_V1';
      matchedIndex = sIdx;
    } else {
      // Check generator 2
      const uIdx = uniformChunks.findIndex((c) => getText(c) === storedText);
      if (uIdx >= 0) {
        matchedStrategy = 'UNIFORM_1000_CHAR_WINDOW';
        matchedIndex = uIdx;
      } else {
        // Check generator 3
        const smIdx = smallUniformChunks.findIndex((c) => getText(c) === storedText);
        if (smIdx >= 0) {
          matchedStrategy = 'UNIFORM_500_CHAR_WINDOW';
          matchedIndex = smIdx;
        } else if (normSource.includes(storedText)) {
          matchedStrategy = 'ARBITRARY_EXACT_SUBSTRING_DIFFERENT_BOUNDS';
        } else {
          matchedStrategy = 'NO_CURRENT_SOURCE_MATCH';
        }
      }
    }

    comparisons.push({
      chunkId: stored.id ?? stored.chunk_id,
      storedLineStart: stored.line_start,
      storedLineEnd: stored.line_end,
      storedDigest: storedSha,
      matchedStrategy,
      matchedIndex,
      isSubstringOfCurrentSource: normSource.includes(storedText),
    });
  }

  const strategyCounts = {};
  for (const c of comparisons) {
    strategyCounts[c.matchedStrategy] = (strategyCounts[c.matchedStrategy] ?? 0) + 1;
  }

  return {
    comparisons,
    strategyCounts,
  };
}

export async function runSegmentationFixturesAudit() {
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    statement_timeout: 60000,
    application_name: 'prove-chunk-segmentation-fixtures-v1',
  });

  const client = await pool.connect();
  let storedRows = [];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const paths = [
      'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts',
      'src/lib/server/ace/context-assembler.ts',
      'src/lib/server/features/ai/ace/context-assembler.ts',
    ];
    const res = await client.query(`
      SELECT id, chunk_id, relative_path, source_ref, content, line_start, line_end
      FROM public.codebase_chunk_index
      WHERE relative_path = ANY($1) OR source_ref = ANY($1)
      ORDER BY id
      LIMIT 100;
    `, [paths]);
    storedRows = res.rows;
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }

  const targetRel = 'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts';
  const targetAbs = path.resolve(ROOT, targetRel);
  if (!fs.existsSync(targetAbs)) {
    throw new Error(`SOURCE_NOT_FOUND: ${targetAbs}`);
  }
  const sourceText = fs.readFileSync(targetAbs, 'utf8');

  const { comparisons, strategyCounts } = compareStoredAgainstGenerated(storedRows, sourceText);

  const generatedAt = new Date().toISOString();
  const receipt = {
    schema: SCHEMA_V1,
    gate: GATE_NAME,
    generatedAt,
    readOnly: true,
    writesPerformed: false,
    canonicalAuthority: false,
    admissionAuthorized: false,
    totalAudited: storedRows.length,
    strategyCounts,
    comparisons,
  };

  const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
  const checksum = `sha256:${sha256Hex(receiptJson)}`;
  receipt.receiptChecksum = checksum;

  const tmpPath = path.resolve(ROOT, '.tmp/atlas/chunk-segmentation-fixtures-v1.json');
  const reportPath = path.resolve(ROOT, 'docs/reports/chunk-segmentation-fixtures-v1.json');
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  fs.writeFileSync(tmpPath, receiptJson, 'utf8');
  fs.writeFileSync(reportPath, receiptJson, 'utf8');

  return {
    reportPath,
    checksum,
    totalAudited: storedRows.length,
    strategyCounts,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runSegmentationFixturesAudit()
    .then((res) => console.log(JSON.stringify(res, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
