#!/usr/bin/env node
/**
 * Reduced Parent Atlas packet transport proof.
 *
 * Proves only:
 *   Postgres canonical packet
 *   -> strict five-field payload
 *   -> isolated Qdrant upsert
 *   -> exact readback
 *   -> packet_key Postgres join-back
 *
 * It does NOT prove representation identity, source revision, symbol identity,
 * production writer integration, ANN quality, RRF, PageRank, summaries, or ACE.
 *
 * Requirements:
 *   - Node.js 20+ (22 recommended)
 *   - `pg` available in the workspace
 *   - DATABASE_URL
 *   - Qdrant reachable at QDRANT_URL (default http://127.0.0.1:6333)
 *
 * Recommended repository path:
 *   scripts/atlas/prove-reduced-packet-transport.mts
 *
 * Example:
 *   npx tsx scripts/atlas/prove-reduced-packet-transport.mts \
 *     --limit=20 \
 *     --source-collection=codebase_chunks_768 \
 *     --proof-collection=codebase_chunks_768_packet_proof
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;

type JsonRecord = Record<string, unknown>;

type PacketRow = {
	packet_key: string;
	source_ref: string;
	workspace_id: string;
	workspace_revision: number;
	representation_revision: number;
};

type ReducedPacketPayload = {
	packet_key: string;
	source_ref: string;
	workspace_id: string;
	workspace_revision: number;
	representation_revision: number;
	qdrant_point_id: string;
};

type SourceVectorMatch = {
	sourcePointId: string | number;
	vector: number[] | Record<string, number[]>;
};

type Metrics = {
	fixture_rows_examined: number;
	fixture_rows_selected: number;
	transport_qualified_rows: number;
	vector_matched_rows: number;
	vector_unmatched_rows: number;
	vector_ambiguous_rows: number;
	writer_rejected_count: number;
	qdrant_upserted_count: number;
	qdrant_readback_count: number;
	payload_complete_count: number;
	payload_incomplete_count: number;
	packet_key_present_count: number;
	source_ref_present_count: number;
	workspace_id_present_count: number;
	workspace_revision_present_count: number;
	representation_revision_present_count: number;
	qdrant_point_id_present_count: number;
	packet_joined_count: number;
	packet_join_failed_count: number;
	workspace_value_match_count: number;
	workspace_revision_match_count: number;
	representation_revision_match_count: number;
	negative_tests_passed: number;
	negative_tests_failed: number;
	production_collections_modified_count: number;
};

type NegativeTestResult = {
	name: string;
	passed: boolean;
	detail: string;
};

type QdrantVectorContract =
	| {
			mode: 'unnamed';
			size: number;
			distance: string;
	  }
	| {
			mode: 'named';
			name: string;
			size: number;
			distance: string;
	  };

type Config = {
	databaseUrl: string;
	qdrantUrl: string;
	sourceCollection: string;
	proofCollection: string;
	vectorName?: string;
	fixtureLimit: number;
	candidateLimit: number;
	reportDir: string;
	recreateProofCollection: boolean;
	cleanupOnly: boolean;
};

class ProofError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProofError';
	}
}

function parseArgs(argv: string[]): Config {
	const getArg = (name: string): string | undefined => {
		const prefix = `--${name}=`;
		return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
	};

	const hasFlag = (name: string): boolean => argv.includes(`--${name}`);

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new ProofError('DATABASE_URL is required.');
	}

	const sourceCollection =
		getArg('source-collection') ??
		process.env.QDRANT_SOURCE_COLLECTION ??
		'codebase_chunks_768';

	const proofCollection =
		getArg('proof-collection') ??
		process.env.QDRANT_PROOF_COLLECTION ??
		'codebase_chunks_768_packet_proof';

	if (proofCollection === sourceCollection) {
		throw new ProofError('Proof collection must not equal the source collection.');
	}
	if (!proofCollection.toLowerCase().includes('proof')) {
		throw new ProofError(
			`Refusing to mutate collection "${proofCollection}" because its name does not contain "proof".`,
		);
	}

	const fixtureLimit = Number(getArg('limit') ?? process.env.FIXTURE_LIMIT ?? '20');
	const candidateLimit = Number(
		getArg('candidate-limit') ?? process.env.FIXTURE_CANDIDATE_LIMIT ?? '500',
	);

	if (!Number.isInteger(fixtureLimit) || fixtureLimit < 1 || fixtureLimit > 100) {
		throw new ProofError('--limit must be an integer from 1 to 100.');
	}
	if (!Number.isInteger(candidateLimit) || candidateLimit < fixtureLimit) {
		throw new ProofError('--candidate-limit must be an integer >= --limit.');
	}

	return {
		databaseUrl,
		qdrantUrl: (
			getArg('qdrant-url') ??
			process.env.QDRANT_URL ??
			'http://127.0.0.1:6333'
		).replace(/\/+$/, ''),
		sourceCollection,
		proofCollection,
		vectorName: getArg('vector-name') ?? process.env.QDRANT_VECTOR_NAME,
		fixtureLimit,
		candidateLimit,
		reportDir:
			getArg('report-dir') ??
			process.env.PARENT_ATLAS_REPORT_DIR ??
			path.join('docs', 'reports', 'parent-atlas'),
		recreateProofCollection: !hasFlag('keep-existing-proof'),
		cleanupOnly: hasFlag('cleanup'),
	};
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new ProofError(`MISSING_${field.toUpperCase()}`);
	}
}

function assertInteger(value: unknown, field: string): asserts value is number {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new ProofError(`MISSING_OR_INVALID_${field.toUpperCase()}`);
	}
}

export function buildReducedPacketPayload(
	input: Partial<{
		packetKey: string;
		sourceRef: string;
		workspaceId: string;
		workspaceRevision: number;
		representationRevision: number;
		qdrantPointId: string;
		treeNodeId: string;
	}>,
): ReducedPacketPayload {
	assertNonEmptyString(input.packetKey, 'packet_key');
	assertNonEmptyString(input.sourceRef, 'source_ref');
	assertNonEmptyString(input.workspaceId, 'workspace_id');
	assertInteger(input.workspaceRevision, 'workspace_revision');
	assertInteger(input.representationRevision, 'representation_revision');
	assertNonEmptyString(input.qdrantPointId, 'qdrant_point_id');

	return {
		packet_key: input.packetKey,
		source_ref: input.sourceRef,
		workspace_id: input.workspaceId,
		workspace_revision: input.workspaceRevision,
		representation_revision: input.representationRevision,
		qdrant_point_id: input.qdrantPointId,
	};
}

function deterministicUuid(value: string): string {
	const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
	hex[12] = '4';
	const variant = Number.parseInt(hex[16]!, 16);
	hex[16] = ((variant & 0x3) | 0x8).toString(16);
	const raw = hex.join('');
	return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(
		16,
		20,
	)}-${raw.slice(20)}`;
}

async function qdrantRequest<T>(
	config: Config,
	endpoint: string,
	init?: RequestInit,
): Promise<T> {
	const response = await fetch(`${config.qdrantUrl}${endpoint}`, {
		...init,
		headers: {
			'content-type': 'application/json',
			...(init?.headers ?? {}),
		},
	});
	const text = await response.text();
	let body: unknown;
	try {
		body = text ? JSON.parse(text) : {};
	} catch {
		throw new ProofError(
			`Qdrant returned non-JSON for ${endpoint}: HTTP ${response.status}: ${text.slice(0, 500)}`,
		);
	}
	if (!response.ok) {
		throw new ProofError(
			`Qdrant request failed for ${endpoint}: HTTP ${response.status}: ${JSON.stringify(body)}`,
		);
	}
	return body as T;
}

async function getCollectionInfo(
	config: Config,
	collection: string,
): Promise<JsonRecord | null> {
	try {
		const response = await qdrantRequest<{ result: JsonRecord }>(
			config,
			`/collections/${encodeURIComponent(collection)}`,
		);
		return response.result;
	} catch (error) {
		if (String(error).includes('HTTP 404')) return null;
		throw error;
	}
}

function getPointsCount(info: JsonRecord | null): number | null {
	const value = info?.points_count;
	return typeof value === 'number' ? value : null;
}

function resolveVectorContract(info: JsonRecord, configuredName?: string): QdrantVectorContract {
	const config = info.config as JsonRecord | undefined;
	const params = config?.params as JsonRecord | undefined;
	const vectors = params?.vectors as unknown;

	if (!vectors || typeof vectors !== 'object' || Array.isArray(vectors)) {
		throw new ProofError('Unable to read source collection vector configuration.');
	}

	const record = vectors as JsonRecord;
	if (typeof record.size === 'number' && typeof record.distance === 'string') {
		return {
			mode: 'unnamed',
			size: record.size,
			distance: record.distance,
		};
	}

	const names = Object.keys(record);
	const selectedName = configuredName ?? (names.length === 1 ? names[0] : undefined);
	if (!selectedName) {
		throw new ProofError(
			`Source collection has named vectors (${names.join(
				', ',
			)}). Supply --vector-name=<name>.`,
		);
	}
	const selected = record[selectedName] as JsonRecord | undefined;
	if (!selected || typeof selected.size !== 'number' || typeof selected.distance !== 'string') {
		throw new ProofError(`Named vector "${selectedName}" does not have size/distance.`);
	}
	return {
		mode: 'named',
		name: selectedName,
		size: selected.size,
		distance: selected.distance,
	};
}

async function deleteProofCollectionIfPresent(config: Config): Promise<void> {
	const existing = await getCollectionInfo(config, config.proofCollection);
	if (!existing) return;
	await qdrantRequest(config, `/collections/${encodeURIComponent(config.proofCollection)}`, {
		method: 'DELETE',
	});
}

async function createProofCollection(
	config: Config,
	contract: QdrantVectorContract,
): Promise<void> {
	const vectors =
		contract.mode === 'unnamed'
			? { size: contract.size, distance: contract.distance }
			: {
					[contract.name]: {
						size: contract.size,
						distance: contract.distance,
					},
			  };

	await qdrantRequest(config, `/collections/${encodeURIComponent(config.proofCollection)}`, {
		method: 'PUT',
		body: JSON.stringify({ vectors }),
	});
}

async function findSourceVector(
	config: Config,
	contract: QdrantVectorContract,
	sourceRef: string,
): Promise<{ status: 'matched'; value: SourceVectorMatch } | { status: 'missing' | 'ambiguous' }> {
	const response = await qdrantRequest<{
		result: {
			points: Array<{
				id: string | number;
				vector?: number[] | Record<string, number[]>;
			}>;
		};
	}>(config, `/collections/${encodeURIComponent(config.sourceCollection)}/points/scroll`, {
		method: 'POST',
		body: JSON.stringify({
			filter: {
				must: [{ key: 'source_ref', match: { value: sourceRef } }],
			},
			limit: 2,
			with_payload: false,
			with_vector: true,
		}),
	});

	const points = response.result.points;
	if (points.length === 0) return { status: 'missing' };
	if (points.length > 1) return { status: 'ambiguous' };

	const point = points[0]!;
	if (!point.vector) return { status: 'missing' };

	if (contract.mode === 'unnamed') {
		if (!Array.isArray(point.vector) || point.vector.length !== contract.size) {
			throw new ProofError(
				`Source vector for ${sourceRef} does not match unnamed dimension ${contract.size}.`,
			);
		}
		return {
			status: 'matched',
			value: { sourcePointId: point.id, vector: point.vector },
		};
	}

	const vectorRecord = point.vector as Record<string, number[]>;
	const selected = vectorRecord[contract.name];
	if (!Array.isArray(selected) || selected.length !== contract.size) {
		throw new ProofError(
			`Source point for ${sourceRef} lacks named vector "${contract.name}" of size ${contract.size}.`,
		);
	}
	return {
		status: 'matched',
		value: {
			sourcePointId: point.id,
			vector: { [contract.name]: selected },
		},
	};
}

async function selectCandidateRows(
	pool: pg.Pool,
	candidateLimit: number,
): Promise<{ totalRows: number; rows: PacketRow[]; missing: Record<string, number> }> {
	const coverage = await pool.query<{
		total_rows: string;
		missing_packet_key_count: string;
		missing_source_ref_count: string;
		missing_workspace_id_count: string;
		missing_workspace_revision_count: string;
		missing_representation_revision_count: string;
	}>(`
		SELECT
			COUNT(*)::text AS total_rows,
			COUNT(*) FILTER (WHERE packet_key IS NULL OR btrim(packet_key) = '')::text
				AS missing_packet_key_count,
			COUNT(*) FILTER (WHERE source_ref IS NULL OR btrim(source_ref) = '')::text
				AS missing_source_ref_count,
			COUNT(*) FILTER (WHERE workspace_id IS NULL OR btrim(workspace_id) = '')::text
				AS missing_workspace_id_count,
			COUNT(*) FILTER (WHERE workspace_revision IS NULL)::text
				AS missing_workspace_revision_count,
			COUNT(*) FILTER (WHERE representation_revision IS NULL)::text
				AS missing_representation_revision_count
		FROM public.atlas_packets
	`);

	const rows = await pool.query<PacketRow>(
		`
		SELECT
			packet_key,
			source_ref,
			workspace_id,
			workspace_revision,
			representation_revision
		FROM public.atlas_packets
		WHERE packet_key IS NOT NULL
		  AND btrim(packet_key) <> ''
		  AND source_ref IS NOT NULL
		  AND btrim(source_ref) <> ''
		  AND workspace_id IS NOT NULL
		  AND btrim(workspace_id) <> ''
		  AND workspace_revision IS NOT NULL
		  AND representation_revision IS NOT NULL
		ORDER BY packet_key
		LIMIT $1
		`,
		[candidateLimit],
	);

	const c = coverage.rows[0]!;
	return {
		totalRows: Number(c.total_rows),
		rows: rows.rows.map((row) => ({
			...row,
			workspace_revision: Number(row.workspace_revision),
			representation_revision: Number(row.representation_revision),
		})),
		missing: {
			missing_packet_key_count: Number(c.missing_packet_key_count),
			missing_source_ref_count: Number(c.missing_source_ref_count),
			missing_workspace_id_count: Number(c.missing_workspace_id_count),
			missing_workspace_revision_count: Number(c.missing_workspace_revision_count),
			missing_representation_revision_count: Number(
				c.missing_representation_revision_count,
			),
		},
	};
}

async function joinByPacketKeys(
	pool: pg.Pool,
	packetKeys: string[],
): Promise<Map<string, PacketRow>> {
	if (packetKeys.length === 0) return new Map();

	const result = await pool.query<PacketRow>(
		`
		SELECT
			packet_key,
			source_ref,
			workspace_id,
			workspace_revision,
			representation_revision
		FROM public.atlas_packets
		WHERE packet_key = ANY($1::text[])
		`,
		[packetKeys],
	);

	return new Map(
		result.rows.map((row) => [
			row.packet_key,
			{
				...row,
				workspace_revision: Number(row.workspace_revision),
				representation_revision: Number(row.representation_revision),
			},
		]),
	);
}

async function upsertProofPoints(
	config: Config,
	points: Array<{
		id: string;
		vector: number[] | Record<string, number[]>;
		payload: ReducedPacketPayload;
	}>,
): Promise<void> {
	await qdrantRequest(
		config,
		`/collections/${encodeURIComponent(config.proofCollection)}/points?wait=true`,
		{
			method: 'PUT',
			body: JSON.stringify({ points }),
		},
	);
}

async function readBackProofPoints(
	config: Config,
	ids: string[],
): Promise<
	Array<{
		id: string | number;
		payload?: Partial<ReducedPacketPayload>;
	}>
> {
	const response = await qdrantRequest<{
		result: Array<{
			id: string | number;
			payload?: Partial<ReducedPacketPayload>;
		}>;
	}>(config, `/collections/${encodeURIComponent(config.proofCollection)}/points`, {
		method: 'POST',
		body: JSON.stringify({
			ids,
			with_payload: true,
			with_vector: false,
		}),
	});
	return response.result;
}

function validatePayload(payload: Partial<ReducedPacketPayload> | undefined): boolean {
	if (!payload) return false;
	return (
		typeof payload.packet_key === 'string' &&
		payload.packet_key.length > 0 &&
		typeof payload.source_ref === 'string' &&
		payload.source_ref.length > 0 &&
		typeof payload.workspace_id === 'string' &&
		payload.workspace_id.length > 0 &&
		Number.isInteger(payload.workspace_revision) &&
		Number.isInteger(payload.representation_revision) &&
		typeof payload.qdrant_point_id === 'string' &&
		payload.qdrant_point_id.length > 0
	);
}

async function runNegativeTests(
	pool: pg.Pool,
	validInput: {
		packetKey: string;
		sourceRef: string;
		workspaceId: string;
		workspaceRevision: number;
		representationRevision: number;
		qdrantPointId: string;
	},
): Promise<NegativeTestResult[]> {
	const results: NegativeTestResult[] = [];

	const expectReject = (
		name: string,
		input: Parameters<typeof buildReducedPacketPayload>[0],
		expectedFragment: string,
	): void => {
		try {
			buildReducedPacketPayload(input);
			results.push({ name, passed: false, detail: 'Builder unexpectedly accepted input.' });
		} catch (error) {
			const message = String(error);
			results.push({
				name,
				passed: message.includes(expectedFragment),
				detail: message,
			});
		}
	};

	expectReject(
		'missing packet_key is rejected',
		{ ...validInput, packetKey: undefined },
		'MISSING_PACKET_KEY',
	);
	expectReject(
		'missing source_ref is rejected',
		{ ...validInput, sourceRef: undefined },
		'MISSING_SOURCE_REF',
	);
	expectReject(
		'missing workspace_id is rejected',
		{ ...validInput, workspaceId: undefined },
		'MISSING_WORKSPACE_ID',
	);
	expectReject(
		'missing workspace_revision is rejected',
		{ ...validInput, workspaceRevision: undefined },
		'MISSING_OR_INVALID_WORKSPACE_REVISION',
	);
	expectReject(
		'missing representation_revision is rejected',
		{ ...validInput, representationRevision: undefined },
		'MISSING_OR_INVALID_REPRESENTATION_REVISION',
	);
	expectReject(
		'tree_node_id cannot substitute for packet_key',
		{
			...validInput,
			packetKey: undefined,
			treeNodeId: 'tree:structural-only',
		},
		'MISSING_PACKET_KEY',
	);

	const changedPointPayload = buildReducedPacketPayload({
		...validInput,
		qdrantPointId: deterministicUuid(`${validInput.packetKey}:changed-point-id`),
	});
	const changedPointJoin = await joinByPacketKeys(pool, [changedPointPayload.packet_key]);
	results.push({
		name: 'changed qdrant_point_id does not affect packet_key join-back',
		passed: changedPointJoin.has(validInput.packetKey),
		detail: changedPointJoin.has(validInput.packetKey)
			? 'Join succeeded through packet_key.'
			: 'Join failed unexpectedly.',
	});

	const nonexistent = `packet:proof-missing:${Date.now()}`;
	const nonexistentJoin = await joinByPacketKeys(pool, [nonexistent]);
	results.push({
		name: 'nonexistent packet_key produces one explicit join failure',
		passed: nonexistentJoin.size === 0,
		detail:
			nonexistentJoin.size === 0
				? 'No canonical row returned.'
				: `Unexpectedly returned ${nonexistentJoin.size} row(s).`,
	});

	return results;
}

function markdownReport(report: JsonRecord): string {
	const metrics = report.metrics as Metrics;
	const negative = report.negative_tests as NegativeTestResult[];
	const assertions = report.assertions as Array<{ name: string; passed: boolean; detail: string }>;

	const lines: string[] = [
		'# Reduced Packet Transport Fixture',
		'',
		`- Generated: ${report.generated_at}`,
		`- Source collection: \`${report.source_collection}\``,
		`- Proof collection: \`${report.proof_collection}\``,
		`- Proof level: **${report.proof_level}**`,
		'',
		'## Scope',
		'',
		'This proves isolated five-field payload transport, exact Qdrant readback, and `packet_key` Postgres join-back.',
		'It does not prove semantic representation identity, source revision, symbol identity, RRF, PageRank, summaries, ACE, or production migration.',
		'',
		'## Metrics',
		'',
		'| Metric | Value |',
		'|---|---:|',
		...Object.entries(metrics).map(([key, value]) => `| ${key} | ${value} |`),
		'',
		'## Assertions',
		'',
		...assertions.map(
			(item) => `- ${item.passed ? '✅' : '❌'} **${item.name}** — ${item.detail}`,
		),
		'',
		'## Negative tests',
		'',
		...negative.map(
			(item) => `- ${item.passed ? '✅' : '❌'} **${item.name}** — ${item.detail}`,
		),
		'',
		'## Cleanup',
		'',
		'```powershell',
		String(report.cleanup_command),
		'```',
		'',
	];

	return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
	const config = parseArgs(process.argv.slice(2));

	if (config.cleanupOnly) {
		await deleteProofCollectionIfPresent(config);
		console.log(`Deleted proof collection: ${config.proofCollection}`);
		return;
	}

	const pool = new Pool({
		connectionString: config.databaseUrl,
		max: 4,
		application_name: 'parent-atlas-reduced-packet-proof',
	});

	const generatedAt = new Date().toISOString();
	const datePart = generatedAt.slice(0, 10);
	const jsonPath = path.join(
		config.reportDir,
		`REDUCED_PACKET_TRANSPORT_FIXTURE_${datePart}.json`,
	);
	const mdPath = path.join(
		config.reportDir,
		`REDUCED_PACKET_TRANSPORT_FIXTURE_${datePart}.md`,
	);

	try {
		const sourceInfoBefore = await getCollectionInfo(config, config.sourceCollection);
		if (!sourceInfoBefore) {
			throw new ProofError(`Source collection does not exist: ${config.sourceCollection}`);
		}
		const sourcePointsBefore = getPointsCount(sourceInfoBefore);
		const vectorContract = resolveVectorContract(sourceInfoBefore, config.vectorName);

		if (config.recreateProofCollection) {
			await deleteProofCollectionIfPresent(config);
		}
		const proofInfo = await getCollectionInfo(config, config.proofCollection);
		if (!proofInfo) {
			await createProofCollection(config, vectorContract);
		}

		const candidates = await selectCandidateRows(pool, config.candidateLimit);

		const selected: Array<{
			row: PacketRow;
			id: string;
			vector: number[] | Record<string, number[]>;
			payload: ReducedPacketPayload;
		}> = [];
		let vectorUnmatchedRows = 0;
		let vectorAmbiguousRows = 0;
		let writerRejectedCount = 0;

		for (const row of candidates.rows) {
			if (selected.length >= config.fixtureLimit) break;

			const vectorResult = await findSourceVector(config, vectorContract, row.source_ref);
			if (vectorResult.status === 'missing') {
				vectorUnmatchedRows += 1;
				continue;
			}
			if (vectorResult.status === 'ambiguous') {
				vectorAmbiguousRows += 1;
				continue;
			}

			const id = deterministicUuid(`parent-atlas-proof:${row.packet_key}`);
			try {
				const payload = buildReducedPacketPayload({
					packetKey: row.packet_key,
					sourceRef: row.source_ref,
					workspaceId: row.workspace_id,
					workspaceRevision: row.workspace_revision,
					representationRevision: row.representation_revision,
					qdrantPointId: id,
				});
				selected.push({
					row,
					id,
					vector: vectorResult.value.vector,
					payload,
				});
			} catch {
				writerRejectedCount += 1;
			}
		}

		if (selected.length === 0) {
			throw new ProofError(
				'No transport-qualified rows had a unique source vector match. No proof points were written.',
			);
		}
		if (selected.length < config.fixtureLimit) {
			console.warn(
				`Warning: selected ${selected.length}/${config.fixtureLimit} requested rows after excluding missing/ambiguous vector matches.`,
			);
		}

		await upsertProofPoints(
			config,
			selected.map((item) => ({
				id: item.id,
				vector: item.vector,
				payload: item.payload,
			})),
		);

		const readback = await readBackProofPoints(
			config,
			selected.map((item) => item.id),
		);

		const payloads = readback.map((point) => point.payload);
		const validPayloads = payloads.filter(validatePayload) as ReducedPacketPayload[];
		const canonicalRows = await joinByPacketKeys(
			pool,
			validPayloads.map((payload) => payload.packet_key),
		);

		let joined = 0;
		let workspaceValueMatches = 0;
		let workspaceRevisionMatches = 0;
		let representationRevisionMatches = 0;

		for (const payload of validPayloads) {
			const row = canonicalRows.get(payload.packet_key);
			if (!row) continue;
			joined += 1;
			if (row.workspace_id === payload.workspace_id) workspaceValueMatches += 1;
			if (row.workspace_revision === payload.workspace_revision) {
				workspaceRevisionMatches += 1;
			}
			if (row.representation_revision === payload.representation_revision) {
				representationRevisionMatches += 1;
			}
		}

		const validInput = {
			packetKey: selected[0]!.row.packet_key,
			sourceRef: selected[0]!.row.source_ref,
			workspaceId: selected[0]!.row.workspace_id,
			workspaceRevision: selected[0]!.row.workspace_revision,
			representationRevision: selected[0]!.row.representation_revision,
			qdrantPointId: selected[0]!.id,
		};
		const negativeTests = await runNegativeTests(pool, validInput);

		const sourceInfoAfter = await getCollectionInfo(config, config.sourceCollection);
		const sourcePointsAfter = getPointsCount(sourceInfoAfter);
		const productionCollectionsModifiedCount =
			sourcePointsBefore === sourcePointsAfter ? 0 : 1;

		const metrics: Metrics = {
			fixture_rows_examined: candidates.totalRows,
			fixture_rows_selected: selected.length,
			transport_qualified_rows: selected.length,
			vector_matched_rows: selected.length,
			vector_unmatched_rows: vectorUnmatchedRows,
			vector_ambiguous_rows: vectorAmbiguousRows,
			writer_rejected_count: writerRejectedCount,
			qdrant_upserted_count: selected.length,
			qdrant_readback_count: readback.length,
			payload_complete_count: validPayloads.length,
			payload_incomplete_count: readback.length - validPayloads.length,
			packet_key_present_count: payloads.filter(
				(payload) => typeof payload?.packet_key === 'string' && payload.packet_key.length > 0,
			).length,
			source_ref_present_count: payloads.filter(
				(payload) => typeof payload?.source_ref === 'string' && payload.source_ref.length > 0,
			).length,
			workspace_id_present_count: payloads.filter(
				(payload) => typeof payload?.workspace_id === 'string' && payload.workspace_id.length > 0,
			).length,
			workspace_revision_present_count: payloads.filter((payload) =>
				Number.isInteger(payload?.workspace_revision),
			).length,
			representation_revision_present_count: payloads.filter((payload) =>
				Number.isInteger(payload?.representation_revision),
			).length,
			qdrant_point_id_present_count: payloads.filter(
				(payload) =>
					typeof payload?.qdrant_point_id === 'string' &&
					payload.qdrant_point_id.length > 0,
			).length,
			packet_joined_count: joined,
			packet_join_failed_count: validPayloads.length - joined,
			workspace_value_match_count: workspaceValueMatches,
			workspace_revision_match_count: workspaceRevisionMatches,
			representation_revision_match_count: representationRevisionMatches,
			negative_tests_passed: negativeTests.filter((test) => test.passed).length,
			negative_tests_failed: negativeTests.filter((test) => !test.passed).length,
			production_collections_modified_count: productionCollectionsModifiedCount,
		};

		const assertions = [
			{
				name: 'transport_qualified_rows > 0',
				passed: metrics.transport_qualified_rows > 0,
				detail: String(metrics.transport_qualified_rows),
			},
			{
				name: 'writer_rejected_count = 0',
				passed: metrics.writer_rejected_count === 0,
				detail: String(metrics.writer_rejected_count),
			},
			{
				name: 'qdrant_upserted_count = transport_qualified_rows',
				passed: metrics.qdrant_upserted_count === metrics.transport_qualified_rows,
				detail: `${metrics.qdrant_upserted_count}/${metrics.transport_qualified_rows}`,
			},
			{
				name: 'qdrant_readback_count = qdrant_upserted_count',
				passed: metrics.qdrant_readback_count === metrics.qdrant_upserted_count,
				detail: `${metrics.qdrant_readback_count}/${metrics.qdrant_upserted_count}`,
			},
			{
				name: 'payload_complete_count = qdrant_upserted_count',
				passed: metrics.payload_complete_count === metrics.qdrant_upserted_count,
				detail: `${metrics.payload_complete_count}/${metrics.qdrant_upserted_count}`,
			},
			{
				name: 'packet_joined_count = qdrant_readback_count',
				passed: metrics.packet_joined_count === metrics.qdrant_readback_count,
				detail: `${metrics.packet_joined_count}/${metrics.qdrant_readback_count}`,
			},
			{
				name: 'packet_join_failed_count = 0',
				passed: metrics.packet_join_failed_count === 0,
				detail: String(metrics.packet_join_failed_count),
			},
			{
				name: 'workspace values match canonical Postgres',
				passed: metrics.workspace_value_match_count === metrics.packet_joined_count,
				detail: `${metrics.workspace_value_match_count}/${metrics.packet_joined_count}`,
			},
			{
				name: 'workspace revisions match canonical Postgres',
				passed:
					metrics.workspace_revision_match_count === metrics.packet_joined_count,
				detail: `${metrics.workspace_revision_match_count}/${metrics.packet_joined_count}`,
			},
			{
				name: 'representation revisions match canonical Postgres',
				passed:
					metrics.representation_revision_match_count === metrics.packet_joined_count,
				detail: `${metrics.representation_revision_match_count}/${metrics.packet_joined_count}`,
			},
			{
				name: 'all negative tests pass',
				passed: metrics.negative_tests_failed === 0,
				detail: `${metrics.negative_tests_passed} passed, ${metrics.negative_tests_failed} failed`,
			},
			{
				name: 'production source collection count unchanged',
				passed: metrics.production_collections_modified_count === 0,
				detail: `${sourcePointsBefore} -> ${sourcePointsAfter}`,
			},
		];

		const allPassed = assertions.every((assertion) => assertion.passed);
		const cleanupCommand = `npx tsx scripts/atlas/prove-reduced-packet-transport.mts --cleanup --proof-collection=${config.proofCollection}`;

		const report: JsonRecord = {
			generated_at: generatedAt,
			proof_level: allPassed ? 'FIXTURE_PROVEN' : 'FAIL',
			scope: 'REDUCED_PACKET_TRANSPORT_AND_PACKET_KEY_JOIN_BACK',
			source_collection: config.sourceCollection,
			proof_collection: config.proofCollection,
			vector_contract: vectorContract,
			excluded_contracts: [
				'representation_id',
				'schema_version',
				'source_revision',
				'symbol_version_id',
				'stable_symbol_id',
			],
			database_missing_counts: candidates.missing,
			metrics,
			assertions,
			negative_tests: negativeTests,
			cleanup_command: cleanupCommand,
			statuses: {
				REDUCED_PACKET_TRANSPORT_FIXTURE: allPassed ? 'FIXTURE_PROVEN' : 'FAIL',
				PACKET_CANONICAL_JOIN_BACK: allPassed ? 'FIXTURE_PROVEN' : 'FAIL',
				REPRESENTATION_IDENTITY: 'BLOCKED_PENDING_CANONICAL_OWNER',
				FULL_PACKET_CONTRACT_FIXTURE: 'BLOCKED_PENDING_REPRESENTATION_OWNER',
				SOURCE_REVISION_VALIDATION: 'BLOCKED_PENDING_OWNER',
				SYMBOL_LEVEL_FIXTURE: 'BLOCKED_PENDING_CANONICAL_OWNER',
				SYMBOL_VERSION_ID_DEDUP: 'BLOCKED_PENDING_CANONICAL_OWNER',
				PRODUCTION_PAYLOAD_IDENTITY: 'FAIL_OR_PARTIAL',
				PRODUCTION_MIGRATION: 'BLOCKED',
				HYPERRAG_END_TO_END: 'NOT_PROVEN',
			},
		};

		await mkdir(config.reportDir, { recursive: true });
		await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		await writeFile(mdPath, markdownReport(report), 'utf8');

		console.log(JSON.stringify(report, null, 2));
		console.error(`\nEvidence written:\n- ${jsonPath}\n- ${mdPath}`);
		console.error(`Cleanup command:\n${cleanupCommand}`);

		if (!allPassed) {
			process.exitCode = 1;
		}
	} finally {
		await pool.end();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
	process.exitCode = 1;
});
