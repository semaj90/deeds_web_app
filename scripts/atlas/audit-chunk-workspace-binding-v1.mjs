#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const repoId = 'deeds-web-app';
const timeoutMs = 60_000;
const client = new pg.Client({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  application_name: 'atlas-chunk-workspace-binding-audit-v1',
  statement_timeout: timeoutMs,
  query_timeout: timeoutMs + 5_000,
});

const receipt = {
  schema: 'atlas.chunk-workspace-binding-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_WORKSPACE_BINDINGS_ONLY',
  repoId,
  sourceRevisionRead: true,
  localWorkingTreeBytesRead: false,
  writesPerformed: false,
  canonicalAuthority: false,
};

try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '60000ms'");

  const result = await client.query(
    `WITH scoped_bindings AS MATERIALIZED (
       SELECT workspace_revision, canonical_source_ref
       FROM public.atlas_workspace_source_bindings
       WHERE repo_id = $1
     ), binding_stats AS (
       SELECT workspace_revision,
              COUNT(*)::bigint AS binding_rows,
              COUNT(DISTINCT canonical_source_ref)::bigint AS distinct_source_refs
       FROM scoped_bindings
       GROUP BY workspace_revision
     ), matched_chunks AS (
       SELECT b.workspace_revision,
              b.canonical_source_ref,
              c.id AS chunk_id,
              c.workspace_revision AS chunk_workspace_revision
       FROM scoped_bindings b
       JOIN public.codebase_chunk_index c
         ON c.source_ref = b.canonical_source_ref
     )
     SELECT s.workspace_revision,
            s.binding_rows::text,
            s.distinct_source_refs::text,
            COUNT(m.chunk_id)::text AS matched_chunk_rows,
            COUNT(DISTINCT m.chunk_id)::text AS distinct_matched_chunks,
            COUNT(DISTINCT m.chunk_id) FILTER (
              WHERE m.chunk_workspace_revision IS NULL
            )::text AS chunks_missing_workspace_revision,
            COUNT(DISTINCT m.chunk_id) FILTER (
              WHERE m.chunk_workspace_revision = s.workspace_revision
            )::text AS chunks_already_bound_to_snapshot,
            COUNT(DISTINCT m.chunk_id) FILTER (
              WHERE m.chunk_workspace_revision IS NOT NULL
                AND m.chunk_workspace_revision <> s.workspace_revision
            )::text AS chunks_bound_to_other_snapshot
     FROM binding_stats s
     LEFT JOIN matched_chunks m USING (workspace_revision)
     GROUP BY s.workspace_revision, s.binding_rows, s.distinct_source_refs
     ORDER BY s.workspace_revision`,
    [repoId],
  );

  receipt.status = 'READ_ONLY_AUDIT_COMPLETED';
  receipt.workspaceRevisions = result.rows.map((row) => ({
    workspaceRevision: row.workspace_revision,
    bindingRows: Number(row.binding_rows),
    distinctSourceRefs: Number(row.distinct_source_refs),
    matchedChunkRows: Number(row.matched_chunk_rows),
    distinctMatchedChunks: Number(row.distinct_matched_chunks),
    chunksMissingWorkspaceRevision: Number(row.chunks_missing_workspace_revision),
    chunksAlreadyBoundToSnapshot: Number(row.chunks_already_bound_to_snapshot),
    chunksBoundToOtherSnapshot: Number(row.chunks_bound_to_other_snapshot),
  }));

  const digestMatches = await client.query(
    `SELECT b.workspace_revision,
            COUNT(*)::text AS exact_content_match_rows,
            COUNT(DISTINCT c.id)::text AS distinct_exact_content_chunks,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.workspace_revision IS NULL
            )::text AS exact_content_chunks_missing_workspace_revision
     FROM public.atlas_workspace_source_bindings b
     JOIN public.codebase_chunk_index c
       ON c.source_ref = b.canonical_source_ref
      AND c.file_content_hash = b.content_digest
     WHERE b.repo_id = $1
       AND c.file_content_hash IS NOT NULL
     GROUP BY b.workspace_revision
     ORDER BY b.workspace_revision`,
    [repoId],
  );
  receipt.exactContentMatchesByWorkspace = digestMatches.rows.map((row) => ({
    workspaceRevision: row.workspace_revision,
    exactContentMatchRows: Number(row.exact_content_match_rows),
    distinctExactContentChunks: Number(row.distinct_exact_content_chunks),
    exactContentChunksMissingWorkspaceRevision: Number(row.exact_content_chunks_missing_workspace_revision),
  }));

  const digestMismatchBreakdown = await client.query(
    `SELECT b.workspace_revision,
            COUNT(DISTINCT c.id)::text AS source_ref_matched_chunks,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.file_content_hash IS NULL
            )::text AS chunks_without_file_content_hash,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.file_content_hash IS NOT NULL
                AND c.file_content_hash <> b.content_digest
            )::text AS chunks_with_nonmatching_file_content_hash,
            COUNT(DISTINCT b.canonical_source_ref) FILTER (
              WHERE c.id IS NOT NULL
                AND (c.file_content_hash IS NULL OR c.file_content_hash <> b.content_digest)
            )::text AS affected_source_refs
     FROM public.atlas_workspace_source_bindings b
     JOIN public.codebase_chunk_index c
       ON c.source_ref = b.canonical_source_ref
     WHERE b.repo_id = $1
       AND b.workspace_revision = $2
     GROUP BY b.workspace_revision`,
    [repoId, 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'],
  );
  receipt.digestMismatchBreakdown = digestMismatchBreakdown.rows.map((row) => ({
    workspaceRevision: row.workspace_revision,
    sourceRefMatchedChunks: Number(row.source_ref_matched_chunks),
    chunksWithoutFileContentHash: Number(row.chunks_without_file_content_hash),
    chunksWithNonmatchingFileContentHash: Number(row.chunks_with_nonmatching_file_content_hash),
    affectedSourceRefs: Number(row.affected_source_refs),
  }));

  const mismatchMetadata = await client.query(
    `SELECT COALESCE(c.content_hash_scope, '<null>') AS content_hash_scope,
            COALESCE(c.content_hash_algorithm, '<null>') AS content_hash_algorithm,
            c.content_hash_length,
            c.content_hash_version,
            COUNT(DISTINCT c.id)::text AS chunks,
            COUNT(DISTINCT b.canonical_source_ref)::text AS source_refs,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.content_hash = c.file_content_hash
            )::text AS file_hash_equals_content_hash,
            MIN(c.updated_at)::text AS oldest_updated_at,
            MAX(c.updated_at)::text AS newest_updated_at
     FROM public.atlas_workspace_source_bindings b
     JOIN public.codebase_chunk_index c
       ON c.source_ref = b.canonical_source_ref
     WHERE b.repo_id = $1
       AND b.workspace_revision = $2
       AND c.file_content_hash IS NOT NULL
       AND c.file_content_hash <> b.content_digest
     GROUP BY c.content_hash_scope, c.content_hash_algorithm,
              c.content_hash_length, c.content_hash_version
     ORDER BY COUNT(DISTINCT c.id) DESC`,
    [repoId, 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'],
  );
  receipt.digestMismatchMetadataGroups = mismatchMetadata.rows.map((row) => ({
    contentHashScope: row.content_hash_scope,
    contentHashAlgorithm: row.content_hash_algorithm,
    contentHashLength: row.content_hash_length === null ? null : Number(row.content_hash_length),
    contentHashVersion: row.content_hash_version === null ? null : Number(row.content_hash_version),
    chunks: Number(row.chunks),
    sourceRefs: Number(row.source_refs),
    fileHashEqualsContentHash: Number(row.file_hash_equals_content_hash),
    oldestUpdatedAt: row.oldest_updated_at,
    newestUpdatedAt: row.newest_updated_at,
  }));

  const mismatchLineage = await client.query(
    `SELECT COUNT(DISTINCT c.id)::text AS chunks,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.source_revision IS NULL
            )::text AS chunks_without_source_revision,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.source_revision = b.source_revision
            )::text AS exact_source_revision_matches,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.source_revision IS NOT NULL
                AND c.source_revision <> b.source_revision
            )::text AS source_revision_mismatches,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.workspace_revision IS NOT NULL
            )::text AS chunks_with_workspace_revision
     FROM public.atlas_workspace_source_bindings b
     JOIN public.codebase_chunk_index c
       ON c.source_ref = b.canonical_source_ref
     WHERE b.repo_id = $1
       AND b.workspace_revision = $2
       AND c.file_content_hash IS NOT NULL
       AND c.file_content_hash <> b.content_digest`,
    [repoId, 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'],
  );
  const mismatchLineageRow = mismatchLineage.rows[0];
  receipt.digestMismatchLineage = {
    chunks: Number(mismatchLineageRow.chunks),
    chunksWithoutSourceRevision: Number(mismatchLineageRow.chunks_without_source_revision),
    exactSourceRevisionMatches: Number(mismatchLineageRow.exact_source_revision_matches),
    sourceRevisionMismatches: Number(mismatchLineageRow.source_revision_mismatches),
    chunksWithWorkspaceRevision: Number(mismatchLineageRow.chunks_with_workspace_revision),
  };

  const writerFingerprints = await client.query(
    `SELECT COALESCE(NULLIF(split_part(c.chunk_id, ':', 1), ''), '<null>') AS chunk_id_prefix,
            CASE
              WHEN c.qdrant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'uuid'
              WHEN c.qdrant_id IS NULL THEN '<null>'
              ELSE 'other'
            END AS qdrant_id_shape,
            COALESCE(c.embedding_model, '<null>') AS embedding_model,
            COUNT(DISTINCT c.id)::text AS chunks,
            COUNT(DISTINCT c.source_ref)::text AS source_refs,
            MIN(c.indexed_at)::text AS first_indexed_at,
            MAX(c.indexed_at)::text AS last_indexed_at,
            MIN(c.updated_at)::text AS first_updated_at,
            MAX(c.updated_at)::text AS last_updated_at,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.metadata ? 'packet_key'
            )::text AS metadata_packet_key_rows,
            COUNT(DISTINCT c.id) FILTER (
              WHERE c.metadata ? 'chunk_source'
            )::text AS metadata_chunk_source_rows
     FROM public.atlas_workspace_source_bindings b
     JOIN public.codebase_chunk_index c
       ON c.source_ref = b.canonical_source_ref
     WHERE b.repo_id = $1
       AND b.workspace_revision = $2
       AND c.file_content_hash IS NOT NULL
       AND c.file_content_hash <> b.content_digest
     GROUP BY 1, 2, 3
     ORDER BY COUNT(DISTINCT c.id) DESC`,
    [repoId, 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'],
  );
  receipt.digestMismatchWriterFingerprints = writerFingerprints.rows.map((row) => ({
    chunkIdPrefix: row.chunk_id_prefix,
    qdrantIdShape: row.qdrant_id_shape,
    embeddingModel: row.embedding_model,
    chunks: Number(row.chunks),
    sourceRefs: Number(row.source_refs),
    firstIndexedAt: row.first_indexed_at,
    lastIndexedAt: row.last_indexed_at,
    firstUpdatedAt: row.first_updated_at,
    lastUpdatedAt: row.last_updated_at,
    metadataPacketKeyRows: Number(row.metadata_packet_key_rows),
    metadataChunkSourceRows: Number(row.metadata_chunk_source_rows),
  }));

  const runFingerprints = await client.query(
    `SELECT COALESCE(c.metadata->>'run_id', '<null>') AS metadata_run_id,
            COALESCE(c.metadata->>'execution_id', '<null>') AS metadata_execution_id,
            COALESCE(c.metadata->>'indexing_run_id', '<null>') AS metadata_indexing_run_id,
            COALESCE(c.embedding_model, '<null>') AS embedding_model,
            COALESCE(c.metadata->>'chunk_source', '<null>') AS metadata_chunk_source,
            COALESCE(c.metadata->>'chunk_kind', '<null>') AS metadata_chunk_kind,
            COUNT(DISTINCT c.id)::text AS chunks,
            COUNT(DISTINCT c.source_ref)::text AS source_refs,
            MIN(c.indexed_at)::text AS first_indexed_at,
            MAX(c.indexed_at)::text AS last_indexed_at
     FROM public.atlas_workspace_source_bindings b
     JOIN public.codebase_chunk_index c
       ON c.source_ref = b.canonical_source_ref
     WHERE b.repo_id = $1
       AND b.workspace_revision = $2
       AND c.file_content_hash IS NOT NULL
       AND c.file_content_hash <> b.content_digest
     GROUP BY 1, 2, 3, 4, 5, 6
     ORDER BY COUNT(DISTINCT c.id) DESC`,
    [repoId, 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'],
  );
  receipt.digestMismatchRunFingerprints = runFingerprints.rows.map((row) => ({
    metadataRunId: row.metadata_run_id,
    metadataExecutionId: row.metadata_execution_id,
    metadataIndexingRunId: row.metadata_indexing_run_id,
    embeddingModel: row.embedding_model,
    metadataChunkSource: row.metadata_chunk_source,
    metadataChunkKind: row.metadata_chunk_kind,
    chunks: Number(row.chunks),
    sourceRefs: Number(row.source_refs),
    firstIndexedAt: row.first_indexed_at,
    lastIndexedAt: row.last_indexed_at,
  }));

  const mismatchSources = await client.query(
    `SELECT DISTINCT b.canonical_source_ref,
            b.content_digest,
            b.git_blob_oid,
            b.tracked_at_base_commit,
            b.dirty_relative_to_base,
            c.file_content_hash
     FROM public.atlas_workspace_source_bindings b
     JOIN public.codebase_chunk_index c
       ON c.source_ref = b.canonical_source_ref
     WHERE b.repo_id = $1
       AND b.workspace_revision = $2
       AND c.file_content_hash IS NOT NULL
       AND c.file_content_hash <> b.content_digest
     ORDER BY b.canonical_source_ref, c.file_content_hash`,
    [repoId, 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc'],
  );
  const repoRoot = await fs.promises.realpath(process.cwd());
  const sourceGroups = new Map();
  for (const row of mismatchSources.rows) {
    const group = sourceGroups.get(row.canonical_source_ref) ?? {
      snapshotDigest: row.content_digest,
      gitBlobOid: row.git_blob_oid,
      trackedAtBaseCommit: row.tracked_at_base_commit,
      dirtyRelativeToBase: row.dirty_relative_to_base,
      storedFileHashes: new Set(),
    };
    group.storedFileHashes.add(row.file_content_hash);
    sourceGroups.set(row.canonical_source_ref, group);
  }
  const localByteCounts = {
    sourceRefs: sourceGroups.size,
    snapshotDigestMatches: 0,
    storedFileHashMatches: 0,
    matchesNeither: 0,
    missing: 0,
    rejectedPath: 0,
    oversizedSkipped: 0,
    bytesHashed: 0,
  };
  for (const [sourceRef, group] of sourceGroups) {
    if (typeof sourceRef !== 'string' || sourceRef.length === 0 || path.isAbsolute(sourceRef) || sourceRef.split(/[\\/]/).includes('..')) {
      localByteCounts.rejectedPath += 1;
      continue;
    }
    const lexicalPath = path.resolve(repoRoot, sourceRef);
    const lexicalRelative = path.relative(repoRoot, lexicalPath);
    if (!lexicalRelative || lexicalRelative.startsWith(`..${path.sep}`) || lexicalRelative === '..' || path.isAbsolute(lexicalRelative)) {
      localByteCounts.rejectedPath += 1;
      continue;
    }
    let realPath;
    let fileStats;
    try {
      realPath = await fs.promises.realpath(lexicalPath);
      fileStats = await fs.promises.stat(realPath);
    } catch {
      localByteCounts.missing += 1;
      continue;
    }
    const realRelative = path.relative(repoRoot, realPath);
    if (!fileStats.isFile() || realRelative.startsWith(`..${path.sep}`) || realRelative === '..' || path.isAbsolute(realRelative)) {
      localByteCounts.rejectedPath += 1;
      continue;
    }
    if (fileStats.size > 50 * 1024 * 1024) {
      localByteCounts.oversizedSkipped += 1;
      continue;
    }
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(realPath)) hash.update(chunk);
    const localDigest = hash.digest('hex');
    localByteCounts.bytesHashed += fileStats.size;
    const snapshotMatches = localDigest === group.snapshotDigest.replace(/^sha256:/, '');
    const storedHashMatches = group.storedFileHashes.has(localDigest) || group.storedFileHashes.has(`sha256:${localDigest}`);
    if (snapshotMatches) localByteCounts.snapshotDigestMatches += 1;
    else if (storedHashMatches) localByteCounts.storedFileHashMatches += 1;
    else localByteCounts.matchesNeither += 1;
  }
  receipt.localWorkingTreeBytesRead = true;
  receipt.localWorkingTreeComparison = {
    meaning: 'DIAGNOSTIC_ONLY_NOT_ADMITTED_SNAPSHOT_PROOF',
    ...localByteCounts,
  };
  receipt.snapshotGitBlobAvailability = {
    sourceRefs: sourceGroups.size,
    gitBlobOidPresent: [...sourceGroups.values()].filter((group) => group.gitBlobOid !== null).length,
    trackedAtBaseCommit: [...sourceGroups.values()].filter((group) => group.trackedAtBaseCommit === true).length,
    dirtyRelativeToBase: [...sourceGroups.values()].filter((group) => group.dirtyRelativeToBase === true).length,
    gitBlobOidMissing: [...sourceGroups.values()].filter((group) => group.gitBlobOid === null).length,
  };
  const headComparison = {
    meaning: 'DIAGNOSTIC_ONLY_CURRENT_HEAD_IS_NOT_SEALED_SNAPSHOT_PROOF',
    sourceRefs: sourceGroups.size,
    snapshotDigestMatches: 0,
    storedFileHashMatches: 0,
    matchesNeither: 0,
    notInHead: 0,
    oversizedSkipped: 0,
    commandFailed: 0,
    bytesHashed: 0,
  };
  for (const [sourceRef, group] of sourceGroups) {
    const objectRef = `HEAD:${sourceRef.replaceAll('\\', '/')}`;
    try {
      const sizeOutput = execFileSync('git', ['cat-file', '-s', objectRef], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5_000,
      });
      const blobSize = Number(sizeOutput.trim());
      if (!Number.isSafeInteger(blobSize) || blobSize < 0) {
        headComparison.commandFailed += 1;
        continue;
      }
      if (blobSize > 50 * 1024 * 1024) {
        headComparison.oversizedSkipped += 1;
        continue;
      }
      const blob = execFileSync('git', ['cat-file', 'blob', objectRef], {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10_000,
        maxBuffer: 50 * 1024 * 1024,
      });
      const digest = crypto.createHash('sha256').update(blob).digest('hex');
      headComparison.bytesHashed += blob.length;
      if (digest === group.snapshotDigest.replace(/^sha256:/, '')) headComparison.snapshotDigestMatches += 1;
      else if (group.storedFileHashes.has(digest) || group.storedFileHashes.has(`sha256:${digest}`)) headComparison.storedFileHashMatches += 1;
      else headComparison.matchesNeither += 1;
    } catch (error) {
      if (error?.status === 128) headComparison.notInHead += 1;
      else headComparison.commandFailed += 1;
    }
  }
  receipt.currentHeadBlobComparison = headComparison;

  const historicalBlobComparisons = [];
  for (const commit of [
    'aba4c17dc464f1c37a6bd9b1158e9ece90f13446',
    '0fdde19a86e82d9d3e86d925eb2bc9d123809853',
  ]) {
    const comparison = {
      commit,
      sourceRefs: sourceGroups.size,
      snapshotDigestMatches: 0,
      storedFileHashMatches: 0,
      matchesNeither: 0,
      missingFromCommit: 0,
      oversizedSkipped: 0,
      commandFailed: 0,
      bytesHashed: 0,
    };
    for (const [sourceRef, group] of sourceGroups) {
      const objectRef = `${commit}:${sourceRef.replaceAll('\\', '/')}`;
      try {
        const sizeOutput = execFileSync('git', ['cat-file', '-s', objectRef], {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5_000,
        });
        const blobSize = Number(sizeOutput.trim());
        if (!Number.isSafeInteger(blobSize) || blobSize < 0) {
          comparison.commandFailed += 1;
          continue;
        }
        if (blobSize > 50 * 1024 * 1024) {
          comparison.oversizedSkipped += 1;
          continue;
        }
        const blob = execFileSync('git', ['cat-file', 'blob', objectRef], {
          cwd: repoRoot,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 10_000,
          maxBuffer: 50 * 1024 * 1024,
        });
        const digest = crypto.createHash('sha256').update(blob).digest('hex');
        comparison.bytesHashed += blob.length;
        if (digest === group.snapshotDigest.replace(/^sha256:/, '')) comparison.snapshotDigestMatches += 1;
        else if (group.storedFileHashes.has(digest) || group.storedFileHashes.has(`sha256:${digest}`)) comparison.storedFileHashMatches += 1;
        else comparison.matchesNeither += 1;
      } catch (error) {
        if (error?.status === 128) comparison.missingFromCommit += 1;
        else comparison.commandFailed += 1;
      }
    }
    historicalBlobComparisons.push(comparison);
  }
  receipt.historicalBlobComparisons = historicalBlobComparisons;

  const sealedMembership = await client.query(
    `WITH mismatch_refs AS MATERIALIZED (
       SELECT b.canonical_source_ref,
              b.content_digest
       FROM public.atlas_workspace_source_bindings b
       JOIN public.codebase_chunk_index c
         ON c.source_ref = b.canonical_source_ref
       WHERE b.repo_id = $1
         AND b.workspace_revision = $2
         AND c.file_content_hash IS NOT NULL
         AND c.file_content_hash <> b.content_digest
       GROUP BY b.canonical_source_ref, b.content_digest
     ), membership AS (
       SELECT r.canonical_source_ref,
              r.content_digest,
              m.content_hash,
              m.code_source_revision
       FROM mismatch_refs r
       LEFT JOIN public.graphify_execution_file_membership_v2 m
         ON m.source_ref = r.canonical_source_ref
        AND m.workspace_revision = $2
        AND m.execution_id = $3::uuid
     ), chunk_revision_join AS (
       SELECT m.canonical_source_ref,
              m.content_digest,
              m.content_hash,
              m.code_source_revision,
              c.id AS chunk_id,
              c.file_content_hash
       FROM membership m
       LEFT JOIN public.codebase_chunk_index c
         ON c.source_ref = m.canonical_source_ref
        AND c.file_content_hash IS NOT NULL
        AND c.file_content_hash <> m.content_digest
     )
     SELECT COUNT(DISTINCT canonical_source_ref)::text AS source_refs,
            COUNT(DISTINCT canonical_source_ref) FILTER (WHERE content_hash IS NULL)::text AS refs_missing_execution_membership,
            COUNT(DISTINCT canonical_source_ref) FILTER (WHERE content_hash = content_digest)::text AS membership_hash_matches_binding,
            COUNT(DISTINCT canonical_source_ref) FILTER (WHERE content_hash IS NOT NULL AND content_hash <> content_digest)::text AS membership_hash_differs_from_binding,
            COUNT(DISTINCT canonical_source_ref) FILTER (WHERE code_source_revision IS NOT NULL)::text AS refs_with_code_source_revision,
            COUNT(DISTINCT canonical_source_ref) FILTER (
              WHERE regexp_replace(code_source_revision, '^sha256:', '') = content_digest
            )::text AS refs_with_code_revision_equal_binding_digest,
            COUNT(DISTINCT canonical_source_ref) FILTER (
              WHERE file_content_hash = regexp_replace(code_source_revision, '^sha256:', '')
            )::text AS refs_with_chunk_hash_equal_code_source_revision,
            COUNT(DISTINCT chunk_id) FILTER (
              WHERE file_content_hash = regexp_replace(code_source_revision, '^sha256:', '')
            )::text AS chunks_with_hash_equal_code_source_revision,
            COUNT(DISTINCT chunk_id)::text AS mismatched_chunk_rows
     FROM chunk_revision_join`,
    [repoId, 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc', '74d50c86-8194-45ea-8c3d-61aab737ef83'],
  );
  const membershipRow = sealedMembership.rows[0];
  receipt.selectedGraphifyMembershipCrosscheck = {
    executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
    workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc',
    sourceRefs: Number(membershipRow.source_refs),
    refsMissingExecutionMembership: Number(membershipRow.refs_missing_execution_membership),
    membershipHashMatchesBinding: Number(membershipRow.membership_hash_matches_binding),
    membershipHashDiffersFromBinding: Number(membershipRow.membership_hash_differs_from_binding),
    refsWithCodeSourceRevision: Number(membershipRow.refs_with_code_source_revision),
    refsWithCodeRevisionEqualBindingDigest: Number(membershipRow.refs_with_code_revision_equal_binding_digest),
    refsWithChunkHashEqualCodeSourceRevision: Number(membershipRow.refs_with_chunk_hash_equal_code_source_revision),
    chunksWithHashEqualCodeSourceRevision: Number(membershipRow.chunks_with_hash_equal_code_source_revision),
    mismatchedChunkRows: Number(membershipRow.mismatched_chunk_rows),
  };

  const graphifyFileRuns = await client.query(
    `SELECT DISTINCT ON (gf.source_ref)
            gf.source_ref,
            gf.last_seen_run_id::text AS last_seen_run_id,
            gr.run_id::text AS joined_run_id,
            gr.repository_revision,
            gr.completed_at,
            gf.content_hash,
            gf.source_revision
     FROM public.graphify_files gf
     LEFT JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
     WHERE gf.source_ref = ANY($1::text[])
     ORDER BY gf.source_ref, gr.completed_at DESC NULLS LAST, gf.file_id DESC`,
    [Array.from(sourceGroups.keys())],
  );
  const selectedRunIds = new Map();
  for (const row of graphifyFileRuns.rows) {
    const runId = row.joined_run_id ?? '<no-joined-run>';
    selectedRunIds.set(runId, (selectedRunIds.get(runId) ?? 0) + 1);
  }
  receipt.graphifyFileRunCrosscheck = {
    requestedMismatchSourceRefs: sourceGroups.size,
    graphifyFileRows: graphifyFileRuns.rows.length,
    refsWithLastSeenRunId: graphifyFileRuns.rows.filter((row) => row.last_seen_run_id).length,
    refsWithJoinedRun: graphifyFileRuns.rows.filter((row) => row.joined_run_id).length,
    latestRunIdCounts: Array.from(selectedRunIds, ([runId, sourceRefCount]) => ({ runId, sourceRefCount })),
    rows: graphifyFileRuns.rows.map((row) => ({
      sourceRef: row.source_ref,
      lastSeenRunId: row.last_seen_run_id,
      joinedRunId: row.joined_run_id,
      repositoryRevision: row.repository_revision,
      completedAt: row.completed_at,
      graphifyContentHash: row.content_hash,
      graphifySourceRevision: row.source_revision,
    })),
  };

  const graphifyFileSourceRefs = new Set(graphifyFileRuns.rows.map((row) => row.source_ref));
  const missingGraphifyFileSourceRefs = Array.from(sourceGroups.keys()).filter((sourceRef) => !graphifyFileSourceRefs.has(sourceRef));
  const missingFileMembership = await client.query(
    `SELECT m.source_ref,
            m.execution_id::text AS execution_id,
            m.workspace_revision,
            m.content_hash,
            m.code_source_revision,
            b.content_digest
     FROM public.graphify_execution_file_membership_v2 m
     LEFT JOIN public.atlas_workspace_source_bindings b
       ON b.repo_id = $1
      AND b.workspace_revision = $2
      AND b.canonical_source_ref = m.source_ref
     WHERE m.execution_id = $3::uuid
       AND m.workspace_revision = $2
       AND m.source_ref = ANY($4::text[])
     ORDER BY m.source_ref`,
    [repoId, 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc', '74d50c86-8194-45ea-8c3d-61aab737ef83', missingGraphifyFileSourceRefs],
  );
  receipt.graphifyFileMissingRefMembershipCrosscheck = {
    missingGraphifyFileSourceRefs,
    selectedExecutionMembershipRows: missingFileMembership.rows.length,
    contentHashMatchesBinding: missingFileMembership.rows.filter((row) => row.content_hash === row.content_digest).length,
    codeSourceRevisionMatchesBindingDigest: missingFileMembership.rows.filter((row) =>
      String(row.code_source_revision ?? '').replace(/^sha256:/, '') === row.content_digest,
    ).length,
    rows: missingFileMembership.rows.map((row) => ({
      sourceRef: row.source_ref,
      executionId: row.execution_id,
      workspaceRevision: row.workspace_revision,
      contentHash: row.content_hash,
      codeSourceRevision: row.code_source_revision,
      bindingContentDigest: row.content_digest,
    })),
  };

  const overlapResult = await client.query(
    `WITH scoped_bindings AS MATERIALIZED (
       SELECT workspace_revision, canonical_source_ref, content_digest
       FROM public.atlas_workspace_source_bindings
       WHERE repo_id = $1
     ), chunk_binding_counts AS (
       SELECT c.id AS chunk_id,
              COUNT(DISTINCT b.workspace_revision)::bigint AS revision_count
       FROM scoped_bindings b
       JOIN public.codebase_chunk_index c
         ON c.source_ref = b.canonical_source_ref
         AND c.file_content_hash = b.content_digest
       WHERE c.file_content_hash IS NOT NULL
       GROUP BY c.id
     )
     SELECT COUNT(*)::text AS chunks_with_any_workspace_binding,
            COUNT(*) FILTER (WHERE revision_count = 1)::text AS chunks_in_one_workspace,
            COUNT(*) FILTER (WHERE revision_count > 1)::text AS chunks_overlapping_workspace_revisions,
            MAX(revision_count)::text AS max_workspace_revisions_per_chunk
     FROM chunk_binding_counts`,
    [repoId],
  );

  const overlap = overlapResult.rows[0];
  receipt.crossSnapshotContentDigestCoverage = {
    chunksWithAnyWorkspaceBinding: Number(overlap.chunks_with_any_workspace_binding),
    chunksInOneWorkspace: Number(overlap.chunks_in_one_workspace),
    chunksOverlappingWorkspaceRevisions: Number(overlap.chunks_overlapping_workspace_revisions),
    maxWorkspaceRevisionsPerChunk: Number(overlap.max_workspace_revisions_per_chunk ?? 0),
  };
  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  receipt.status = 'READ_ONLY_AUDIT_FAILED';
  receipt.error = error instanceof Error ? error.message : String(error);
} finally {
  await client.end().catch(() => undefined);
}

const canonicalBody = JSON.stringify(receipt);
receipt.receiptChecksum = `sha256:${crypto.createHash('sha256').update(canonicalBody).digest('hex')}`;
console.log(JSON.stringify(receipt, null, 2));

if (receipt.status !== 'READ_ONLY_AUDIT_COMPLETED') process.exitCode = 1;
