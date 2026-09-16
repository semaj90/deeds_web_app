#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
const root = process.cwd();
const reportPath = path.join(root, 'docs/reports/atlas-packets-workspace-binding-joinability-v1.json');
const revisionArgIndex = process.argv.indexOf('--workspace-revision');
const explicitRevision = revisionArgIndex >= 0 ? process.argv[revisionArgIndex + 1] : null;
if (explicitRevision !== null && !/^sha256:[0-9a-f]{64}$/i.test(explicitRevision)) {
  throw new Error('INVALID_EXPLICIT_WORKSPACE_REVISION');
}
let admittedRevision = null;
try {
  const admission = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
  if (admission.authority === true && typeof admission.workspaceRevision === 'string') admittedRevision = admission.workspaceRevision;
} catch {
  // Explicit input remains the preferred safe mode when no admission receipt exists.
}
const workspaceRevision = explicitRevision ?? admittedRevision;
if (!workspaceRevision) throw new Error('ADMITTED_WORKSPACE_REVISION_REQUIRED');
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 20000 });
const joinable = await pool.query(`
  SELECT count(*)::int AS total_packets,
         count(wsb.canonical_source_ref)::int AS joinable_to_bindings
  FROM atlas_packets ap
  LEFT JOIN atlas_workspace_source_bindings wsb
    ON wsb.canonical_source_ref = ap.source_ref AND wsb.repo_id = 'deeds-web-app'
`);
const joinableAdmitted = await pool.query(`
  SELECT count(*)::int AS n
  FROM atlas_packets ap
  JOIN atlas_workspace_source_bindings wsb
    ON wsb.canonical_source_ref = ap.source_ref AND wsb.repo_id = 'deeds-web-app'
  WHERE wsb.workspace_revision = $1
`, [workspaceRevision]);
const report = {
  schema: 'atlas.packets-workspace-binding-joinability.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  workspaceRevision,
  joinability: joinable.rows[0],
  joinableToAdmittedRevision: joinableAdmitted.rows[0],
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const reportTemp = `${reportPath}.${process.pid}.tmp`;
fs.writeFileSync(reportTemp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(reportTemp, reportPath);
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
await pool.end();
