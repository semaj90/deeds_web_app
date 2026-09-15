#!/usr/bin/env node

/**
 * PACKET-CHUNK-LINEAGE-MIGRATION-OWNER-01
 *
 * Read-only ownership audit for the manual packet/chunk lineage migration.
 * This script does NOT register, apply, repair, backfill, or roll back a
 * migration. It answers a narrower question: who owns the migration, is the
 * live relation present, are prerequisites/callers consistent with that owner,
 * and what proof must close before an operator may authorize apply.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const migrationRelativePath = 'sveltekit-frontend/drizzle/manual/20260901_atlas_packet_chunk_lineage.sql';
const sidecarRelativePath = 'sveltekit-frontend/drizzle/sidecar-migrations.json';
const journalRelativePath = 'sveltekit-frontend/drizzle/meta/_journal.json';
const migrationInventoryRelativePath = 'docs/reports/migration-inventory-classification-v1.json';
const deploymentRelativePath = 'docs/reports/current-packet-chunk-lineage-deployment-v1.json';
const historicalProofRelativePath = 'docs/reports/workstation-lineage-resume-01-results.json';
const reportRelativePath = 'docs/reports/packet-chunk-lineage-migration-owner-v1.json';

const migrationPath = path.join(root, migrationRelativePath);
const sidecarPath = path.join(root, sidecarRelativePath);
const journalPath = path.join(root, journalRelativePath);
const migrationInventoryPath = path.join(root, migrationInventoryRelativePath);
const deploymentPath = path.join(root, deploymentRelativePath);
const historicalProofPath = path.join(root, historicalProofRelativePath);
const reportPath = path.join(root, reportRelativePath);

const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileSha256 = (filePath) => fs.existsSync(filePath) ? sha256(fs.readFileSync(filePath)) : null;
const readJson = (filePath) => {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
};
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

function collectObjectsContaining(value, needle, pathParts = [], output = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectObjectsContaining(child, needle, [...pathParts, String(index)], output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const serialized = JSON.stringify(value);
  if (serialized.includes(needle)) output.push({ jsonPath: pathParts.join('.'), value });
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') collectObjectsContaining(child, needle, [...pathParts, key], output);
  }
  return output;
}

function classifyCaller(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized === migrationRelativePath) return 'MIGRATION_DEFINITION';
  if (/packet-chunk-lineage-canary|register-orphaned-chunks|packet-chunk-membership-v1/.test(normalized)) return 'WRITER_OR_WRITE_CONTRACT';
  if (/export-current-source-chunk-cohort|audit-current-semantic-corpus|audit-chunk-retrieval-profile-live-readback/.test(normalized)) return 'CURRENT_READ_CONSUMER';
  if (/audit-|prove-|plan-|freeze-|backfill-dry|recon/.test(normalized)) return 'AUDIT_OR_PROOF';
  if (/tasks\.md$|docs\/reports|workstation.*todo/.test(normalized)) return 'LEDGER_OR_REPORT';
  if (/\.sql$/.test(normalized)) return 'SQL_ADJACENT';
  return 'OTHER_REFERENCE';
}

function walkFiles(basePath, output = []) {
  if (!fs.existsSync(basePath)) return output;
  for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.svelte-kit' || entry.name === 'dist' || entry.name === 'build' || entry.name === 'coverage') continue;
    const absolute = path.join(basePath, entry.name);
    if (entry.isDirectory()) walkFiles(absolute, output);
    else output.push(absolute);
  }
  return output;
}

function callerCensus() {
  const roots = [
    path.join(root, 'scripts/atlas'),
    path.join(root, 'sveltekit-frontend/scripts/atlas'),
    path.join(root, 'sveltekit-frontend/src/lib/server/atlas'),
    path.join(root, 'openspec/changes'),
  ];
  const candidates = roots.flatMap((base) => walkFiles(base));
  const allowed = /\.(?:mjs|mts|js|ts|sql|md|json)$/i;
  const rows = [];
  for (const filePath of candidates) {
    if (!allowed.test(filePath)) continue;
    let body;
    try { body = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
    if (!body.includes('atlas_packet_chunk_lineage')) continue;
    const relativePath = path.relative(root, filePath).replaceAll('\\', '/');
    rows.push({ path: relativePath, classification: classifyCaller(relativePath) });
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  const countsByClassification = Object.fromEntries(
    [...new Set(rows.map((row) => row.classification))].sort().map((classification) => [
      classification,
      rows.filter((row) => row.classification === classification).length,
    ]),
  );
  return { rows, countsByClassification };
}

const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';
const migrationChecksum = migrationSql ? `sha256:${sha256(migrationSql)}` : null;
const sidecarManifest = readJson(sidecarPath);
const journal = readJson(journalPath);
const migrationInventory = readJson(migrationInventoryPath);
const deploymentReceipt = readJson(deploymentPath);
const historicalProof = readJson(historicalProofPath);

const sidecarEntries = Array.isArray(sidecarManifest?.sidecars) ? sidecarManifest.sidecars : [];
const sidecarEntry = sidecarEntries.find((entry) => text(entry?.file).replaceAll('\\', '/') === 'manual/20260901_atlas_packet_chunk_lineage.sql') ?? null;
const journalEntries = Array.isArray(journal?.entries) ? journal.entries : [];
const journalMatches = journalEntries.filter((entry) => /packet.*chunk.*lineage|20260901/i.test(`${entry?.tag ?? ''}`));
const inventoryMatches = migrationInventory ? collectObjectsContaining(migrationInventory, '20260901_atlas_packet_chunk_lineage.sql') : [];
const historicalProofMatches = historicalProof ? collectObjectsContaining(historicalProof, '20260901_atlas_packet_chunk_lineage.sql') : [];
const callers = callerCensus();

const expectedColumns = [
  'id',
  'packet_key',
  'canonical_chunk_id',
  'chunk_row_id',
  'source_ref',
  'source_namespace',
  'source_revision',
  'membership_status',
  'revision_status',
  'chunk_ordinal',
  'lineage_producer_revision',
  'evidence_refs',
  'created_at',
];
const expectedConstraints = [
  'atlas_pcl_membership_status_check',
  'atlas_pcl_revision_status_check',
  'atlas_pcl_revision_consistency_check',
  'atlas_pcl_membership_unique',
];
const expectedIndexes = [
  'idx_atlas_pcl_packet_key',
  'idx_atlas_pcl_canonical_chunk_id',
  'idx_atlas_pcl_source_ref',
  'idx_atlas_pcl_revision_status',
];

const staticSqlContract = {
  createTablePresent: /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+atlas_packet_chunk_lineage/i.test(migrationSql),
  uniquePacketChunkPresent: /UNIQUE\s*\(\s*packet_key\s*,\s*canonical_chunk_id\s*\)/i.test(migrationSql),
  provenRevisionConsistencyPresent: /revision_status\s*=\s*'PROVEN'[\s\S]*source_revision\s+IS\s+NOT\s+NULL/i.test(migrationSql),
  inferredIdentityWarningPresent: /Never randomUUID\(\)|nearest-match|must originate from an existing/i.test(migrationSql),
  transactionWrapped: /\bBEGIN\s*;/i.test(migrationSql) && /\bCOMMIT\s*;/i.test(migrationSql),
  sourceRevisionCompositeIndexPresent: /\(\s*source_ref\s*,\s*source_revision\s*\)/i.test(migrationSql),
};

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 60000,
  application_name: 'atlas-packet-chunk-lineage-migration-owner-v1',
});

let pgSnapshot = null;
let live = {
  relationPresent: false,
  columns: [],
  constraints: [],
  indexes: [],
  rowCount: null,
  provenRowCount: null,
  prerequisites: {},
  drizzleLedger: { relationPresent: false, rowCount: null, maxId: null },
};
let databaseError = null;

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    pgSnapshot = (await client.query('SELECT pg_current_snapshot()::text AS snapshot')).rows[0]?.snapshot ?? null;

    const prerequisiteNames = [
      'atlas_packets',
      'codebase_chunk_index',
      'graphify_files',
      'atlas_workspace_source_bindings',
    ];
    for (const name of prerequisiteNames) {
      live.prerequisites[name] = Boolean((await client.query(
        `SELECT to_regclass($1::text) IS NOT NULL AS present`,
        [`public.${name}`],
      )).rows[0]?.present);
    }

    live.relationPresent = Boolean((await client.query(
      `SELECT to_regclass('public.atlas_packet_chunk_lineage') IS NOT NULL AS present`,
    )).rows[0]?.present);

    if (live.relationPresent) {
      live.columns = (await client.query(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='atlas_packet_chunk_lineage'
          ORDER BY ordinal_position`,
      )).rows;
      live.constraints = (await client.query(
        `SELECT conname, contype, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
          WHERE conrelid='public.atlas_packet_chunk_lineage'::regclass
          ORDER BY conname`,
      )).rows;
      live.indexes = (await client.query(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname='public' AND tablename='atlas_packet_chunk_lineage'
          ORDER BY indexname`,
      )).rows;
      const counts = (await client.query(
        `SELECT count(*)::bigint AS rows,
                count(*) FILTER (WHERE revision_status='PROVEN')::bigint AS proven_rows
           FROM public.atlas_packet_chunk_lineage`,
      )).rows[0];
      live.rowCount = Number(counts?.rows ?? 0);
      live.provenRowCount = Number(counts?.proven_rows ?? 0);
    }

    live.drizzleLedger.relationPresent = Boolean((await client.query(
      `SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`,
    )).rows[0]?.present);
    if (live.drizzleLedger.relationPresent) {
      const ledger = (await client.query(
        `SELECT count(*)::bigint AS rows, max(id)::bigint AS max_id FROM drizzle.__drizzle_migrations`,
      )).rows[0];
      live.drizzleLedger.rowCount = Number(ledger?.rows ?? 0);
      live.drizzleLedger.maxId = ledger?.max_id == null ? null : Number(ledger.max_id);
    }

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const liveColumnNames = new Set(live.columns.map((row) => text(row.column_name)));
const liveConstraintNames = new Set(live.constraints.map((row) => text(row.conname)));
const liveIndexNames = new Set(live.indexes.map((row) => text(row.indexname)));
const liveShape = {
  missingColumns: expectedColumns.filter((name) => !liveColumnNames.has(name)),
  missingConstraints: expectedConstraints.filter((name) => !liveConstraintNames.has(name)),
  missingIndexes: expectedIndexes.filter((name) => !liveIndexNames.has(name)),
};
const prerequisitesPresent = Object.values(live.prerequisites).every(Boolean);
const writerContractPresent = fs.existsSync(path.join(root, 'sveltekit-frontend/src/lib/server/atlas/lineage/packet-chunk-membership-v1.ts'));
const dryCanaryPresent = fs.existsSync(path.join(root, 'sveltekit-frontend/scripts/atlas/packet-chunk-lineage-canary-01.mts'));
const deploymentSaysAbsent = deploymentReceipt?.status === 'LINEAGE_TABLE_NOT_DEPLOYED' || deploymentReceipt?.liveRelation?.present === false;

const historicalProofCurrentChecksumKnown = historicalProofMatches.some(({ value }) => {
  const serialized = JSON.stringify(value);
  return serialized.includes(migrationChecksum ?? '__NO_CHECKSUM__');
});
const historicalProofClaimsApply = historicalProofMatches.some(({ value }) => /applied identically|applied live|CREATE TABLE\/INDEX IF NOT EXISTS/i.test(JSON.stringify(value)));

let ownerClassification = 'UNRESOLVED';
if (migrationSql && journalMatches.length === 0 && !sidecarEntry) ownerClassification = 'MANUAL_SIDECAR_OWNER_CANDIDATE_UNREGISTERED';
else if (sidecarEntry && ['planned_sidecar', 'manual_sidecar'].includes(text(sidecarEntry.status))) ownerClassification = 'MANUAL_SIDECAR_OWNER_REGISTERED_UNAPPLIED';
else if (sidecarEntry && text(sidecarEntry.status) === 'applied') ownerClassification = 'MANUAL_SIDECAR_OWNER_REGISTERED_APPLIED';
else if (journalMatches.length > 0) ownerClassification = 'JOURNAL_OWNER_CONFLICT_REVIEW';

const blockers = [];
if (!migrationSql) blockers.push('MIGRATION_SQL_MISSING');
if (!prerequisitesPresent) blockers.push('PREREQUISITE_RELATION_MISSING');
if (!writerContractPresent) blockers.push('WRITER_CONTRACT_MISSING');
if (!dryCanaryPresent) blockers.push('CANARY_HARNESS_MISSING');
if (journalMatches.length > 0) blockers.push('JOURNAL_OWNER_CONFLICT');
if (!sidecarEntry) blockers.push('SIDECAR_MANIFEST_REGISTRATION_MISSING');
if (live.drizzleLedger.relationPresent && Number(live.drizzleLedger.rowCount ?? 0) === 0) blockers.push('LIVE_DRIZZLE_LEDGER_EMPTY');
if (historicalProofClaimsApply && !live.relationPresent) blockers.push('HISTORICAL_APPLY_PROOF_CONFLICTS_WITH_CURRENT_LIVE_SCHEMA');
if (historicalProofMatches.length > 0 && !historicalProofCurrentChecksumKnown) blockers.push('HISTORICAL_PROOF_NOT_BOUND_TO_CURRENT_SQL_CHECKSUM');
if (!live.relationPresent && deploymentReceipt && !deploymentSaysAbsent) blockers.push('DEPLOYMENT_RECEIPT_CONFLICT');

let status = 'MIGRATION_OWNER_REVIEW_REQUIRED';
let firstBlocker = blockers[0] ?? null;
let nextGate = 'PACKET-CHUNK-LINEAGE-MIGRATION-OWNER-01';
if (databaseError) {
  status = 'MIGRATION_OWNER_AUDIT_ERROR';
  firstBlocker = databaseError;
  nextGate = 'DATABASE_CONNECTIVITY_OR_CATALOG_RECHECK';
} else if (ownerClassification === 'MANUAL_SIDECAR_OWNER_CANDIDATE_UNREGISTERED') {
  status = 'MIGRATION_OWNER_CANDIDATE_PROVEN_REGISTRATION_MISSING';
  firstBlocker = 'SIDECAR_MANIFEST_REGISTRATION_MISSING';
  nextGate = 'PACKET-CHUNK-LINEAGE-SIDECAR-REGISTRATION-01';
} else if (ownerClassification === 'MANUAL_SIDECAR_OWNER_REGISTERED_UNAPPLIED' && !live.relationPresent) {
  status = 'MIGRATION_OWNER_REGISTERED_APPLY_STILL_GATED';
  firstBlocker = blockers.find((value) => value !== 'SIDECAR_MANIFEST_REGISTRATION_MISSING') ?? 'EXPLICIT_OPERATOR_APPLY_AUTHORIZATION_REQUIRED';
  nextGate = 'PACKET-CHUNK-LINEAGE-DISPOSABLE-MIGRATION-PROOF-02';
} else if (live.relationPresent && liveShape.missingColumns.length === 0 && liveShape.missingConstraints.length === 0 && liveShape.missingIndexes.length === 0) {
  status = 'LIVE_RELATION_SHAPE_ALIGNED_OWNER_RECONCILIATION_REQUIRED';
  firstBlocker = !sidecarEntry ? 'SIDECAR_MANIFEST_REGISTRATION_MISSING' : null;
  nextGate = 'CURRENT-EXECUTION-LINEAGE-CLOSURE-02';
}

const report = {
  schema: 'atlas.packet-chunk-lineage-migration-owner.v1',
  gate: 'PACKET-CHUNK-LINEAGE-MIGRATION-OWNER-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REPOSITORY_AND_LIVE_SCHEMA_AUDIT',
  status,
  firstBlocker,
  nextGate,
  ownerClassification,
  migration: {
    path: migrationRelativePath,
    present: Boolean(migrationSql),
    checksum: migrationChecksum,
    staticSqlContract,
    journalMatches,
    sidecarEntry,
    inventoryMatches,
  },
  live: {
    pgSnapshot,
    ...live,
    expectedShape: { expectedColumns, expectedConstraints, expectedIndexes },
    shapeDelta: liveShape,
  },
  callers,
  proofSurfaces: {
    writerContractPresent,
    writerContractPath: 'sveltekit-frontend/src/lib/server/atlas/lineage/packet-chunk-membership-v1.ts',
    dryCanaryPresent,
    dryCanaryPath: 'sveltekit-frontend/scripts/atlas/packet-chunk-lineage-canary-01.mts',
    deploymentReceiptPresent: Boolean(deploymentReceipt),
    deploymentReceiptStatus: deploymentReceipt?.status ?? null,
    historicalProofPresent: historicalProofMatches.length > 0,
    historicalProofClaimsApply,
    historicalProofBoundToCurrentSqlChecksum: historicalProofCurrentChecksumKnown,
  },
  blockers,
  policy: {
    migrationRegistrationAuthorized: false,
    migrationApplyAuthorized: false,
    lineageBackfillAuthorized: false,
    canaryApplyAuthorized: false,
    inferredLineageAuthorized: false,
    historicalRowsMayBeRewritten: false,
  },
  recommendedIndexAfterOwnerAndDisposableProof: staticSqlContract.sourceRevisionCompositeIndexPresent
    ? null
    : "CREATE INDEX ... ON atlas_packet_chunk_lineage (source_ref, source_revision) WHERE revision_status='PROVEN' -- proposal only; do not mutate the unresolved migration from this receipt",
  evidenceRefs: [
    migrationRelativePath,
    sidecarRelativePath,
    journalRelativePath,
    migrationInventoryRelativePath,
    deploymentRelativePath,
    historicalProofRelativePath,
    'sveltekit-frontend/src/lib/server/atlas/lineage/packet-chunk-membership-v1.ts',
    'sveltekit-frontend/scripts/atlas/packet-chunk-lineage-canary-01.mts',
  ],
  databaseError,
  writesPerformed: false,
};
report.reportChecksum = `sha256:${sha256(stableJson(report))}`;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tmp = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(tmp, reportPath);

console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  firstBlocker: report.firstBlocker,
  nextGate: report.nextGate,
  ownerClassification: report.ownerClassification,
  migrationChecksum: report.migration.checksum,
  liveRelationPresent: report.live.relationPresent,
  prerequisites: report.live.prerequisites,
  sidecarRegistered: Boolean(report.migration.sidecarEntry),
  journalMatches: report.migration.journalMatches.length,
  callerCounts: report.callers.countsByClassification,
  blockers: report.blockers,
  reportPath: reportRelativePath,
}, null, 2));

if (!['LIVE_RELATION_SHAPE_ALIGNED_OWNER_RECONCILIATION_REQUIRED'].includes(status)) process.exitCode = 3;
