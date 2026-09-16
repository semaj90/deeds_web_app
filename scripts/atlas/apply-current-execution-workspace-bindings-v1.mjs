#!/usr/bin/env node

/** Bind exact repo:root Graphify membership to the admitted workspace revision. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const ADMISSION = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/current-execution-workspace-bindings-v1.json');
const executionArg = process.argv.indexOf('--execution-id');
const executionId = executionArg >= 0 ? process.argv[executionArg + 1] : null;
const apply = process.argv.includes('--apply');
const confirm = process.argv.includes('--confirm-current-execution-workspace-bindings-v1');
if (!executionId) throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_EXECUTION_ID_REQUIRED');
if (apply && !confirm) throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_CONFIRMATION_REQUIRED');

const admission = JSON.parse(readFileSync(ADMISSION, 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_ADMISSION_REQUIRED');
}
const snapshotPath = resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const expected = new Map(snapshot.sources.filter((s) => s.repositoryId === 'repo:root')
  .map((s) => [String(s.repositoryRelativePath).replaceAll('\\', '/').replace(/^\.\//, ''), s]));
if (snapshot.snapshotRevision !== admission.snapshotRevision || expected.size === 0) throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_SNAPSHOT_INVALID');
const normalize = (v) => String(v ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
const hash = (v) => createHash('sha256').update(v, 'utf8').digest('hex');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000, application_name: 'atlas-current-execution-workspace-bindings-v1' });
let report;
try {
  const execution = await pool.query(`SELECT execution_id::text, workspace_revision::text, status FROM public.graphify_executions WHERE execution_id=$1::uuid`, [executionId]);
  const e = execution.rows[0];
  if (!e) throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_EXECUTION_NOT_FOUND');
  if (e.workspace_revision !== admission.workspaceRevision) throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_REVISION_MISMATCH');
  if (!['COMPLETED', 'COMPLETED_REUSED'].includes(e.status)) throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_EXECUTION_NOT_TERMINAL');
  const members = await pool.query(`SELECT repository_id::text, repository_relative_path::text, source_ref::text, workspace_revision::text, code_source_revision::text, content_hash::text, byte_length::int FROM public.graphify_execution_file_membership_v2 WHERE execution_id=$1::uuid ORDER BY repository_id, repository_relative_path`, [executionId]);
  const root = members.rows.filter((m) => m.repository_id === 'repo:root');
  if (root.length !== expected.size) throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_ROOT_COUNT_MISMATCH');
  const refs = await pool.query(`SELECT source_ref_key::text FROM public.atlas_source_refs WHERE repo_id='deeds-web-app'`);
  const refSet = new Set(refs.rows.map((r) => normalize(r.source_ref_key)));
  const existing = await pool.query(`SELECT canonical_source_ref::text FROM public.atlas_workspace_source_bindings WHERE repo_id='deeds-web-app' AND workspace_revision=$1`, [admission.workspaceRevision]);
  const existingSet = new Set(existing.rows.map((r) => normalize(r.canonical_source_ref)));
  const rows = [];
  const missingRefs = [];
  for (const m of root) {
    const relativePath = normalize(m.repository_relative_path);
    const source = expected.get(relativePath);
    if (!source || normalize(m.source_ref) !== normalize(source.sourceRef)
      || String(m.workspace_revision) !== admission.workspaceRevision
      || String(m.code_source_revision) !== String(source.sourceRevision)
      || String(m.content_hash).replace(/^sha256:/, '').toLowerCase() !== String(source.contentDigest).replace(/^sha256:/, '').toLowerCase()
      || Number(m.byte_length) !== Number(source.byteLength)) throw new Error(`CURRENT_EXECUTION_WORKSPACE_BINDINGS_MEMBER_MISMATCH:${relativePath}`);
    if (!refSet.has(relativePath)) { missingRefs.push(relativePath); continue; }
    if (existingSet.has(relativePath)) continue;
    const sourceRevision = String(m.code_source_revision);
    const contentDigest = String(m.content_hash).replace(/^sha256:/, '').toLowerCase();
    const producerRevision = `graphify-execution-membership-v2:${executionId}`;
    const bindingChecksum = hash(`deeds-web-app:${admission.workspaceRevision}:${relativePath}:${sourceRevision}:${contentDigest}:${m.byte_length}:${producerRevision}`);
    rows.push({ relativePath, sourceRevision, contentDigest, byteLength: Number(m.byte_length), producerRevision, bindingChecksum });
  }
  const candidateChecksum = `sha256:${hash(rows.map((r) => `${r.relativePath}\0${r.sourceRevision}\0${r.contentDigest}\0${r.byteLength}\0${r.bindingChecksum}`).join('\n'))}`;
  report = { schema: 'atlas.current-execution-workspace-bindings.v1', mode: apply ? 'APPLY' : 'READ_ONLY_PLAN', executionId, workspaceRevision: admission.workspaceRevision, snapshotRevision: admission.snapshotRevision, counts: { executionMembers: members.rows.length, rootMembers: root.length, unresolvedOtherRepositories: members.rows.length - root.length, existingBindings: existingSet.size, missingSourceRefs: missingRefs.length, candidateBindings: rows.length }, missingSourceRefs: missingRefs.slice(0, 100), candidateChecksum, candidates: rows.slice(0, 100), committed: false, insertedCount: 0, readbackCount: 0, writesPerformed: false, safeToApply: !apply && missingRefs.length === 0 && rows.length > 0, status: missingRefs.length ? 'BLOCKED_SOURCE_REGISTRY_GAP' : (apply ? 'PLANNED_APPLY' : 'PLAN_READY') };
  if (apply && missingRefs.length === 0 && rows.length > 0) {
    await pool.query('BEGIN');
    try {
      for (const [ordinal, r] of rows.entries()) await pool.query(`INSERT INTO public.atlas_workspace_source_bindings (repo_id, workspace_revision, canonical_source_ref, source_revision, content_digest, byte_length, source_manifest_ordinal, producer_revision, binding_checksum) VALUES ('deeds-web-app',$1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (repo_id, workspace_revision, canonical_source_ref) DO NOTHING`, [admission.workspaceRevision, r.relativePath, r.sourceRevision, r.contentDigest, r.byteLength, ordinal, r.producerRevision, r.bindingChecksum]);
      const readback = await pool.query(`SELECT count(*)::int AS n FROM public.atlas_workspace_source_bindings WHERE repo_id='deeds-web-app' AND workspace_revision=$1`, [admission.workspaceRevision]);
      if (Number(readback.rows[0]?.n ?? 0) !== existingSet.size + rows.length) throw new Error('CURRENT_EXECUTION_WORKSPACE_BINDINGS_READBACK_MISMATCH');
      await pool.query('COMMIT'); report.committed = true; report.insertedCount = rows.length; report.readbackCount = Number(readback.rows[0].n); report.writesPerformed = true; report.safeToApply = false; report.status = 'WORKSPACE_BINDINGS_INSERT_AND_READBACK_PROVEN';
    } catch (error) { await pool.query('ROLLBACK').catch(() => undefined); report.status = 'APPLY_FAILED'; report.error = error instanceof Error ? error.message : String(error); }
  }
} finally { await pool.end(); }
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
