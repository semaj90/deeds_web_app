#!/usr/bin/env node

/** Verify revision lineage for the bounded exact source cohort; read-only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cohortPath = path.join(root, 'docs/reports/current-source-projection-cohort-v1.json');
const observationPath = path.join(root, 'docs/reports/workspace-source-binding-observation.json');
const reportPath = path.join(root, 'docs/reports/current-source-cohort-lineage-v1.json');
const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
const observation = JSON.parse(fs.readFileSync(observationPath, 'utf8'));
const currentWorkspaceRevision = observation.workspaceRevision
  ?? observation.workspace_revision
  ?? observation.record?.workspaceRevision
  ?? observation.record?.workspace_revision
  ?? null;
const rows = cohort.cohort ?? [];
const refs = rows.map((row) => String(row.relativePath ?? '').trim()).filter(Boolean);
const prefixedRefs = refs.map((ref) => ref.startsWith('sveltekit-frontend/') ? ref : `sveltekit-frontend/${ref}`);
const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 120000 });
let graphifyRows = [];
let error = null;
try {
  graphifyRows = (await pool.query(
    `select source_ref, content_hash, workspace_revision, code_source_revision, source_revision
     from public.graphify_files
     where source_ref = any($1::text[]) or source_ref = any($2::text[])
     order by source_ref`,
    [refs, prefixedRefs],
  )).rows;
} catch (err) {
  error = err instanceof Error ? err.message : String(err);
} finally {
  await pool.end();
}
const byRef = new Map();
for (const row of graphifyRows) {
  const key = String(row.source_ref ?? '').replaceAll('\\', '/').toLowerCase();
  const list = byRef.get(key) ?? [];
  list.push(row);
  byRef.set(key, list);
}
const resultRows = rows.map((row) => {
  const ref = String(row.relativePath ?? '').replaceAll('\\', '/').toLowerCase();
  const matches = [...(byRef.get(ref) ?? []), ...(byRef.get(`sveltekit-frontend/${ref}`) ?? [])];
  const unique = [...new Map(matches.map((match) => [JSON.stringify(match), match])).values()];
  const current = unique.filter((match) => match.workspace_revision === currentWorkspaceRevision && String(match.workspace_revision ?? '').startsWith('sha256:'));
  const expectedSourceRevision = String(row.sourceRevision ?? '').trim();
  const expectedContentHash = String(row.filesystemHash ?? '').trim().toLowerCase().replace(/^sha256:/, '');
  const qualified = unique.filter((match) => {
    const actualRevision = String(match.code_source_revision ?? match.source_revision ?? '').trim();
    const actualHash = String(match.content_hash ?? '').trim().toLowerCase().replace(/^sha256:/, '');
    return Boolean(actualRevision)
      && (!expectedSourceRevision || actualRevision === expectedSourceRevision)
      && (!expectedContentHash || actualHash === expectedContentHash);
  });
  const workspaceQualified = qualified.filter((match) => match.workspace_revision === currentWorkspaceRevision && String(match.workspace_revision ?? '').startsWith('sha256:'));
  return {
    relativePath: row.relativePath,
    graphifyRows: unique.length,
    currentWorkspaceRows: current.length,
    sourceRevisionQualifiedRows: qualified.length,
    revisionQualifiedRows: qualified.length,
    workspaceRevisionQualifiedRows: workspaceQualified.length,
    sourceRevision: qualified[0]?.code_source_revision ?? qualified[0]?.source_revision ?? row.sourceRevision ?? null,
    workspaceRevision: qualified[0]?.workspace_revision ?? null,
    classification: qualified.length === 1 && workspaceQualified.length === 1
      ? 'CURRENT_REVISION_QUALIFIED'
      : qualified.length === 1
        ? 'SOURCE_REVISION_QUALIFIED_WORKSPACE_MISMATCH'
        : unique.length === 0
          ? 'GRAPHIFY_SOURCE_MISSING'
          : current.length === 0
            ? 'WORKSPACE_REVISION_MISMATCH'
            : 'AMBIGUOUS_REVISION_BINDING',
  };
});
const counts = {
  cohortRows: resultRows.length,
  currentWorkspaceRevision,
  graphifyMatched: resultRows.filter((row) => row.graphifyRows > 0).length,
  currentWorkspaceMatched: resultRows.filter((row) => row.currentWorkspaceRows > 0).length,
  sourceRevisionQualified: resultRows.filter((row) => row.sourceRevisionQualifiedRows > 0).length,
  revisionQualified: resultRows.filter((row) => row.classification === 'CURRENT_REVISION_QUALIFIED').length,
  workspaceMismatchAfterSourceQualification: resultRows.filter((row) => row.classification === 'SOURCE_REVISION_QUALIFIED_WORKSPACE_MISMATCH').length,
  missing: resultRows.filter((row) => row.classification === 'GRAPHIFY_SOURCE_MISSING').length,
  mismatched: resultRows.filter((row) => row.classification === 'WORKSPACE_REVISION_MISMATCH').length,
  ambiguous: resultRows.filter((row) => row.classification === 'AMBIGUOUS_REVISION_BINDING').length,
};
const report = {
  schema: 'atlas.current-source-cohort-lineage.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LINEAGE_AUDIT',
  inputs: { cohortChecksum: cohort.cohortChecksum ?? null, observationPath: path.relative(root, observationPath).replaceAll('\\', '/') },
  counts,
  rows: resultRows,
  databaseError: error,
  sourceRevisionRequired: true,
  canonicalAuthority: false,
  postgresWrites: false,
  graphifyWrites: false,
  qdrantWrites: false,
  status: error
    ? 'LINEAGE_AUDIT_ERROR'
    : counts.revisionQualified > 0
      ? 'CURRENT_LINEAGE_COHORT_FOUND'
      : counts.sourceRevisionQualified > 0
        ? 'SOURCE_LINEAGE_COHORT_FOUND_WORKSPACE_MISMATCH'
        : 'CURRENT_LINEAGE_COHORT_EMPTY',
  nextGate: counts.sourceRevisionQualified > 0 ? 'SOURCE_PROJECTION_EXACT_BYTES_ADMISSION_REVIEW' : 'GRAPHIFY_REVISION_RECONCILIATION_REQUIRED',
};
report.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts, reportPath: 'docs/reports/current-source-cohort-lineage-v1.json' }, null, 2));
