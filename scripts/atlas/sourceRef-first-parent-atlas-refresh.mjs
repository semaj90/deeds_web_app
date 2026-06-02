#!/usr/bin/env node
/**
 * sourceRef-first-parent-atlas-refresh.mjs
 *
 * Promote the canonical sourceRef-first hot-join report into the existing
 * parent_atlas_records / parent_atlas_vectors mirror tables.
 *
 * This runner is report-first:
 *   sourceRef-first warmup -> NES/Glyph compression -> hot-join warmup
 *   -> parent atlas refresh
 *
 * It does not change schema. It reuses the existing parent atlas mirror tables
 * and writes a compact report under docs/reports/.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.json');
const REPORT_MD_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-parent-atlas-refresh.md');
const INPUT_HOT_JOIN_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-hot-join-warmup.json');
const FRONTEND_ENV_PATH = path.join(REPO_ROOT, 'sveltekit-frontend', '.env');
const DIMENSIONS = 768;

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const DRY_RUN = argv.has('--dry-run') || !APPLY;
const LIMIT_ARG_INDEX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_ARG_INDEX >= 0 ? Number(process.argv[LIMIT_ARG_INDEX + 1]) : null;

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });
dotenv.config({ path: FRONTEND_ENV_PATH });

const DATABASE_URL =
  process.env.ADMIN_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  '';

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeMarkdown(filePath, markdown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
}

function toNonEmptyString(value) {
  const str = typeof value === 'string' ? value.trim() : '';
  return str.length > 0 ? str : null;
}

function normalizeFeatureId(value, fallback = 'sourceRef-first') {
  const raw = toNonEmptyString(value) ?? fallback;
  return raw.replace(/[^a-zA-Z0-9:_-]+/g, '_');
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function fallbackVector(text, dimension = DIMENSIONS) {
  const seed = crypto.createHash('sha1').update(String(text)).digest();
  const vector = new Array(dimension).fill(0).map((_, index) => {
    const byte = seed[index % seed.length];
    return (byte - 128) / 128;
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

async function embedBatch(texts) {
  if (!texts.length) return [];

  const modelCandidates = [
    process.env.OLLAMA_EMBED_MODEL,
    process.env.BIFROST_EMBEDDING_MODEL,
    'embeddinggemma:latest',
    'nomic-embed-text:latest',
  ]
    .map((model) => toNonEmptyString(model))
    .filter(Boolean);

  const urlCandidates = [
    process.env.OLLAMA_URL,
    process.env.OLLAMA_BASE_URL,
    'http://127.0.0.1:11434',
  ]
    .map((value) => toNonEmptyString(value) ?? 'http://127.0.0.1:11434')
    .map((value) => value.replace(/\/$/, ''));

  for (const url of urlCandidates) {
    for (const model of modelCandidates) {
      try {
        const res = await fetch(`${url}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, input: texts }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data?.embeddings) && data.embeddings.length === texts.length) {
          return data.embeddings;
        }
        if (Array.isArray(data?.embedding) && texts.length === 1) {
          return [data.embedding];
        }
      } catch {
        // Try the next candidate or fall back deterministically.
      }
    }
  }

  return texts.map((text) => fallbackVector(text));
}

function buildPacketText(item, reportGeneratedAt) {
  const sourceRefs = Array.isArray(item.sourceRefs) ? item.sourceRefs.filter(Boolean) : [];
  return [
    'SourceRef-first parent atlas refresh packet',
    `Kind: ${item.kind ?? 'unknown'}`,
    `FeatureId: ${item.featureId ?? 'unknown'}`,
    `SourceRef: ${item.sourceRef ?? 'unknown'}`,
    `QueryHash: ${item.queryHash ?? 'unknown'}`,
    `ChunkId: ${item.chunkId ?? 'unknown'}`,
    `SourceRefs: ${sourceRefs.join(', ')}`,
    `CachedKey: ${item.cachedKey ?? 'n/a'}`,
    `Summary: ${item.summary ?? ''}`,
    `ReportGeneratedAt: ${reportGeneratedAt}`,
  ].join('\n');
}

function normalizeSamples(report) {
  const samples = Array.isArray(report?.samples)
    ? report.samples
    : Array.isArray(report?.outputs)
      ? report.outputs
      : [];

  return samples
    .map((sample, index) => {
      if (!sample || typeof sample !== 'object') return null;
      const sourceRefs = [...new Set([sample.sourceRef, ...(Array.isArray(sample.sourceRefs) ? sample.sourceRefs : [])].filter(Boolean))];
      const featureId = normalizeFeatureId(sample.featureId ?? sample.feature_id ?? sample.kind ?? `sourceRef-first:${index}`);
      const queryHash = toNonEmptyString(sample.queryHash ?? sample.query_hash) ?? hashText(`sourceRef-first-parent-atlas:${featureId}:${sourceRefs.join('|')}:${index}`);
      const chunkId = toNonEmptyString(sample.chunkId ?? sample.chunk_id) ?? hashText(`chunk:${featureId}:${queryHash}`).slice(0, 12);
      const summary = toNonEmptyString(sample.summary) ?? `SourceRef-first packet for ${featureId}`;
      const sourceRef = sourceRefs[0] ?? null;
      const summaryKey = toNonEmptyString(sample.summaryKey) ?? `sourceRef-first:parent-atlas:${featureId}:${queryHash.slice(0, 16)}`;
      const cachedKey = toNonEmptyString(sample.cachedKey) ?? `sourceRef-first:hot-join:${sample.kind ?? 'item'}:${featureId}:${queryHash.slice(0, 16)}`;
      return {
        index,
        kind: toNonEmptyString(sample.kind) ?? 'hot_join',
        sourceRef,
        sourceRefs,
        featureId,
        queryHash,
        chunkId,
        summary,
        summaryKey,
        cachedKey,
        hitCount: Number(sample.hitCount ?? sourceRefs.length ?? 0),
        bifrostModel: toNonEmptyString(sample.bifrostModel),
        bifrostFallback: Boolean(sample.bifrostFallback),
      };
    })
    .filter(Boolean);
}

function buildRows(samples, vectors, reportGeneratedAt, report) {
  return samples.map((item, index) => {
    const recordId = `parent_atlas:sourceRef_first:${item.featureId}:${item.queryHash.slice(0, 16)}`;
    const lane = 'sourceRef_first_hot_join';
    const title = `${item.kind === 'cluster' ? 'NES/Glyph cluster' : 'NES/Glyph packet'} ${item.featureId}`;
    const payload = {
      lane,
      sourceRefFirst: true,
      refreshLane: 'sourceRef-first',
      sourceRef: item.sourceRef,
      sourceRefs: item.sourceRefs,
      featureId: item.featureId,
      queryHash: item.queryHash,
      chunkId: item.chunkId,
      summary: item.summary,
      summaryKey: item.summaryKey,
      cachedKey: item.cachedKey,
      hitCount: item.hitCount,
      kind: item.kind,
      sourceReport: path.relative(REPO_ROOT, INPUT_HOT_JOIN_PATH).replace(/\\/g, '/'),
      upstreamReports: {
        warmup: path.relative(REPO_ROOT, path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-join-warmup.json')).replace(/\\/g, '/'),
        compressed: path.relative(REPO_ROOT, path.join(REPO_ROOT, 'docs', 'reports', 'sourceRef-first-nes-glyph-compress.json')).replace(/\\/g, '/'),
        hotJoin: path.relative(REPO_ROOT, INPUT_HOT_JOIN_PATH).replace(/\\/g, '/'),
      },
      joinSpine: 'sourceRef + featureId + queryHash',
      summaryOrigin: 'sourceRef-first hot join',
      reportGeneratedAt,
      reportMode: report.mode,
      hotJoinSummary: report.summary,
      neo4j: report.neo4j ?? null,
      top: report.top ?? null,
    };

    const embeddingText = buildPacketText(item, reportGeneratedAt);
    const vector = vectors[index] ?? fallbackVector(embeddingText);
    const embedding = JSON.stringify(vector);

    return {
      record_id: recordId,
      lane,
      node_id: recordId,
      title,
      source_ref: item.sourceRef,
      feature_id: item.featureId,
      task_id: `sourceRef-first:${item.featureId}`,
      payload,
      embedding,
      embedding_768: embedding,
    };
  });
}

function renderMarkdown(report) {
  const lines = [
    '# SourceRef-First Parent Atlas Refresh',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Inputs',
    '',
    `- hot-join report: ${report.inputs.hotJoinReport}`,
    `- limit: ${report.inputs.limit ?? 'all'}`,
    '',
    '## Output',
    '',
    `- items processed: ${report.summary.items}`,
    `- records written: ${report.summary.recordsWritten}`,
    `- vectors written: ${report.summary.vectorsWritten}`,
    `- embedding mode: ${report.summary.embeddingMode}`,
    `- errors: ${report.summary.errors}`,
    '',
    '## Top featureIds',
    '',
    ...(report.top?.featureIds ?? []).map((entry) => `- ${entry.value}: ${entry.count}`),
    '',
    '## Top sourceRefs',
    '',
    ...(report.top?.sourceRefs ?? []).map((entry) => `- ${entry.value}: ${entry.count}`),
    '',
    '## Notes',
    '',
    '- This runner promotes the canonical sourceRef-first hot-join report into the existing parent atlas mirror tables.',
    '- The join spine remains sourceRef + featureId + queryHash.',
    '- No schema changes are performed.',
  ];
  return `${lines.join('\n')}\n`;
}

async function ensureTables(client) {
  const recordsCols = new Set(
    (await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='parent_atlas_records'`
    )).rows.map((row) => row.column_name)
  );
  const vectorsCols = new Set(
    (await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='parent_atlas_vectors'`
    )).rows.map((row) => row.column_name)
  );

  if (!recordsCols.has('id') || !recordsCols.has('lane') || !recordsCols.has('payload')) {
    throw new Error('parent_atlas_records table is missing required columns');
  }
  if (!vectorsCols.has('record_id') || (!vectorsCols.has('embedding') && !vectorsCols.has('embedding_768'))) {
    throw new Error('parent_atlas_vectors table is missing required vector columns');
  }

  return {
    recordsCols,
    vectorsCols,
    vectorColumns: ['embedding', 'embedding_768'].filter((column) => vectorsCols.has(column)),
  };
}

function buildRecordInsertSql(vectorColumns) {
  const vectorColumnsSql = vectorColumns.join(', ');
  const vectorPlaceholders = vectorColumns.map((_, idx) => `$${idx + 5}::vector`).join(', ');
  return {
    vectorColumnsSql,
    vectorPlaceholders,
  };
}

async function main() {
  if (!fs.existsSync(INPUT_HOT_JOIN_PATH)) {
    throw new Error(`Missing input report: ${INPUT_HOT_JOIN_PATH}`);
  }
  const report = readJson(INPUT_HOT_JOIN_PATH, null);
  if (!report) {
    throw new Error(`Could not parse hot-join report: ${INPUT_HOT_JOIN_PATH}`);
  }

  const samples = normalizeSamples(report);
  if (!samples.length) {
    throw new Error(`No samples found in ${INPUT_HOT_JOIN_PATH}`);
  }
  const limit = Number.isFinite(LIMIT) && LIMIT > 0 ? Math.min(LIMIT, samples.length) : samples.length;
  const selected = samples.slice(0, limit);
  const reportGeneratedAt = report.generatedAt ?? new Date().toISOString();

  const texts = selected.map((item) => buildPacketText(item, reportGeneratedAt));
  const vectors = await embedBatch(texts);
  const rows = buildRows(selected, vectors, reportGeneratedAt, report);

  const summary = {
    items: selected.length,
    recordsWritten: 0,
    vectorsWritten: 0,
    embeddingMode: vectors.every((vector) => Array.isArray(vector) && vector.length === DIMENSIONS)
      ? 'ollama-or-fallback'
      : 'fallback',
    errors: 0,
    applied: false,
  };

  const reportData = {
    schema: 'sourceRef_first_parent_atlas_refresh_report.v1',
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    inputs: {
      hotJoinReport: INPUT_HOT_JOIN_PATH,
      limit: Number.isFinite(LIMIT) && LIMIT > 0 ? LIMIT : null,
    },
    summary,
    top: {
      featureIds: [...new Map(selected.map((item) => [item.featureId, 0])).keys()].map((value) => ({
        value,
        count: selected.filter((item) => item.featureId === value).length,
      })).sort((a, b) => b.count - a.count),
      sourceRefs: [...new Map(selected.flatMap((item) => item.sourceRefs).map((value) => [value, 0])).keys()].map((value) => ({
        value,
        count: selected.filter((item) => item.sourceRefs.includes(value)).length,
      })).sort((a, b) => b.count - a.count),
    },
    rows: rows.map((row) => ({
      recordId: row.record_id,
      sourceRef: row.source_ref,
      featureId: row.feature_id,
      taskId: row.task_id,
      title: row.title,
      joinSpine: row.payload.joinSpine,
      cachedKey: row.payload.cachedKey,
    })),
  };

  if (!DATABASE_URL) {
    summary.applied = false;
    reportData.postgres = {
      attempted: false,
      applied: false,
      reason: 'DATABASE_URL missing',
    };
    writeJson(REPORT_JSON_PATH, reportData);
    writeMarkdown(REPORT_MD_PATH, renderMarkdown(reportData));
    console.log(`Wrote ${REPORT_JSON_PATH}`);
    console.log(`Wrote ${REPORT_MD_PATH}`);
    return;
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 5_000,
  });

  let postgres = {
    attempted: true,
    applied: false,
    rows: rows.length,
    recordsWritten: 0,
    vectorsWritten: 0,
    tableRecords: 'parent_atlas_records',
    tableVectors: 'parent_atlas_vectors',
  };

  try {
    const client = await pool.connect();
    try {
      const { vectorColumns } = await ensureTables(client);
      const recordIds = rows.map((row) => row.record_id);
      const { vectorColumnsSql, vectorPlaceholders } = buildRecordInsertSql(vectorColumns);

      if (APPLY) {
        await client.query('BEGIN');
        try {
          await client.query('DELETE FROM parent_atlas_vectors WHERE record_id = ANY($1::text[])', [recordIds]);
          await client.query('DELETE FROM parent_atlas_records WHERE id = ANY($1::text[])', [recordIds]);

          for (const row of rows) {
            await client.query(
              `INSERT INTO parent_atlas_records (id, lane, node_id, title, source_ref, payload, index_version)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1)
               ON CONFLICT (id) DO UPDATE SET
                 lane = EXCLUDED.lane,
                 node_id = EXCLUDED.node_id,
                 title = EXCLUDED.title,
                 source_ref = EXCLUDED.source_ref,
                 payload = EXCLUDED.payload,
                 index_version = parent_atlas_records.index_version + 1`,
              [
                row.record_id,
                row.lane,
                row.node_id,
                row.title,
                row.source_ref,
                JSON.stringify(row.payload),
              ]
            );
          }
          postgres.recordsWritten = rows.length;

          for (const row of rows) {
            const vectorValues = vectorColumns.map(() => row.embedding);
            const query = `INSERT INTO parent_atlas_vectors (record_id, source_ref, feature_id, task_id${vectorColumnsSql ? `, ${vectorColumnsSql}` : ''})
                           VALUES ($1, $2, $3, $4${vectorPlaceholders ? `, ${vectorPlaceholders}` : ''})`;
            await client.query(query, [
              row.record_id,
              row.source_ref,
              row.feature_id,
              row.task_id,
              ...vectorValues,
            ]);
          }
          postgres.vectorsWritten = rows.length;
          await client.query('COMMIT');
          postgres.applied = true;
          summary.applied = true;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } else {
        postgres.applied = false;
      }

      if (APPLY) {
        const countRecords = await client.query(
          'SELECT count(*)::int AS count FROM parent_atlas_records WHERE id = ANY($1::text[])',
          [recordIds]
        );
        const countVectors = await client.query(
          'SELECT count(*)::int AS count FROM parent_atlas_vectors WHERE record_id = ANY($1::text[])',
          [recordIds]
        );
        postgres.verifiedRecords = Number(countRecords.rows[0]?.count ?? 0);
        postgres.verifiedVectors = Number(countVectors.rows[0]?.count ?? 0);
      }
    } finally {
      client.release();
    }
  } catch (error) {
    summary.errors += 1;
    postgres.error = error?.message ?? String(error);
    throw error;
  } finally {
    await pool.end();
  }

  summary.recordsWritten = postgres.recordsWritten;
  summary.vectorsWritten = postgres.vectorsWritten;
  reportData.postgres = postgres;
  writeJson(REPORT_JSON_PATH, reportData);
  writeMarkdown(REPORT_MD_PATH, renderMarkdown(reportData));

  console.log(`[sourceRef-first parent atlas refresh] items=${summary.items} records=${summary.recordsWritten} vectors=${summary.vectorsWritten} errors=${summary.errors}`);
  console.log(`[sourceRef-first parent atlas refresh] json=${REPORT_JSON_PATH}`);
  console.log(`[sourceRef-first parent atlas refresh] md=${REPORT_MD_PATH}`);
}

main().catch((error) => {
  const reportData = {
    schema: 'sourceRef_first_parent_atlas_refresh_report.v1',
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    inputs: {
      hotJoinReport: INPUT_HOT_JOIN_PATH,
      limit: Number.isFinite(LIMIT) && LIMIT > 0 ? LIMIT : null,
    },
    summary: {
      items: 0,
      recordsWritten: 0,
      vectorsWritten: 0,
      embeddingMode: 'fallback',
      errors: 1,
      applied: false,
    },
    error: error?.message ?? String(error),
  };
  writeJson(REPORT_JSON_PATH, reportData);
  writeMarkdown(REPORT_MD_PATH, renderMarkdown(reportData));
  console.error('[sourceRef-first parent atlas refresh] fatal:', error?.message ?? error);
  process.exit(1);
});
