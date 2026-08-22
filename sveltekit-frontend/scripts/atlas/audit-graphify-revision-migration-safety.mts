#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const MIGRATION = path.resolve(
  FRONTEND,
  process.env.ATLAS_GRAPHIFY_REVISION_MIGRATION
    ?? 'drizzle/manual/20260822_graphify_revision_authority_v2.sql',
);

const sql = await readFile(MIGRATION, 'utf8');

// Strip SQL line comments so the migration can explicitly document forbidden
// operations without making the scanner flag its own safety contract.
const executable = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const forbidden = [
  ['DROP_TABLE', /\bDROP\s+TABLE\b/i],
  ['DROP_COLUMN', /\bDROP\s+COLUMN\b/i],
  ['DROP_CONSTRAINT', /\bDROP\s+CONSTRAINT\b/i],
  ['DROP_INDEX', /\bDROP\s+INDEX\b/i],
  ['DELETE_FROM', /\bDELETE\s+FROM\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['UPDATE', /\bUPDATE\s+[A-Za-z_".]/i],
  ['ON_DELETE_CASCADE', /\bON\s+DELETE\s+CASCADE\b/i],
  ['ALTER_COLUMN_TYPE', /\bALTER\s+COLUMN\b[\s\S]{0,120}\bTYPE\b/i],
] as const;

const findings = forbidden
  .filter(([, pattern]) => pattern.test(executable))
  .map(([code]) => code);

const required = {
  transactionWrapped: /\bBEGIN\s*;/i.test(executable) && /\bCOMMIT\s*;/i.test(executable),
  graphifyRunsCreateIfMissing: /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.graphify_runs/i.test(executable),
  graphifyFilesCreateIfMissing: /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.graphify_files/i.test(executable),
  workspaceRevisionAdditive: /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+workspace_revision\s+text/i.test(executable),
  sourceManifestDigestAdditive: /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+source_manifest_digest\s+text/i.test(executable),
  codeSourceRevisionAdditive: /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+code_source_revision\s+text/i.test(executable),
  checksAreNotValid: /ADD\s+CONSTRAINT[\s\S]*?CHECK[\s\S]*?NOT\s+VALID/i.test(executable),
  newForeignKeysRestrictDeletion: !/REFERENCES\s+public\.graphify_runs\(run_id\)(?![\s\S]{0,40}ON\s+DELETE\s+RESTRICT)/i.test(executable),
};

const missingRequired = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);

const additiveOnly = findings.length === 0 && missingRequired.length === 0;
const report = {
  schema: 'atlas.graphify-revision-migration-safety.v1',
  status: additiveOnly
    ? 'GRAPHIFY_REVISION_MIGRATION_ADDITIVE_ONLY_PROVEN'
    : 'GRAPHIFY_REVISION_MIGRATION_UNSAFE_OR_INCOMPLETE',
  migration: path.relative(FRONTEND, MIGRATION).replaceAll('\\', '/'),
  readOnly: true,
  databaseConnected: false,
  canonicalWriteAttempted: false,
  destructiveFindings: findings,
  required,
  missingRequired,
  fanoutMayConsumeAsCanonical: false,
};

console.log(JSON.stringify(report, null, 2));
if (!additiveOnly) process.exitCode = 3;
