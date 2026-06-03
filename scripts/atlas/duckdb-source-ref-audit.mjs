#!/usr/bin/env node
/**
 * duckdb-source-ref-audit.mjs
 *
 * Offline audit hammer — runs DuckDB queries against atlas.duckdb to answer:
 *
 *   Q1. Which Postgres chunks are missing a qdrant_id?
 *   Q2. Which relative_paths appear more than once (duplicates)?
 *   Q3. Which GPU clusters have zero source_refs?
 *   Q4. Which paths are in .venv / deeds_labs (junk chunks)?
 *   Q5. How many chunks exist per domain?
 *
 * Does NOT write to Qdrant. Read-only audit only.
 *
 * Usage:
 *   node scripts/atlas/duckdb-source-ref-audit.mjs
 *   node scripts/atlas/duckdb-source-ref-audit.mjs --json   # machine-readable output
 */

import { spawnSync }    from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv           from 'dotenv';
import pg               from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

const AS_JSON    = process.argv.includes('--json');
const DB_URL     = process.env.DATABASE_URL;
const DUCKDB_EXE = process.env.DUCKDB_PATH
  ?? 'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe';
const DUCK_FILE  = resolve(ROOT, 'duckdb/atlas.duckdb');
const TODAY      = new Date().toISOString().slice(0, 10);
const TMP_DIR    = resolve(ROOT, '.tmp');
const REPORT_OUT = resolve(TMP_DIR, `duckdb-source-ref-audit-${TODAY}.json`);

// ── Run a DuckDB SQL query, return parsed JSON rows ───────────────────
function duckQuery(sql, label) {
  const r = spawnSync(DUCKDB_EXE, [DUCK_FILE, '-json', '-c', sql], {
    encoding: 'utf8', timeout: 30_000,
  });
  if (r.status !== 0) {
    const msg = r.stderr?.trim() ?? 'unknown error';
    if (!AS_JSON) console.error(`  [${label}] DuckDB error: ${msg}`);
    return { error: msg };
  }
  try {
    return JSON.parse(r.stdout.trim());
  } catch {
    return r.stdout.trim();
  }
}

// ── Run Postgres queries for live data not yet in DuckDB ──────────────
async function pgQueries() {
  if (!DB_URL) return null;
  const pool = new pg.Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const results = {};
  try {
    // Q1: missing qdrant_id
    const q1 = await client.query(`
      SELECT COUNT(*) AS n
      FROM codebase_chunk_index
      WHERE qdrant_id IS NULL AND chunk_id IS NULL
    `);
    results.missing_qdrant_id = parseInt(q1.rows[0]?.n ?? 0, 10);

    // Q2: duplicate relative_paths
    const q2 = await client.query(`
      SELECT relative_path, COUNT(*) AS n
      FROM codebase_chunk_index
      WHERE relative_path IS NOT NULL
      GROUP BY relative_path
      HAVING COUNT(*) > 1
      ORDER BY n DESC
      LIMIT 20
    `);
    results.duplicate_paths = q2.rows;

    // Q3: clusters with no chunks having source_refs
    const q3 = await client.query(`
      SELECT neo4j_gpu_cluster AS cluster, COUNT(*) AS total,
             SUM(CASE WHEN relative_path IS NULL THEN 1 ELSE 0 END) AS missing_path
      FROM codebase_chunk_index
      WHERE neo4j_gpu_cluster IS NOT NULL
      GROUP BY neo4j_gpu_cluster
      HAVING SUM(CASE WHEN relative_path IS NULL THEN 1 ELSE 0 END) > 0
      ORDER BY missing_path DESC
      LIMIT 20
    `);
    results.clusters_with_missing_paths = q3.rows;

    // Q4: junk chunks from .venv / deeds_labs
    const q4 = await client.query(`
      SELECT
        CASE
          WHEN relative_path LIKE '.venv%' THEN '.venv'
          WHEN relative_path LIKE 'deeds_labs%' THEN 'deeds_labs'
          WHEN relative_path LIKE 'node_modules%' THEN 'node_modules'
          ELSE 'other'
        END AS bucket,
        COUNT(*) AS n
      FROM codebase_chunk_index
      WHERE relative_path IS NOT NULL
        AND (relative_path LIKE '.venv%' OR relative_path LIKE 'deeds_labs%' OR relative_path LIKE 'node_modules%')
      GROUP BY bucket
      ORDER BY n DESC
    `);
    results.junk_chunks = q4.rows;

    // Q5: chunks per domain
    const q5 = await client.query(`
      SELECT domain, COUNT(*) AS n
      FROM codebase_chunk_index
      GROUP BY domain
      ORDER BY n DESC
      LIMIT 15
    `);
    results.chunks_by_domain = q5.rows;

    // Q6: total row count
    const q6 = await client.query(`SELECT COUNT(*) AS n FROM codebase_chunk_index`);
    results.total_rows = parseInt(q6.rows[0]?.n ?? 0, 10);

  } finally {
    client.release();
    await pool.end();
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  if (!AS_JSON) {
    console.log('\n[duckdb-source-ref-audit] Offline source-ref audit');
    console.log(`  DuckDB: ${DUCKDB_EXE}`);
    console.log(`  DB:     ${DUCK_FILE}\n`);
  }

  mkdirSync(TMP_DIR, { recursive: true });

  // Postgres live queries
  if (!AS_JSON) process.stdout.write('Running Postgres queries...\n');
  const pg = await pgQueries().catch(e => ({ error: e.message }));

  // DuckDB CLI queries (supplemental — runs only if atlas.duckdb exists and duckdb.exe is present)
  let duckAudit = null;
  try {
    const { statSync } = await import('node:fs');
    statSync(DUCK_FILE);
    statSync(DUCKDB_EXE);
    duckAudit = {
      missing_qdrant_id: duckQuery(
        `SELECT COUNT(*) AS n FROM codebase_chunk_index WHERE qdrant_id IS NULL`,
        'missing_qdrant_id'
      ),
    };
  } catch { /* DuckDB or atlas.duckdb not available */ }

  const report = {
    generatedAt: new Date().toISOString(),
    postgres: pg,
    duckdb: duckAudit,
  };

  // Print human-readable summary
  if (!AS_JSON && pg && !pg.error) {
    console.log(`\n── Postgres codebase_chunk_index ──────────────────────`);
    console.log(`  Total rows:              ${pg.total_rows}`);
    console.log(`  Missing qdrant_id:       ${pg.missing_qdrant_id}`);
    console.log(`  Duplicate relative_paths: ${pg.duplicate_paths?.length ?? 0}`);
    console.log(`  Clusters with missing paths: ${pg.clusters_with_missing_paths?.length ?? 0}`);

    if (pg.junk_chunks?.length) {
      console.log(`\n── Junk chunks (should not be in Qdrant) ──────────────`);
      for (const row of pg.junk_chunks) {
        console.log(`  ${row.bucket.padEnd(20)} ${row.n} chunks`);
      }
    }

    if (pg.chunks_by_domain?.length) {
      console.log(`\n── Chunks by domain ───────────────────────────────────`);
      for (const row of pg.chunks_by_domain) {
        console.log(`  ${(row.domain ?? 'null').padEnd(20)} ${row.n}`);
      }
    }

    if (pg.duplicate_paths?.length) {
      console.log(`\n── Duplicate paths (top 5) ────────────────────────────`);
      for (const row of pg.duplicate_paths.slice(0, 5)) {
        console.log(`  ${row.relative_path} (${row.n}×)`);
      }
    }

    if (pg.clusters_with_missing_paths?.length) {
      console.log(`\n── Clusters with missing paths (top 5) ────────────────`);
      for (const row of pg.clusters_with_missing_paths.slice(0, 5)) {
        console.log(`  Cluster ${String(row.cluster).padEnd(4)} total=${row.total} missing=${row.missing_path}`);
      }
    }

    console.log(`\n── Recommendation ─────────────────────────────────────`);
    if (pg.junk_chunks?.find(r => r.bucket === '.venv')) {
      console.log(`  ⚠  .venv chunks are indexed in Qdrant — run:`);
      console.log(`     node scripts/atlas/backfill-qdrant-source-refs.mjs --commit`);
      console.log(`     (Phase 3B will patch sourceRef; then filter .venv out of search results)`);
    }
    if (pg.missing_qdrant_id > 0) {
      console.log(`  ⚠  ${pg.missing_qdrant_id} rows have no qdrant_id — re-index with:`);
      console.log(`     npm run graphify:semantic`);
    }
    if (pg.duplicate_paths?.length > 0) {
      console.log(`  ⚠  ${pg.duplicate_paths.length} duplicate paths — resolve with:`);
      console.log(`     node scripts/atlas/backfill-qdrant-source-refs.mjs --commit (dedup in REDUCE phase)`);
    }
  }

  writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));
  if (AS_JSON) {
    process.stdout.write(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Report: ${REPORT_OUT}`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
