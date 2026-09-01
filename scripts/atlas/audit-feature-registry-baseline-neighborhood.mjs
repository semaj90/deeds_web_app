#!/usr/bin/env node

/**
 * MMR-BASELINE-01 — read-only census for the journaled feature_registry neighborhood.
 *
 * Purpose:
 * - explain how much of 0024_nebulous_mongoose + 0025_yellow_tony_stark
 *   appears in the live PostgreSQL catalog;
 * - distinguish complete, partial, absent, and shape-drift states;
 * - inspect migration-ledger presence without changing it.
 *
 * Safety:
 * - opens a READ ONLY transaction;
 * - queries pg_catalog/information_schema only;
 * - never CREATE/ALTER/INSERT/UPDATE/DELETEs;
 * - never registers or repairs migration-ledger rows.
 *
 * Usage:
 *   node scripts/atlas/audit-feature-registry-baseline-neighborhood.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Client } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const frontendRoot = resolve(repoRoot, 'sveltekit-frontend');
const migration0024Path = resolve(frontendRoot, 'drizzle', '0024_nebulous_mongoose.sql');
const migration0025Path = resolve(frontendRoot, 'drizzle', '0025_yellow_tony_stark.sql');
const reportPath = resolve(repoRoot, 'docs', 'reports', 'feature-registry-baseline-neighborhood-v1.json');

const env = loadRepoEnv(process.env);
const databaseUrl = resolveDatabaseUrl(env);

const expectedFeatureRegistryColumns = [
  'id',
  'feature_key',
  'title',
  'description',
  'status',
  'summary',
  'source_refs',
  'chunk_ids',
  'tags',
  'code_refs',
  'test_refs',
  'retry_queries',
  'cluster_id',
  'trust_tier',
  'last_verified_at',
];

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function splitStatements(sql) {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function extractCreateTableNames(sql) {
  const names = [];
  for (const statement of splitStatements(sql)) {
    const match = statement.match(/^CREATE TABLE\s+"([^"]+)"\s*\(/i);
    if (match) names.push(match[1]);
  }
  return [...new Set(names)];
}

function extractCreateIndexNames(sql) {
  const names = [];
  for (const statement of splitStatements(sql)) {
    const match = statement.match(/^CREATE(?: UNIQUE)? INDEX\s+"([^"]+)"/i);
    if (match) names.push(match[1]);
  }
  return [...new Set(names)];
}

function expectedColumnsForTable(sql, tableName) {
  const statement = splitStatements(sql).find((candidate) =>
    new RegExp(`^CREATE TABLE\\s+"${tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\(`, 'i').test(candidate)
  );
  if (!statement) return [];

  const columns = [];
  for (const line of statement.split(/\r?\n/).slice(1)) {
    const match = line.trim().match(/^"([^"]+)"\s+/);
    if (match) columns.push(match[1]);
  }
  return columns;
}

async function getTableColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows.map((row) => row.column_name);
}

async function getTableRowEstimate(client, tableName) {
  const result = await client.query(
    `SELECT c.reltuples::bigint AS estimate
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind IN ('r', 'p')`,
    [tableName]
  );
  return result.rows[0]?.estimate ?? null;
}

async function getIndexDefinition(client, indexName) {
  const result = await client.query(
    `SELECT indexdef
       FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = $1`,
    [indexName]
  );
  return result.rows[0]?.indexdef ?? null;
}

async function inspectLedger(client, qualifiedName) {
  const [schemaName, tableName] = qualifiedName.split('.');
  const existsResult = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [schemaName, tableName]
  );

  const exists = Boolean(existsResult.rows[0]?.exists);
  if (!exists) return { qualifiedName, exists: false, count: null };

  // Identifier is selected from a fixed internal allow-list only.
  const countResult = await client.query(`SELECT count(*)::int AS count FROM "${schemaName}"."${tableName}"`);
  return { qualifiedName, exists: true, count: countResult.rows[0]?.count ?? null };
}

function classifyObject({ exists, expectedColumns, actualColumns }) {
  if (!exists) return 'ABSENT';
  const missing = expectedColumns.filter((column) => !actualColumns.includes(column));
  const extra = actualColumns.filter((column) => !expectedColumns.includes(column));
  if (missing.length === 0 && extra.length === 0) return 'EXACT_SHAPE_PRESENT';
  if (missing.length === 0) return 'EXPECTED_COLUMNS_PRESENT_WITH_EXTRAS';
  return 'SHAPE_DRIFT';
}

function classifyNeighborhood(tableAudits, ledgerAudits) {
  const states = tableAudits.map((entry) => entry.classification);
  const present = states.filter((state) => state !== 'ABSENT').length;
  const exactish = states.filter((state) =>
    state === 'EXACT_SHAPE_PRESENT' || state === 'EXPECTED_COLUMNS_PRESENT_WITH_EXTRAS'
  ).length;
  const drift = states.filter((state) => state === 'SHAPE_DRIFT').length;
  const ledgerRows = ledgerAudits.reduce((sum, entry) => sum + (entry.count ?? 0), 0);

  if (present === 0) {
    return {
      classification: 'NOT_APPLIED_CANDIDATE',
      confidence: 'MEDIUM',
      reason: 'None of the tables created by 0024 are present under their journaled names. This cannot prove they were never applied and later removed, so the result remains a candidate classification.',
    };
  }

  if (present === tableAudits.length && exactish === tableAudits.length && ledgerRows === 0) {
    return {
      classification: 'APPLIED_OUTSIDE_LEDGER_CANDIDATE',
      confidence: 'MEDIUM',
      reason: 'All 0024-created tables are present with expected columns but no inspected migration ledger rows exist. Catalog parity alone does not prove which process created them.',
    };
  }

  if (drift > 0) {
    return {
      classification: 'PARTIAL_OR_SUPERSEDED_WITH_SHAPE_DRIFT',
      confidence: 'HIGH_FOR_CURRENT_STATE_ONLY',
      reason: 'At least one journaled table name exists with a shape that does not match the migration-era expected columns.',
    };
  }

  return {
    classification: 'PARTIAL_OR_SUPERSEDED_CANDIDATE',
    confidence: 'HIGH_FOR_CURRENT_STATE_ONLY',
    reason: 'Only part of the 0024 object neighborhood is present. This is compatible with partial manual application, later replacement, or supersession; the catalog alone cannot choose among them.',
  };
}

const migration0024 = readFileSync(migration0024Path, 'utf8');
const migration0025 = readFileSync(migration0025Path, 'utf8');
const createTables = extractCreateTableNames(migration0024);
const createIndexes = extractCreateIndexNames(migration0024);

if (!createTables.includes('feature_registry')) {
  throw new Error('FEATURE_REGISTRY_NOT_FOUND_IN_0024');
}

const client = new Client({ connectionString: databaseUrl });
const startedAt = new Date().toISOString();

try {
  await client.connect();
  await client.query('BEGIN READ ONLY');

  const identity = await client.query(
    `SELECT current_database() AS database_name,
            current_setting('server_version') AS server_version,
            current_user AS database_user`
  );

  const tableAudits = [];
  for (const tableName of createTables) {
    let expectedColumns = expectedColumnsForTable(migration0024, tableName);
    if (tableName === 'feature_registry') {
      // 0025 completes the feature_registry shape to the current Drizzle contract.
      expectedColumns = expectedFeatureRegistryColumns;
    }

    const actualColumns = await getTableColumns(client, tableName);
    const exists = actualColumns.length > 0;
    const missingColumns = expectedColumns.filter((column) => !actualColumns.includes(column));
    const extraColumns = actualColumns.filter((column) => !expectedColumns.includes(column));

    tableAudits.push({
      tableName,
      exists,
      expectedColumns,
      actualColumns,
      missingColumns,
      extraColumns,
      rowEstimate: exists ? await getTableRowEstimate(client, tableName) : null,
      classification: classifyObject({ exists, expectedColumns, actualColumns }),
    });
  }

  const indexAudits = [];
  for (const indexName of createIndexes) {
    const indexdef = await getIndexDefinition(client, indexName);
    indexAudits.push({ indexName, exists: Boolean(indexdef), indexdef });
  }

  const ledgerAllowList = [
    'drizzle.__drizzle_migrations',
    'public.__drizzle_migrations',
    'public.drizzle_migrations',
  ];
  const ledgerAudits = [];
  for (const qualifiedName of ledgerAllowList) {
    ledgerAudits.push(await inspectLedger(client, qualifiedName));
  }

  const neighborhood = classifyNeighborhood(tableAudits, ledgerAudits);
  const featureRegistry = tableAudits.find((entry) => entry.tableName === 'feature_registry');

  const report = {
    schema: 'atlas.feature-registry-baseline-neighborhood.v1',
    status: 'READ_ONLY_CENSUS_COMPLETE',
    startedAt,
    completedAt: new Date().toISOString(),
    safety: {
      transactionMode: 'READ ONLY',
      databaseMutationAttempted: false,
      migrationLedgerMutationAttempted: false,
      ddlExecuted: false,
      dmlExecuted: false,
    },
    database: identity.rows[0],
    sources: {
      migration0024: 'sveltekit-frontend/drizzle/0024_nebulous_mongoose.sql',
      migration0024Sha256: sha256(migration0024),
      migration0025: 'sveltekit-frontend/drizzle/0025_yellow_tony_stark.sql',
      migration0025Sha256: sha256(migration0025),
      currentOwner: 'sveltekit-frontend/src/lib/server/db/schema/feature-registry.ts',
    },
    migrationNeighborhood: {
      journaledTables: createTables,
      journaledIndexes: createIndexes,
      tables: tableAudits,
      indexes: indexAudits,
      ledgers: ledgerAudits,
      classification: neighborhood,
    },
    featureRegistry: {
      ...featureRegistry,
      shapeOwnerReconciled: true,
      historicalChain: ['0024_nebulous_mongoose', '0025_yellow_tony_stark'],
    },
    decisions: {
      authorizeGlobalDrizzleMigrate: false,
      authorizeLedgerRepair: false,
      authorizeLiveFeatureRegistryApply: false,
      authorizeNewCompetingFeatureRegistryMigration: false,
      nextGate: 'Use this census plus the disposable PostgreSQL proof to produce an explicit scoped baseline-admission decision. Do not infer historical causality from catalog parity alone.',
    },
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    database: report.database.database_name,
    neighborhood: neighborhood.classification,
    featureRegistry: featureRegistry?.classification ?? 'UNKNOWN',
    reportPath,
  }, null, 2));

  await client.query('ROLLBACK');
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Ignore rollback failure when connection setup itself failed.
  }
  throw error;
} finally {
  await client.end().catch(() => undefined);
}
