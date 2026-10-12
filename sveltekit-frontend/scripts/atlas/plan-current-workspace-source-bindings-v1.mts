#!/usr/bin/env tsx
// Dry-run planner for the CURRENT working-tree workspace source bindings (read-only; no writes).
// Maps the materializer's bindings onto atlas_workspace_source_bindings columns, then checks
// foreign keys, batch duplicates and existing rows. Writes only a receipt under .tmp/atlas.
// Apply is intentionally not implemented here; it needs an explicit operator decision.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { materializeWorkspaceRevisionOriginV1 } from '../../src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.ts';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
import { buildArchiveTextDocumentProposalV1 } from '../../../scripts/atlas/lib/archive-text-document-proposal-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const REPO_ID = 'deeds-web-app';

type Binding = {
  workspaceRevision: string;
  sourceRef: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
  sourceManifestOrdinal: number;
  gitBlobOid: string | null;
  trackedAtBaseCommit: boolean;
  dirtyRelativeToBaseCommit: boolean;
  producerRevision: string;
  checksum: string;
};

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision: 'atlas.current-workspace-source-bindings-plan.v1',
});
const bindings = origin.bindings as Binding[];
const workspaceRevision = origin.record.workspaceRevision;

// Typed contract checks before any database contact. Any failure is recorded, not coerced.
const problems: string[] = [];
const seen = new Set<string>();
let duplicateKeys = 0;
for (const b of bindings) {
  if (b.workspaceRevision !== workspaceRevision) problems.push(`WORKSPACE_MISMATCH:${b.sourceRef}`);
  if (!/^sha256:[0-9a-f]{64}$/.test(b.sourceRevision)) problems.push(`SOURCE_REVISION_INVALID:${b.sourceRef}`);
  if (!/^[0-9a-f]{64}$/.test(b.contentDigest)) problems.push(`CONTENT_DIGEST_INVALID:${b.sourceRef}`);
  if (!Number.isSafeInteger(b.byteLength) || b.byteLength <= 0) problems.push(`BYTE_LENGTH_INVALID:${b.sourceRef}`);
  const key = `${REPO_ID}|${b.sourceRef}`;
  if (seen.has(key)) duplicateKeys += 1;
  seen.add(key);
}

loadRepoEnv();
const client = new pg.Client({ connectionString: resolveDatabaseUrl(process.env) });
await client.connect();
let fkMissing: string[] = [];
let existingRows = 0;
let uniqueSourceRefs = 0;
let knownSet = new Set<string>();
const sourceRefProposals: Array<Record<string, unknown>> = [];
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const refs = [...new Set(bindings.map((b) => b.sourceRef))];
  uniqueSourceRefs = refs.length;
  // Foreign key: (repo_id, canonical_source_ref) -> atlas_source_refs(repo_id, source_ref_key)
  const known = await client.query<{ source_ref_key: string }>(
    'SELECT source_ref_key FROM atlas_source_refs WHERE repo_id = $1 AND source_ref_key = ANY($2::text[])',
    [REPO_ID, refs],
  );
  knownSet = new Set(known.rows.map((r) => r.source_ref_key));
  fkMissing = refs.filter((r) => !knownSet.has(r));
  const rootRealPath = realpathSync(REPO_ROOT);
  const bindingByRef = new Map(bindings.map((binding) => [binding.sourceRef, binding]));
  for (const sourceRef of fkMissing) {
    const binding = bindingByRef.get(sourceRef);
    const absolutePath = path.resolve(rootRealPath, sourceRef);
    const realPath = existsSync(absolutePath)
      ? realpathSync(absolutePath)
      : null;
    const relative = realPath ? path.relative(rootRealPath, realPath) : '';
    const contained = Boolean(realPath && relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    const bytes = contained ? readFileSync(realPath!) : null;
    const actualDigest = bytes ? createHash('sha256').update(bytes).digest('hex') : null;
    const digestMatches = Boolean(binding && actualDigest === binding.contentDigest
      && binding.sourceRevision === `sha256:${binding.contentDigest}`
      && binding.byteLength === bytes?.byteLength);
    const isArchiveText = /(?:^|[\\/])(?:\.?archives?|\.?archived|historical|history|backups?)(?:[\\/])/i.test(sourceRef)
      && /\.(?:md|txt)$/i.test(sourceRef);
    const archiveDocument = isArchiveText && digestMatches && bytes
      ? buildArchiveTextDocumentProposalV1({ sourceRef, bytes, expectedDigest: binding!.contentDigest })
      : null;
    sourceRefProposals.push({
      sourceRefKey: sourceRef,
      repoId: REPO_ID,
      sourceType: archiveDocument?.sourceTypeProposal ?? null,
      relativePath: sourceRef,
      contentHash: binding?.contentDigest ?? null,
      workspaceRevision: binding?.workspaceRevision ?? null,
      sourceRevision: binding?.sourceRevision ?? null,
      byteLength: binding?.byteLength ?? null,
      archiveDocument,
      status: !contained ? 'BLOCKED_SOURCE_PATH_MISSING_OR_OUTSIDE_REPO'
        : !digestMatches ? 'BLOCKED_SOURCE_BYTES_OR_REVISION_MISMATCH'
          : archiveDocument ? 'ARCHIVE_TEXT_REVIEW_ONLY'
        : 'SOURCE_IDENTITY_DERIVED_NOT_ADMITTED_SOURCE_TYPE_UNRESOLVED',
    });
  }
  const existing = await client.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM atlas_workspace_source_bindings WHERE repo_id = $1 AND workspace_revision = $2',
    [REPO_ID, workspaceRevision],
  );
  existingRows = Number(existing.rows[0]?.n ?? 0);
  await client.query('ROLLBACK');
} finally {
  await client.end();
}

const plannedRows = bindings.length - fkMissing.length;
const status = problems.length === 0 && duplicateKeys === 0 && fkMissing.length === 0 && existingRows === 0
  ? 'DRY_RUN_PLANNED_READY_FOR_APPLY_DECISION'
  : 'DRY_RUN_BLOCKED';

const receipt = {
  schema: 'atlas.current-workspace-source-bindings-plan.v1',
  readOnly: true, writesPerformed: false, canonicalAuthority: false, admissionAuthorized: false,
  generatedAt: new Date().toISOString(),
  repoId: REPO_ID,
  workspaceRevision,
  sourceCount: origin.record.sourceCount,
  bindingsInMemory: bindings.length,
  skippedInMemory: origin.skipped.length,
  uniqueSourceRefs,
  foreignKeyMissingCount: fkMissing.length,
  foreignKeyMissingSample: fkMissing.slice(0, 10),
  derivedSourceRefProposalCount: sourceRefProposals.length,
  byteVerifiedSourceRefProposalCount: sourceRefProposals.filter((row) => row.status === 'SOURCE_IDENTITY_DERIVED_NOT_ADMITTED_SOURCE_TYPE_UNRESOLVED').length,
  unresolvedSourceTypeCount: sourceRefProposals.filter((row) => row.status === 'SOURCE_IDENTITY_DERIVED_NOT_ADMITTED_SOURCE_TYPE_UNRESOLVED').length,
  archiveTextReviewOnlyCount: sourceRefProposals.filter((row) => row.status === 'ARCHIVE_TEXT_REVIEW_ONLY').length,
  blockedSourceRefProposalCount: sourceRefProposals.filter((row) => String(row.status).startsWith('BLOCKED_')).length,
  sourceRefProposals,
  batchDuplicateKeys: duplicateKeys,
  contractProblemCount: problems.length,
  contractProblemSample: problems.slice(0, 10),
  existingRowsForWorkspace: existingRows,
  plannedInsertRows: plannedRows,
  columnMap: {
    repo_id: REPO_ID,
    workspace_revision: 'workspaceRevision',
    canonical_source_ref: 'sourceRef',
    source_revision: 'sourceRevision',
    content_digest: 'contentDigest',
    byte_length: 'byteLength',
    source_manifest_ordinal: 'sourceManifestOrdinal',
    git_blob_oid: 'gitBlobOid',
    tracked_at_base_commit: 'trackedAtBaseCommit',
    dirty_relative_to_base: 'dirtyRelativeToBaseCommit',
    producer_revision: 'producerRevision',
    binding_checksum: 'checksum',
  },
  status,
};
const outDir = path.join(REPO_ROOT, '.tmp', 'atlas');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'current-workspace-source-bindings-plan-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status, workspaceRevision, bindingsInMemory: bindings.length, foreignKeyMissingCount: fkMissing.length, existingRowsForWorkspace: existingRows, batchDuplicateKeys: duplicateKeys, contractProblemCount: problems.length, plannedInsertRows: plannedRows }, null, 2));
