#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportsDirectory = path.join(root, 'docs', 'reports');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 15000,
});
const checksum = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

let databaseError = null;
let counts = null;
let schema = null;
let reconciliationCandidates = null;
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    schema = (await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('atlas_symbol_versions', 'atlas_ast_nodes', 'atlas_workspace_source_bindings')
      ORDER BY table_name, ordinal_position
    `)).rows;
    counts = (await client.query(`
      WITH versions AS (
        SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision,
               workspace_revision, byte_start, byte_end, upstream_node_id, packet_key
        FROM public.atlas_symbol_versions
      ), path_matches AS (
        SELECT v.symbol_version_id, v.source_revision, v.byte_start, v.byte_end,
               a.source_revision AS ast_source_revision,
               a.start_byte AS ast_start_byte, a.end_byte AS ast_end_byte
        FROM versions v
        JOIN public.atlas_ast_nodes a ON a.relative_path = v.source_ref
      ), packet_matches AS (
        SELECT v.symbol_version_id, v.source_ref, v.source_revision,
               p.source_ref AS packet_source_ref,
               p.source_revision AS packet_source_revision,
               p.workspace_revision_key AS packet_workspace_revision_key
        FROM versions v
        JOIN public.atlas_packets p ON p.packet_key = v.packet_key
      ), tree_packet_matches AS (
        SELECT DISTINCT v.symbol_version_id, v.source_ref, t.source_ref AS tree_source_ref
        FROM versions v
        JOIN public.atlas_tree_nodes t ON t.packet_key = v.packet_key
      ), source_binding_matches AS (
        SELECT v.symbol_version_id,
               count(b.canonical_source_ref)::int AS path_binding_rows,
               count(b.canonical_source_ref) FILTER (
                 WHERE b.source_revision = v.source_revision
               )::int AS source_revision_binding_rows,
               count(b.canonical_source_ref) FILTER (
                 WHERE b.workspace_revision = v.workspace_revision
               )::int AS workspace_revision_binding_rows,
               count(b.canonical_source_ref) FILTER (
                 WHERE b.source_revision = v.source_revision
                   AND b.workspace_revision = v.workspace_revision
               )::int AS exact_binding_rows
        FROM versions v
        LEFT JOIN public.atlas_workspace_source_bindings b
          ON b.canonical_source_ref = v.source_ref
        GROUP BY v.symbol_version_id
      ), packet_binding_crosswalk AS (
        SELECT pm.symbol_version_id, pm.packet_source_revision,
               pm.packet_workspace_revision_key, sb.exact_binding_rows
        FROM packet_matches pm
        JOIN source_binding_matches sb USING (symbol_version_id)
      )
      SELECT
        (SELECT count(*)::int FROM versions) AS symbol_version_rows,
        (SELECT count(DISTINCT stable_symbol_id)::int FROM versions) AS stable_symbol_ids,
        (SELECT count(*)::int FROM versions WHERE source_revision ~ '^sha256:[0-9a-f]{64}$') AS sha256_source_revisions,
        (SELECT count(*)::int FROM versions v
          JOIN public.atlas_ast_nodes a ON a.tree_node_id = v.upstream_node_id) AS upstream_id_equals_tree_node_id_rows,
        (SELECT count(DISTINCT symbol_version_id)::int FROM path_matches) AS source_path_matched_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM path_matches
          WHERE source_revision = ast_source_revision) AS path_and_source_revision_matched_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM path_matches
          WHERE source_revision = ast_source_revision
            AND byte_start = ast_start_byte AND byte_end = ast_end_byte) AS exact_path_revision_span_matched_versions,
        (SELECT count(*)::int FROM path_matches
          WHERE source_revision = ast_source_revision
            AND byte_start = ast_start_byte AND byte_end = ast_end_byte) AS exact_path_revision_span_match_rows,
        (SELECT count(*)::int FROM versions WHERE packet_key IS NOT NULL) AS versions_with_packet_key,
        (SELECT count(DISTINCT symbol_version_id)::int FROM packet_matches) AS packet_key_joined_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM packet_matches
          WHERE source_ref = packet_source_ref) AS packet_key_and_source_ref_matched_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM packet_matches
          WHERE source_ref = packet_source_ref AND source_revision = packet_source_revision) AS packet_source_revision_matched_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM packet_matches
          WHERE packet_source_revision IS NULL) AS packet_source_revision_missing_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM packet_matches
          WHERE packet_source_revision IS NOT NULL AND source_revision <> packet_source_revision) AS packet_source_revision_conflict_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM packet_matches
          WHERE packet_workspace_revision_key IS NULL) AS packet_workspace_revision_missing_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM tree_packet_matches) AS tree_packet_joined_versions,
        (SELECT count(DISTINCT symbol_version_id)::int FROM tree_packet_matches
          WHERE source_ref = tree_source_ref) AS tree_packet_and_source_ref_matched_versions,
        (SELECT count(*)::int FROM source_binding_matches WHERE path_binding_rows > 0) AS source_binding_path_matched_versions,
        (SELECT count(*)::int FROM source_binding_matches WHERE source_revision_binding_rows > 0) AS source_binding_source_revision_matched_versions,
        (SELECT count(*)::int FROM source_binding_matches WHERE workspace_revision_binding_rows > 0) AS source_binding_workspace_revision_matched_versions,
        (SELECT count(*)::int FROM source_binding_matches WHERE exact_binding_rows = 1) AS source_binding_exact_singleton_versions,
        (SELECT count(*)::int FROM source_binding_matches WHERE exact_binding_rows > 1) AS source_binding_exact_ambiguous_versions,
        (SELECT count(*)::int FROM packet_binding_crosswalk
          WHERE packet_source_revision IS NULL AND exact_binding_rows = 1) AS packet_revision_missing_with_exact_binding_versions,
        (SELECT count(*)::int FROM packet_binding_crosswalk
          WHERE packet_source_revision IS NULL AND exact_binding_rows > 1) AS packet_revision_missing_with_ambiguous_binding_versions,
        (SELECT count(*)::int FROM packet_binding_crosswalk
          WHERE packet_source_revision IS NULL AND exact_binding_rows = 0) AS packet_revision_missing_without_exact_binding_versions,
        (SELECT count(*)::int FROM packet_binding_crosswalk
          WHERE packet_workspace_revision_key IS NULL AND exact_binding_rows = 1) AS packet_workspace_missing_with_exact_binding_versions,
        (SELECT count(*)::int FROM packet_binding_crosswalk
          WHERE packet_workspace_revision_key IS NULL AND exact_binding_rows = 0) AS packet_workspace_missing_without_exact_binding_versions
    `)).rows[0];
    reconciliationCandidates = (await client.query(`
      WITH candidates AS (
        SELECT v.symbol_version_id, v.stable_symbol_id, v.packet_key,
               v.source_ref, v.source_revision AS symbol_source_revision,
               v.workspace_revision AS symbol_workspace_revision,
               v.qualified_name, v.signature_normalized, v.byte_start, v.byte_end,
               p.source_revision AS packet_source_revision,
               p.workspace_revision_key AS packet_workspace_revision,
               p.content_hash AS packet_content_hash,
               b.repo_id, b.source_revision AS binding_source_revision,
               b.workspace_revision AS binding_workspace_revision,
               b.content_digest AS binding_content_digest,
               b.byte_length AS binding_byte_length,
               b.binding_checksum,
               count(*) OVER (PARTITION BY v.symbol_version_id)::int AS exact_binding_rows
        FROM public.atlas_symbol_versions v
        JOIN public.atlas_packets p
          ON p.packet_key = v.packet_key AND p.source_ref = v.source_ref
        JOIN public.atlas_workspace_source_bindings b
          ON b.canonical_source_ref = v.source_ref
         AND b.source_revision = v.source_revision
         AND b.workspace_revision = v.workspace_revision
        WHERE p.source_revision IS NULL
          AND p.workspace_revision_key IS NULL
      )
      SELECT symbol_version_id, stable_symbol_id, packet_key, source_ref,
             symbol_source_revision, symbol_workspace_revision, qualified_name,
             signature_normalized, byte_start, byte_end,
             packet_source_revision, packet_workspace_revision, packet_content_hash,
             repo_id, binding_source_revision, binding_workspace_revision,
             binding_content_digest, binding_byte_length, binding_checksum,
             exact_binding_rows
      FROM candidates
      WHERE exact_binding_rows = 1
      ORDER BY source_ref, byte_start, byte_end, symbol_version_id
      LIMIT 100
    `)).rows;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const generatedAt = new Date().toISOString();
const repositoryRealPath = fs.realpathSync(root);
const workspaceByteObservations = (reconciliationCandidates ?? []).map((candidate) => {
  const sourceRef = String(candidate.source_ref ?? '');
  if (!sourceRef || path.isAbsolute(sourceRef) || /^[A-Za-z]:/.test(sourceRef)) {
    return { symbolVersionId: candidate.symbol_version_id, sourceRef, status: 'REJECTED_NON_RELATIVE_SOURCE_REF' };
  }
  const candidatePath = path.resolve(root, ...sourceRef.split(/[\\/]+/));
  const relativePath = path.relative(root, candidatePath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return { symbolVersionId: candidate.symbol_version_id, sourceRef, status: 'REJECTED_PATH_ESCAPE' };
  }
  try {
    const realPath = fs.realpathSync(candidatePath);
    const realRelativePath = path.relative(repositoryRealPath, realPath);
    if (!realRelativePath || realRelativePath === '..' || realRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(realRelativePath)) {
      return { symbolVersionId: candidate.symbol_version_id, sourceRef, status: 'REJECTED_REALPATH_ESCAPE' };
    }
    const bytes = fs.readFileSync(realPath);
    const diskDigest = crypto.createHash('sha256').update(bytes).digest('hex');
    const expectedDigest = String(candidate.binding_content_digest ?? '').replace(/^sha256:/i, '').toLowerCase();
    const expectedLength = Number(candidate.binding_byte_length);
    return {
      symbolVersionId: candidate.symbol_version_id,
      sourceRef,
      status: 'READ_ONLY_SOURCE_BYTES_OBSERVED',
      diskByteLength: bytes.length,
      bindingByteLength: Number.isFinite(expectedLength) ? expectedLength : null,
      byteLengthMatches: Number.isFinite(expectedLength) ? bytes.length === expectedLength : false,
      diskSha256: `sha256:${diskDigest}`,
      bindingDigestMatches: /^[0-9a-f]{64}$/.test(expectedDigest) && diskDigest === expectedDigest,
    };
  } catch (error) {
    return {
      symbolVersionId: candidate.symbol_version_id,
      sourceRef,
      status: error?.code === 'ENOENT' ? 'SOURCE_FILE_MISSING' : 'SOURCE_FILE_UNREADABLE',
      errorCode: error?.code ?? 'UNKNOWN',
    };
  }
});
const workspaceByteSummary = {
  candidateRows: workspaceByteObservations.length,
  readable: workspaceByteObservations.filter((item) => item.status === 'READ_ONLY_SOURCE_BYTES_OBSERVED').length,
  digestMatches: workspaceByteObservations.filter((item) => item.bindingDigestMatches === true).length,
  byteLengthMatches: workspaceByteObservations.filter((item) => item.byteLengthMatches === true).length,
  missing: workspaceByteObservations.filter((item) => item.status === 'SOURCE_FILE_MISSING').length,
  rejectedOrUnreadable: workspaceByteObservations.filter((item) => item.status !== 'READ_ONLY_SOURCE_BYTES_OBSERVED' && item.status !== 'SOURCE_FILE_MISSING').length,
};
let admittedSnapshotCrosswalk = { status: 'NOT_CHECKED', candidateRows: 0 };
try {
  const admissionPath = path.join(root, 'docs', 'reports', 'workspace-revision-tournament-admission-v1.json');
  const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true ||
      !/^sha256:[0-9a-f]{64}$/.test(admission.workspaceRevision ?? '') ||
      !/^sha256:[0-9a-f]{64}$/.test(admission.snapshotRevision ?? '')) {
    throw new Error('ADMITTED_WORKSPACE_SNAPSHOT_AUTHORITY_INVALID');
  }
  const snapshotPath = path.join(root, 'docs', 'reports', 'workspace-source-snapshots', `${admission.snapshotRevision.slice(7)}.json`);
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const {
    schema: snapshotSchema,
    snapshotRevision,
    workspaceRevision: snapshotWorkspaceRevision,
    status: snapshotStatus,
    canonicalAuthority: snapshotCanonicalAuthority,
    datastoreWritesPerformed,
    ...snapshotBody
  } = snapshot;
  const sha256Json = (value) => checksum(JSON.stringify(value));
  const sourceIdentityKeys = snapshot.sources?.map((source) => source.sourceIdentityKey ??
    `${source.repositoryId}:${source.repositoryRelativePath}`) ?? [];
  const sourceContentRows = snapshot.sources?.map((source) => [
    source.sourceIdentityKey ?? `${source.repositoryId}:${source.repositoryRelativePath}`,
    source.sourceRevision,
    source.byteLength,
  ]) ?? [];
  const snapshotIntegrity = {
    snapshotDigestMatches: sha256Json(snapshotBody) === snapshotRevision,
    membershipDigestMatches: sha256Json([...sourceIdentityKeys].sort()) === snapshot.sourceMembershipChecksum &&
      snapshot.sourceMembershipChecksum === admission.snapshotMembershipChecksum,
    sourceContentDigestMatches: sha256Json(sourceContentRows) === snapshot.sourceContentChecksum,
    noViolations: Array.isArray(snapshot.violations) && snapshot.violations.length === 0,
  };
  if (snapshotSchema !== 'atlas.workspace-source-snapshot-capture.v1' ||
      snapshotRevision !== admission.snapshotRevision ||
      snapshotWorkspaceRevision !== null ||
      snapshotStatus !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK' ||
      snapshotCanonicalAuthority !== false || datastoreWritesPerformed !== false ||
      !Array.isArray(snapshot.sources) || Object.values(snapshotIntegrity).some((valid) => !valid)) {
    throw new Error('SEALED_WORKSPACE_SNAPSHOT_ID_MISMATCH');
  }
  const snapshotSources = snapshot.sources.filter((source) => source.repositoryId === 'repo:root');
  const observations = (reconciliationCandidates ?? []).map((candidate) => {
    const matches = snapshotSources.filter((source) => source.sourceRef === candidate.source_ref);
    if (matches.length !== 1) {
      return { symbolVersionId: candidate.symbol_version_id, sourceRef: candidate.source_ref,
        status: matches.length === 0 ? 'SOURCE_NOT_IN_ADMITTED_SNAPSHOT' : 'AMBIGUOUS_SNAPSHOT_SOURCE' };
    }
    const source = matches[0];
    const digest = String(source.contentDigest ?? '').replace(/^sha256:/i, '').toLowerCase();
    const sourceRevision = String(source.sourceRevision ?? '').toLowerCase();
    const matchesBinding = digest === String(candidate.binding_content_digest ?? '').replace(/^sha256:/i, '').toLowerCase() &&
      sourceRevision === String(candidate.binding_source_revision ?? '').toLowerCase() &&
      admission.workspaceRevision === candidate.binding_workspace_revision &&
      Number(source.byteLength) === Number(candidate.binding_byte_length);
    return { symbolVersionId: candidate.symbol_version_id, sourceRef: candidate.source_ref,
      status: matchesBinding ? 'ADMITTED_SNAPSHOT_BINDING_EXACT_MATCH' : 'ADMITTED_SNAPSHOT_BINDING_MISMATCH' };
  });
  const materializedRoot = path.join(root, '.tmp', 'workspace-source-snapshots', admission.snapshotRevision.slice(7));
  const materializedRootReal = fs.realpathSync(materializedRoot);
  const materializedByteObservations = (reconciliationCandidates ?? []).map((candidate) => {
    const sourceRef = String(candidate.source_ref ?? '');
    if (!sourceRef || path.isAbsolute(sourceRef) || /^[A-Za-z]:/.test(sourceRef)) {
      return { symbolVersionId: candidate.symbol_version_id, sourceRef, status: 'REJECTED_NON_RELATIVE_SOURCE_REF' };
    }
    const candidatePath = path.resolve(materializedRoot, ...sourceRef.split(/[\\/]+/));
    const relativePath = path.relative(materializedRoot, candidatePath);
    if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      return { symbolVersionId: candidate.symbol_version_id, sourceRef, status: 'REJECTED_PATH_ESCAPE' };
    }
    try {
      const realPath = fs.realpathSync(candidatePath);
      const realRelativePath = path.relative(materializedRootReal, realPath);
      if (!realRelativePath || realRelativePath === '..' || realRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(realRelativePath)) {
        return { symbolVersionId: candidate.symbol_version_id, sourceRef, status: 'REJECTED_REALPATH_ESCAPE' };
      }
      const bytes = fs.readFileSync(realPath);
      const diskDigest = crypto.createHash('sha256').update(bytes).digest('hex');
      const expectedDigest = String(candidate.binding_content_digest ?? '').replace(/^sha256:/i, '').toLowerCase();
      const expectedRevision = String(candidate.binding_source_revision ?? '').toLowerCase();
      const expectedLength = Number(candidate.binding_byte_length);
      const byteStart = Number(candidate.byte_start);
      const byteEnd = Number(candidate.byte_end);
      let validUtf8 = true;
      try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { validUtf8 = false; }
      const isUtf8Boundary = (offset) => Number.isInteger(offset) && offset >= 0 && offset <= bytes.length &&
        (offset === 0 || offset === bytes.length || (bytes[offset] & 0xc0) !== 0x80);
      const byteSpanInBounds = Number.isInteger(byteStart) && Number.isInteger(byteEnd) &&
        byteStart >= 0 && byteEnd >= byteStart && byteEnd <= bytes.length;
      return {
        symbolVersionId: candidate.symbol_version_id,
        sourceRef,
        status: 'READ_ONLY_ADMITTED_SNAPSHOT_BYTES_OBSERVED',
        byteLength: bytes.length,
        byteLengthMatches: Number.isFinite(expectedLength) && bytes.length === expectedLength,
        sha256: `sha256:${diskDigest}`,
        digestMatches: /^[0-9a-f]{64}$/.test(expectedDigest) && diskDigest === expectedDigest,
        sourceRevisionMatches: `sha256:${diskDigest}` === expectedRevision,
        validUtf8,
        byteSpanInBounds,
        byteSpanAtUtf8Boundaries: validUtf8 && byteSpanInBounds && isUtf8Boundary(byteStart) && isUtf8Boundary(byteEnd),
      };
    } catch (error) {
      return {
        symbolVersionId: candidate.symbol_version_id,
        sourceRef,
        status: error?.code === 'ENOENT' ? 'MATERIALIZED_SOURCE_MISSING' : 'MATERIALIZED_SOURCE_UNREADABLE',
        errorCode: error?.code ?? 'UNKNOWN',
      };
    }
  });
  admittedSnapshotCrosswalk = {
    status: 'ADMITTED_SNAPSHOT_CHECKED',
    admittedWorkspaceRevision: admission.workspaceRevision,
    snapshotRevision: admission.snapshotRevision,
    snapshotStatus,
    snapshotCanonicalAuthority,
    snapshotIntegrity,
    snapshotPath: path.relative(root, snapshotPath).replace(/\\/g, '/'),
    materializedRoot: path.relative(root, materializedRoot).replace(/\\/g, '/'),
    rootSourceCount: snapshotSources.length,
    candidateRows: observations.length,
    exactMatches: observations.filter((item) => item.status === 'ADMITTED_SNAPSHOT_BINDING_EXACT_MATCH').length,
    missing: observations.filter((item) => item.status === 'SOURCE_NOT_IN_ADMITTED_SNAPSHOT').length,
    ambiguous: observations.filter((item) => item.status === 'AMBIGUOUS_SNAPSHOT_SOURCE').length,
    mismatches: observations.filter((item) => item.status === 'ADMITTED_SNAPSHOT_BINDING_MISMATCH').length,
    observations,
    materializedBytes: {
      candidateRows: materializedByteObservations.length,
      readable: materializedByteObservations.filter((item) => item.status === 'READ_ONLY_ADMITTED_SNAPSHOT_BYTES_OBSERVED').length,
      digestMatches: materializedByteObservations.filter((item) => item.digestMatches === true).length,
      revisionMatches: materializedByteObservations.filter((item) => item.sourceRevisionMatches === true).length,
      byteLengthMatches: materializedByteObservations.filter((item) => item.byteLengthMatches === true).length,
      validUtf8: materializedByteObservations.filter((item) => item.validUtf8 === true).length,
      byteSpansInBounds: materializedByteObservations.filter((item) => item.byteSpanInBounds === true).length,
      byteSpansAtUtf8Boundaries: materializedByteObservations.filter((item) => item.byteSpanAtUtf8Boundaries === true).length,
      missing: materializedByteObservations.filter((item) => item.status === 'MATERIALIZED_SOURCE_MISSING').length,
      failures: materializedByteObservations.filter((item) => item.status !== 'READ_ONLY_ADMITTED_SNAPSHOT_BYTES_OBSERVED' ||
        !item.digestMatches || !item.sourceRevisionMatches || !item.byteLengthMatches || !item.validUtf8 ||
        !item.byteSpanInBounds || !item.byteSpanAtUtf8Boundaries).length,
      observations: materializedByteObservations,
    },
  };
} catch (error) {
  admittedSnapshotCrosswalk = {
    status: 'ADMITTED_SNAPSHOT_CHECK_FAILED',
    error: error instanceof Error ? error.message : String(error),
    candidateRows: reconciliationCandidates?.length ?? 0,
  };
}
const report = {
  schema: 'atlas.symbol-ast-identity-crosswalk.v1',
  generatedAt,
  mode: 'POSTGRES_REPEATABLE_READ_READ_ONLY',
  status: databaseError ? 'DATABASE_AUDIT_FAILED' : 'CROSSWALK_PARTIAL',
  databaseError,
  counts,
  reconciliationCandidates,
  workspaceByteObservations,
  workspaceByteSummary,
  admittedSnapshotCrosswalk,
  identitySemantics: {
    treeNodeId: 'AST database projection-row key; producer formula does not include source revision or byte span',
    upstreamNodeId: 'symbol-version provenance field; equality with tree_node_id is tested, not assumed',
    treeNodeOccurrenceId: 'separate revision/span observation identity; not a column in the two audited table schemas',
    symbolVersionId: 'versioned registry key; direct producer join to AST rows remains unproven',
  },
  schemaColumns: schema,
  authority: false,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  caveats: [
    'The path join uses only exact atlas_symbol_versions.source_ref = atlas_ast_nodes.relative_path; alternate path normalization is not inferred.',
    'Counts are live row crosswalk observations, not proof that unmatched rows should be repaired or promoted.',
    'Candidate rows are exact symbol-to-source-binding matches with both packet revision fields missing; packet content_hash is included for diagnosis only and is not treated as comparable to content_digest because the packet writer documents a distinct historical recipe.',
    'Workspace byte observations hash only bounded candidate source files under the repository root; file contents are not included in the receipt. A matching current-worktree digest is not itself packet-writer authorization or independent database readback.',
    'The admitted-snapshot crosswalk compares binding metadata to the immutable admitted snapshot manifest; the manifest is not source-byte storage and does not replace live source readback or authorize packet writes.',
    'Materialized snapshot byte observations read only candidate files from the snapshot-revision directory with lexical and real-path containment checks; they record hashes and lengths, never source contents. Snapshot byte parity does not promote canonical identity or authorize packet writes.',
    'No identity, source revision, parser output, or canonical row was changed.',
  ],
  likely_cause: 'Symbol-version upstream node identifiers and AST projection tree_node_id values represent different identity axes, and most rows lack an exact source-revision-span crosswalk under the tested path key.',
  evidence: ['public.atlas_symbol_versions', 'public.atlas_ast_nodes', 'scripts/atlas/lib/atlas-ast-nodes-writer.mjs', 'sveltekit-frontend/src/lib/server/atlas/identity/tree-node-occurrence-v1.ts'],
  patch_targets: ['scripts/atlas/audit-symbol-ast-identity-crosswalk-v1.mjs', 'openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md'],
  safe_next_command: 'node scripts/atlas/audit-symbol-ast-identity-crosswalk-v1.mjs',
  smoke_command: 'node scripts/atlas/audit-symbol-ast-identity-crosswalk-v1.mjs',
};
const suffix = generatedAt.replace(/[:.]/g, '-');
const reportPath = path.join(reportsDirectory, `symbol-ast-identity-crosswalk-v1-${suffix}.json`);
report.reportPath = path.relative(root, reportPath).replace(/\\/g, '/');
report.checksum = checksum(JSON.stringify(report));
fs.mkdirSync(reportsDirectory, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ schema: report.schema, status: report.status, counts, reportPath: report.reportPath, databaseError }, null, 2));
