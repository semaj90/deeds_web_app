#!/usr/bin/env node
/**
 * GPH-SOURCE-AUTHORITY-01: per-file source authority diagnostic (READ ONLY). For each tested file it compares the CURRENT bytes with the
 * registered Graphify binding (public.graphify_files) at the ADMITTED workspace revision, and reports one status:
 *   PROVEN | NO_ADMITTED_SOURCE_BINDING | SOURCE_REVISION_MISMATCH | WORKSPACE_REVISION_MISMATCH | AUTHORITY_RECORD_MISSING | AMBIGUOUS_BINDING
 * hash(current bytes) == recorded content_hash is necessary but NOT sufficient: the binding must also sit at the admitted workspace revision,
 * carry source_revision_authority = PROVEN, and belong to a COMPLETED run. Anything other than PROVEN stays OBSERVATION_ONLY.
 * It never writes a datastore and never assigns a revision. Reuses the repo connection helpers (no credentials in source).
 * Writes docs/reports/ast-source-authority-v1.json, which audit-ast-edge-eligibility-v1.mjs reads.
 *   node scripts/atlas/audit-ast-source-authority-v1.mjs [--files a.ts,b.ts]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const argIdx = process.argv.indexOf('--files');
const FILES = argIdx > 0 ? process.argv[argIdx + 1].split(',') : [
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts',
  'sveltekit-frontend/src/lib/server/retrieval/parent-atlas-bridge.ts',
  'sveltekit-frontend/src/lib/server/atlas/operations/atlas-operation-runtime-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-intelligence-adapter.ts',
  'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-symbol-projection-v1.ts',
  'packages/parent-atlas/src/core/ast-relation-graph-v1.ts',
];
const REPORT = path.join(REPO_ROOT, 'docs/reports/ast-source-authority-v1.json');
const admission = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const ADMITTED_WORKSPACE_REVISION = admission.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' && admission.authority === true ? admission.workspaceRevision : null;
const digest = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const norm = (v) => (v == null ? null : String(v).startsWith('sha256:') ? String(v) : `sha256:${v}`);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
const results = [];
let databaseError = null;
try {
  const rows = (await pool.query(
    `SELECT f.source_ref, f.content_hash, f.byte_length, f.source_revision, f.code_source_revision, f.workspace_revision,
            f.source_revision_authority, f.git_blob_oid, f.last_seen_run_id::text AS run_id, r.status AS run_status
       FROM public.graphify_files f LEFT JOIN public.graphify_runs r ON r.run_id = f.last_seen_run_id
      WHERE f.source_ref = ANY($1::text[])`, [FILES])).rows;
  for (const file of FILES) {
    const bytes = fs.readFileSync(path.join(REPO_ROOT, file));
    const currentDigest = digest(bytes);
    let currentBlob = null;
    try { currentBlob = execFileSync('git', ['hash-object', '--', file], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); } catch { /* not a git file */ }
    let dirty = null;
    try { dirty = execFileSync('git', ['status', '--porcelain', '--', file], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0; } catch { /* ignore */ }
    const bindings = rows.filter((r) => r.source_ref === file);
    const atAdmitted = bindings.filter((r) => r.workspace_revision === ADMITTED_WORKSPACE_REVISION);
    let status; let chosen = null;
    if (!bindings.length) status = 'NO_ADMITTED_SOURCE_BINDING';
    else if (!ADMITTED_WORKSPACE_REVISION || !atAdmitted.length) status = 'WORKSPACE_REVISION_MISMATCH';
    else if (new Set(atAdmitted.map((r) => `${r.content_hash}|${r.code_source_revision}`)).size > 1) status = 'AMBIGUOUS_BINDING';
    else {
      chosen = atAdmitted[0];
      if (norm(chosen.content_hash) !== currentDigest || (chosen.byte_length != null && Number(chosen.byte_length) !== bytes.length)) status = 'SOURCE_REVISION_MISMATCH';
      else if (chosen.source_revision_authority !== 'PROVEN' || chosen.run_status !== 'COMPLETED') status = 'AUTHORITY_RECORD_MISSING';
      else status = 'PROVEN';
    }
    results.push({ sourceRef: file, status, currentBytesDigest: currentDigest, currentGitBlobOid: currentBlob, workingTreeDirty: dirty, bindingsFound: bindings.length,
      bindingsAtAdmittedWorkspace: atAdmitted.length, binding: chosen ? { contentHash: chosen.content_hash, codeSourceRevision: chosen.code_source_revision, workspaceRevision: chosen.workspace_revision,
        sourceRevisionAuthority: chosen.source_revision_authority, runId: chosen.run_id, runStatus: chosen.run_status, gitBlobOidRecorded: Boolean(chosen.git_blob_oid) } : null,
      otherWorkspaceRevisions: [...new Set(bindings.map((r) => r.workspace_revision))].slice(0, 3), edgesMayAdvance: status === 'PROVEN' });
  }
} catch (error) { databaseError = String(error.message ?? error).slice(0, 160); } finally { await pool.end(); }

const report = { schema: 'atlas.ast-source-authority.v1', generatedAt: new Date().toISOString(), canonicalAuthority: false, writesPerformed: false,
  admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION, databaseError, results,
  summary: results.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {}) };
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
if (databaseError) console.log('DATABASE_ERROR', databaseError);
for (const r of results) console.log(`${r.status.padEnd(28)} bindings=${r.bindingsFound} atAdmitted=${r.bindingsAtAdmittedWorkspace} dirty=${r.workingTreeDirty} ${r.sourceRef.split('/').pop()}${r.binding ? ` auth=${r.binding.sourceRevisionAuthority} run=${r.binding.runStatus}` : ` otherWs=${r.otherWorkspaceRevisions.map((w) => String(w).slice(0, 15))}`}`);
console.log('summary', JSON.stringify(report.summary), 'admittedWorkspaceRevision', String(ADMITTED_WORKSPACE_REVISION).slice(0, 22), 'report=docs/reports/ast-source-authority-v1.json');
