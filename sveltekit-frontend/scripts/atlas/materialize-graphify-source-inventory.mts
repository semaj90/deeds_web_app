#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const apply = process.argv.includes('--apply');
const sourceArgIndex = process.argv.indexOf('--source');
const requestedSource = sourceArgIndex >= 0 ? process.argv[sourceArgIndex + 1]?.replaceAll('\\', '/') : null;
const limit = Math.max(1, Math.min(5000, Number(process.env.ATLAS_GRAPHIFY_SOURCE_LIMIT ?? (requestedSource ? 1 : 100))));
const out = path.resolve(REPO_ROOT, process.env.ATLAS_GRAPHIFY_SOURCE_INVENTORY_PLAN_OUT ?? 'docs/reports/graphify-source-inventory-plan.json');
const producerRevision = 'atlas.graphify-source-inventory-dry-run.v2';

/*
 * IMPORTANT: the historical APPLY path targeted a single-table layout with
 * graphify_files.workspace_revision/git_blob_oid/source_revision_authority.
 * The current manual v2 migration owns a two-table layout instead:
 * graphify_runs.workspace_revision/source_manifest_digest plus
 * graphify_files.code_source_revision. Until the canonical writer is
 * reconciled to that exact contract, APPLY fails closed here.
 */
if (apply) {
  const blocked = {
    schemaVersion: 'atlas.graphify-source-inventory-plan.v2',
    status: 'BLOCKED_V2_WRITER_RECONCILIATION_REQUIRED',
    readOnly: true,
    canonicalWriteAttempted: false,
    migration: 'sveltekit-frontend/drizzle/manual/20260822_graphify_revision_authority_v2.sql',
    requiredWriterContract: {
      runTable: 'graphify_runs',
      runRevisionColumns: ['workspace_revision', 'source_manifest_digest'],
      fileTable: 'graphify_files',
      fileRevisionColumn: 'code_source_revision',
      gitProvenanceColumns: ['repository_revision', 'source_revision'],
    },
    nextGate: 'RECONCILE_EXISTING_MATERIALIZER_TO_V2_TWO_TABLE_CONTRACT',
  };
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(blocked, null, 2)}\n`, 'utf8');
  console.error(JSON.stringify({ ...blocked, output: out }, null, 2));
  process.exit(3);
}

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision,
});

const selected = requestedSource
  ? origin.bindings.filter((binding) => binding.sourceRef === requestedSource)
  : origin.bindings.slice(0, limit);

if (requestedSource && selected.length !== 1) {
  throw new Error(`GRAPHIFY_SOURCE_NOT_IN_WORKSPACE_MANIFEST:${requestedSource}`);
}

const plan = {
  schemaVersion: 'atlas.graphify-source-inventory-plan.v2',
  status: 'DRY_RUN_PROVEN',
  mode: 'DRY_RUN',
  readOnly: true,
  canonicalWriteAttempted: false,
  durableOwnerBound: false,
  workspaceRevision: origin.record.workspaceRevision,
  sourceManifestDigest: origin.record.sourceManifestDigest,
  repositoryRevision: origin.record.baseCommitOid,
  repositoryRevisionRole: 'GIT_PROVENANCE_ONLY',
  workspaceSourceCount: origin.record.sourceCount,
  selectedSourceCount: selected.length,
  records: selected.map((binding) => ({
    workspaceRevision: binding.workspaceRevision,
    sourceRef: binding.sourceRef,
    codeSourceRevision: binding.sourceRevision,
    contentHash: binding.contentDigest,
    byteLength: binding.byteLength,
    baseGitCommitOid: binding.baseCommitOid,
    gitBlobOid: binding.gitBlobOid,
    trackedAtBaseCommit: binding.trackedAtBaseCommit,
    dirtyRelativeToBaseCommit: binding.dirtyRelativeToBaseCommit,
  })),
  skipped: origin.skipped,
  migration: 'sveltekit-frontend/drizzle/manual/20260822_graphify_revision_authority_v2.sql',
  nextGate: 'RECONCILE_EXISTING_MATERIALIZER_TO_V2_TWO_TABLE_CONTRACT',
};

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: plan.status, output: out, selectedSourceCount: plan.selectedSourceCount, workspaceRevision: plan.workspaceRevision, canonicalWriteAttempted: false }, null, 2));
