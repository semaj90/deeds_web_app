#!/usr/bin/env node
/**
 * scripts/atlas/daily-graphify-cold-processing.mjs
 *
 * Orchestrates the Parent Atlas cold-processing pipeline:
 *   1. Postgres lineage coverage audit
 *   2. CouchDB MapReduce reingest (dry-run by default, apply with --apply-couchdb)
 *   3. DuckDB offline MapReduce synthesis (skip with --skip-duckdb)
 *   4. Profile card generation (dry-run by default, apply with --apply-profile-cards)
 *   5. Summary report
 *
 * Usage:
 *   node scripts/atlas/daily-graphify-cold-processing.mjs
 *   node scripts/atlas/daily-graphify-cold-processing.mjs --apply-couchdb --apply-profile-cards
 *   node scripts/atlas/daily-graphify-cold-processing.mjs --skip-duckdb --limit=10
 *
 * Flags:
 *   --apply-couchdb         Write CouchDB docs (default: dry-run only)
 *   --apply-profile-cards   Write profile card JSON files (default: dry-run only)
 *   --skip-duckdb           Skip DuckDB offline synthesis step
 *   --limit=<n>             Limit number of profile cards generated
 *   --dry-run               Explicit dry-run mode (default behavior, no-op flag)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync as fsReadFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const args = new Set(process.argv.slice(2));
const APPLY_COUCHDB = args.has('--apply-couchdb');
const APPLY_PROFILE_CARDS = args.has('--apply-profile-cards');
const SKIP_DUCKDB = args.has('--skip-duckdb');
const LIMIT_ARG = [...args].find(a => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : 0;

const RUN_ID = `graphify_cold_${Date.now()}`;
const repoEnv = loadRepoEnv(process.env);
Object.assign(process.env, repoEnv);
const DATABASE_URL = resolveDatabaseUrl(repoEnv);

const results = {
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  flags: { APPLY_COUCHDB, APPLY_PROFILE_CARDS, SKIP_DUCKDB, LIMIT },
  steps: {},
  errors: [],
  summary: {},
};

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function logStep(step, result) {
  results.steps[step] = result;
  const icon = result.ok ? '✓' : '✗';
  log(`${icon} ${step}: ${result.message}`);
}

// ── Step 1: Postgres lineage coverage audit ───────────────────────────────────
async function auditPostgresLineage() {
  log('── Step 1: Postgres lineage coverage audit ──────────────────────────────');
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const { rows: tableRows } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'parent_atlas_documents',
          'atlas_packets',
          'atlas_summary_layers',
          'atlas_feature_map',
          'atlas_feature_synthesis',
          'route_runtime_packets'
        )
    `);
    const tables = new Set(tableRows.map((row) => row.table_name));

    if (!tables.has('parent_atlas_documents') && tables.has('atlas_packets')) {
      const { rows: packetRows } = await pool.query(`
        SELECT
          COUNT(*)                                             AS total,
          COUNT(*) FILTER (WHERE source_ref IS NOT NULL)      AS has_source_ref,
          COUNT(*) FILTER (WHERE source_ref_key IS NOT NULL)  AS has_source_ref_key,
          COUNT(*) FILTER (WHERE feature_id IS NOT NULL)      AS has_feature_id,
          COUNT(*) FILTER (WHERE file_path IS NOT NULL)       AS has_file_path,
          COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) AS has_qdrant_point_id,
          COUNT(*) FILTER (WHERE som_cluster IS NOT NULL)     AS has_som_cluster,
          COUNT(*) FILTER (WHERE kmeans_cluster IS NOT NULL)  AS has_kmeans_cluster,
          COUNT(*) FILTER (WHERE source_ref LIKE 'feature:%') AS feature_bucket_misuse
        FROM atlas_packets
      `);
      const packets = packetRows[0];

      const { rows: summaryRows } = tables.has('atlas_summary_layers')
        ? await pool.query(`
            SELECT
              COUNT(*)                                        AS total,
              COUNT(*) FILTER (WHERE embedding IS NOT NULL)   AS has_embedding,
              COUNT(*) FILTER (WHERE feature_id IS NOT NULL)  AS has_feature_id,
              COUNT(*) FILTER (WHERE source_ref IS NOT NULL)  AS has_source_ref
            FROM atlas_summary_layers
          `)
        : { rows: [{ total: 0, has_embedding: 0, has_feature_id: 0, has_source_ref: 0 }] };

      const report = {
        canonical_source_table: 'atlas_packets',
        compatibility: {
          parent_atlas_documents_exists: false,
          atlas_packets_exists: true,
          duckdb_legacy_mapreduce_supported: false,
          hint: 'Legacy parent_atlas_documents is absent; daily graphify is using atlas_packets as the canonical Parent Atlas spine.',
        },
        atlas_packets: {
          total: Number(packets.total),
          has_source_ref: Number(packets.has_source_ref),
          has_source_ref_key: Number(packets.has_source_ref_key),
          has_feature_id: Number(packets.has_feature_id),
          has_file_path: Number(packets.has_file_path),
          has_qdrant_point_id: Number(packets.has_qdrant_point_id),
          has_som_cluster: Number(packets.has_som_cluster),
          has_kmeans_cluster: Number(packets.has_kmeans_cluster),
          feature_bucket_misuse: Number(packets.feature_bucket_misuse),
        },
        atlas_summary_layers: {
          total: Number(summaryRows[0].total),
          has_embedding: Number(summaryRows[0].has_embedding),
          has_feature_id: Number(summaryRows[0].has_feature_id),
          has_source_ref: Number(summaryRows[0].has_source_ref),
        },
        auditedAt: new Date().toISOString(),
      };

      mkdirSync(resolve(REPO_ROOT, '.tmp'), { recursive: true });
      writeFileSync(
        resolve(REPO_ROOT, '.tmp/parent-atlas-postgres-lineage-report.json'),
        JSON.stringify(report, null, 2) + '\n',
        'utf8'
      );

      results.summary.postgresLineage = report;

      logStep('postgres-lineage', {
        ok: Number(packets.feature_bucket_misuse) === 0,
        message: `atlas_packets=${packets.total} rows, summaries=${summaryRows[0].total} rows, qdrant_links=${packets.has_qdrant_point_id}, legacy parent_atlas_documents absent`,
      });
      return report;
    }

    const { rows: padRows } = await pool.query(`
      SELECT
        COUNT(*)                                             AS total,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL)      AS has_source_ref,
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL)      AS has_feature_id,
        COUNT(*) FILTER (WHERE rel_path IS NOT NULL)        AS has_rel_path,
        COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) AS has_qdrant_point_id,
        COUNT(*) FILTER (WHERE centroid_id IS NOT NULL)     AS has_centroid_id,
        COUNT(*) FILTER (WHERE cluster_id IS NOT NULL)      AS has_cluster_id,
        COUNT(*) FILTER (WHERE source_ref LIKE 'feature:%') AS feature_bucket_misuse
      FROM parent_atlas_documents
    `);
    const pad = padRows[0];

    const { rows: afmRows } = await pool.query(`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL)       AS has_source_ref,
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL)       AS has_feature_id,
        COUNT(*) FILTER (WHERE som_cluster IS NOT NULL)      AS has_som_cluster,
        COUNT(*) FILTER (WHERE centroid_id IS NOT NULL)      AS has_centroid_id,
        COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL)  AS has_qdrant_point_id,
        COUNT(*) FILTER (WHERE source_ref LIKE 'feature:%')  AS feature_bucket_misuse,
        COUNT(*) FILTER (
          WHERE source_ref NOT LIKE 'feature:%'
          AND source_ref NOT IN (SELECT source_ref FROM parent_atlas_documents WHERE source_ref IS NOT NULL)
        ) AS not_in_parent_atlas_documents
      FROM atlas_feature_map
    `);
    const afm = afmRows[0];

    const { rows: afsRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM atlas_feature_synthesis`
    );

    const { rows: rrpRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM route_runtime_packets`
    );

    const report = {
      parent_atlas_documents: {
        total: Number(pad.total),
        has_source_ref: Number(pad.has_source_ref),
        has_feature_id: Number(pad.has_feature_id),
        has_rel_path: Number(pad.has_rel_path),
        has_qdrant_point_id: Number(pad.has_qdrant_point_id),
        has_centroid_id: Number(pad.has_centroid_id),
        has_cluster_id: Number(pad.has_cluster_id),
        feature_bucket_misuse: Number(pad.feature_bucket_misuse),
      },
      atlas_feature_map: {
        total: Number(afm.total),
        has_source_ref: Number(afm.has_source_ref),
        has_feature_id: Number(afm.has_feature_id),
        has_som_cluster: Number(afm.has_som_cluster),
        has_centroid_id: Number(afm.has_centroid_id),
        has_qdrant_point_id: Number(afm.has_qdrant_point_id),
        feature_bucket_misuse: Number(afm.feature_bucket_misuse),
        not_in_parent_atlas_documents: Number(afm.not_in_parent_atlas_documents),
      },
      atlas_feature_synthesis: { total: Number(afsRows[0].total) },
      route_runtime_packets: { total: Number(rrpRows[0].total) },
      auditedAt: new Date().toISOString(),
    };

    // Write lineage report
    mkdirSync(resolve(REPO_ROOT, '.tmp'), { recursive: true });
    writeFileSync(
      resolve(REPO_ROOT, '.tmp/parent-atlas-postgres-lineage-report.json'),
      JSON.stringify(report, null, 2) + '\n',
      'utf8'
    );

    results.summary.postgresLineage = report;

    logStep('postgres-lineage', {
      ok: Number(pad.feature_bucket_misuse) === 0,
      message: `pad=${pad.total} rows, afm=${afm.total} rows, afs=${afsRows[0].total} features, rrp=${rrpRows[0].total} runtime packets, feature_misuse=${pad.feature_bucket_misuse}`,
    });
    return report;
  } catch (err) {
    results.errors.push(`postgres-lineage: ${err.message}`);
    logStep('postgres-lineage', { ok: false, message: `FAILED: ${err.message}` });
    return null;
  } finally {
    await pool.end();
  }
}

// ── Step 2: CouchDB MapReduce reingest ────────────────────────────────────────
function runCouchDBMapReduce() {
  log('── Step 2: CouchDB MapReduce reingest ───────────────────────────────────');
  const scriptPath = resolve(REPO_ROOT, 'scripts/atlas/ingest-couchdb-mapreduce.mjs');

  const couchArgs = ['node', scriptPath];
  if (APPLY_COUCHDB) {
    couchArgs.push('--write', `--runId=${RUN_ID}`);
  }
  if (LIMIT > 0) {
    couchArgs.push(`--limit=${LIMIT}`);
  }

  const mode = APPLY_COUCHDB ? 'APPLY' : 'DRY-RUN';
  log(`  Running CouchDB MapReduce [${mode}]...`);

  try {
    const result = spawnSync('node', [scriptPath, ...(APPLY_COUCHDB ? ['--write', `--runId=${RUN_ID}`] : []), ...(LIMIT > 0 ? [`--limit=${LIMIT}`] : [])], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    });

    if (result.status !== 0) {
      const errMsg = result.stderr?.slice(0, 500) || 'non-zero exit';
      results.errors.push(`couchdb-mapreduce: ${errMsg}`);
      logStep('couchdb-mapreduce', { ok: false, message: `Exit ${result.status}: ${errMsg}` });
      return false;
    }

    // Extract doc counts from stdout
    const stdout = result.stdout || '';
    const docsMatch = stdout.match(/docs:\s*(\d+)/);
    const docCount = docsMatch ? docsMatch[1] : 'unknown';

    results.summary.couchdbMapreduce = { mode, docCount };
    logStep('couchdb-mapreduce', { ok: true, message: `${mode} complete, ~${docCount} docs` });
    return true;
  } catch (err) {
    results.errors.push(`couchdb-mapreduce: ${err.message}`);
    logStep('couchdb-mapreduce', { ok: false, message: `FAILED: ${err.message}` });
    return false;
  }
}

// ── Step 3: DuckDB offline MapReduce synthesis ────────────────────────────────
function runDuckDBMapReduce() {
  if (SKIP_DUCKDB) {
    log('── Step 3: DuckDB offline synthesis (SKIPPED) ───────────────────────────');
    logStep('duckdb-mapreduce', { ok: true, message: 'Skipped via --skip-duckdb' });
    return true;
  }

  if (results.summary.postgresLineage?.compatibility?.duckdb_legacy_mapreduce_supported === false) {
    log('── Step 3: DuckDB offline synthesis (SKIPPED) ───────────────────────────');
    const detail = results.summary.postgresLineage.compatibility.hint || 'Legacy DuckDB MapReduce source tables are unavailable.';
    results.summary.duckdbMapreduce = {
      skipped: true,
      reason: 'legacy_parent_atlas_documents_absent',
      detail,
    };
    logStep('duckdb-mapreduce', { ok: true, message: `Skipped: ${detail}` });
    return true;
  }

  log('── Step 3: DuckDB offline MapReduce synthesis ───────────────────────────');

  // Check for DuckDB binary
  const duckdbBin =
    process.env.DUCKDB_BIN ||
    'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe';

  if (!existsSync(duckdbBin)) {
    logStep('duckdb-mapreduce', {
      ok: false,
      message: `DuckDB binary not found at ${duckdbBin}. Set DUCKDB_BIN env var or install DuckDB.`,
    });
    return false;
  }

  const sqlPath = resolve(REPO_ROOT, 'scripts/atlas/offline-parent-atlas-mapreduce.sql');
  const dbPath = resolve(REPO_ROOT, '.tmp/offline-synthesis-mapreduce.duckdb');
  mkdirSync(resolve(REPO_ROOT, '.tmp'), { recursive: true });

  log(`  Running DuckDB synthesis: ${sqlPath}`);
  try {
    const result = spawnSync(duckdbBin, [dbPath], {
      input: fsReadFileSync(sqlPath, 'utf8'),
      encoding: 'utf8',
      timeout: 300_000,
    });

    if (result.status !== 0) {
      const errMsg = result.stderr?.slice(0, 500) || 'non-zero exit';
      results.errors.push(`duckdb-mapreduce: ${errMsg}`);
      logStep('duckdb-mapreduce', { ok: false, message: `Exit ${result.status}: ${errMsg}` });
      return false;
    }

    // Extract table row counts from output
    const stdout = result.stdout || '';
    const tableMatches = [...stdout.matchAll(/(\w+_\w+)\s+\|\s+(\d+)/g)];
    const tableSummary = Object.fromEntries(tableMatches.map(([, tbl, rows]) => [tbl, Number(rows)]));

    results.summary.duckdbMapreduce = tableSummary;
    logStep('duckdb-mapreduce', {
      ok: true,
      message: `Tables built: ${Object.entries(tableSummary).map(([t, r]) => `${t}=${r}`).join(', ') || 'complete'}`,
    });
    return true;
  } catch (err) {
    results.errors.push(`duckdb-mapreduce: ${err.message}`);
    logStep('duckdb-mapreduce', { ok: false, message: `FAILED: ${err.message}` });
    return false;
  }
}

// ── Step 4: Profile card generation ──────────────────────────────────────────
function runProfileCards() {
  log('── Step 4: Profile card generation ──────────────────────────────────────');
  const scriptPath = resolve(REPO_ROOT, 'scripts/docs/build-file-profile-cards.mjs');

  const cardArgs = [scriptPath];
  if (APPLY_PROFILE_CARDS) {
    cardArgs.push('--apply');
  }
  if (LIMIT > 0) {
    cardArgs.push('--limit', String(LIMIT));
  } else if (!APPLY_PROFILE_CARDS) {
    cardArgs.push('--limit', '5');
  }

  const mode = APPLY_PROFILE_CARDS ? 'APPLY' : 'DRY-RUN';
  log(`  Running profile card generator [${mode}]...`);

  try {
    const result = spawnSync('node', cardArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 300_000,
    });

    if (result.status !== 0) {
      const errMsg = result.stderr?.slice(0, 500) || 'non-zero exit';
      results.errors.push(`profile-cards: ${errMsg}`);
      logStep('profile-cards', { ok: false, message: `Exit ${result.status}: ${errMsg}` });
      return false;
    }

    const stdout = result.stdout || '';
    const foundMatch = stdout.match(/Found (\d+) files/);
    const fileCount = foundMatch ? foundMatch[1] : 'unknown';

    results.summary.profileCards = { mode, fileCount };
    logStep('profile-cards', { ok: true, message: `${mode} complete, ${fileCount} files processed` });
    return true;
  } catch (err) {
    results.errors.push(`profile-cards: ${err.message}`);
    logStep('profile-cards', { ok: false, message: `FAILED: ${err.message}` });
    return false;
  }
}

// ── Step 5: Write summary report ─────────────────────────────────────────────
function writeSummaryReport() {
  log('── Step 5: Writing summary report ───────────────────────────────────────');

  results.completedAt = new Date().toISOString();
  results.totalErrors = results.errors.length;
  results.allOk = Object.values(results.steps).every(s => s.ok);

  const tmpDir = resolve(REPO_ROOT, '.tmp');
  mkdirSync(tmpDir, { recursive: true });

  writeFileSync(
    resolve(tmpDir, 'parent-atlas-reprocessing-final-report.json'),
    JSON.stringify(results, null, 2) + '\n',
    'utf8'
  );

  const lin = results.summary.postgresLineage;
  const sourceTableName = lin?.canonical_source_table ?? 'parent_atlas_documents';
  const sourceTableTotal = lin?.atlas_packets?.total ?? lin?.parent_atlas_documents?.total ?? 'N/A';
  const summaryLayerTotal = lin?.atlas_summary_layers?.total ?? 'N/A';
  const qdrantLinkedTotal = lin?.atlas_packets?.has_qdrant_point_id ?? lin?.parent_atlas_documents?.has_qdrant_point_id ?? 'N/A';
  const featureIdTotal = lin?.atlas_packets?.has_feature_id ?? lin?.parent_atlas_documents?.has_feature_id ?? 'N/A';
  const afmTotal = lin?.atlas_feature_map?.total ?? 'N/A';
  const afsTotal = lin?.atlas_feature_synthesis?.total ?? 'N/A';
  const rrpTotal = lin?.route_runtime_packets?.total ?? 'N/A';
  const couchMode = results.summary.couchdbMapreduce?.mode ?? 'N/A';
  const couchDocs = results.summary.couchdbMapreduce?.docCount ?? 'N/A';
  const cardMode = results.summary.profileCards?.mode ?? 'N/A';
  const cardFiles = results.summary.profileCards?.fileCount ?? 'N/A';

  const stepLines = Object.entries(results.steps)
    .map(([step, r]) => `| ${step} | ${r.ok ? '✓' : '✗'} | ${r.message} |`)
    .join('\n');

  const duckdbLines = results.summary.duckdbMapreduce
    ? Object.entries(results.summary.duckdbMapreduce)
        .map(([t, r]) => `| ${t} | ${r} |`)
        .join('\n')
    : '| (skipped or failed) | — |';

  const md = `# Parent Atlas Cold-Processing Report

**Run ID**: ${RUN_ID}
**Started**: ${results.startedAt}
**Completed**: ${results.completedAt}
**Overall**: ${results.allOk ? '✓ ALL STEPS OK' : `✗ ${results.totalErrors} error(s)`}

## Flags

| Flag | Value |
|------|-------|
| \`--apply-couchdb\` | ${APPLY_COUCHDB} |
| \`--apply-profile-cards\` | ${APPLY_PROFILE_CARDS} |
| \`--skip-duckdb\` | ${SKIP_DUCKDB} |
| \`--limit\` | ${LIMIT || '(none)'} |

## Step Results

| Step | OK | Message |
|------|----|---------|
${stepLines}

## Postgres Lineage Coverage

| Table | Count |
|-------|-------|
| active source table: ${sourceTableName} | ${sourceTableTotal} |
| active source qdrant_point_id coverage | ${qdrantLinkedTotal} |
| active source feature_id coverage | ${featureIdTotal} |
| atlas_summary_layers | ${summaryLayerTotal} |
| atlas_feature_map | ${afmTotal} |
| atlas_feature_synthesis | ${afsTotal} |
| route_runtime_packets | ${rrpTotal} |

## CouchDB MapReduce

Mode: **${couchMode}** — ~${couchDocs} docs processed

## DuckDB Cold Tables

| Table | Rows |
|-------|------|
${duckdbLines}

## Profile Cards

Mode: **${cardMode}** — ${cardFiles} files processed

## Errors

${results.errors.length === 0 ? '_None_' : results.errors.map(e => `- ${e}`).join('\n')}

---
*Generated by \`scripts/atlas/daily-graphify-cold-processing.mjs\`*
`;

  writeFileSync(resolve(tmpDir, 'parent-atlas-reprocessing-final-report.md'), md, 'utf8');

  log(`  Reports written to .tmp/parent-atlas-reprocessing-final-report.{json,md}`);
  log(`  Lineage report at .tmp/parent-atlas-postgres-lineage-report.json`);

  logStep('summary-report', { ok: true, message: 'Reports written to .tmp/' });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log(`Starting Parent Atlas Cold-Processing Pipeline [runId=${RUN_ID}]`);
  log(`Flags: couchdb=${APPLY_COUCHDB ? 'APPLY' : 'dry'} | cards=${APPLY_PROFILE_CARDS ? 'APPLY' : 'dry'} | duckdb=${SKIP_DUCKDB ? 'SKIP' : 'run'} | limit=${LIMIT || 'none'}`);
  log('');

  await auditPostgresLineage();
  runCouchDBMapReduce();
  runDuckDBMapReduce();
  runProfileCards();
  writeSummaryReport();

  log('');
  log(`Pipeline complete. ${results.totalErrors} error(s). All OK: ${results.allOk}`);

  if (results.errors.length > 0) {
    log('Errors:');
    for (const e of results.errors) log(`  - ${e}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
