#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '../..');
const migration = path.join(frontend, 'drizzle/manual/20260822_graphify_revision_authority_v2.sql');
const sql = await readFile(migration, 'utf8');

const stripped = sql
  .replace(/--.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'(?:''|[^'])*'/g, "''");

const forbidden = [
  /\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA|VIEW|TYPE|DATABASE)\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /\bUPDATE\s+[A-Za-z_][A-Za-z0-9_.]*\s+SET\b/i,
  /\bALTER\s+TABLE\b[\s\S]*?\bDROP\b/i,
  /\bRENAME\s+(?:TO|COLUMN)\b/i,
];

const violations = forbidden
  .map((pattern) => ({ pattern: String(pattern), match: stripped.match(pattern)?.[0] ?? null }))
  .filter((item) => item.match !== null);

const required = [
  'CREATE TABLE IF NOT EXISTS public.graphify_runs',
  'CREATE TABLE IF NOT EXISTS public.graphify_files',
  'CREATE TABLE IF NOT EXISTS public.graphify_workspace_revisions_v2',
  'CREATE TABLE IF NOT EXISTS public.graphify_source_revisions_v2',
  'ADD COLUMN IF NOT EXISTS workspace_revision',
  'ADD COLUMN IF NOT EXISTS source_manifest_digest',
  'ADD COLUMN IF NOT EXISTS code_source_revision',
];
const missingRequired = required.filter((needle) => !sql.includes(needle));

const receipt = {
  schema: 'atlas.graphify-revision-authority-migration-audit.v1',
  migration: 'drizzle/manual/20260822_graphify_revision_authority_v2.sql',
  status: violations.length === 0 && missingRequired.length === 0
    ? 'NON_DESTRUCTIVE_MIGRATION_STATICALLY_PROVEN'
    : 'MIGRATION_AUDIT_FAILED',
  destructiveStatementsFound: violations,
  missingRequiredAdditiveStatements: missingRequired,
  guarantees: {
    dropStatementsAllowed: false,
    deleteStatementsAllowed: false,
    truncateStatementsAllowed: false,
    updateStatementsAllowed: false,
    renameStatementsAllowed: false,
    legacyConstraintRemovalAllowed: false,
    additiveTablesExpected: true,
    additiveColumnsExpected: true,
  },
};

console.log(JSON.stringify(receipt, null, 2));
if (receipt.status !== 'NON_DESTRUCTIVE_MIGRATION_STATICALLY_PROVEN') process.exitCode = 1;
