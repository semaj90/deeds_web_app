#!/usr/bin/env node
/**
 * Export the canonical Parent Atlas Postgres surfaces for Colab/offline GPU work.
 *
 * Produces:
 *   .tmp/colab-parent-atlas/parent-atlas-selected.dump
 *   .tmp/colab-parent-atlas/*.ndjson
 *   .tmp/colab-parent-atlas/manifest.json
 *
 * The custom dump is for PostgreSQL restore. The NDJSON files are for Colab,
 * DuckDB, pandas, cuML/cuVS experiments, and feature-ranking notebooks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);
const OUT_DIR = path.join(REPO_ROOT, '.tmp/colab-parent-atlas');
const LIMIT = Number(argValue('--limit') ?? 0);
const SKIP_DUMP = process.argv.includes('--skip-dump');

const TABLES = [
  'atlas_packets',
  'atlas_summary_layers',
  'packet_features',
  'atlas_feature_envelopes',
  'atlas_tree_nodes',
];

function argValue(name) {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : null;
}

function dockerPgDump(outFile) {
  const args = [
    'exec',
    'legal-ai-postgres',
    'pg_dump',
    '-U',
    'legal_admin',
    '-d',
    'legal_ai_db',
    '-Fc',
    '--no-owner',
    '--no-privileges',
    ...TABLES.flatMap((table) => ['-t', `public.${table}`]),
  ];
  const result = spawnSync('docker', args, {
    cwd: REPO_ROOT,
    encoding: null,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`pg_dump failed: ${(result.stderr ?? Buffer.from('')).toString('utf8').slice(0, 1000)}`);
  }
  fs.writeFileSync(outFile, result.stdout);
}

async function tableExists(pool, table) {
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [table],
  );
  return rows.length > 0;
}

async function exportNdjson(pool, table) {
  if (!(await tableExists(pool, table))) {
    return { table, exists: false, rows: 0, file: null };
  }
  const outFile = path.join(OUT_DIR, `${table}.ndjson`);
  const limitSql = LIMIT > 0 ? ` LIMIT ${LIMIT}` : '';
  const query = `
    SELECT row_to_json(t)::text AS line
    FROM (
      SELECT *
      FROM ${table}
      ORDER BY 1
      ${limitSql}
    ) t
  `;
  const client = await pool.connect();
  let count = 0;
  try {
    const result = await client.query(query);
    const stream = fs.createWriteStream(outFile, { encoding: 'utf8' });
    for (const row of result.rows) {
      stream.write(`${row.line}\n`);
      count += 1;
    }
    await new Promise((resolve, reject) => {
      stream.end(resolve);
      stream.on('error', reject);
    });
  } finally {
    client.release();
  }
  return { table, exists: true, rows: count, file: outFile };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const startedAt = new Date().toISOString();
  try {
    const ndjson = [];
    for (const table of TABLES) {
      const exported = await exportNdjson(pool, table);
      ndjson.push(exported);
      console.log(`[ndjson] ${table}: ${exported.exists ? exported.rows : 'missing'}`);
    }

    const dumpFile = path.join(OUT_DIR, 'parent-atlas-selected.dump');
    let dump = { skipped: SKIP_DUMP, file: dumpFile, bytes: 0 };
    if (!SKIP_DUMP) {
      dockerPgDump(dumpFile);
      dump = { skipped: false, file: dumpFile, bytes: fs.statSync(dumpFile).size };
      console.log(`[pg_dump] ${dumpFile} (${dump.bytes} bytes)`);
    }

    const manifest = {
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      source: 'legal-ai-postgres/legal_ai_db',
      purpose: 'Colab/offline GPU feature ranking, embeddings, clustering, and topology experiments',
      canonical_truth: 'Postgres atlas_packets',
      limit: LIMIT || null,
      dump,
      ndjson,
      colab_notes: [
        'Upload the .ndjson files for pandas/DuckDB/cuML experiments.',
        'Use parent-atlas-selected.dump only if restoring into PostgreSQL.',
        'Do not treat Qdrant, cuVS, Weaviate, or Colab outputs as canonical truth.',
        'Write derived fields back through explicit import/backfill scripts only.',
      ],
    };
    const manifestFile = path.join(OUT_DIR, 'manifest.json');
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: 'PASS', out_dir: OUT_DIR, manifest: manifestFile, dump, ndjson }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
