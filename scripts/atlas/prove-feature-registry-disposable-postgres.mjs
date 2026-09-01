#!/usr/bin/env node

/**
 * Prove the historical feature_registry migration chain in a disposable PostgreSQL 18 container.
 *
 * Safety properties:
 * - never reads DATABASE_URL;
 * - never connects to legal_ai_db;
 * - creates an ephemeral container with no volume and no published host port;
 * - extracts only feature_registry DDL from the historical migrations;
 * - performs insert/readback inside a transaction and rolls it back;
 * - removes the proof container in finally unless --keep-container is supplied.
 *
 * Historical ownership under proof:
 *   drizzle/0024_nebulous_mongoose.sql  -> CREATE TABLE feature_registry
 *   drizzle/0025_yellow_tony_stark.sql  -> ADD summary/chunk_ids/tags/retry_queries
 *
 * Usage:
 *   node scripts/atlas/prove-feature-registry-disposable-postgres.mjs
 *   node scripts/atlas/prove-feature-registry-disposable-postgres.mjs --image postgres:18
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const frontendRoot = resolve(repoRoot, 'sveltekit-frontend');
const migration0024Path = resolve(frontendRoot, 'drizzle', '0024_nebulous_mongoose.sql');
const migration0025Path = resolve(frontendRoot, 'drizzle', '0025_yellow_tony_stark.sql');
const reportPath = resolve(repoRoot, 'docs', 'reports', 'feature-registry-disposable-postgres-proof-v1.json');

const imageArgIndex = process.argv.indexOf('--image');
const image = imageArgIndex >= 0 && process.argv[imageArgIndex + 1]
  ? process.argv[imageArgIndex + 1]
  : 'postgres:18';
const keepContainer = process.argv.includes('--keep-container');

const suffix = `${process.pid}-${Date.now().toString(36)}`;
const containerName = `atlas-feature-registry-proof-${suffix}`;
const database = 'atlas_feature_registry_proof';
const user = 'atlas_proof';
const password = `atlas-proof-${suffix}`;

if (containerName === 'legal-ai-postgres' || database === 'legal_ai_db') {
  throw new Error('PROOF_TARGET_SAFETY_VIOLATION');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
    input: options.input,
    env: options.env ?? process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}${stderr ? `: ${stderr}` : ''}`);
  }
  return result.stdout ?? '';
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function psql(sql, { capture = true } = {}) {
  return docker([
    'exec', '-i', containerName,
    'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database,
    ...(capture ? ['-A', '-t'] : []),
  ], { input: sql, capture });
}

function splitStatements(sql) {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function loadScopedHistoricalDdl() {
  const migration0024 = readFileSync(migration0024Path, 'utf8');
  const migration0025 = readFileSync(migration0025Path, 'utf8');

  const baseMatches = splitStatements(migration0024).filter((statement) =>
    /^CREATE TABLE\s+"feature_registry"\s*\(/i.test(statement)
  );
  if (baseMatches.length !== 1) {
    throw new Error(`FEATURE_REGISTRY_BASE_DDL_COUNT_MISMATCH:${baseMatches.length}`);
  }

  const alters = splitStatements(migration0025);
  if (alters.length !== 4 || alters.some((statement) => !/^ALTER TABLE\s+"feature_registry"\s+ADD COLUMN/i.test(statement))) {
    throw new Error('FEATURE_REGISTRY_ALTER_DDL_UNEXPECTED');
  }

  return {
    base: baseMatches[0],
    alters,
    scopedSql: `${baseMatches[0]};\n${alters.map((statement) => `${statement};`).join('\n')}`,
    sourceChecksums: {
      migration0024: sha256(migration0024),
      migration0025: sha256(migration0025),
      scopedDdl: sha256(`${baseMatches[0]};\n${alters.map((statement) => `${statement};`).join('\n')}`),
    },
  };
}

const expectedColumns = [
  ['id', 'uuid', 'NO'],
  ['feature_key', 'text', 'NO'],
  ['title', 'text', 'NO'],
  ['description', 'text', 'YES'],
  ['status', 'text', 'NO'],
  ['summary', 'text', 'YES'],
  ['source_refs', 'jsonb', 'NO'],
  ['chunk_ids', 'jsonb', 'NO'],
  ['tags', 'jsonb', 'NO'],
  ['code_refs', 'jsonb', 'NO'],
  ['test_refs', 'jsonb', 'NO'],
  ['retry_queries', 'jsonb', 'NO'],
  ['cluster_id', 'integer', 'YES'],
  ['trust_tier', 'text', 'YES'],
  ['last_verified_at', 'timestamp with time zone', 'YES'],
];

function parseRows(output) {
  return output
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('|'));
}

function assertColumns() {
  const sql = `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'feature_registry'
    ORDER BY ordinal_position;
  `;
  const actual = parseRows(psql(sql));
  const same = JSON.stringify(actual) === JSON.stringify(expectedColumns);
  if (!same) {
    throw new Error(`FEATURE_REGISTRY_COLUMN_MISMATCH:${JSON.stringify({ expected: expectedColumns, actual })}`);
  }
  return actual;
}

function assertIndexes() {
  const rows = parseRows(psql(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'feature_registry'
    ORDER BY indexname;
  `));

  const names = rows.map(([name]) => name);
  for (const required of ['feature_registry_feature_key_unique', 'feature_registry_pkey']) {
    if (!names.includes(required)) {
      throw new Error(`FEATURE_REGISTRY_INDEX_MISSING:${required}`);
    }
  }
  return rows;
}

function proveReadbackRollback() {
  const featureKey = `proof-${suffix}`;
  const output = psql(`
    BEGIN;
    INSERT INTO feature_registry (
      feature_key, title, description, status, summary,
      source_refs, chunk_ids, tags, code_refs, test_refs, retry_queries,
      cluster_id, trust_tier
    ) VALUES (
      '${featureKey}', 'Disposable proof', 'ephemeral row', 'implemented', 'rollback proof',
      '["src/proof.ts"]'::jsonb, '["chunk:proof"]'::jsonb, '["proof"]'::jsonb,
      '["src/proof.ts"]'::jsonb, '["proof.spec.ts"]'::jsonb, '["retry proof"]'::jsonb,
      7, 'proof'
    );
    SELECT 'READBACK|' || feature_key || '|' || status || '|' || trust_tier
    FROM feature_registry WHERE feature_key = '${featureKey}';
    ROLLBACK;
    SELECT 'RESIDUE|' || count(*)::text
    FROM feature_registry WHERE feature_key = '${featureKey}';
  `);

  const lines = output.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const readback = lines.find((line) => line.startsWith('READBACK|'));
  const residue = lines.find((line) => line.startsWith('RESIDUE|'));
  if (readback !== `READBACK|${featureKey}|implemented|proof`) {
    throw new Error(`FEATURE_REGISTRY_READBACK_FAILED:${readback ?? 'missing'}`);
  }
  if (residue !== 'RESIDUE|0') {
    throw new Error(`FEATURE_REGISTRY_ROLLBACK_FAILED:${residue ?? 'missing'}`);
  }
  return { readback, residue };
}

function waitForPostgres() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = spawnSync('docker', [
      'exec', containerName, 'pg_isready', '-U', user, '-d', database,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0) return attempt;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error('DISPOSABLE_POSTGRES_NOT_READY');
}

let created = false;
const startedAt = new Date().toISOString();

try {
  const historical = loadScopedHistoricalDdl();

  docker([
    'run', '-d', '--name', containerName,
    '--label', 'parent-atlas-purpose=feature-registry-disposable-proof',
    '-e', `POSTGRES_USER=${user}`,
    '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', `POSTGRES_DB=${database}`,
    image,
  ], { capture: true });
  created = true;

  const readinessAttempts = waitForPostgres();
  psql(historical.scopedSql, { capture: false });

  const columns = assertColumns();
  const indexes = assertIndexes();
  const transactionProof = proveReadbackRollback();
  const postgresVersion = psql('SHOW server_version;').trim();

  const report = {
    schema: 'atlas.feature-registry-disposable-postgres-proof.v1',
    status: 'DISPOSABLE_POSTGRES_PROVEN',
    startedAt,
    completedAt: new Date().toISOString(),
    safety: {
      disposableContainer: true,
      dockerVolumeAttached: false,
      hostPortPublished: false,
      databaseUrlRead: false,
      liveDatabaseTargeted: false,
      productionWrites: false,
      transactionRolledBack: true,
      containerRemovedByDefault: !keepContainer,
    },
    runtime: {
      image,
      postgresVersion,
      readinessAttempts,
      proofDatabase: database,
    },
    ownership: {
      drizzleSchema: 'sveltekit-frontend/src/lib/server/db/schema/feature-registry.ts',
      baseMigration: 'sveltekit-frontend/drizzle/0024_nebulous_mongoose.sql',
      additiveMigration: 'sveltekit-frontend/drizzle/0025_yellow_tony_stark.sql',
      conclusion: '0024+0025 together match the current feature_registry Drizzle shape; no new shape migration is required solely to add summary/chunk_ids/tags/retry_queries.',
    },
    sourceChecksums: historical.sourceChecksums,
    verification: {
      columns,
      indexes,
      transactionProof,
    },
    remainingBlocker: 'Live migration-ledger/baseline reconciliation remains required before any local feature_registry apply. This proof does not authorize drizzle-kit migrate.',
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, reportPath, postgresVersion }, null, 2));
} finally {
  if (created && !keepContainer) {
    spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8', stdio: 'ignore' });
  }
}
