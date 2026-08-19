#!/usr/bin/env node

/**
 * ORF-2P read-only PostgreSQL plan proof.
 *
 * Captures PostgreSQL 18 AIO-related settings and EXPLAIN ANALYZE/BUFFERS for a
 * representative selective observation-feature query. It never creates indexes
 * or mutates feature rows.
 */

import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};

const featureRevision = arg('feature-revision', 'orf:1');
const ontologyClass = arg('ontology', 'DATABASE');
const astKind = arg('ast', 'DATABASE_WRITE');
const limit = Math.max(1, Math.min(500, Number(arg('limit', '50')) || 50));
const receiptOut = path.resolve(arg('receipt-out', 'data/atlas-ml/orf-postgres-plan-receipt.json'));

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function collectNodeTypes(plan, output = []) {
  if (!plan || typeof plan !== 'object') return output;
  if (typeof plan['Node Type'] === 'string') output.push(plan['Node Type']);
  for (const child of plan.Plans ?? []) collectNodeTypes(child, output);
  return output;
}

async function showOptional(client, name) {
  try {
    const result = await client.query(`SHOW ${name}`);
    return result.rows[0]?.[name] ?? Object.values(result.rows[0] ?? {})[0] ?? null;
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const relation = await client.query(
      `SELECT to_regclass('public.atlas_observation_feature_rows')::text AS relation`,
    );
    if (!relation.rows[0]?.relation) {
      throw new Error('ORF_FEATURE_TABLE_MISSING: apply drizzle/manual/20260819_atlas_observation_feature_rows.sql first');
    }

    const [version, snapshot] = await Promise.all([
      client.query('SHOW server_version'),
      client.query(`SELECT pg_current_snapshot()::text AS snapshot, transaction_timestamp()::text AS captured_at`),
    ]);

    const settings = {
      serverVersion: version.rows[0]?.server_version ?? null,
      effectiveIoConcurrency: await showOptional(client, 'effective_io_concurrency'),
      maintenanceIoConcurrency: await showOptional(client, 'maintenance_io_concurrency'),
      ioMethod: await showOptional(client, 'io_method'),
      ioCombineLimit: await showOptional(client, 'io_combine_limit'),
      randomPageCost: await showOptional(client, 'random_page_cost'),
      effectiveCacheSize: await showOptional(client, 'effective_cache_size'),
    };

    const explain = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT JSON)
       SELECT packet_key, source_ref, feature_revision, ontology_classes,
              ast_observation_kinds, kmeans_cluster_id, community_id, pagerank
         FROM atlas_observation_feature_rows
        WHERE feature_revision = $1
          AND ontology_classes @> ARRAY[$2]::text[]
          AND ast_observation_kinds @> ARRAY[$3]::text[]
        LIMIT $4`,
      [featureRevision, ontologyClass, astKind, limit],
    );

    const document = explain.rows[0]?.['QUERY PLAN']?.[0] ?? null;
    const plan = document?.Plan ?? null;
    const nodeTypes = collectNodeTypes(plan);
    const indexNames = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node['Index Name']) indexNames.push(node['Index Name']);
      for (const child of node.Plans ?? []) visit(child);
    };
    visit(plan);

    const receipt = {
      schema: 'atlas.orf-postgres-plan-receipt.v1',
      capturedAt: snapshot.rows[0]?.captured_at ?? new Date().toISOString(),
      postgresSnapshot: snapshot.rows[0]?.snapshot ?? null,
      readOnly: true,
      query: {
        featureRevision,
        ontologyClass,
        astKind,
        limit,
      },
      settings,
      nodeTypes,
      indexNames: [...new Set(indexNames)],
      observedBitmapPlan: nodeTypes.some((name) => name.includes('Bitmap')),
      observedIndexPlan: nodeTypes.some((name) => name.includes('Index') || name.includes('Bitmap')),
      executionTimeMs: document?.['Execution Time'] ?? null,
      planningTimeMs: document?.['Planning Time'] ?? null,
      plan: document,
    };
    receipt.receiptDigest = digest(receipt);

    await fs.mkdir(path.dirname(receiptOut), { recursive: true });
    await fs.writeFile(receiptOut, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(receipt));

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
