#!/usr/bin/env node

/*
 * Guarded source/workspace lineage mirror. This file was added but not run.
 * Dry-run and apply use selectionSql identically; apply additionally requires
 * the frozen 5,000-row count/checksum and the explicit authorization token.
 * No packet identity, content, vector, or representation field is writable.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import {
	canonicalSourceRefSqlV1,
	chunkLineageCandidateChecksumV2,
	classifyChunkLineageMirrorCandidateV2,
	CHUNK_LINEAGE_MIRROR_ASSIGNMENTS_V2,
	CHUNK_LINEAGE_MIRROR_FIELDS_V2,
	digestSqlV1,
	parseChunkLineageMirrorArgsV2,
} from './lib/chunk-lineage-mirror-policy-v2.mjs';

const { values: args, repoId, workspaceRevision, limit, admissionReceipt, apply } = parseChunkLineageMirrorArgsV2(process.argv.slice(2));
const admissionPath = path.resolve(REPO_ROOT, admissionReceipt);
if (!admissionPath.startsWith(`${REPO_ROOT}${path.sep}`)) throw new Error('ADMISSION_RECEIPT_MUST_BE_UNDER_REPOSITORY');

const admission = JSON.parse(await fs.readFile(admissionPath, 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
	|| admission.authority !== true
	|| admission.workspaceRevision !== workspaceRevision) {
	throw new Error('ADMITTED_WORKSPACE_RECEIPT_MISMATCH');
}

const normalizeRefBinding = canonicalSourceRefSqlV1('b.canonical_source_ref');
const normalizeRefChunk = canonicalSourceRefSqlV1('c.source_ref');
const normalizeDigestBinding = digestSqlV1('b.content_digest');
const normalizeDigestChunk = digestSqlV1('c.file_content_hash');

const selectionSql = `
  WITH path_matches AS (
    SELECT c.id, c.source_ref, c.file_content_hash,
           c.source_revision AS chunk_source_revision,
           c.workspace_revision AS chunk_workspace_revision,
           c.lineage_binding_checksum AS chunk_binding_checksum,
           c.lineage_producer_revision AS chunk_producer_revision,
           c.representation_revision,
           b.canonical_source_ref AS binding_source_ref,
           b.source_revision AS binding_source_revision,
           b.workspace_revision AS binding_workspace_revision,
           b.content_digest AS binding_content_digest,
           b.binding_checksum,
           b.producer_revision AS binding_producer_revision,
           (${normalizeRefBinding} = ${normalizeRefChunk}) AS path_exact,
           (lower(b.content_digest) = lower(c.file_content_hash)) AS digest_exact,
           count(*) OVER (PARTITION BY c.id)::int AS path_binding_count
      FROM public.codebase_chunk_index c
      JOIN public.atlas_workspace_source_bindings b
        ON b.repo_id = $1
       AND b.workspace_revision = $2
       AND lower(b.canonical_source_ref) = lower(c.source_ref)
       AND lower(b.content_digest) = lower(c.file_content_hash)
     WHERE c.source_ref IS NOT NULL
       AND c.file_content_hash IS NOT NULL
  ), frozen AS (
    SELECT e.*
      FROM path_matches e
     WHERE e.chunk_workspace_revision IS NULL OR e.chunk_source_revision IS NULL
        OR e.chunk_binding_checksum IS NULL OR e.chunk_producer_revision IS NULL
     ORDER BY e.id
     LIMIT $3
  )
  SELECT f.*,
         COALESCE(bridge.proven_source_revisions, ARRAY[]::text[]) AS bridge_source_revisions
    FROM frozen f
    LEFT JOIN LATERAL (
      SELECT array_agg(l.source_revision ORDER BY l.source_revision) AS proven_source_revisions
        FROM public.atlas_packet_chunk_lineage l
       WHERE l.chunk_row_id = f.id
         AND l.revision_status = 'PROVEN'
    ) bridge ON true
   ORDER BY f.id
`;

const caseOnlySql = `
  SELECT count(DISTINCT c.id)::int AS case_insensitive_only_count
    FROM public.codebase_chunk_index c
    JOIN public.atlas_workspace_source_bindings b
      ON b.repo_id = $1
     AND b.workspace_revision = $2
     AND lower(${normalizeRefBinding}) = lower(${normalizeRefChunk})
     AND ${normalizeRefBinding} <> ${normalizeRefChunk}
     AND ${normalizeDigestBinding} = ${normalizeDigestChunk}
   WHERE c.source_ref IS NOT NULL
     AND c.file_content_hash IS NOT NULL
`;

const report = {
	schema: 'atlas.codebase-chunk-lineage-backfill.v2',
	gate: 'CHUNK-LINEAGE-APPLY-01',
	mode: apply ? 'COMMIT_CAPABLE_APPLY' : 'READ_ONLY_DRY_RUN',
	repositoryId: repoId,
	workspaceRevision,
	limit,
	selectionPolicy: 'FROZEN_V1_CASE_FOLDED_5000_ROW_COHORT; CASE_SENSITIVE_CANONICAL_PATH_AND_EXACT_DIGEST_REQUIRED_FOR_ADMISSION',
	representationRevisionTouched: false,
	representationRevision: null,
	authorizationPresent: apply && args.get('authorization') === 'CHUNK-LINEAGE-APPLY-01:COMMIT',
	transactionCommitted: false,
	writesPerformed: false,
	writeColumns: [...CHUNK_LINEAGE_MIRROR_FIELDS_V2],
};

const pool = new pg.Pool({
	connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
	max: 1,
	statement_timeout: 120_000,
	application_name: 'atlas-codebase-chunk-lineage-backfill-v2',
});

let inTransaction = false;
try {
	await pool.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN READ ONLY');
	inTransaction = true;
	const params = [repoId, workspaceRevision, limit];
	const selected = await pool.query(selectionSql, params);
	const candidates = selected.rows.map((row) => ({
		id: String(row.id),
		sourceRef: row.source_ref,
		fileContentHash: row.file_content_hash,
		bindingSourceRef: row.binding_source_ref,
		bindingSourceRevision: row.binding_source_revision,
		bindingWorkspaceRevision: row.binding_workspace_revision,
		bindingChecksum: row.binding_checksum,
		bindingProducerRevision: row.binding_producer_revision,
		bridgeSourceRevisions: row.bridge_source_revisions ?? [],
		chunkSourceRevision: row.chunk_source_revision,
		chunkWorkspaceRevision: row.chunk_workspace_revision,
		chunkBindingChecksum: row.chunk_binding_checksum,
		chunkProducerRevision: row.chunk_producer_revision,
		representationRevision: row.representation_revision,
		pathBindingCount: row.path_binding_count,
		pathExact: row.path_exact,
		digestExact: row.digest_exact,
	}));
	const candidateChecksum = chunkLineageCandidateChecksumV2(candidates);
	const eligible = candidates.filter((candidate) => classifyChunkLineageMirrorCandidateV2(candidate) === 'ELIGIBLE');
	const rejections = {};
	for (const candidate of candidates) {
		const reason = classifyChunkLineageMirrorCandidateV2(candidate);
		if (reason !== 'ELIGIBLE') rejections[reason] = (rejections[reason] ?? 0) + 1;
	}
	const caseOnly = await pool.query(caseOnlySql, [repoId, workspaceRevision]);
	report.candidateCount = candidates.length;
	report.candidateChecksum = candidateChecksum;
	report.eligibleCount = eligible.length;
	report.bridgeBindingConflictCount = rejections.BRIDGE_BINDING_SOURCE_REVISION_CONFLICT ?? 0;
	report.conflictCount = Object.entries(rejections)
		.filter(([reason]) => reason.endsWith('_CONFLICT'))
		.reduce((total, [, count]) => total + count, 0);
	report.skippedCount = candidates.length - eligible.length;
	report.rejections = rejections;
	report.caseInsensitiveOnlyExcludedCount = caseOnly.rows[0]?.case_insensitive_only_count ?? 0;
	report.caseOnlyFrozenCandidateCount = rejections.CASE_INSENSITIVE_SOURCE_REF_ONLY ?? 0;
	report.beforeNullCounts = Object.fromEntries([
		['workspaceRevision', 'chunkWorkspaceRevision'],
		['sourceRevision', 'chunkSourceRevision'],
		['lineageBindingChecksum', 'chunkBindingChecksum'],
		['lineageProducerRevision', 'chunkProducerRevision'],
		['representationRevision', 'representationRevision'],
	].map(([key, field]) => [key, candidates.filter((candidate) => candidate[field] == null).length]));
	report.bridgeBackedCount = candidates.filter((candidate) => candidate.bridgeSourceRevisions.length > 0).length;

	if (apply) {
		if (candidates.length !== limit) throw new Error('FROZEN_CANDIDATE_COUNT_MISMATCH');
		if (candidateChecksum !== args.get('expected-checksum')) throw new Error('FROZEN_CANDIDATE_CHECKSUM_MISMATCH');
		if (report.conflictCount !== 0) throw new Error('FROZEN_CANARY_CONTAINS_LINEAGE_CONFLICT');
		if (eligible.length === 0) throw new Error('NO_ELIGIBLE_ROWS');
		const locked = await pool.query(`
			SELECT id, source_ref, file_content_hash, source_revision, workspace_revision,
			       lineage_binding_checksum, lineage_producer_revision, representation_revision
			  FROM public.codebase_chunk_index
			 WHERE id = ANY($1::uuid[])
			 FOR UPDATE
		`, [candidates.map((candidate) => candidate.id)]);
		if (locked.rowCount !== candidates.length) throw new Error('FROZEN_ROW_LOCK_COUNT_MISMATCH');
		const lockedById = new Map(locked.rows.map((row) => [String(row.id), row]));
		for (const candidate of candidates) {
			const row = lockedById.get(candidate.id);
			if (!row
				|| row.source_ref !== candidate.sourceRef
				|| row.file_content_hash !== candidate.fileContentHash
				|| row.source_revision !== candidate.chunkSourceRevision
				|| row.workspace_revision !== candidate.chunkWorkspaceRevision
				|| row.lineage_binding_checksum !== candidate.chunkBindingChecksum
				|| row.lineage_producer_revision !== candidate.chunkProducerRevision
				|| row.representation_revision !== candidate.representationRevision) {
				throw new Error('FROZEN_ROW_CHANGED_BEFORE_UPDATE');
			}
		}
		const updated = await pool.query(`
			UPDATE public.codebase_chunk_index c
			   SET ${CHUNK_LINEAGE_MIRROR_ASSIGNMENTS_V2.join(',\n\t\t\t       ')}
			  FROM jsonb_to_recordset($1::jsonb) AS s(
			       id uuid, source_ref text, file_content_hash text,
			       workspace_revision text, source_revision text,
			       binding_checksum text, producer_revision text)
			 WHERE c.id = s.id
			   AND c.source_ref = s.source_ref
			   AND c.file_content_hash = s.file_content_hash
			   AND (c.workspace_revision IS NULL OR c.workspace_revision = s.workspace_revision)
			   AND (c.source_revision IS NULL OR c.source_revision = s.source_revision)
			   AND EXISTS (
			       SELECT 1 FROM public.atlas_workspace_source_bindings b
			        WHERE b.repo_id = $2
			          AND b.workspace_revision = $3
			          AND ${normalizeRefBinding} = ${normalizeRefChunk}
			          AND ${normalizeDigestBinding} = ${normalizeDigestChunk}
			          AND b.source_revision = s.source_revision
			          AND b.binding_checksum = s.binding_checksum
			          AND b.producer_revision = s.producer_revision
			   )
			   AND NOT EXISTS (
			       SELECT 1 FROM public.atlas_packet_chunk_lineage l
			        WHERE l.chunk_row_id = c.id
			          AND l.revision_status = 'PROVEN'
			          AND l.source_revision IS DISTINCT FROM s.source_revision
			   )
			RETURNING c.id, c.workspace_revision, c.source_revision,
			          c.lineage_binding_checksum, c.lineage_producer_revision,
			          c.representation_revision
		`, [JSON.stringify(eligible.map((candidate) => ({
			id: candidate.id,
			source_ref: candidate.sourceRef,
			file_content_hash: candidate.fileContentHash,
			workspace_revision: candidate.bindingWorkspaceRevision,
			source_revision: candidate.bindingSourceRevision,
			binding_checksum: candidate.bindingChecksum,
			producer_revision: candidate.bindingProducerRevision,
		}))), repoId, workspaceRevision]);
		if (updated.rowCount !== eligible.length) throw new Error('UPDATE_READBACK_COUNT_MISMATCH');
		const updatedIds = new Set(updated.rows.map((row) => String(row.id)));
		if (eligible.some((candidate) => !updatedIds.has(candidate.id))) throw new Error('UNEXPECTED_UPDATED_ID_SET');
		const readback = await pool.query(`
			SELECT id, source_ref, file_content_hash, source_revision, workspace_revision,
			       lineage_binding_checksum, lineage_producer_revision, representation_revision
			  FROM public.codebase_chunk_index
			 WHERE id = ANY($1::uuid[])
		`, [candidates.map((candidate) => candidate.id)]);
		if (readback.rowCount !== candidates.length) throw new Error('FINAL_READBACK_COUNT_MISMATCH');
		const byId = new Map(readback.rows.map((row) => [String(row.id), row]));
		for (const candidate of candidates) {
			const row = byId.get(candidate.id);
			const isEligible = classifyChunkLineageMirrorCandidateV2(candidate) === 'ELIGIBLE';
			const expectedSourceRevision = isEligible ? candidate.bindingSourceRevision : candidate.chunkSourceRevision;
			const expectedWorkspaceRevision = isEligible ? candidate.bindingWorkspaceRevision : candidate.chunkWorkspaceRevision;
			const expectedBindingChecksum = isEligible ? candidate.bindingChecksum : candidate.chunkBindingChecksum;
			const expectedProducerRevision = isEligible ? candidate.bindingProducerRevision : candidate.chunkProducerRevision;
			if (!row
				|| row.source_ref !== candidate.sourceRef
				|| row.file_content_hash !== candidate.fileContentHash
				|| row.workspace_revision !== expectedWorkspaceRevision
				|| row.source_revision !== expectedSourceRevision
				|| row.lineage_binding_checksum !== expectedBindingChecksum
				|| row.lineage_producer_revision !== expectedProducerRevision
				|| row.representation_revision !== candidate.representationRevision) {
				throw new Error('LINEAGE_MIRROR_READBACK_MISMATCH');
			}
		}
		report.updatedCount = updated.rowCount;
		report.afterNullCounts = Object.fromEntries([
			['workspaceRevision', 'workspace_revision'],
			['sourceRevision', 'source_revision'],
			['lineageBindingChecksum', 'lineage_binding_checksum'],
			['lineageProducerRevision', 'lineage_producer_revision'],
			['representationRevision', 'representation_revision'],
		].map(([key, field]) => [key, readback.rows.filter((row) => row[field] == null).length]));
		report.readbackPass = true;
		await pool.query('COMMIT');
		inTransaction = false;
		report.transactionCommitted = true;
		report.writesPerformed = true;
		report.status = 'CANARY_COMMITTED_READBACK_PROVEN';
	} else {
		report.updatedCount = 0;
		report.afterNullCounts = { ...report.beforeNullCounts };
		report.readbackPass = null;
		report.status = candidates.length ? 'DRY_RUN_CANDIDATES_READY' : 'DRY_RUN_NO_CANDIDATES';
		await pool.query('ROLLBACK');
		inTransaction = false;
	}
} catch (error) {
	if (inTransaction) await pool.query('ROLLBACK').catch(() => undefined);
	report.transactionCommitted = false;
	report.writesPerformed = false;
	report.status = 'FAILED_ROLLED_BACK';
	report.error = String(error?.message ?? error).slice(0, 300);
} finally {
	await pool.end();
}

const reportDirectory = path.join(REPO_ROOT, 'docs/reports');
await fs.mkdir(reportDirectory, { recursive: true });
const reportPath = path.join(reportDirectory, `chunk-lineage-backfill-v2-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({
	status: report.status,
	mode: report.mode,
	repositoryId: report.repositoryId,
	workspaceRevision: report.workspaceRevision,
	candidateCount: report.candidateCount ?? 0,
	candidateChecksum: report.candidateChecksum ?? null,
	eligibleCount: report.eligibleCount ?? 0,
	conflictCount: report.conflictCount ?? 0,
	caseInsensitiveOnlyExcludedCount: report.caseInsensitiveOnlyExcludedCount ?? 0,
	caseOnlyFrozenCandidateCount: report.caseOnlyFrozenCandidateCount ?? 0,
	writesPerformed: report.writesPerformed,
	transactionCommitted: report.transactionCommitted,
	reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/'),
}, null, 2));
