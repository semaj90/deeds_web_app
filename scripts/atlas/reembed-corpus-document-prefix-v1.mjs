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
const OLLAMA_MODEL = 'embeddinggemma:latest';
const OLLAMA_URL = 'http://127.0.0.1:11434/api/embeddings';

function formatDocumentPrompt(content, title) {
  const normalized = content.trim();
  if (!normalized) throw new Error('EMBEDDINGGEMMA_EMPTY_INPUT');
  return `title: ${title?.trim() || 'none'} | text: ${normalized}`;
}

async function embedOne(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!Array.isArray(data.embedding)) throw new Error('Ollama response missing embedding array');
    return data.embedding;
  } finally {
    clearTimeout(timeout);
  }
}

function toPgVectorLiteral(vec) {
  return `[${vec.join(',')}]`;
}

const env = loadRepoEnv(process.env);
const outPath = path.resolve(
  REPO_ROOT,
  `docs/reports/atlas-corpus-reembed-document-prefix-v1${DRY_RUN ? '-dry_run' : '-apply'}.json`,
);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 2,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

const report = {
  schema: 'atlas.corpus-reembed-document-prefix.v1',
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  writesPerformed: false,
  newEmbeddingModelTag: NEW_EMBEDDING_MODEL_TAG,
  limit: Number.isFinite(LIMIT) ? LIMIT : null,
  processed: 0,
  updated: 0,
  skippedAlreadyDone: 0,
  errors: [],
  sampleDimensionCheck: null,
  startedAt: new Date().toISOString(),
};

async function main() {
  let lastId = '00000000-0000-0000-0000-000000000000';
  let remaining = LIMIT;

  while (remaining > 0) {
    const batchLimit = Math.min(BATCH_SIZE, remaining === Infinity ? BATCH_SIZE : remaining);
    const { rows } = await pool.query(
      `SELECT id, content, relative_path, embedding_model
       FROM codebase_chunk_index
       WHERE content IS NOT NULL AND btrim(content) <> '' AND id > $1
         AND (embedding_model IS NULL OR embedding_model <> $2)
       ORDER BY id
       LIMIT $3`,
      [lastId, NEW_EMBEDDING_MODEL_TAG, batchLimit],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = row.id;
      report.processed += 1;
      try {
        const prompted = formatDocumentPrompt(row.content, row.relative_path);
        const vec = await embedOne(prompted);
        if (vec.length !== 768) throw new Error(`Unexpected dimension ${vec.length}`);
        if (vec.some((v) => !Number.isFinite(v))) throw new Error('Non-finite value in embedding');

        if (report.sampleDimensionCheck === null) {
          report.sampleDimensionCheck = { id: row.id, dimension: vec.length, first3: vec.slice(0, 3) };
        }

        if (!DRY_RUN) {
          await pool.query(
            `UPDATE codebase_chunk_index
             SET content_embedding = $1::halfvec, embedding_model = $2, updated_at = now()
             WHERE id = $3`,
            [toPgVectorLiteral(vec), NEW_EMBEDDING_MODEL_TAG, row.id],
          );
        }
        report.updated += 1;
      } catch (error) {
        report.errors.push({ id: row.id, message: error.message });
      }
    }

    if (report.processed % 500 < BATCH_SIZE) {
      console.log(JSON.stringify({
        progress: report.processed,
        updated: report.updated,
        errors: report.errors.length,
        lastId,
      }));
    }

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
