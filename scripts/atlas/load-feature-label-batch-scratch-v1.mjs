#!/usr/bin/env node

/**
 * Load repository feature-label observations into an isolated PostgreSQL 18
 * scratch schema for batch tests. This is a test fixture loader, never a
 * canonical label registry or a production feature-map writer.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_DB = 'legal_ai_live_integration_scratch';
const TARGET_PORT = '5434';
const SCHEMA = 'atlas_batch_test';
const TABLE = `${SCHEMA}.feature_label_observations`;
const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 250;

dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJsonlArtifact(relativePath, artifactKind) {
  const absolutePath = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  const bytes = fs.readFileSync(absolutePath);
  const artifactHash = sha256(bytes);
  const rows = bytes
    .toString('utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const observations = [];

  const add = (row, lineNumber, recordKind, featureLabel, options = {}) => {
    const label = String(featureLabel ?? '').trim();
    if (!label || label.length > 512) return;
    const sourceRef = typeof options.sourceRef === 'string' ? options.sourceRef : null;
    const featureId = typeof options.featureId === 'string' ? options.featureId : null;
    const pathValue = typeof options.path === 'string' ? options.path : null;
    const occurrenceCount = Number.isSafeInteger(options.occurrenceCount) && options.occurrenceCount > 0
      ? options.occurrenceCount
      : 1;
    const tags = Array.isArray(options.tags) ? options.tags : [];
    const rowKey = sha256(JSON.stringify([
      relativePath,
      artifactHash,
      lineNumber,
      recordKind,
      label,
      featureId,
      sourceRef,
    ]));
    observations.push({
      rowKey,
      artifactPath: relativePath.replaceAll('\\', '/'),
      artifactSha256: artifactHash,
      recordKind,
      featureId,
      registryKey: null,
      featureLabel: label,
      sourceRef,
      filePath: pathValue,
      occurrenceCount,
      tags,
      rawRecord: row,
    });
  };

  rows.forEach((row, index) => {
    const lineNumber = index + 1;
    if (artifactKind === 'aggregated-feature-labels') {
      add(row, lineNumber, 'SHARED_LABEL_OBSERVATION', row.shared_label, {
        path: row.file,
      });
      for (const feature of Array.isArray(row.features) ? row.features : []) {
        add(row, lineNumber, 'FEATURE_COUNT_OBSERVATION', feature.name, {
          path: row.file,
          occurrenceCount: Number(feature.count),
        });
      }
      return;
    }
    add(row, lineNumber, 'FEATURE_LABEL_OBSERVATION', row.label, {
      featureId: row.feature_id,
      sourceRef: row.source_ref,
      path: row.path,
      tags: row.tags,
    });
  });

  return {
    relativePath: relativePath.replaceAll('\\', '/'),
    artifactHash,
    inputRows: rows.length,
    observations,
  };
}

function readRegistry(relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  const bytes = fs.readFileSync(absolutePath);
  const artifactHash = sha256(bytes);
  const entries = JSON.parse(bytes.toString('utf8'));
  const observations = [];
  const add = (entry, index, kind, label) => {
    const value = String(label ?? '').trim();
    if (!value || value.length > 512) return;
    const rowKey = sha256(JSON.stringify([relativePath, artifactHash, index + 1, kind, value]));
    observations.push({
      rowKey,
      artifactPath: relativePath,
      artifactSha256: artifactHash,
      recordKind: kind,
      featureId: null,
      registryKey: String(entry.key ?? ''),
      featureLabel: value,
      sourceRef: null,
      filePath: null,
      occurrenceCount: 1,
      tags: [],
      rawRecord: entry,
    });
  };
  entries.forEach((entry, index) => {
    add(entry, index, 'REGISTRY_KEY_CANDIDATE', entry.key);
    for (const alias of Array.isArray(entry.aliases) ? entry.aliases : []) {
      add(entry, index, 'REGISTRY_ALIAS_CANDIDATE', alias);
    }
  });
  return {
    relativePath,
    artifactHash,
    inputRows: entries.length,
    observations,
  };
}

function buildCorpus() {
  const artifacts = [
    readJsonlArtifact('.tmp/feature_labels.jsonl', 'feature-label-observations'),
    readJsonlArtifact('sveltekit-frontend/.tmp/feature_labels.jsonl', 'feature-label-observations'),
    readJsonlArtifact('sveltekit-frontend/.tmp/offline-analysis/feature_labels.jsonl', 'feature-label-observations'),
  ].filter(Boolean);
  // The root-level artifact stores shared_label plus weighted feature counts.
  const rootArtifactIndex = artifacts.findIndex((artifact) => artifact.relativePath === '.tmp/feature_labels.jsonl');
  if (rootArtifactIndex >= 0) {
    const replacement = readJsonlArtifact('.tmp/feature_labels.jsonl', 'aggregated-feature-labels');
    artifacts[rootArtifactIndex] = replacement;
  }
  const registry = readRegistry('sveltekit-frontend/src/lib/server/labels/feature-label-registry.shared.json');
  if (registry) artifacts.push(registry);
  return artifacts;
}

function resolveScratchUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL_REQUIRED_FROM_ROOT_ENV');
  const url = new URL(raw);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase())) {
    throw new Error('SCRATCH_TARGET_MUST_BE_LOOPBACK');
  }
  if (url.port !== TARGET_PORT) throw new Error(`SCRATCH_TARGET_MUST_USE_PORT_${TARGET_PORT}`);
  url.pathname = `/${TARGET_DB}`;
  return url.toString();
}

async function readTarget(client) {
  const { rows } = await client.query(`
    SELECT current_database() AS database,
           current_setting('server_version_num')::integer AS server_version_num
  `);
  if (rows[0].database !== TARGET_DB || rows[0].server_version_num < 180000 || rows[0].server_version_num >= 190000) {
    throw new Error('EXPECTED_POSTGRESQL_18_SCRATCH_DATABASE');
  }
  const extension = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
  if (!extension.rows[0]) throw new Error('PGVECTOR_EXTENSION_REQUIRED_IN_SCRATCH');
  return { ...rows[0], pgvector_version: extension.rows[0].extversion };
}

async function insertRows(client, rows) {
  let inserted = 0;
  let conflicts = 0;
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const chunk = rows.slice(offset, offset + BATCH_SIZE).map((row) => ({
      row_key: row.rowKey,
      artifact_path: row.artifactPath,
      artifact_sha256: row.artifactSha256,
      repo_head_at_load: row.repoHeadAtLoad,
      record_kind: row.recordKind,
      feature_id: row.featureId,
      registry_key: row.registryKey,
      feature_label: row.featureLabel,
      source_ref: row.sourceRef,
      file_path: row.filePath,
      occurrence_count: row.occurrenceCount,
      tags: row.tags,
      raw_record: row.rawRecord,
    }));
    const result = await client.query(`
      INSERT INTO ${TABLE} (
        row_key, artifact_path, artifact_sha256, repo_head_at_load, record_kind,
        feature_id, registry_key, feature_label, source_ref, file_path,
        occurrence_count, tags, raw_record, source_revision, workspace_revision,
        canonical_authority, admission_status
      )
      SELECT x.row_key, x.artifact_path, x.artifact_sha256, x.repo_head_at_load, x.record_kind,
             x.feature_id, x.registry_key, x.feature_label, x.source_ref, x.file_path,
             x.occurrence_count, x.tags, x.raw_record, NULL, NULL, false, 'PROPOSAL_ONLY'
      FROM jsonb_to_recordset($1::jsonb) AS x(
        row_key text, artifact_path text, artifact_sha256 text, repo_head_at_load text,
        record_kind text, feature_id text, registry_key text, feature_label text,
        source_ref text, file_path text, occurrence_count integer, tags jsonb, raw_record jsonb
      )
      ON CONFLICT (row_key) DO NOTHING
    `, [JSON.stringify(chunk)]);
    inserted += result.rowCount ?? 0;
    conflicts += chunk.length - (result.rowCount ?? 0);
  }
  return { inserted, conflicts };
}

const artifacts = buildCorpus();
const observations = artifacts.flatMap((artifact) => artifact.observations);
const repoHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const byLabel = new Set(observations.map((row) => row.featureLabel));
const artifactManifest = artifacts.map(({ relativePath, artifactHash, inputRows, observations: rows }) => ({
  path: relativePath,
  sha256: artifactHash,
  inputRows,
  observationRows: rows.length,
}));

if (!APPLY) {
  console.log(JSON.stringify({
    schema: 'atlas.feature-label-batch-scratch.v1',
    mode: 'PLAN_ONLY',
    targetDatabase: TARGET_DB,
    targetPort: TARGET_PORT,
    repoHeadAtLoad: repoHead,
    artifactManifest,
    observationRows: observations.length,
    distinctLabels: byLabel.size,
    sourceRevisionQualifiedRows: 0,
    canonicalAuthority: false,
    writesPerformed: false,
    next: 'Run with --apply to load the isolated scratch schema; no public tables are modified.',
  }, null, 2));
  process.exit(0);
}

const databaseUrl = resolveScratchUrl();
const { Client } = pg;
const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
let target;
let firstPass;
let replayPass;
let preexistingRows = 0;

try {
  await client.connect();
  await client.query('BEGIN');
  target = await readTarget(client);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  const tableExists = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [TABLE]);
  if (tableExists.rows[0].present) {
    const existing = await client.query(`SELECT count(*)::integer AS count FROM ${TABLE}`);
    preexistingRows = Number(existing.rows[0].count);
  }
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      row_key text PRIMARY KEY CHECK (row_key ~ '^[a-f0-9]{64}$'),
      artifact_path text NOT NULL,
      artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
      repo_head_at_load text NOT NULL,
      record_kind text NOT NULL,
      feature_id text,
      registry_key text,
      feature_label text NOT NULL CHECK (length(feature_label) BETWEEN 1 AND 512),
      source_ref text,
      file_path text,
      occurrence_count integer NOT NULL CHECK (occurrence_count > 0),
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_record jsonb NOT NULL,
      source_revision text,
      workspace_revision text,
      canonical_authority boolean NOT NULL DEFAULT false CHECK (canonical_authority = false),
      admission_status text NOT NULL DEFAULT 'PROPOSAL_ONLY' CHECK (admission_status = 'PROPOSAL_ONLY'),
      loaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS feature_label_observations_label_idx ON ${TABLE} (feature_label)`);
  await client.query(`CREATE INDEX IF NOT EXISTS feature_label_observations_kind_idx ON ${TABLE} (record_kind)`);
  const rows = observations.map((row) => ({ ...row, repoHeadAtLoad: repoHead }));
  firstPass = await insertRows(client, rows);
  replayPass = await insertRows(client, rows);
  const txReadback = await client.query(`
    SELECT count(*)::integer AS total_rows,
           count(DISTINCT feature_label)::integer AS distinct_labels,
           count(*) FILTER (WHERE source_revision IS NULL OR workspace_revision IS NULL)::integer AS unqualified_rows,
           count(*) FILTER (WHERE canonical_authority)::integer AS canonical_rows,
           count(*) FILTER (WHERE admission_status <> 'PROPOSAL_ONLY')::integer AS non_proposal_rows
    FROM ${TABLE}
  `);
  await client.query('COMMIT');

  // Independent post-commit connection/readback: the imported rows must be
  // visible as test candidates, with no source qualification or authority.
  const verify = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  await verify.connect();
  await verify.query('BEGIN READ ONLY');
  const readback = await verify.query(`
    SELECT count(*)::integer AS total_rows,
           count(DISTINCT feature_label)::integer AS distinct_labels,
           count(*) FILTER (WHERE source_revision IS NULL OR workspace_revision IS NULL)::integer AS unqualified_rows,
           count(*) FILTER (WHERE canonical_authority)::integer AS canonical_rows,
           count(*) FILTER (WHERE admission_status <> 'PROPOSAL_ONLY')::integer AS non_proposal_rows
    FROM ${TABLE}
  `);
  const kinds = await verify.query(`SELECT record_kind, count(*)::integer AS rows FROM ${TABLE} GROUP BY record_kind ORDER BY record_kind`);
  await verify.query('ROLLBACK');
  await verify.end();

  const txSummary = txReadback.rows[0];
  const independentSummary = readback.rows[0];
  if (JSON.stringify(txSummary) !== JSON.stringify(independentSummary)) throw new Error('INDEPENDENT_READBACK_MISMATCH');
  if (Number(independentSummary.total_rows) !== preexistingRows + firstPass.inserted) throw new Error('SCRATCH_ROW_COUNT_MISMATCH');
  if (firstPass.inserted + firstPass.conflicts !== observations.length) throw new Error('FIRST_PASS_ROW_ACCOUNTING_MISMATCH');
  if (replayPass.inserted !== 0 || replayPass.conflicts !== observations.length) throw new Error('IDEMPOTENT_REPLAY_FAILED');
  if (Number(independentSummary.canonical_rows) !== 0 || Number(independentSummary.non_proposal_rows) !== 0) {
    throw new Error('CANDIDATE_AUTHORITY_GUARD_FAILED');
  }

  const report = {
    schema: 'atlas.feature-label-batch-scratch.v1',
    status: 'SCRATCH_BATCH_LOAD_AND_READBACK_PASS',
    target: { ...target, schema: SCHEMA, table: TABLE },
    repoHeadAtLoad: repoHead,
    artifactManifest,
    input: { observationRows: observations.length, distinctLabels: byLabel.size },
    load: {
      preexistingRows,
      insertedRows: firstPass.inserted,
      firstPassConflicts: firstPass.conflicts,
      replayInsertedRows: replayPass.inserted,
      replayConflicts: replayPass.conflicts,
      readback: independentSummary,
      byRecordKind: kinds.rows,
    },
    gates: {
      postgresql18: true,
      pgvectorPresent: true,
      exactScratchDatabase: true,
      publicTablesModified: false,
      sourceRevisionQualifiedRows: 0,
      canonicalAuthority: false,
      idempotentReplay: true,
      independentReadback: true,
    },
    writesPerformed: true,
  };
  const receiptDirectory = path.join(ROOT, '.tmp', 'atlas');
  fs.mkdirSync(receiptDirectory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '');
  const receiptPath = path.join(receiptDirectory, `feature-label-batch-scratch-v1-${stamp}.json`);
  fs.writeFileSync(receiptPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, receiptPath: path.relative(ROOT, receiptPath).replaceAll('\\', '/') }, null, 2));
} catch (error) {
  if (client._connected) await client.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({
    schema: 'atlas.feature-label-batch-scratch.v1',
    status: 'SCRATCH_BATCH_LOAD_FAILED',
    targetDatabase: TARGET_DB,
    writesPerformed: false,
    error: error.code ?? error.message,
  }, null, 2));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
