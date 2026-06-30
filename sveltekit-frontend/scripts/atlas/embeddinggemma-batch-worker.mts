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
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

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
  data?: Array<{ embedding?: number[] }>;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
};

type SchemaCheck = {
  columns: Set<string>;
  indexes: Set<string>;
  hints: string[];
  failures: string[];
  summaryExpression: string;
  orderBy: string;
  selectSourceRef: string;
  selectFeatureId: string;
  selectLayerType: string;
  selectSummaryLevel: string;
  columnTypes: Record<string, { dataType: string; udtName: string }>;
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

const repoEnv = loadRepoEnv(process.env);
Object.assign(process.env, repoEnv);
const DATABASE_URL = resolveDatabaseUrl(repoEnv);

const OLLAMA_URL = (repoEnv.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OPENAI_EMBED_BASE_URL = String(repoEnv.OLLAMA_EMBED_BASE_URL || repoEnv.EMBED_SERVER_URL || '').replace(/\/$/, '');
const EMBED_URL = OPENAI_EMBED_BASE_URL ? `${OPENAI_EMBED_BASE_URL}/v1/embeddings` : `${OLLAMA_URL}/api/embed`;
const EMBED_TRANSPORT = OPENAI_EMBED_BASE_URL ? 'openai_compatible' : 'ollama_api_embed';
const EMBED_MODEL =
  repoEnv.OLLAMA_EMBED_MODEL ||
  repoEnv.PRIMARY_EMBEDDING_MODEL ||
  repoEnv.EMBED_MODEL ||
  repoEnv.EMBEDDING_MODEL ||
  'embeddinggemma:latest';
const EXPECTED_DIM = Number(repoEnv.EMBEDDING_DIM || 768);

const REPORT_DIR = path.resolve('docs', 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'embeddinggemma-batch-worker.json');
const MD_REPORT = path.join(REPORT_DIR, 'embeddinggemma-batch-worker.md');

const pgPool = new Pool({
  connectionString: DATABASE_URL,
  max: Math.max(4, CONCURRENCY + 2),
});

let schemaCheck: SchemaCheck | null = null;

function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  }
}

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
  const schema = schemaCheck;
  const sourceRef = schema?.selectSourceRef ?? 'source_ref';
  const featureId = schema?.selectFeatureId ?? 'feature_id';
  const layerType = schema?.selectLayerType ?? 'layer_type';
  const summaryLevel = schema?.selectSummaryLevel ?? 'summary_level';
  const summaryExpression = schema?.summaryExpression ?? "coalesce(summary, summary_text, '')";
  const orderBy = schema?.orderBy ?? 'updated_at NULLS FIRST, created_at NULLS FIRST, packet_key';
  const result = await pgPool.query<SummaryRow>(
    `
      SELECT
        ctid::text AS ctid,
        packet_key,
        ${sourceRef},
        ${featureId},
        ${layerType},
        ${summaryLevel},
        left(${summaryExpression}, 8192) AS summary_text
      FROM atlas_summary_layers
      WHERE embedding IS NULL
        AND length(trim(${summaryExpression})) > 0
      ORDER BY ${orderBy}
      LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

async function validateSchema(): Promise<SchemaCheck> {
  const [columnsResult, indexesResult] = await Promise.all([
    pgPool.query<{ column_name: string; data_type: string; udt_name: string }>(
      `
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'atlas_summary_layers'
        ORDER BY ordinal_position
      `,
    ),
    pgPool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'atlas_summary_layers'
        ORDER BY indexname
      `,
    ),
  ]);

  const columns = new Set(columnsResult.rows.map((row) => row.column_name));
  const indexes = new Set(indexesResult.rows.map((row) => row.indexname));
  const columnTypes = Object.fromEntries(
    columnsResult.rows.map((row) => [row.column_name, { dataType: row.data_type, udtName: row.udt_name }]),
  );
  const hints: string[] = [];
  const failures: string[] = [];

  if (!columns.size) {
    failures.push('missing table public.atlas_summary_layers; run migrations or restore the Parent Atlas summary schema before embedding.');
  }

  for (const required of ['packet_key', 'embedding', 'metadata']) {
    if (!columns.has(required)) failures.push(`missing required column atlas_summary_layers.${required}`);
  }

  const hasSummary = columns.has('summary');
  const hasSummaryText = columns.has('summary_text');
  if (!hasSummary && !hasSummaryText) {
    failures.push('missing summary text column; expected atlas_summary_layers.summary or atlas_summary_layers.summary_text');
  }

  for (const recommended of ['source_ref', 'source_ref_key', 'feature_id', 'embedding_model', 'vector_dim']) {
    if (!columns.has(recommended)) hints.push(`recommended column missing: atlas_summary_layers.${recommended}`);
  }

  if (!columns.has('canonical_source_ref')) {
    hints.push('canonical_source_ref is not a scalar column in this database; derive it from source_ref/source_ref_key/file_path or JSONB metadata/payload.');
  }

  const embeddingType = columnTypes.embedding;
  if (embeddingType && embeddingType.udtName !== 'vector') {
    hints.push(`atlas_summary_layers.embedding type is ${embeddingType.udtName}; expected pgvector type "vector" for EmbeddingGemma mirrors.`);
  }

  for (const expectedIndex of [
    'idx_summary_layers_metadata_gin',
    'idx_summary_layers_summary_fts',
    'idx_atlas_summary_layers_packet_key',
  ]) {
    if (!indexes.has(expectedIndex)) hints.push(`expected index missing: ${expectedIndex}`);
  }

  const summaryExpression = hasSummary && hasSummaryText
    ? "coalesce(summary, summary_text, '')"
    : hasSummary
      ? "coalesce(summary, '')"
      : "coalesce(summary_text, '')";

  const orderColumns = [
    columns.has('updated_at') ? 'updated_at NULLS FIRST' : null,
    columns.has('created_at') ? 'created_at NULLS FIRST' : null,
    columns.has('packet_key') ? 'packet_key' : null,
  ].filter(Boolean).join(', ') || 'ctid';

  return {
    columns,
    indexes,
    hints,
    failures,
    summaryExpression,
    orderBy: orderColumns,
    selectSourceRef: columns.has('source_ref') ? 'source_ref' : 'NULL::text AS source_ref',
    selectFeatureId: columns.has('feature_id') ? 'feature_id' : 'NULL::text AS feature_id',
    selectLayerType: columns.has('layer_type') ? 'layer_type' : 'NULL::text AS layer_type',
    selectSummaryLevel: columns.has('summary_level') ? 'summary_level' : 'NULL::text AS summary_level',
    columnTypes,
  };
}

async function embedBatch(texts: string[]): Promise<{ embeddings: number[][]; durationMs: number; ollamaDurationNs?: number }> {
  const start = performance.now();
  const response = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Embedding request failed (${EMBED_TRANSPORT}): HTTP ${response.status} ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as OllamaEmbedResponse;
  const embeddings = data.embeddings
    ?? data.data?.map((row) => row.embedding ?? [])
    ?? (data.embedding ? [data.embedding] : []);
  if (embeddings.length !== texts.length) {
    throw new Error(`Embedding endpoint returned ${embeddings.length} embeddings for ${texts.length} inputs`);
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
            embedding_source: EMBED_TRANSPORT === 'openai_compatible' ? 'openai_compatible_batch' : 'ollama_batch',
            embedding_endpoint: EMBED_URL,
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
      `- endpoint: ${report.endpoint}`,
      `- transport: ${report.transport}`,
      `- expected_dim: ${report.expectedDim}`,
      `- selected_rows: ${report.selectedRows}`,
      `- embedded_rows: ${report.embeddedRows}`,
      `- updated_rows: ${report.updatedRows}`,
      `- batches: ${report.batches}`,
      `- batch_size: ${report.batchSize}`,
      `- concurrency: ${report.concurrency}`,
      `- elapsed_ms: ${report.elapsedMs}`,
      `- schema_failures: ${Array.isArray(report.schemaFailures) ? report.schemaFailures.length : 0}`,
      `- schema_hints: ${Array.isArray(report.schemaHints) ? report.schemaHints.length : 0}`,
      `- report_json: ${JSON_REPORT}`,
      '',
      '## Schema Hints',
      '',
      ...(Array.isArray(report.schemaHints) && report.schemaHints.length
        ? report.schemaHints.map((hint) => `- ${hint}`)
        : ['- none']),
      '',
      '## Schema Failures',
      '',
      ...(Array.isArray(report.schemaFailures) && report.schemaFailures.length
        ? report.schemaFailures.map((failure) => `- ${failure}`)
        : ['- none']),
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
  console.log(`postgres=${redactDatabaseUrl(DATABASE_URL)} embed=${EMBED_URL} transport=${EMBED_TRANSPORT} model=${EMBED_MODEL} expectedDim=${EXPECTED_DIM}`);

  schemaCheck = await validateSchema();
  if (schemaCheck.hints.length) {
    for (const hint of schemaCheck.hints) console.warn(`[schema-hint] ${hint}`);
  }
  if (schemaCheck.failures.length) {
    const elapsedMs = Math.round(performance.now() - start);
    const report = {
      status: 'FAIL',
      mode: DRY_RUN ? 'dry-run' : 'apply',
      model: EMBED_MODEL,
      endpoint: EMBED_URL,
      transport: EMBED_TRANSPORT,
      expectedDim: EXPECTED_DIM,
      selectedRows: 0,
      embeddedRows: 0,
      updatedRows: 0,
      batches: 0,
      batchSize: BATCH_SIZE,
      concurrency: CONCURRENCY,
      elapsedMs,
      failures: schemaCheck.failures.map((error, batch) => ({ batch, error })),
      schemaFailures: schemaCheck.failures,
      schemaHints: schemaCheck.hints,
      schemaColumns: Array.from(schemaCheck.columns).sort(),
      schemaIndexes: Array.from(schemaCheck.indexes).sort(),
      outputs: {
        json: JSON_REPORT,
        markdown: MD_REPORT,
      },
    };
    await writeReports(report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

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
    endpoint: EMBED_URL,
    transport: EMBED_TRANSPORT,
    expectedDim: EXPECTED_DIM,
    selectedRows: rows.length,
    embeddedRows,
    updatedRows,
    batches: batches.length,
    batchSize: BATCH_SIZE,
    concurrency: CONCURRENCY,
    elapsedMs,
    failures,
    schemaFailures: schemaCheck.failures,
    schemaHints: schemaCheck.hints,
    schemaColumns: Array.from(schemaCheck.columns).sort(),
    schemaIndexes: Array.from(schemaCheck.indexes).sort(),
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
