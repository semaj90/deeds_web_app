#!/usr/bin/env node
/**
 * Re-embed codebase_chunk_index.content_embedding with the corrected,
 * EmbeddingGemma-documented document-side prompt prefix
 * (`title: {title|"none"} | text: {content}`), instead of the raw unprompted
 * text every row currently carries (PROMPT_REVISION_UNPROMPTED).
 *
 * Writes are tagged embedding_model = 'embeddinggemma:latest:eg-task-prefix-v1'
 * so old vs new rows stay distinguishable without a schema migration. Idempotent:
 * rows already carrying that tag are skipped on re-run.
 *
 * Flags: --dry-run (compute + verify, no writes), --limit N, --batch-size N.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find((value) => value.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const batchArg = args.find((value) => value.startsWith('--batch-size='));
const BATCH_SIZE = batchArg ? Number(batchArg.slice('--batch-size='.length)) : 100;

const NEW_EMBEDDING_MODEL_TAG = 'embeddinggemma:latest:eg-task-prefix-v1';
const OLLAMA_MODEL = process.env.LEGAL_EMBED_MODEL || 'embeddinggemma:latest';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

function formatDocumentPrompt(content, title) {
  const normalized = content.trim();
  if (!normalized) throw new Error('EMBEDDINGGEMMA_EMPTY_INPUT');
  return `title: ${title?.trim() || 'none'} | text: ${normalized}`;
}

async function embedBatch(texts) {
  if (!texts.length) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        input: texts,
        truncate: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
      throw new Error(`Ollama response mismatch: expected ${texts.length}, got ${data.embeddings?.length}`);
    }
    return data.embeddings;
  } finally {
    clearTimeout(timeout);
  }
}

async function embedOne(text) {
  const [vec] = await embedBatch([text]);
  return vec;
}

function toPgVectorLiteral(vec) {
  return `[${vec.join(',')}]`;
}

const env = loadRepoEnv(process.env);
const outPath = path.resolve(
  REPO_ROOT,
  `docs/reports/atlas-corpus-reembed-document-prefix-v1${DRY_RUN ? '-dry_run' : '-apply'}.json`,
);
// Separate from the one-off export `.tmp/atlas/reembed-preimage-v1.jsonl` (its sha256 is recorded in tasks.md) so appends never change that file.
const preimagePath = path.resolve(REPO_ROOT, '.tmp/atlas/reembed-preimage-appended-v1.jsonl');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 2,
  connectionTimeoutMillis: 5000,
  statement_timeout: 60000,
});

const report = {
  schema: 'atlas.corpus-reembed-document-prefix.v1',
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  writesPerformed: false, // set true only after a page UPDATE actually succeeds
  newEmbeddingModelTag: NEW_EMBEDDING_MODEL_TAG,
  limit: Number.isFinite(LIMIT) ? LIMIT : null,
  batchSize: BATCH_SIZE,
  processed: 0,
  updated: 0,
  overwrittenPreimages: 0,
  skippedAlreadyDone: 0,
  errors: [],
  sampleDimensionCheck: null,
  throughputRowsPerSec: 0,
  startedAt: new Date().toISOString(),
};

async function main() {
  let lastId = '00000000-0000-0000-0000-000000000000';
  let remaining = LIMIT;
  const startTime = Date.now();

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(preimagePath), { recursive: true });
  }

  while (remaining > 0) {
    const batchLimit = Math.min(BATCH_SIZE, remaining === Infinity ? BATCH_SIZE : remaining);
    const { rows } = await pool.query(
      `SELECT id, content, relative_path, embedding_model, content_embedding
       FROM codebase_chunk_index
       WHERE content IS NOT NULL AND btrim(content) <> '' AND id > $1
         AND (embedding_model IS NULL OR embedding_model <> $2)
       ORDER BY id
       LIMIT $3`,
      [lastId, NEW_EMBEDDING_MODEL_TAG, batchLimit],
    );

    if (rows.length === 0) break;

    // Filter valid rows and format prompts
    const validRows = [];
    const prompts = [];
    for (const row of rows) {
      lastId = row.id;
      report.processed += 1;
      try {
        const p = formatDocumentPrompt(row.content, row.relative_path);
        validRows.push(row);
        prompts.push(p);
      } catch (err) {
        report.errors.push({ id: row.id, message: err.message });
      }
    }

    if (validRows.length > 0) {
      let vectors = null;
      try {
        // Try batched /api/embed
        vectors = await embedBatch(prompts);
      } catch (batchErr) {
        // Fallback to sequential row-by-row on batch failure
        vectors = [];
        for (let i = 0; i < prompts.length; i++) {
          try {
            const v = await embedOne(prompts[i]);
            vectors.push(v);
          } catch (oneErr) {
            report.errors.push({ id: validRows[i].id, message: oneErr.message });
            vectors.push(null);
          }
        }
      }

      // Filter rows with valid 768-D vectors
      const updateIds = [];
      const updateVecs = [];
      for (let i = 0; i < validRows.length; i++) {
        const vec = vectors[i];
        if (!vec) continue;
        if (vec.length !== 768 || !vec.every(Number.isFinite)) {
          report.errors.push({ id: validRows[i].id, message: `Invalid vector dimension ${vec?.length}` });
          continue;
        }
        // REPR-MANIFEST-01 requires L2 unit-norm vectors; reject rather than store a non-normalised one.
        const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
        if (!(Math.abs(norm - 1) < 1e-3)) {
          report.errors.push({ id: validRows[i].id, message: `Vector norm ${norm} is not unit length` });
          continue;
        }

        if (report.sampleDimensionCheck === null) {
          report.sampleDimensionCheck = { id: validRows[i].id, dimension: vec.length, first3: vec.slice(0, 3) };
        }

        // Record pre-image if row already had an embedding and this is a write run
        if (!DRY_RUN && validRows[i].content_embedding) {
          const preimageLine = JSON.stringify({
            id: validRows[i].id,
            previous_embedding_model: validRows[i].embedding_model,
            content_embedding: validRows[i].content_embedding,
            timestamp: new Date().toISOString(),
          }) + '\n';
          fs.appendFileSync(preimagePath, preimageLine, 'utf8');
          report.overwrittenPreimages += 1;
        }

        updateIds.push(validRows[i].id);
        updateVecs.push(toPgVectorLiteral(vec));
      }

      // Atomic batch update via UNNEST
      // A failed page is logged per id and skipped; the run keeps indexing the rest (a single statement is atomic, so a failure writes nothing for that page).
      let pageWritten = updateIds.length;
      if (!DRY_RUN && updateIds.length > 0) {
        try {
          await pool.query(
            `UPDATE codebase_chunk_index AS c
             SET content_embedding = u.vec::halfvec,
                 embedding_model = $2,
                 updated_at = now()
             FROM (
               SELECT unnest($1::uuid[]) AS id,
                      unnest($3::text[]) AS vec
             ) AS u
             WHERE c.id = u.id`,
            [updateIds, NEW_EMBEDDING_MODEL_TAG, updateVecs],
          );
          report.writesPerformed = true;
        } catch (updateErr) {
          pageWritten = 0;
          for (const failedId of updateIds) report.errors.push({ id: failedId, message: `PAGE_UPDATE_FAILED: ${updateErr.message}` });
        }
      }
      report.updated += pageWritten;
    }

    const elapsedSec = (Date.now() - startTime) / 1000;
    report.throughputRowsPerSec = elapsedSec > 0 ? Number((report.updated / elapsedSec).toFixed(2)) : 0;

    console.log(JSON.stringify({
      progress: report.processed,
      updated: report.updated,
      throughputRowsPerSec: report.throughputRowsPerSec,
      errors: report.errors.length,
      lastId,
    }));

    if (remaining !== Infinity) remaining -= rows.length;
    if (rows.length < batchLimit) break;
  }
}

try {
  await main();
} catch (error) {
  report.fatalError = error.message;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
}

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  processed: report.processed,
  updated: report.updated,
  errorCount: report.errors.length,
  sampleDimensionCheck: report.sampleDimensionCheck,
  out: outPath,
}, null, 2));
if (report.fatalError) process.exitCode = 1;
