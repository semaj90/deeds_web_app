#!/usr/bin/env node
/**
 * Read-only audit for the proposed 64 x 64 residual PQ codebook.
 * Uses the explicit loopback *_scratch PostgreSQL database only. It measures
 * canonical semantic_768 availability and existing centroid shapes; it does
 * not train, assign, write, or promote any codebook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_SCRATCH = path.join(ROOT, 'docs/reports/pq4096-readiness-audit-v1.json');
const OUTPUT_LIVE = path.join(ROOT, 'docs/reports/pq4096-readiness-live-read-only-v1.json');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SCRATCH_NAME = /^[a-z0-9_]+_scratch$/;

function targetUrl(target) {
  if (target === 'live-read-only') {
    if (process.env.ATLAS_ALLOW_LIVE_READ_ONLY !== '1') throw new Error('LIVE_READ_ONLY_GATE: set ATLAS_ALLOW_LIVE_READ_ONLY=1 explicitly');
    return resolveDatabaseUrl(loadRepoEnv(process.env));
  }
  if (process.env.SCRATCH_DATABASE_URL) return process.env.SCRATCH_DATABASE_URL;
  const url = new URL(resolveDatabaseUrl(loadRepoEnv(process.env)));
  url.pathname = '/legal_ai_live_integration_scratch';
  return url.toString();
}

async function tableColumns(client, table) {
  return (await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  )).rows.map((row) => row.column_name);
}

async function main() {
  const target = process.argv.includes('--target=live-read-only') ? 'live-read-only' : 'scratch';
  const url = new URL(targetUrl(target));
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const targetMatches = target === 'scratch' ? SCRATCH_NAME.test(database) : database === 'legal_ai_db';
  if (!LOOPBACK.has(url.hostname.toLowerCase()) || !targetMatches) {
    throw new Error(target === 'scratch'
      ? 'SCRATCH_GATE: expected loopback PostgreSQL database ending in _scratch'
      : 'LIVE_READ_ONLY_GATE: expected loopback legal_ai_db');
  }

  const pool = new pg.Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query(
      `SELECT current_database() AS database, current_setting('server_version_num')::int AS version_num`,
    )).rows[0];
    if (identity.database !== database || !(target === 'scratch' ? SCRATCH_NAME.test(identity.database) : identity.database === 'legal_ai_db')) {
      throw new Error('DATABASE_IDENTITY_MISMATCH');
    }
    if (Number(identity.version_num) < 180000) throw new Error('POSTGRES_18_REQUIRED');

    const chunkColumns = await tableColumns(client, 'codebase_chunk_index');
    let semanticChunks = { tablePresent: chunkColumns.length > 0, totalRows: null, vectors768: null, provenance: null, modelRevisions: [] };
    if (chunkColumns.includes('content_embedding_768')) {
      const has = (name) => chunkColumns.includes(name);
      const fields = [
        'count(*)::bigint AS total_rows',
        'count(content_embedding_768)::bigint AS vectors_768',
        has('source_revision') ? "count(*) FILTER (WHERE source_revision IS NOT NULL)::bigint AS source_revision_rows" : '0::bigint AS source_revision_rows',
        has('workspace_revision') ? "count(*) FILTER (WHERE workspace_revision IS NOT NULL)::bigint AS workspace_revision_rows" : '0::bigint AS workspace_revision_rows',
        has('representation_revision') ? "count(*) FILTER (WHERE representation_revision IS NOT NULL)::bigint AS representation_revision_rows" : '0::bigint AS representation_revision_rows',
        has('embedding_model') ? "count(*) FILTER (WHERE embedding_model IS NOT NULL)::bigint AS embedding_model_rows" : '0::bigint AS embedding_model_rows',
        has('content_embedding_768') && has('source_revision') && has('workspace_revision') && has('representation_revision') && has('embedding_model')
          ? "count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND source_revision IS NOT NULL AND workspace_revision IS NOT NULL AND representation_revision IS NOT NULL AND embedding_model IS NOT NULL)::bigint AS fully_bound_vector_rows"
          : '0::bigint AS fully_bound_vector_rows',
      ];
      const counts = (await client.query(`SELECT ${fields.join(', ')} FROM public.codebase_chunk_index`)).rows[0];
      const modelRevisions = has('embedding_model')
        ? (await client.query(`SELECT embedding_model, count(*)::bigint AS rows
             FROM public.codebase_chunk_index WHERE content_embedding_768 IS NOT NULL
             GROUP BY embedding_model ORDER BY rows DESC, embedding_model LIMIT 20`)).rows
        : [];
      semanticChunks = {
        tablePresent: true,
        totalRows: Number(counts.total_rows),
        vectors768: Number(counts.vectors_768),
        provenance: {
          sourceRevisionRows: Number(counts.source_revision_rows),
          workspaceRevisionRows: Number(counts.workspace_revision_rows),
          representationRevisionRows: Number(counts.representation_revision_rows),
          embeddingModelRows: Number(counts.embedding_model_rows),
          allRequiredFieldsPresent: Number(counts.fully_bound_vector_rows),
        },
        modelRevisions: modelRevisions.map((row) => ({ model: row.embedding_model, rows: Number(row.rows) })),
      };
    }

    const centroidColumns = await tableColumns(client, 'gpu_cluster_centroids');
    let centroids = { tablePresent: centroidColumns.length > 0, byType: [], vectorDimensions: [] };
    if (centroidColumns.length && centroidColumns.includes('cluster_id')) {
      const typeExpr = centroidColumns.includes('cluster_type') ? 'cluster_type' : "'UNCLASSIFIED'::text AS cluster_type";
      centroids.byType = (await client.query(
        `SELECT ${typeExpr}, count(*)::int AS rows FROM public.gpu_cluster_centroids GROUP BY 1 ORDER BY 1`,
      )).rows;
      if (centroidColumns.includes('centroid_vec')) {
        centroids.vectorDimensions = (await client.query(
          `SELECT cardinality(centroid_vec) AS dimensions, count(*)::int AS rows
             FROM public.gpu_cluster_centroids GROUP BY 1 ORDER BY 1`,
        )).rows;
      }
    }

    const qdrantCentroidColumns = await tableColumns(client, 'qdrant_centroid_clusters');
    const qdrantCentroids = qdrantCentroidColumns.length
      ? Number((await client.query('SELECT count(*)::int AS rows FROM public.qdrant_centroid_clusters')).rows[0].rows)
      : null;

    await client.query('ROLLBACK');
    const report = {
      schema: 'atlas.pq4096-readiness-audit.v1',
      generatedAt: new Date().toISOString(),
      database: identity.database,
      targetMode: target === 'scratch' ? 'SCRATCH_READ_ONLY' : 'LIVE_READ_ONLY',
      postgresMajor: Math.floor(Number(identity.version_num) / 10000),
      canonicalVectorContract: 'public.codebase_chunk_index.content_embedding_768 (semantic_768, 768 dimensions)',
      proposal: { coarseK: 64, residualKPerCoarse: 64, leafCount: 4096, status: 'CANDIDATE_NOT_TRAINED' },
      semanticChunks,
      centroids,
      qdrantCentroidRows: qdrantCentroids,
      writesPerformed: false,
      canonicalAuthority: false,
      conclusion: semanticChunks.vectors768 === null
        ? 'BLOCKED_SOURCE_TABLE_OR_VECTOR_COLUMN_ABSENT_IN_SCRATCH'
        : semanticChunks.vectors768 === 0
          ? 'BLOCKED_NO_CANONICAL_768D_VECTORS_IN_SCRATCH'
          : semanticChunks.provenance.allRequiredFieldsPresent === 0
            ? 'NOT_READY_REVISION_AND_MODEL_PROVENANCE_INCOMPLETE'
            : 'DATASET_COUNTS_PRESENT_REQUIRES_SNAPSHOT_QUALIFICATION_AND_EVALUATION',
    };
    const outputPath = target === 'scratch' ? OUTPUT_SCRATCH : OUTPUT_LIVE;
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`[pq4096-readiness] ${error.message}\n`);
  process.exitCode = 1;
});
