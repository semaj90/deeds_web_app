#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { Pool } from 'pg';
import { readJson, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown } from './_atlas-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolveRepoPath('.');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

const MANIFEST_PATH = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas.json');
const REPORT_JSON = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas-postgres.json');
const REPORT_MD = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas-postgres.md');
const RECORDS_TABLE = 'parent_atlas_records';
const POSTGRES_TABLE = 'parent_atlas_vectors';
const OLLAMA_URL = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const DIMENSIONS = 768;

const argv = new Set(process.argv.slice(2));
const WRITE = argv.has('--write') || argv.has('--apply');
const DRY_RUN = argv.has('--dry-run') || !WRITE;

function laneText(lane) {
  const lines = [
    `lane: ${lane.title}`,
    `lane_id: ${lane.laneId}`,
    `description: ${lane.description}`,
    `match_count: ${lane.matchCount ?? 0}`,
    `source_ref_anchors: ${lane.sourceRefAnchors ?? 0}`,
    `semantic_hash: ${lane.semanticHash ?? ''}`,
    `feature_keys: ${(lane.topFeatureKeys ?? []).join(', ')}`,
    `todo_anchors: ${(lane.todoAnchors ?? []).join(' | ')}`,
    'top_matches:',
  ];
  for (const match of lane.topMatches ?? []) {
    lines.push(
      `- ${match.featureKey ?? match.title ?? 'unknown'} :: ${match.title ?? ''} :: ${match.status ?? ''} :: ${match.nextQuery ?? ''}`
    );
    if (Array.isArray(match.sourceRefs) && match.sourceRefs.length) {
      lines.push(`  sourceRefs: ${match.sourceRefs.join(', ')}`);
    }
  }
  return lines.join('\n');
}

function fallbackVector(text, dimension = DIMENSIONS) {
  const seed = crypto.createHash('sha1').update(text).digest();
  const vector = new Array(dimension).fill(0).map((_, index) => {
    const byte = seed[index % seed.length];
    return (byte - 128) / 128;
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

async function embedBatch(texts) {
  if (!texts.length) return [];
  try {
    const res = await fetch(`${OLLAMA_URL.replace(/\/$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`embed failed ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data?.embeddings) && data.embeddings.length === texts.length) {
      return data.embeddings;
    }
    if (Array.isArray(data?.embedding) && texts.length === 1) {
      return [data.embedding];
    }
  } catch {
    // deterministic fallback
  }

  return texts.map((text) => fallbackVector(text));
}

function buildRows(manifest, vectors) {
  return manifest.lanes.map((lane, index) => {
    const sourceRefs = [...new Set((lane.topMatches ?? []).flatMap((entry) => entry.sourceRefs ?? []))];
    const payload = {
      lane_id: lane.laneId,
      lane: 'feature_command_atlas',
      title: lane.title,
      description: lane.description,
      match_count: lane.matchCount ?? 0,
      source_ref_anchors: sourceRefs.length,
      sourceRefs,
      feature_keys: (lane.topMatches ?? []).map((entry) => entry.featureKey ?? entry.title ?? null).filter(Boolean),
      todo_anchors: lane.todoAnchors ?? [],
      semantic_hash: lane.semanticHash ?? null,
      join_spine: 'sourceRef + feature_id',
      storage_lane: 'postgres_pgvector',
      vector_column: 'embedding_768',
      manifest_generated_at: manifest.generatedAt,
    };

    const featureId = lane.topMatches?.[0]?.featureKey ?? lane.laneId;
    const sourceRef = sourceRefs[0] ?? null;
    const embedding = JSON.stringify(vectors[index] ?? fallbackVector(laneText(lane)));

    return {
      record_id: `parent_atlas:${lane.laneId}`,
      lane: 'feature_command_atlas',
      title: lane.title,
      source_ref: sourceRef,
      feature_id: featureId,
      task_id: `parent_atlas:${lane.laneId}`,
      payload,
      embedding,
    };
  });
}

async function ensureSchema(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${RECORDS_TABLE} (
      id varchar(255) PRIMARY KEY,
      lane varchar(64) NOT NULL,
      node_id varchar(255) NOT NULL,
      title text,
      source_ref text,
      payload jsonb NOT NULL,
      index_version integer DEFAULT 1,
      created_at timestamptz DEFAULT now()
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${POSTGRES_TABLE} (
      id serial PRIMARY KEY,
      record_id varchar(255) REFERENCES public.${RECORDS_TABLE}(id) ON DELETE CASCADE,
      source_ref text,
      feature_id varchar(255),
      task_id varchar(255),
      embedding vector(768),
      created_at timestamptz DEFAULT now()
    );
  `);
  await client.query(`ALTER TABLE public.${POSTGRES_TABLE} ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;`);
  await client.query(`ALTER TABLE public.${POSTGRES_TABLE} ADD COLUMN IF NOT EXISTS embedding_768 vector(768);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${POSTGRES_TABLE}_record_id ON public.${POSTGRES_TABLE}(record_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${POSTGRES_TABLE}_source_ref ON public.${POSTGRES_TABLE}(source_ref);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${POSTGRES_TABLE}_feature_id ON public.${POSTGRES_TABLE}(feature_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${POSTGRES_TABLE}_task_id ON public.${POSTGRES_TABLE}(task_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${RECORDS_TABLE}_source_ref ON public.${RECORDS_TABLE}(source_ref);`);
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${POSTGRES_TABLE}_embedding_768 ON public.${POSTGRES_TABLE} USING hnsw (embedding_768 vector_cosine_ops);`);
  } catch (error) {
    console.warn(`[postgres mirror] vector index skipped: ${error?.message ?? error}`);
  }
}

function renderMarkdown(report) {
  return parentAtlasMarkdown('Parent Atlas Feature Command Atlas Postgres Mirror', {
    lanes: report.summary.lanesMirrored,
    records: report.summary.recordsWritten,
    postgresRows: report.summary.postgresRowsWritten,
    embeddingMode: report.summary.embeddingMode,
    embeddingColumn: report.summary.embeddingColumn,
  }, report.lanes.map((lane) => `${lane.laneId}: record_id=${lane.recordId}, record=${lane.recordStatus}, vector=${lane.vectorStatus}, sourceRef=${lane.sourceRef ?? 'n/a'}`));
}

async function main() {
  const manifest = readJson(MANIFEST_PATH, null);
  if (!manifest?.lanes?.length) {
    throw new Error(`Missing manifest: ${MANIFEST_PATH}. Run npm run atlas:feature-command-atlas first.`);
  }

  const texts = manifest.lanes.map(laneText);
  const vectors = await embedBatch(texts);
  const rows = buildRows(manifest, vectors);

  const databaseUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    const report = {
      generatedAt: new Date().toISOString(),
      inputs: {
        manifestPath: MANIFEST_PATH,
        postgresTable: POSTGRES_TABLE,
      },
      summary: {
        lanesMirrored: rows.length,
        recordsWritten: 0,
        postgresRowsWritten: 0,
        embeddingMode: 'offline-fallback',
        embeddingColumn: 'embedding_768',
        applied: false,
      },
      postgres: {
        attempted: false,
        applied: false,
        reason: 'DATABASE_URL missing',
      },
      lanes: rows.map((row, index) => ({
        laneId: manifest.lanes[index].laneId,
        recordId: row.record_id,
        sourceRef: row.source_ref,
        featureId: row.feature_id,
        recordStatus: DRY_RUN ? 'prepared' : 'blocked',
        vectorStatus: DRY_RUN ? 'prepared' : 'blocked',
      })),
    };
    writeJson(REPORT_JSON, report);
    writeMarkdown(REPORT_MD, renderMarkdown(report));
    console.log(`Wrote ${REPORT_JSON}`);
    console.log(`Wrote ${REPORT_MD}`);
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 5_000,
  });

  let postgres = {
    attempted: false,
    applied: false,
    rows: rows.length,
    recordsWritten: 0,
    verifiedRows: 0,
    table: POSTGRES_TABLE,
  };

  try {
    if (!DRY_RUN) {
      const client = await pool.connect();
      try {
        await ensureSchema(client);
        const recordIds = rows.map((row) => row.record_id);
        await client.query('BEGIN');
        try {
          await client.query(`DELETE FROM public.${POSTGRES_TABLE} WHERE record_id = ANY($1::text[])`, [recordIds]);
          await client.query(`DELETE FROM public.${RECORDS_TABLE} WHERE id = ANY($1::text[])`, [recordIds]);
          for (const row of rows) {
            await client.query(
              `INSERT INTO public.${RECORDS_TABLE} (id, lane, node_id, title, source_ref, payload, index_version)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1)`,
              [row.record_id, row.lane, row.record_id, row.title, row.source_ref, JSON.stringify(row.payload)]
            );
          }
          postgres.recordsWritten = rows.length;
          for (const row of rows) {
            await client.query(
              `INSERT INTO public.${POSTGRES_TABLE} (record_id, source_ref, feature_id, task_id, payload, embedding, embedding_768)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector, $7::vector)`,
              [row.record_id, row.source_ref, row.feature_id, row.task_id, JSON.stringify(row.payload), row.embedding, row.embedding]
            );
          }
          const countResult = await client.query(
            `SELECT count(*)::int AS count FROM public.${POSTGRES_TABLE} WHERE record_id = ANY($1::text[])`,
            [recordIds]
          );
          await client.query('COMMIT');
          postgres = {
            attempted: true,
            applied: true,
            rows: rows.length,
            recordsWritten: postgres.recordsWritten,
            verifiedRows: countResult.rows?.[0]?.count ?? 0,
            table: POSTGRES_TABLE,
            embeddingColumn: 'embedding_768',
          };
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        }
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      manifestPath: MANIFEST_PATH,
      postgresTable: POSTGRES_TABLE,
    },
    summary: {
      lanesMirrored: rows.length,
      recordsWritten: postgres.applied ? postgres.recordsWritten : 0,
      postgresRowsWritten: postgres.applied ? postgres.verifiedRows : 0,
      embeddingMode: vectors.every((vector) => Array.isArray(vector) && vector.length === DIMENSIONS) ? 'ollama-or-fallback' : 'fallback',
      embeddingColumn: 'embedding_768',
      applied: postgres.applied,
    },
    postgres,
    lanes: rows.map((row, index) => ({
      laneId: manifest.lanes[index].laneId,
      recordId: row.record_id,
      sourceRef: row.source_ref,
      featureId: row.feature_id,
      recordStatus: postgres.applied ? 'written' : 'prepared',
      vectorStatus: postgres.applied ? 'written' : 'prepared',
    })),
  };

  writeJson(REPORT_JSON, report);
  writeMarkdown(REPORT_MD, renderMarkdown(report));

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Postgres table: ${POSTGRES_TABLE}`);
  console.log(`Applied: ${postgres.applied ? 'yes' : 'no'}`);
}

main().catch((error) => {
  console.error('Parent Atlas Postgres mirror failed:', error?.message ?? error);
  process.exit(1);
});
