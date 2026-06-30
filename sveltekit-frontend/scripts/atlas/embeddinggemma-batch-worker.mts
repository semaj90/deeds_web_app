#!/usr/bin/env node
/**
 * EmbeddingGemma Batch Worker
 *
 * Embeds atlas_summary_layers rows with Ollama EmbeddingGemma in batches.
 * This worker only fills the summary embedding mirror; packet identity stays in
 * atlas_packets and is never mutated here.
 *
 * Usage:
 *   npm run worker:embedding:batch:dry -- --limit=20 --batch-size=10
 *   npm run worker:embedding:batch:apply -- --limit=200 --batch-size=20
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';

type SummaryRow = {
  ctid: string;
  packet_key: string;
  source_ref: string | null;
  feature_id: string | null;
  layer_type: string | null;
  summary_level: string | null;
  summary_text: string;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  embedding?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
};

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value = 'true'] = arg.slice(2).split('=');
      return [key, value] as const;
    }),
);

const DRY_RUN = args.has('dry-run') || !args.has('apply');
const APPLY = args.has('apply');
const LIMIT = Number(args.get('limit') ?? process.env.LIMIT ?? 100);
const BATCH_SIZE = Number(args.get('batch-size') ?? process.env.BATCH_SIZE ?? 20);
const CONCURRENCY = Math.max(1, Number(args.get('concurrency') ?? process.env.CONCURRENCY ?? 1));

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = Number(process.env.POSTGRES_PORT || 5434);
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const EMBED_MODEL = process.env.EMBED_MODEL || process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
const EXPECTED_DIM = Number(process.env.EMBEDDING_DIM || 768);

const REPORT_DIR = path.resolve('docs', 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'embeddinggemma-batch-worker.json');
const MD_REPORT = path.join(REPORT_DIR, 'embeddinggemma-batch-worker.md');

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DB,
  user: PG_USER,
  password: PG_PASSWORD,
  max: Math.max(4, CONCURRENCY + 2),
});

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => {
    if (!Number.isFinite(value)) return '0';
    return Number(value).toPrecision(8);
  }).join(',')}]`;
}

async function fetchSummaryRows(limit: number): Promise<SummaryRow[]> {
  const result = await pgPool.query<SummaryRow>(
    `
      SELECT
        ctid::text AS ctid,
        packet_key,
        source_ref,
        feature_id,
        layer_type,
        summary_level,
        left(coalesce(summary, summary_text, ''), 8192) AS summary_text
      FROM atlas_summary_layers
      WHERE embedding IS NULL
        AND length(trim(coalesce(summary, summary_text, ''))) > 0
      ORDER BY updated_at NULLS FIRST, created_at NULLS FIRST, packet_key
      LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

async function embedBatch(texts: string[]): Promise<{ embeddings: number[][]; durationMs: number; ollamaDurationNs?: number }> {
  const start = performance.now();
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama embed failed: HTTP ${response.status} ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as OllamaEmbedResponse;
  const embeddings = data.embeddings ?? (data.embedding ? [data.embedding] : []);
  if (embeddings.length !== texts.length) {
    throw new Error(`Ollama returned ${embeddings.length} embeddings for ${texts.length} inputs`);
  }

  for (const [index, embedding] of embeddings.entries()) {
    if (!Array.isArray(embedding) || embedding.length !== EXPECTED_DIM) {
      throw new Error(`Embedding ${index} dimension mismatch: expected ${EXPECTED_DIM}, got ${embedding?.length ?? 'null'}`);
    }
  }

  return {
    embeddings,
    durationMs: performance.now() - start,
    ollamaDurationNs: data.total_duration,
  };
}

async function updateRows(rows: SummaryRow[], embeddings: number[][], batchMeta: Record<string, unknown>): Promise<number> {
  if (!APPLY) return 0;
  let updated = 0;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i += 1) {
      const result = await client.query(
        `
          UPDATE atlas_summary_layers
          SET
            embedding = $1::vector,
            embedding_model = $2,
            vector_dim = $3,
            metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb,
            updated_at = now()
          WHERE ctid = $5::tid
        `,
        [
          vectorLiteral(embeddings[i]),
          EMBED_MODEL,
          EXPECTED_DIM,
          JSON.stringify({
            embedding_source: 'ollama_batch',
            embedded_at: new Date().toISOString(),
            embedding_batch_size: rows.length,
            ...batchMeta,
          }),
          rows[i].ctid,
        ],
      );
      updated += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function writeReports(report: Record<string, unknown>) {
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(JSON_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(
    MD_REPORT,
    [
      '# EmbeddingGemma Batch Worker',
      '',
      `- status: ${report.status}`,
      `- mode: ${report.mode}`,
      `- model: ${report.model}`,
      `- expected_dim: ${report.expectedDim}`,
      `- selected_rows: ${report.selectedRows}`,
      `- embedded_rows: ${report.embeddedRows}`,
      `- updated_rows: ${report.updatedRows}`,
      `- batches: ${report.batches}`,
      `- batch_size: ${report.batchSize}`,
      `- concurrency: ${report.concurrency}`,
      `- elapsed_ms: ${report.elapsedMs}`,
      `- report_json: ${JSON_REPORT}`,
      '',
      'This worker embeds summary rows only. It does not mutate packet identity fields.',
      '',
    ].join('\n'),
    'utf8',
  );
}

async function main() {
  const start = performance.now();
  console.log('EmbeddingGemma Batch Worker');
  console.log(`mode=${DRY_RUN ? 'dry-run' : 'apply'} limit=${LIMIT} batchSize=${BATCH_SIZE} concurrency=${CONCURRENCY}`);
  console.log(`postgres=${PG_HOST}:${PG_PORT}/${PG_DB} ollama=${OLLAMA_URL} model=${EMBED_MODEL} expectedDim=${EXPECTED_DIM}`);

  const rows = await fetchSummaryRows(LIMIT);
  const batches = chunk(rows, BATCH_SIZE);
  let embeddedRows = 0;
  let updatedRows = 0;
  const failures: Array<{ batch: number; error: string }> = [];

  await runWithConcurrency(batches, CONCURRENCY, async (batchRows, batchIndex) => {
    try {
      const texts = batchRows.map((row) => row.summary_text);
      const embedded = await embedBatch(texts);
      const batchUpdated = await updateRows(batchRows, embedded.embeddings, {
        batch_index: batchIndex,
        ollama_duration_ns: embedded.ollamaDurationNs ?? null,
        worker: 'embeddinggemma-batch-worker',
      });
      embeddedRows += embedded.embeddings.length;
      updatedRows += batchUpdated;
      console.log(`batch=${batchIndex + 1}/${batches.length} rows=${batchRows.length} embedMs=${embedded.durationMs.toFixed(1)} updated=${batchUpdated}`);
    } catch (error) {
      failures.push({ batch: batchIndex, error: error instanceof Error ? error.message : String(error) });
      console.error(`batch=${batchIndex + 1}/${batches.length} failed: ${failures.at(-1)?.error}`);
    }
  });

  const elapsedMs = Math.round(performance.now() - start);
  const report = {
    status: failures.length ? 'WARN' : 'PASS',
    mode: DRY_RUN ? 'dry-run' : 'apply',
    model: EMBED_MODEL,
    expectedDim: EXPECTED_DIM,
    selectedRows: rows.length,
    embeddedRows,
    updatedRows,
    batches: batches.length,
    batchSize: BATCH_SIZE,
    concurrency: CONCURRENCY,
    elapsedMs,
    failures,
    outputs: {
      json: JSON_REPORT,
      markdown: MD_REPORT,
    },
  };
  await writeReports(report);
  console.log(JSON.stringify(report, null, 2));

  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
