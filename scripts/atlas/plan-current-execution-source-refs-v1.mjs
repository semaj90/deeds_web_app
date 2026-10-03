#!/usr/bin/env node

/**
 * Plan (and only with two explicit gates, apply) whole-file source references from the
 * immutable Graphify V2 execution membership. This is deliberately limited to the proven
 * repo:root -> deeds-web-app namespace bridge; other repository namespaces remain unresolved.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const ADMISSION = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/current-execution-source-refs-plan-v1.json');
const executionArg = process.argv.indexOf('--execution-id');
const executionId = executionArg >= 0 ? process.argv[executionArg + 1] : null;
const apply = process.argv.includes('--apply');
const confirm = process.argv.includes('--confirm-current-execution-source-refs-v1');
const repoId = 'deeds-web-app';

if (!executionId) throw new Error('CURRENT_EXECUTION_SOURCE_REFS_EXECUTION_ID_REQUIRED');
if (apply && !confirm) throw new Error('CURRENT_EXECUTION_SOURCE_REFS_CONFIRMATION_REQUIRED');

const admission = JSON.parse(readFileSync(ADMISSION, 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('CURRENT_EXECUTION_SOURCE_REFS_ADMISSION_REQUIRED');
}
const snapshotPath = resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
if (snapshot.snapshotRevision !== admission.snapshotRevision) throw new Error('CURRENT_EXECUTION_SOURCE_REFS_SNAPSHOT_MISMATCH');

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const normalize = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
const key = (repositoryId, relativePath) => `${repositoryId}:${normalize(relativePath)}`;
const expected = new Map(snapshot.sources.filter((s) => s.repositoryId === 'repo:root')
  .map((s) => [key(s.repositoryId, s.repositoryRelativePath), s]));

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-current-execution-source-refs-v1',
});
let report;
try {
  const execution = await pool.query(
    `SELECT execution_id::text, workspace_revision::text, status
       FROM public.graphify_executions
      WHERE execution_id = $1::uuid`, [executionId],
  );
  const executionRow = execution.rows[0];
  if (!executionRow) throw new Error('CURRENT_EXECUTION_SOURCE_REFS_EXECUTION_NOT_FOUND');
  if (executionRow.workspace_revision !== admission.workspaceRevision) throw new Error('CURRENT_EXECUTION_SOURCE_REFS_WORKSPACE_REVISION_MISMATCH');
  if (!['COMPLETED', 'COMPLETED_REUSED'].includes(executionRow.status)) throw new Error('CURRENT_EXECUTION_SOURCE_REFS_EXECUTION_NOT_TERMINAL');

  const members = await pool.query(
    `SELECT repository_id::text, repository_relative_path::text, source_ref::text,
            workspace_revision::text, code_source_revision::text, content_hash::text, byte_length::int
       FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid
      ORDER BY repository_id, repository_relative_path`, [executionId],
  );
  const rootMembers = members.rows.filter((m) => m.repository_id === 'repo:root');
  if (rootMembers.length !== expected.size) throw new Error('CURRENT_EXECUTION_SOURCE_REFS_ROOT_COUNT_MISMATCH');

  const registry = await pool.query(
    `SELECT source_ref_key::text FROM public.atlas_source_refs WHERE repo_id = $1`, [repoId],
  );
  const registryKeys = new Set(registry.rows.map((r) => normalize(r.source_ref_key)));
  const candidates = [];
  const mismatches = [];
  for (const member of rootMembers) {
    const source = expected.get(key(member.repository_id, member.repository_relative_path));
    const relativePath = normalize(member.repository_relative_path);
    const contentHash = String(member.content_hash ?? '').replace(/^sha256:/, '').toLowerCase();
    const sourceRevision = String(member.code_source_revision ?? '').toLowerCase();
    if (!source || normalize(member.source_ref) !== normalize(source.sourceRef)
      || sourceRevision !== String(source.sourceRevision).toLowerCase()
      || contentHash !== String(source.contentDigest).replace(/^sha256:/, '').toLowerCase()
      || Number(member.byte_length) !== Number(source.byteLength)) {
      mismatches.push(relativePath);
      continue;
    }
    if (registryKeys.has(relativePath)) continue;
    candidates.push({ sourceRefKey: relativePath, relativePath, contentHash });
  }
  const sourceSelectionChecksum = `sha256:${sha256(rootMembers.map((m) => `${normalize(m.repository_relative_path)}\0${m.code_source_revision}\0${m.content_hash}\0${m.byte_length}`).join('\n'))}`;
  const candidateChecksum = `sha256:${sha256(candidates.map((c) => `${c.sourceRefKey}\0${c.contentHash}`).join('\n'))}`;
  report = {
    schema: 'atlas.current-execution-source-refs-plan.v1',
    mode: apply ? 'APPLY' : 'READ_ONLY_PLAN',
    executionId,
    workspaceRevision: admission.workspaceRevision,
    snapshotRevision: admission.snapshotRevision,
    sourceSelectionChecksum,
    repositoryBridge: { executionRepository: 'repo:root', sourceRegistryRepository: repoId },
    counts: {
      executionMembers: members.rows.length,
      rootMembers: rootMembers.length,
      unresolvedOtherRepositories: members.rows.length - rootMembers.length,
      existingWholeFileRefs: rootMembers.length - candidates.length - mismatches.length,
      contentOrIdentityMismatches: mismatches.length,
      candidateInserts: candidates.length,
    },
    candidateChecksum,
    candidates: candidates.slice(0, 100),
    mismatches: mismatches.slice(0, 100),
    committed: false,
    insertedCount: 0,
    readbackCount: 0,
    writesPerformed: false,
    safeToApply: !apply && mismatches.length === 0 && candidates.length > 0,
    status: mismatches.length === 0 ? (apply ? 'PLANNED_APPLY' : 'PLAN_READY') : 'BLOCKED_IDENTITY_MISMATCH',
  };

  if (apply && mismatches.length === 0 && candidates.length > 0) {
    await pool.query('BEGIN');
    try {
      const values = [];
      const params = [];
      candidates.forEach((candidate, index) => {
        const base = index * 5;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        params.push(candidate.sourceRefKey, repoId, 'code', candidate.relativePath, candidate.contentHash);
      });
      const inserted = await pool.query(
        `INSERT INTO public.atlas_source_refs (source_ref_key, repo_id, source_type, relative_path, content_hash)
         VALUES ${values.join(',')} ON CONFLICT (source_ref_key, repo_id) DO NOTHING`, params,
      );
      const readback = await pool.query(
        `SELECT count(*)::int AS n FROM public.atlas_source_refs WHERE repo_id = $1 AND source_ref_key = ANY($2::text[])`,
        [repoId, candidates.map((c) => c.sourceRefKey)],
      );
      if (Number(readback.rows[0]?.n ?? 0) !== candidates.length) throw new Error('CURRENT_EXECUTION_SOURCE_REFS_READBACK_MISMATCH');
      await pool.query('COMMIT');
      report.committed = true;
      report.insertedCount = inserted.rowCount ?? 0;
      report.readbackCount = Number(readback.rows[0].n);
      report.writesPerformed = true;
      report.safeToApply = false;
      report.status = 'SOURCE_REFS_INSERT_AND_READBACK_PROVEN';
    } catch (error) {
      await pool.query('ROLLBACK').catch(() => undefined);
      report.status = 'APPLY_FAILED';
      report.error = error instanceof Error ? error.message : String(error);
    }
  }
} finally {
  await pool.end();
}
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
