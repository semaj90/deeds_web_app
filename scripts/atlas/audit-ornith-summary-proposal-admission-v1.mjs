#!/usr/bin/env node

/** Read-only repeatable-read revalidation of a sealed summary proposal canary. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map(process.argv.slice(2).map((arg) => {
	const split = arg.indexOf('=');
	return split < 0 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, split), arg.slice(split + 1)];
}));
const manifestArg = args.get('manifest');
if (!manifestArg) throw new Error('MANIFEST_REQUIRED');
const manifestPath = path.resolve(REPO_ROOT, manifestArg);
const manifestDir = path.dirname(manifestPath);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const prefixed = (value) => `sha256:${hash(value)}`;
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (manifest.schema !== 'atlas.ornith-lineage-bound-summary-proposal-manifest.v1' || manifest.canonicalAuthority !== false) {
	throw new Error('UNSUPPORTED_OR_CANONICAL_MANIFEST');
}
const proposals = [];
for (const shard of manifest.shards ?? []) {
	const bytes = await fs.readFile(path.resolve(manifestDir, shard.path));
	if (prefixed(bytes) !== shard.sha256) throw new Error(`SHARD_CHECKSUM_MISMATCH:${shard.path}`);
	const rows = bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
	if (rows.length !== shard.rows) throw new Error(`SHARD_ROW_COUNT_MISMATCH:${shard.path}`);
	proposals.push(...rows);
}
if (proposals.length !== manifest.counts?.generated) throw new Error('MANIFEST_GENERATED_COUNT_MISMATCH');
const root = prefixed(JSON.stringify(proposals.map((row) => row.summarySha256)));
if (root !== manifest.rootChecksum) throw new Error('PROPOSAL_ROOT_CHECKSUM_MISMATCH');

const pool = new pg.Pool({
	connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
	max: 1,
	connectionTimeoutMillis: 5000,
	statement_timeout: 30000,
});
const client = await pool.connect();
let rowReadbacks = [];
try {
	await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
	const result = await client.query(`
		WITH p AS (
			SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
				"sourceIdentityKey" text, "chunkRowId" uuid, "chunkId" text, "chunkCanonicalId" text,
				"sourceRef" text, "sourceRevision" text, "workspaceRevision" text,
				"inputTextSha256" text, "summarySha256" text, "evidenceRefs" jsonb
			)
		)
		SELECT p."sourceIdentityKey", p."chunkRowId"::text AS "chunkRowId",
			p."chunkId", p."chunkCanonicalId", p."sourceRef",
			p."sourceRevision", p."workspaceRevision", p."inputTextSha256",
			p."summarySha256", p."evidenceRefs",
			ci.id IS NOT NULL AS "rowExists",
			(ci.chunk_id = p."chunkId" AND ci.source_ref = p."sourceRef") AS "chunkIdentityMatches",
			(encode(sha256(convert_to(ci.content, 'UTF8')), 'hex') = p."inputTextSha256") AS "inputTextMatches",
			ci.source_revision AS "rowSourceRevisionMirror",
			ci.workspace_revision AS "rowWorkspaceRevisionMirror",
			ci.summary_text AS "summaryTextBefore",
			ci.summary_provenance AS "summaryProvenanceBefore",
			ci.summary_hash AS "summaryHashBefore",
			ci.summary_model AS "summaryModelBefore",
			(ci.summary_text IS NULL AND ci.summary_provenance IS NULL) AS "summaryTargetsEmpty",
			ci.summary_hash IS NOT NULL AS "existingSummaryHashPresent",
			EXISTS (
				SELECT 1 FROM public.atlas_workspace_source_bindings b
				WHERE b.repo_id = $2 AND b.workspace_revision = p."workspaceRevision"
					AND b.canonical_source_ref = p."sourceRef"
					AND b.source_revision = p."sourceRevision"
			) AS "exactSourceBinding",
			EXISTS (
				SELECT 1 FROM public.atlas_packet_chunk_lineage l
				WHERE l.chunk_row_id = ci.id AND l.canonical_chunk_id = p."chunkCanonicalId"
					AND l.source_ref = p."sourceRef" AND l.source_revision = p."sourceRevision"
					AND l.revision_status = 'PROVEN'
			) AS "exactChunkLineage",
			(
				SELECT b.binding_checksum FROM public.atlas_workspace_source_bindings b
				WHERE b.repo_id = $2 AND b.workspace_revision = p."workspaceRevision"
					AND b.canonical_source_ref = p."sourceRef"
					AND b.source_revision = p."sourceRevision"
				LIMIT 1
			) AS "bindingChecksum"
		FROM p LEFT JOIN public.codebase_chunk_index ci ON ci.id = p."chunkRowId"
		ORDER BY p."chunkRowId"
	`, [JSON.stringify(proposals), manifest.scope.repositoryId]);
	rowReadbacks = result.rows;
	await client.query('ROLLBACK');
} catch (error) {
	try { await client.query('ROLLBACK'); } catch { /* transaction already ended */ }
	throw error;
} finally {
	client.release();
	await pool.end();
}

const checkedRows = rowReadbacks.map((row) => {
	const expectedBindingRef = `binding_checksum:${row.bindingChecksum}`;
	const bindingEvidenceMatches = Array.isArray(row.evidenceRefs) && row.evidenceRefs.includes(expectedBindingRef);
	const sourceIdentityKeyPresent = typeof row.sourceIdentityKey === 'string' && row.sourceIdentityKey.trim().length > 0;
	return {
		chunkRowId: row.chunkRowId,
		sourceIdentityKey: row.sourceIdentityKey,
		chunkId: row.chunkId,
		chunkCanonicalId: row.chunkCanonicalId,
		sourceRef: row.sourceRef,
		sourceRevision: row.sourceRevision,
		workspaceRevision: row.workspaceRevision,
		inputTextSha256: row.inputTextSha256,
		summarySha256: row.summarySha256,
		rowExists: row.rowExists,
		chunkIdentityMatches: row.chunkIdentityMatches,
		inputTextMatches: row.inputTextMatches,
		exactSourceBinding: row.exactSourceBinding,
		exactChunkLineage: row.exactChunkLineage,
		bindingEvidenceMatches,
		sourceIdentityKeyPresent,
		summaryTargetsEmpty: row.summaryTargetsEmpty,
		existingSummaryHashPresent: row.existingSummaryHashPresent,
		summaryTextBefore: row.summaryTextBefore,
		summaryProvenanceBefore: row.summaryProvenanceBefore,
		summaryHashBefore: row.summaryHashBefore,
		summaryModelBefore: row.summaryModelBefore,
		rowSourceRevisionMirror: row.rowSourceRevisionMirror,
		rowWorkspaceRevisionMirror: row.rowWorkspaceRevisionMirror,
		rowSourceRevisionMirrorPresent: row.rowSourceRevisionMirror != null,
		rowWorkspaceRevisionMirrorPresent: row.rowWorkspaceRevisionMirror != null,
	};
});
const mustPass = [
	'rowExists', 'chunkIdentityMatches', 'inputTextMatches', 'exactSourceBinding',
	'exactChunkLineage', 'bindingEvidenceMatches', 'sourceIdentityKeyPresent', 'summaryTargetsEmpty',
];
const counts = Object.fromEntries(mustPass.map((key) => [key, checkedRows.filter((row) => row[key]).length]));
const planEligible = checkedRows.filter((row) => mustPass.every((key) => row[key])).length;
const digestPreimage = JSON.stringify(checkedRows.map((row) => ({
	chunkRowId: row.chunkRowId,
	chunkId: row.chunkId,
	chunkCanonicalId: row.chunkCanonicalId,
	sourceRef: row.sourceRef,
	sourceRevision: row.sourceRevision,
	workspaceRevision: row.workspaceRevision,
	inputTextSha256: row.inputTextSha256,
	summaryTextBefore: row.summaryTextBefore,
	summaryProvenanceBefore: row.summaryProvenanceBefore,
	summaryHashBefore: row.summaryHashBefore,
	summaryModelBefore: row.summaryModelBefore,
	rowSourceRevisionMirror: row.rowSourceRevisionMirror,
	rowWorkspaceRevisionMirror: row.rowWorkspaceRevisionMirror,
})));
const report = {
	schema: 'atlas.ornith-summary-proposal-admission-plan.v1',
	mode: 'PLAN_ONLY_READ_ONLY',
	status: planEligible === proposals.length && proposals.length > 0 ? 'CANARY_TARGETS_REVALIDATED' : 'BLOCKED',
	canonicalAuthority: false,
	databaseWrites: 0,
	projectionWrites: 0,
	graphifyRuns: 0,
	manifestPath: path.relative(REPO_ROOT, manifestPath).replaceAll('\\', '/'),
	manifestRootChecksum: manifest.rootChecksum,
	scope: manifest.scope,
	counts: { proposals: proposals.length, ...counts, planEligible },
	rowRevisionMirrors: {
	sourceRevisionPresent: checkedRows.filter((row) => row.rowSourceRevisionMirrorPresent).length,
	workspaceRevisionPresent: checkedRows.filter((row) => row.rowWorkspaceRevisionMirrorPresent).length,
	interpretation: 'sourceIdentityKey is carried from the proposal producer and is not re-derived here; optional codebase_chunk_index revision mirrors are reported, not used as authority. Exact source binding and proven chunk lineage are required.',
	},
	priorSummaryHashPresent: checkedRows.filter((row) => row.existingSummaryHashPresent).length,
	priorTargetSnapshotSha256: prefixed(digestPreimage),
	snapshotDefinition: 'Stable chunk identity and exact revision evidence plus pre-write summary_text, summary_provenance, summary_hash, summary_model, and row revision mirrors.',
	rows: checkedRows,
	writerGate: 'CANONICAL_SUMMARY_ADMISSION_WRITER_NOT_PROVEN',
	nextGate: 'PROVE_OR_SELECT_EXISTING_CANONICAL_CHUNK_SUMMARY_WRITER; no apply performed',
	generatedAt: new Date().toISOString(),
};
const outDir = path.join(REPO_ROOT, '.tmp/atlas/ornith-summary-proposals-v1/admission-plans');
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${Date.now()}-${hash(JSON.stringify(report)).slice(0, 12)}.json`);
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ reportPath: path.relative(REPO_ROOT, outPath).replaceAll('\\', '/'), status: report.status, counts: report.counts, rowRevisionMirrors: report.rowRevisionMirrors, priorTargetSnapshotSha256: report.priorTargetSnapshotSha256, writerGate: report.writerGate, databaseWrites: 0 }, null, 2));
