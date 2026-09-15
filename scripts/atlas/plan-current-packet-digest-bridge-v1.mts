#!/usr/bin/env node

/**
 * CURRENT-PACKET-DIGEST-BRIDGE-01
 *
 * Read-only planner that binds one admitted Graphify execution membership
 * cohort to exact materialized snapshot bytes and current atlas_packets rows.
 *
 * Authority rules:
 * - explicit workspace revision + execution ID are required;
 * - workspace revision must equal the admitted tournament receipt;
 * - exact materialized snapshot bytes are the source-byte oracle;
 * - packet identity is never inferred/fuzzy: every exact source_ref candidate
 *   is returned to the pure classifier so ambiguity stays visible;
 * - legacy atlas_packets.sha256/content_hash are corroborating evidence only;
 * - whole-source digest authority is used only when a separately named live
 *   column exists (`source_content_digest` or `file_content_hash`);
 * - no database/cache/vector/graph/GPU writes are performed.
 *
 * Usage from repository root:
 *   npx tsx scripts/atlas/plan-current-packet-digest-bridge-v1.mts \
 *     --workspace-revision=sha256:... --execution-id=<uuid> --limit=128
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildPacketDigestBridgeV1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/packet-digest-bridge-v1.js';
import {
	classifyCurrentPacketDigestReadbackV1,
	type CurrentPacketDigestCandidateV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/identity/current-packet-digest-readback-v1.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ADMISSION_PATH = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/current-packet-digest-bridge-v1.json');

const arg = (name: string): string | null => {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
};

const workspaceRevision = arg('workspace-revision');
const executionId = arg('execution-id');
const limit = Number.parseInt(arg('limit') ?? '128', 10);
if (!workspaceRevision) throw new Error('CURRENT_PACKET_DIGEST_WORKSPACE_REVISION_REQUIRED');
if (!executionId) throw new Error('CURRENT_PACKET_DIGEST_EXECUTION_ID_REQUIRED');
if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) throw new Error('CURRENT_PACKET_DIGEST_LIMIT_INVALID');

const rawAdmission = readFileSync(ADMISSION_PATH, 'utf8');
const admission = JSON.parse(rawAdmission);
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
	throw new Error('CURRENT_PACKET_DIGEST_ADMISSION_NOT_AUTHORITATIVE');
}
if (admission.workspaceRevision !== workspaceRevision) {
	throw new Error(`CURRENT_PACKET_DIGEST_ADMISSION_WORKSPACE_MISMATCH:${admission.workspaceRevision}:${workspaceRevision}`);
}
if (!admission.snapshotRevision) throw new Error('CURRENT_PACKET_DIGEST_ADMISSION_SNAPSHOT_REQUIRED');

const snapshotHex = String(admission.snapshotRevision).replace(/^sha256:/, '');
const materializedRoot = resolve(ROOT, '.tmp/workspace-source-snapshots', snapshotHex);
if (!existsSync(materializedRoot)) throw new Error(`CURRENT_PACKET_DIGEST_MATERIALIZATION_MISSING:${materializedRoot}`);
const safeMaterializedRoot = realpathSync(materializedRoot);

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const admissionReceiptChecksum = `sha256:${sha256(rawAdmission)}`;
const clean = (value: unknown): string | null => {
	if (value == null) return null;
	const text = String(value).trim();
	return text || null;
};
const isNonNullString = (value: string | null): value is string => value !== null;
const normalizeSourceRef = (value: unknown): string => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\/+/, '').replace(/^\.\//, '');
const stable = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
};

const pool = new pg.Pool({
	connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
	max: 1,
	connectionTimeoutMillis: 5_000,
	statement_timeout: 60_000,
	application_name: 'atlas-current-packet-digest-bridge-v1',
});

const client = await pool.connect();
let pgSnapshot: string | null = null;
let report: Record<string, unknown>;
try {
	await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
	await client.query(`SET LOCAL lock_timeout = '5s'`);
	await client.query(`SET LOCAL statement_timeout = '60s'`);
	pgSnapshot = (await client.query('SELECT pg_current_snapshot()::text AS snapshot')).rows[0]?.snapshot ?? null;

	const membershipExists = Boolean((await client.query(
		`SELECT to_regclass('public.graphify_execution_file_membership_v2') IS NOT NULL AS present`,
	)).rows[0]?.present);
	if (!membershipExists) throw new Error('CURRENT_PACKET_DIGEST_MEMBERSHIP_V2_MISSING');

	const packetColumnsRows = (await client.query(
		`SELECT column_name, data_type
		   FROM information_schema.columns
		  WHERE table_schema='public' AND table_name='atlas_packets'`,
	)).rows;
	const packetColumns = new Map(packetColumnsRows.map((row) => [String(row.column_name), String(row.data_type)]));
	for (const required of ['packet_key', 'source_ref', 'source_revision', 'workspace_revision']) {
		if (!packetColumns.has(required)) throw new Error(`CURRENT_PACKET_DIGEST_PACKET_COLUMN_MISSING:${required}`);
	}

	const wholeDigestColumn = packetColumns.has('source_content_digest')
		? 'source_content_digest'
		: packetColumns.has('file_content_hash')
			? 'file_content_hash'
			: null;
	const wholeDigestKind: CurrentPacketDigestCandidateV1['wholeSourceDigestKind'] = wholeDigestColumn === 'source_content_digest'
		? 'SOURCE_CONTENT_DIGEST'
		: wholeDigestColumn === 'file_content_hash'
			? 'FILE_CONTENT_HASH'
			: 'NONE';
	const hasSha256 = packetColumns.has('sha256');
	const hasContentHash = packetColumns.has('content_hash');

	const members = (await client.query(
		`SELECT execution_id::text, repository_id::text, repository_relative_path::text,
		        source_ref::text, workspace_revision::text, code_source_revision::text,
		        content_hash::text, byte_length::bigint
		   FROM public.graphify_execution_file_membership_v2
		  WHERE execution_id = $1::uuid AND workspace_revision = $2
		  ORDER BY repository_id, repository_relative_path
		  LIMIT $3`,
		[executionId, workspaceRevision, limit],
	)).rows;

	const classifications: Record<string, number> = {};
	const rows: Array<Record<string, unknown>> = [];
	for (const member of members) {
		const sourceRef = normalizeSourceRef(member.source_ref);
		const sourceFile = resolve(safeMaterializedRoot, sourceRef);
		let sourceContent: string | null = null;
		let byteReadbackStatus = 'NOT_READ';
		let readError: string | null = null;
		try {
			const resolvedFile = realpathSync(sourceFile);
			if (!resolvedFile.startsWith(safeMaterializedRoot + path.sep)) throw new Error('SOURCE_PATH_ESCAPE');
			const bytes = readFileSync(resolvedFile);
			const byteDigest = sha256(bytes);
			const expectedDigest = String(member.content_hash ?? '').replace(/^sha256:/, '').toLowerCase();
			if (byteDigest !== expectedDigest) throw new Error('MATERIALIZED_SOURCE_DIGEST_MISMATCH');
			if (Number(member.byte_length) !== bytes.byteLength) throw new Error('MATERIALIZED_SOURCE_SIZE_MISMATCH');
			sourceContent = bytes.toString('utf8');
			byteReadbackStatus = 'EXACT_BYTES_PROVEN';
		} catch (error) {
			readError = error instanceof Error ? error.message : String(error);
			byteReadbackStatus = 'BYTE_READBACK_BLOCKED';
		}

		if (sourceContent == null) {
			const classification = 'SOURCE_BYTE_READBACK_BLOCKED';
			classifications[classification] = (classifications[classification] ?? 0) + 1;
			rows.push({ sourceRef, repositoryId: member.repository_id, classification, byteReadbackStatus, readError });
			continue;
		}

		const digestSelect = wholeDigestColumn ? `, ${wholeDigestColumn}::text AS whole_source_digest` : `, NULL::text AS whole_source_digest`;
		const shaSelect = hasSha256 ? `, sha256::text AS legacy_sha256` : `, NULL::text AS legacy_sha256`;
		const contentHashSelect = hasContentHash ? `, content_hash::text AS ambiguous_content_hash` : `, NULL::text AS ambiguous_content_hash`;
		const packetCandidates = (await client.query(
			`SELECT packet_key::text, source_ref::text, source_revision::text,
			        workspace_revision::text
			        ${digestSelect}${shaSelect}${contentHashSelect}
			   FROM public.atlas_packets
			  WHERE source_ref = $1
			  ORDER BY packet_key NULLS LAST, packet_id`,
			[sourceRef],
		)).rows;

		const distinctPacketKeys = [...new Set(
			packetCandidates.map((row) => clean(row.packet_key)).filter(isNonNullString),
		)];
		const provisionalPacketKey = distinctPacketKeys.length === 1 ? distinctPacketKeys[0] : 'UNRESOLVED_PACKET_KEY';
		const bridge = buildPacketDigestBridgeV1({
			packetKey: provisionalPacketKey,
			sourceRef,
			sourceContent,
			admission: {
				status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
				authority: true,
				workspaceRevision,
				snapshotRevision: admission.snapshotRevision,
				sourceInventoryChecksum: admission.sourceInventoryChecksum ?? null,
				sourceSelectionChecksum: admission.sourceSelectionChecksum ?? admission.snapshotMembershipChecksum ?? null,
				admissionReceiptChecksum,
			},
		});

		const candidates: CurrentPacketDigestCandidateV1[] = packetCandidates.map((row) => ({
			packetKey: clean(row.packet_key),
			sourceRef: normalizeSourceRef(row.source_ref),
			sourceRevision: clean(row.source_revision),
			workspaceRevision: clean(row.workspace_revision),
			wholeSourceDigest: clean(row.whole_source_digest),
			wholeSourceDigestKind: wholeDigestKind,
			legacySha256: clean(row.legacy_sha256),
			ambiguousContentHash: clean(row.ambiguous_content_hash),
		}));
		const readback = classifyCurrentPacketDigestReadbackV1(bridge, candidates);
		classifications[readback.classification] = (classifications[readback.classification] ?? 0) + 1;
		rows.push({
			repositoryId: member.repository_id,
			repositoryRelativePath: member.repository_relative_path,
			sourceRef,
			graphifySourceRevision: member.code_source_revision,
			graphifyContentDigest: String(member.content_hash ?? '').replace(/^sha256:/, ''),
			byteReadbackStatus,
			bridgeChecksum: bridge.bridgeChecksum,
			...readback,
		});
	}

	const currentExact = classifications.CURRENT_EXACT ?? 0;
	const reportIdentity = {
		workspaceRevision,
		executionId,
		snapshotRevision: admission.snapshotRevision,
		sourceSelectionChecksum: admission.sourceSelectionChecksum ?? admission.snapshotMembershipChecksum ?? null,
		membershipRows: members.length,
		classifications,
		wholeSourceDigestColumn: wholeDigestColumn,
		wholeSourceDigestKind,
	};
	report = {
		schema: 'atlas.current-packet-digest-bridge-plan.v1',
		generatedAt: new Date().toISOString(),
		mode: 'REPEATABLE_READ_READ_ONLY',
		status: members.length === 0
			? 'CURRENT_PACKET_DIGEST_MEMBERSHIP_EMPTY'
			: currentExact === members.length
				? 'CURRENT_PACKET_DIGEST_BOUNDED_READBACK_PROVEN'
				: 'CURRENT_PACKET_DIGEST_BRIDGE_INCOMPLETE',
		proofLevel: currentExact === members.length && members.length > 0 ? 'BOUNDED_LIVE_PROVEN' : 'READ_ONLY_DIAGNOSTIC',
		pgSnapshot,
		...reportIdentity,
		currentExact,
		rows,
		reportIdentityChecksum: `sha256:${sha256(stable(reportIdentity))}`,
		policy: {
			packetIdentityInferenceAllowed: false,
			legacySha256PromotesAuthority: false,
			ambiguousContentHashPromotesAuthority: false,
			wholeSourceToChunkHashComparisonAllowed: false,
			canonicalMutationAuthorized: false,
		},
		canonicalAuthority: false,
		writesPerformed: false,
		databaseWrites: false,
		cacheWrites: false,
		graphWrites: false,
		gpuWrites: false,
		nextGate: currentExact === members.length && members.length > 0
			? 'CURRENT-PACKET-CHUNK-LINEAGE-READBACK-01'
			: 'CANONICAL-PACKET-DIGEST-PRODUCER-READBACK-01',
	};
	await client.query('ROLLBACK');
} catch (error) {
	try { await client.query('ROLLBACK'); } catch {}
	report = {
		schema: 'atlas.current-packet-digest-bridge-plan.v1',
		generatedAt: new Date().toISOString(),
		mode: 'REPEATABLE_READ_READ_ONLY',
		status: 'CURRENT_PACKET_DIGEST_BRIDGE_READ_UNAVAILABLE',
		proofLevel: 'NOT_PROVEN',
		pgSnapshot,
		workspaceRevision,
		executionId,
		readError: error instanceof Error ? error.message : String(error),
		canonicalAuthority: false,
		writesPerformed: false,
		databaseWrites: false,
		cacheWrites: false,
		graphWrites: false,
		gpuWrites: false,
		nextGate: 'RESTORE_READ_AVAILABILITY_AND_RERUN',
	};
} finally {
	client.release();
	await pool.end();
}

mkdirSync(dirname(REPORT_PATH), { recursive: true });
const tmp = `${REPORT_PATH}.${process.pid}.${Date.now()}.tmp`;
writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
renameSync(tmp, REPORT_PATH);
console.log(JSON.stringify({
	status: report.status,
	proofLevel: report.proofLevel,
	workspaceRevision,
	executionId,
	membershipRows: report.membershipRows ?? 0,
	currentExact: report.currentExact ?? 0,
	classifications: report.classifications ?? {},
	nextGate: report.nextGate,
	reportPath: 'docs/reports/current-packet-digest-bridge-v1.json',
	writesPerformed: false,
}, null, 2));
