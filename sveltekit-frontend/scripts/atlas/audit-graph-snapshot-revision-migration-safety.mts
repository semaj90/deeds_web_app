#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const migration = path.resolve(
  FRONTEND,
  process.env.ATLAS_GRAPH_SNAPSHOT_REVISION_MIGRATION ??
    'drizzle/manual/20260822_graph_snapshot_revision_owner_v1.sql',
);

const sql = await readFile(migration, 'utf8');
const executable = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const destructiveFindings = [
  ['DROP_TABLE', /\bDROP\s+TABLE\b/i],
  ['DROP_COLUMN', /\bDROP\s+COLUMN\b/i],
  ['DROP_CONSTRAINT', /\bDROP\s+CONSTRAINT\b/i],
  ['DROP_INDEX', /\bDROP\s+INDEX\b/i],
  ['DELETE_FROM', /\bDELETE\s+FROM\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['UPDATE', /\bUPDATE\s+[A-Za-z_".]/i],
  ['ALTER_COLUMN_TYPE', /\bALTER\s+COLUMN\b[\s\S]{0,120}\bTYPE\b/i],
] as const;

const findings = destructiveFindings
  .filter(([, pattern]) => pattern.test(executable))
  .map(([code]) => code);

const required = {
  transactionWrapped: /\bBEGIN\s*;/i.test(executable) && /\bCOMMIT\s*;/i.test(executable),
  snapshotRevisionColumns: [
    'workspace_revision',
    'source_inventory_revision',
    'graph_revision',
    'identity_contract_version',
    'parser_contract_version',
    'revision_checksum',
  ].every((column) =>
    new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${column}\\s+text`, 'i').test(executable),
  ),
  nodeSourceRevisionAdditive: /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+source_revision\s+text/i.test(executable),
  nullableChecks: /CHECK\s*\([\s\S]*?IS\s+NULL/i.test(executable),
  revisionIndexes: /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS[\s\S]*workspace_revision/i.test(executable),
};

const missingRequired = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);
const safe = findings.length === 0 && missingRequired.length === 0;

console.log(JSON.stringify({
  schema: 'atlas.graph-snapshot-revision-migration-safety.v1',
  status: safe
    ? 'GRAPH_SNAPSHOT_REVISION_MIGRATION_ADDITIVE_ONLY_PROVEN'
    : 'GRAPH_SNAPSHOT_REVISION_MIGRATION_UNSAFE_OR_INCOMPLETE',
  migration: path.relative(FRONTEND, migration).replaceAll('\\', '/'),
  readOnly: true,
  databaseConnected: false,
  canonicalWriteAttempted: false,
  destructiveFindings: findings,
  required,
  missingRequired,
  fanoutMayConsumeAsCanonical: false,
}, null, 2));

if (!safe) process.exitCode = 3;
