#!/usr/bin/env node
/**
 * Parent Atlas canonical routing + XGBoost integration validator.
 *
 * Read-only by default.
 *
 * Validates:
 *  - PostgreSQL 18 connectivity on the configured DATABASE_URL (typically :5434)
 *  - atlas_packets live schema and canonical identity coverage
 *  - Qdrant collection inventory and payload signatures
 *  - deterministic duplicate detection by canonical envelope identity
 *  - XGBoost sidecar health/model_loaded/score contract
 *  - LLM model discovery at /v1/models
 *  - LangExtract/NLP sidecar health
 *  - optional isolated Qdrant upsert/readback/join-back proof
 *
 * It never mutates a production collection. The optional write proof requires:
 *  --write-proof
 * and the target collection name must contain "proof".
 *
 * Suggested path:
 *  scripts/atlas/validate-parent-atlas-canonical-routing.mts
 *
 * Example:
 *  $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5434/legal_ai_db"
 *  npx tsx scripts/atlas/validate-parent-atlas-canonical-routing.mts
 *
 * Isolated proof:
 *  npx tsx scripts/atlas/validate-parent-atlas-canonical-routing.mts `
 *    --write-proof `
 *    --proof-collection=codebase_chunks_768_envelope_proof
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;

type Status = 'PASS' | 'PARTIAL' | 'FAIL' | 'BLOCKED' | 'SKIP';

type Gate = {
	id: string;
	title: string;
	status: Status;
	summary: string;
	evidence: unknown;
	nextAction?: string;
};

type Config = {
	databaseUrl: string;
	qdrantUrl: string;
	qdrantCollection: string;
	qdrantSampleSize: number;
	xgboostUrl: string;
	llmUrl: string;
	langExtractUrl: string;
	reportDir: string;
	writeProof: boolean;
	proofCollection: string;
	fixtureLimit: number;
	strict: boolean;
};

type CanonicalEnvelope = {
	packet_key: string;
	source_ref: string;
	workspace_id: string;
	workspace_revision: number;
	representation_id: string;
	representation_revision: number;
	schema_version: string;
	qdrant_point_id: string;
	source_revision?: string;
	stable_symbol_id?: string;
	symbol_version_id?: string;
};

type PacketRow = {
	packet_key: string;
	source_ref: string;
	workspace_id: string;
	workspace_revision: number;
	representation_revision: number;
	source_representation_id: string | null;
	projection_representation_id: string | null;
};

class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}

function argValue(argv: string[], name: string): string | undefined {
	const prefix = `--${name}=`;
	return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(argv: string[], name: string): boolean {
	return argv.includes(`--${name}`);
}

function loadConfig(): Config {
	const argv = process.argv.slice(2);
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new ValidationError(
			'DATABASE_URL is required, for example postgresql://...@127.0.0.1:5434/legal_ai_db',
		);
	}

	const proofCollection =
		argValue(argv, 'proof-collection') ??
		process.env.QDRANT_PROOF_COLLECTION ??
		'codebase_chunks_768_envelope_proof';

	const writeProof = hasFlag(argv, 'write-proof');
	if (writeProof && !proofCollection.toLowerCase().includes('proof')) {
		throw new ValidationError(
			`Refusing write proof because collection "${proofCollection}" does not contain "proof".`,
		);
	}

	return {
		databaseUrl,
		qdrantUrl: (
			argValue(argv, 'qdrant-url') ??
			process.env.QDRANT_URL ??
			'http://127.0.0.1:6333'
		).replace(/\/+$/, ''),
		qdrantCollection:
			argValue(argv, 'qdrant-collection') ??
			process.env.QDRANT_COLLECTION ??
			'codebase_chunks_768',
		qdrantSampleSize: Number(
			argValue(argv, 'qdrant-sample-size') ??
				process.env.QDRANT_SAMPLE_SIZE ??
				'200',
		),
		xgboostUrl: (
			argValue(argv, 'xgboost-url') ??
			process.env.XGBOOST_URL ??
			'http://127.0.0.1:8765'
		).replace(/\/+$/, ''),
		llmUrl: (
			argValue(argv, 'llm-url') ??
			process.env.LLM_URL ??
			'http://127.0.0.1:8090'
		).replace(/\/+$/, ''),
		langExtractUrl: (
			argValue(argv, 'langextract-url') ??
			process.env.LANGEXTRACT_URL ??
			'http://127.0.0.1:8095'
		).replace(/\/+$/, ''),
		reportDir:
			argValue(argv, 'report-dir') ??
			process.env.PARENT_ATLAS_REPORT_DIR ??
			path.join('docs', 'reports', 'parent-atlas'),
		writeProof,
		proofCollection,
		fixtureLimit: Number(
			argValue(argv, 'fixture-limit') ??
				process.env.FIXTURE_LIMIT ??
				'20',
		),
		strict: hasFlag(argv, 'strict'),
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

function canonicalPointId(envelope: Omit<CanonicalEnvelope, 'qdrant_point_id'>): string {
	return deterministicUuid(
		[
			envelope.packet_key,
			envelope.workspace_id,
			envelope.workspace_revision,
			envelope.representation_id,
			envelope.representation_revision,
			envelope.schema_version,
		].join('|'),
	);
}

function assertText(value: unknown, field: string): asserts value is string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new ValidationError(`INVALID_${field.toUpperCase()}`);
	}
}

function assertInteger(value: unknown, field: string): asserts value is number {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new ValidationError(`INVALID_${field.toUpperCase()}`);
	}
}

function validateCanonicalEnvelope(
	value: Partial<CanonicalEnvelope>,
): CanonicalEnvelope {
	assertText(value.packet_key, 'packet_key');
	assertText(value.source_ref, 'source_ref');
	assertText(value.workspace_id, 'workspace_id');
	assertInteger(value.workspace_revision, 'workspace_revision');
	assertText(value.representation_id, 'representation_id');
	assertInteger(value.representation_revision, 'representation_revision');
	assertText(value.schema_version, 'schema_version');
	assertText(value.qdrant_point_id, 'qdrant_point_id');

	const expectedId = canonicalPointId({
		packet_key: value.packet_key,
		source_ref: value.source_ref,
		workspace_id: value.workspace_id,
		workspace_revision: value.workspace_revision,
		representation_id: value.representation_id,
		representation_revision: value.representation_revision,
		schema_version: value.schema_version,
		source_revision: value.source_revision,
		stable_symbol_id: value.stable_symbol_id,
		symbol_version_id: value.symbol_version_id,
	});

	if (value.qdrant_point_id !== expectedId) {
		throw new ValidationError('QDRANT_POINT_ID_NOT_DETERMINISTIC');
	}

	return value as CanonicalEnvelope;
}

async function fetchJson<T>(
	url: string,
	init?: RequestInit,
	timeoutMs = 10_000,
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			...init,
			signal: controller.signal,
			headers: {
				'content-type': 'application/json',
				...(init?.headers ?? {}),
			},
		});
		const text = await response.text();
		let body: unknown = {};
		try {
			body = text ? JSON.parse(text) : {};
		} catch {
			throw new ValidationError(
				`NON_JSON_RESPONSE ${url} HTTP ${response.status}: ${text.slice(0, 300)}`,
			);
		}
		if (!response.ok) {
			throw new ValidationError(
				`HTTP_${response.status} ${url}: ${JSON.stringify(body)}`,
			);
		}
		return body as T;
	} finally {
		clearTimeout(timer);
	}
}

async function tryEndpoint<T>(
	baseUrl: string,
	paths: string[],
): Promise<{ ok: true; path: string; value: T } | { ok: false; errors: string[] }> {
	const errors: string[] = [];
	for (const endpoint of paths) {
		try {
			return {
				ok: true,
				path: endpoint,
				value: await fetchJson<T>(`${baseUrl}${endpoint}`),
			};
		} catch (error) {
			errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { ok: false, errors };
}

async function inspectPostgres(pool: pg.Pool) {
	const connection = await pool.query(`
		SELECT
			current_database() AS database,
			current_schema() AS schema,
			inet_server_addr()::text AS server_address,
			inet_server_port() AS server_port,
			current_setting('server_version') AS server_version,
			current_setting('search_path') AS search_path
	`);

	const columns = await pool.query<{
		column_name: string;
		data_type: string;
		is_nullable: 'YES' | 'NO';
		column_default: string | null;
		ordinal_position: number;
	}>(`
		SELECT
			column_name,
			data_type,
			is_nullable,
			column_default,
			ordinal_position
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = 'atlas_packets'
		ORDER BY ordinal_position
	`);

	const columnSet = new Set(columns.rows.map((row) => row.column_name));
	const requiredForQuery = [
		'packet_key',
		'source_ref',
		'workspace_id',
		'workspace_revision',
		'representation_revision',
		'source_representation_id',
		'projection_representation_id',
	];
	const missingForQuery = requiredForQuery.filter((name) => !columnSet.has(name));

	let coverage: Record<string, number> | null = null;
	let candidates: PacketRow[] = [];

	if (missingForQuery.length === 0) {
		const coverageResult = await pool.query<Record<string, string>>(`
			SELECT
				COUNT(*)::text AS total_rows,
				COUNT(packet_key)::text AS packet_key_present,
				COUNT(source_ref)::text AS source_ref_present,
				COUNT(workspace_id)::text AS workspace_id_present,
				COUNT(workspace_revision)::text AS workspace_revision_present,
				COUNT(representation_revision)::text AS representation_revision_present,
				COUNT(source_representation_id)::text AS source_representation_id_present,
				COUNT(projection_representation_id)::text AS projection_representation_id_present,
				COUNT(*) FILTER (
					WHERE packet_key IS NULL OR btrim(packet_key) = ''
				)::text AS packet_key_missing,
				COUNT(*) FILTER (
					WHERE workspace_id IS NULL OR btrim(workspace_id) = ''
				)::text AS workspace_id_missing,
				COUNT(*) FILTER (
					WHERE representation_revision = 0
				)::text AS representation_revision_zero
			FROM public.atlas_packets
		`);
		coverage = Object.fromEntries(
			Object.entries(coverageResult.rows[0] ?? {}).map(([key, value]) => [
				key,
				Number(value),
			]),
		);

		const candidateResult = await pool.query<PacketRow>(
			`
			SELECT
				packet_key,
				source_ref,
				workspace_id,
				workspace_revision,
				representation_revision,
				source_representation_id,
				projection_representation_id
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
			[100],
		);
		candidates = candidateResult.rows.map((row) => ({
			...row,
			workspace_revision: Number(row.workspace_revision),
			representation_revision: Number(row.representation_revision),
		}));
	}

	return {
		connection: connection.rows[0] ?? {},
		columns: columns.rows,
		missingForQuery,
		coverage,
		candidates,
	};
}

async function inspectQdrant(config: Config) {
	const collections = await fetchJson<{
		result: { collections: Array<{ name: string }> };
	}>(`${config.qdrantUrl}/collections`);

	const collectionNames = collections.result.collections.map((item) => item.name);
	const info = await fetchJson<{
		result: {
			points_count?: number;
			config?: {
				params?: {
					vectors?: unknown;
				};
			};
		};
	}>(`${config.qdrantUrl}/collections/${encodeURIComponent(config.qdrantCollection)}`);

	const response = await fetchJson<{
		result: {
			points: Array<{
				id: string | number;
				payload?: Record<string, unknown>;
			}>;
		};
	}>(
		`${config.qdrantUrl}/collections/${encodeURIComponent(
			config.qdrantCollection,
		)}/points/scroll`,
		{
			method: 'POST',
			body: JSON.stringify({
				limit: Math.min(config.qdrantSampleSize, 256),
				with_payload: true,
				with_vector: false,
			}),
		},
	);

	const points = response.result.points;
	const fields = [
		'packet_key',
		'source_ref',
		'workspace_id',
		'workspace_revision',
		'source_revision',
		'representation_id',
		'representation_revision',
		'schema_version',
		'stable_symbol_id',
		'symbol_version_id',
		'qdrant_point_id',
	];
	const coverage = Object.fromEntries(fields.map((field) => [field, 0]));
	const signatures: Record<string, number> = {};
	const canonicalKeys = new Map<string, number>();
	let duplicateEnvelopeCount = 0;
	let deterministicPointIdMatches = 0;

	for (const point of points) {
		const payload = point.payload ?? {};
		const signature = Object.keys(payload).sort().join(',');
		signatures[signature] = (signatures[signature] ?? 0) + 1;

		for (const field of fields) {
			if (payload[field] !== null && payload[field] !== undefined) {
				coverage[field] += 1;
			}
		}

		const packetKey = payload.packet_key;
		const workspaceId = payload.workspace_id;
		const workspaceRevision = payload.workspace_revision;
		const representationId = payload.representation_id;
		const representationRevision = payload.representation_revision;
		const schemaVersion = payload.schema_version;

		if (
			typeof packetKey === 'string' &&
			typeof workspaceId === 'string' &&
			Number.isInteger(workspaceRevision) &&
			typeof representationId === 'string' &&
			Number.isInteger(representationRevision) &&
			typeof schemaVersion === 'string'
		) {
			const key = [
				packetKey,
				workspaceId,
				workspaceRevision,
				representationId,
				representationRevision,
				schemaVersion,
			].join('|');
			const count = (canonicalKeys.get(key) ?? 0) + 1;
			canonicalKeys.set(key, count);
			if (count === 2) duplicateEnvelopeCount += 1;

			const expectedId = canonicalPointId({
				packet_key: packetKey,
				source_ref:
					typeof payload.source_ref === 'string' ? payload.source_ref : 'unknown',
				workspace_id: workspaceId,
				workspace_revision: workspaceRevision as number,
				representation_id: representationId,
				representation_revision: representationRevision as number,
				schema_version: schemaVersion,
			});
			if (String(point.id) === expectedId || payload.qdrant_point_id === expectedId) {
				deterministicPointIdMatches += 1;
			}
		}
	}

	return {
		collectionNames,
		info: info.result,
		sampled: points.length,
		coverage,
		signatures,
		duplicateEnvelopeCount,
		deterministicPointIdMatches,
	};
}

function normalizeFeatureVector(): Record<string, number> {
	return {
		trace_score: 0.82,
		freshness_score: 0.67,
		packet_hit_count: 3,
		reward_prior: 0.15,
		domain_class_match: 1,
		community_conf: 0.74,
		concept_overlap: 0.41,
	};
}

async function inspectXgboost(config: Config) {
	const health = await tryEndpoint<Record<string, unknown>>(config.xgboostUrl, [
		'/health',
		'/',
	]);
	if (!health.ok) {
		return {
			health,
			score: null,
		featureContract: null,
		monotonicity: null,
		duplicateCandidateHandling: null,
	};
	}

	const featureContract = normalizeFeatureVector();
	const baseCandidate = {
		id: 'candidate:base',
		packet_key: 'packet:proof:xgboost',
		features: featureContract,
	};

	const scoreAttempts = [
		{
			path: '/score',
			body: { candidates: [baseCandidate] },
		},
		{
			path: '/score',
			body: { rows: [featureContract] },
		},
		{
			path: '/predict',
			body: { candidates: [baseCandidate] },
		},
		{
			path: '/predict',
			body: { rows: [featureContract] },
		},
	];

	let score:
		| { ok: true; path: string; value: unknown; request: unknown }
		| { ok: false; errors: string[] } = { ok: false, errors: [] };

	for (const attempt of scoreAttempts) {
		try {
			const value = await fetchJson<unknown>(`${config.xgboostUrl}${attempt.path}`, {
				method: 'POST',
				body: JSON.stringify(attempt.body),
			});
			score = { ok: true, path: attempt.path, value, request: attempt.body };
			break;
		} catch (error) {
			score.errors.push(
				`${attempt.path}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	let monotonicity: unknown = null;
	let duplicateCandidateHandling: unknown = null;

	if (score.ok) {
		const low = {
			...featureContract,
			trace_score: 0.1,
			freshness_score: 0.1,
		};
		const high = {
			...featureContract,
			trace_score: 0.9,
			freshness_score: 0.9,
		};

		const monotonicAttempts = [
			{
				path: score.path,
				body: {
					candidates: [
						{ id: 'low', packet_key: 'packet:low', features: low },
						{ id: 'high', packet_key: 'packet:high', features: high },
					],
				},
			},
			{
				path: score.path,
				body: { rows: [low, high] },
			},
		];

		for (const attempt of monotonicAttempts) {
			try {
				monotonicity = await fetchJson<unknown>(
					`${config.xgboostUrl}${attempt.path}`,
					{
						method: 'POST',
						body: JSON.stringify(attempt.body),
					},
				);
				break;
			} catch {
				// Try next shape.
			}
		}

		const duplicateAttempts = [
			{
				path: score.path,
				body: {
					candidates: [
						baseCandidate,
						{ ...baseCandidate, id: 'candidate:duplicate' },
					],
				},
			},
			{
				path: score.path,
				body: { rows: [featureContract, featureContract] },
			},
		];

		for (const attempt of duplicateAttempts) {
			try {
				duplicateCandidateHandling = await fetchJson<unknown>(
					`${config.xgboostUrl}${attempt.path}`,
					{
						method: 'POST',
						body: JSON.stringify(attempt.body),
					},
				);
				break;
			} catch {
				// Try next shape.
			}
		}
	}

	return {
		health,
		score,
		featureContract,
		monotonicity,
		duplicateCandidateHandling,
	};
}

async function inspectLlmModels(config: Config) {
	return tryEndpoint<Record<string, unknown>>(config.llmUrl, ['/v1/models']);
}

async function inspectLangExtract(config: Config) {
	return tryEndpoint<Record<string, unknown>>(config.langExtractUrl, [
		'/health',
		'/',
	]);
}

function resolveRepresentationId(row: PacketRow): {
	status: 'PROVEN' | 'CONTRACT_ONLY';
	value: string;
	source: string;
} {
	if (row.projection_representation_id) {
		return {
			status: 'PROVEN',
			value: row.projection_representation_id,
			source: 'projection_representation_id',
		};
	}
	if (row.source_representation_id) {
		return {
			status: 'PROVEN',
			value: row.source_representation_id,
			source: 'source_representation_id',
		};
	}
	return {
		status: 'CONTRACT_ONLY',
		value: 'semantic_768',
		source: 'versioned_lane_contract_fallback',
	};
}

function makeEnvelope(row: PacketRow): CanonicalEnvelope {
	const representation = resolveRepresentationId(row);
	const schemaVersion = 'atlas.projection.packet.v1';

	const withoutPointId: Omit<CanonicalEnvelope, 'qdrant_point_id'> = {
		packet_key: row.packet_key,
		source_ref: row.source_ref,
		workspace_id: row.workspace_id,
		workspace_revision: row.workspace_revision,
		representation_id: representation.value,
		representation_revision: row.representation_revision,
		schema_version: schemaVersion,
	};

	return validateCanonicalEnvelope({
		...withoutPointId,
		qdrant_point_id: canonicalPointId(withoutPointId),
	});
}

async function retrieveSourceVector(
	config: Config,
	sourceRef: string,
): Promise<
	| { status: 'MATCHED'; pointId: string | number; vector: unknown }
	| { status: 'MISSING' | 'AMBIGUOUS' }
> {
	const response = await fetchJson<{
		result: {
			points: Array<{
				id: string | number;
				vector?: unknown;
			}>;
		};
	}>(
		`${config.qdrantUrl}/collections/${encodeURIComponent(
			config.qdrantCollection,
		)}/points/scroll`,
		{
			method: 'POST',
			body: JSON.stringify({
				filter: {
					must: [{ key: 'source_ref', match: { value: sourceRef } }],
				},
				limit: 2,
				with_payload: false,
				with_vector: true,
			}),
		},
	);

	if (response.result.points.length === 0) return { status: 'MISSING' };
	if (response.result.points.length > 1) return { status: 'AMBIGUOUS' };
	const point = response.result.points[0]!;
	if (point.vector === undefined) return { status: 'MISSING' };
	return { status: 'MATCHED', pointId: point.id, vector: point.vector };
}

async function ensureProofCollection(config: Config, sourceInfo: unknown) {
	if (!config.proofCollection.toLowerCase().includes('proof')) {
		throw new ValidationError('PROOF_COLLECTION_NAME_REQUIRED');
	}

	const existing = await tryEndpoint<unknown>(config.qdrantUrl, [
		`/collections/${encodeURIComponent(config.proofCollection)}`,
	]);
	if (existing.ok) return;

	const vectors =
		(sourceInfo as { config?: { params?: { vectors?: unknown } } })?.config?.params
			?.vectors;
	if (!vectors) {
		throw new ValidationError('SOURCE_VECTOR_CONTRACT_NOT_FOUND');
	}

	await fetchJson(
		`${config.qdrantUrl}/collections/${encodeURIComponent(
			config.proofCollection,
		)}`,
		{
			method: 'PUT',
			body: JSON.stringify({ vectors }),
		},
	);
}

async function runIsolatedProof(
	config: Config,
	pool: pg.Pool,
	postgres: Awaited<ReturnType<typeof inspectPostgres>>,
	qdrant: Awaited<ReturnType<typeof inspectQdrant>>,
) {
	if (!config.writeProof) {
		return { status: 'SKIP', reason: '--write-proof not supplied' };
	}

	await ensureProofCollection(config, qdrant.info);

	const selected: Array<{
		row: PacketRow;
		envelope: CanonicalEnvelope;
		vector: unknown;
	}> = [];
	let missingVectors = 0;
	let ambiguousVectors = 0;
	let contractOnlyRepresentationRows = 0;

	for (const row of postgres.candidates) {
		if (selected.length >= config.fixtureLimit) break;
		const match = await retrieveSourceVector(config, row.source_ref);
		if (match.status === 'MISSING') {
			missingVectors += 1;
			continue;
		}
		if (match.status === 'AMBIGUOUS') {
			ambiguousVectors += 1;
			continue;
		}
		const representation = resolveRepresentationId(row);
		if (representation.status === 'CONTRACT_ONLY') {
			contractOnlyRepresentationRows += 1;
		}
		selected.push({
			row,
			envelope: makeEnvelope(row),
			vector: match.vector,
		});
	}

	if (selected.length === 0) {
		return {
			status: 'BLOCKED',
			reason: 'No packet rows had a unique source_ref vector match.',
			missingVectors,
			ambiguousVectors,
		};
	}

	const points = selected.map(({ envelope, vector }) => ({
		id: envelope.qdrant_point_id,
		vector,
		payload: envelope,
	}));

	// Deterministic IDs make this idempotent: the same canonical envelope overwrites
	// the same proof point rather than creating a duplicate.
	await fetchJson(
		`${config.qdrantUrl}/collections/${encodeURIComponent(
			config.proofCollection,
		)}/points?wait=true`,
		{
			method: 'PUT',
			body: JSON.stringify({ points }),
		},
	);

	// Upsert the exact same points again. Point count must remain unchanged.
	const beforeInfo = await fetchJson<{ result: { points_count?: number } }>(
		`${config.qdrantUrl}/collections/${encodeURIComponent(
			config.proofCollection,
		)}`,
	);
	await fetchJson(
		`${config.qdrantUrl}/collections/${encodeURIComponent(
			config.proofCollection,
		)}/points?wait=true`,
		{
			method: 'PUT',
			body: JSON.stringify({ points }),
		},
	);
	const afterInfo = await fetchJson<{ result: { points_count?: number } }>(
		`${config.qdrantUrl}/collections/${encodeURIComponent(
			config.proofCollection,
		)}`,
	);

	const readback = await fetchJson<{
		result: Array<{
			id: string | number;
			payload?: Partial<CanonicalEnvelope>;
		}>;
	}>(
		`${config.qdrantUrl}/collections/${encodeURIComponent(
			config.proofCollection,
		)}/points`,
		{
			method: 'POST',
			body: JSON.stringify({
				ids: selected.map((item) => item.envelope.qdrant_point_id),
				with_payload: true,
				with_vector: false,
			}),
		},
	);

	const validReadback: CanonicalEnvelope[] = [];
	const validationErrors: string[] = [];
	for (const point of readback.result) {
		try {
			validReadback.push(validateCanonicalEnvelope(point.payload ?? {}));
		} catch (error) {
			validationErrors.push(
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	const packetKeys = validReadback.map((item) => item.packet_key);
	const joined = await pool.query<{ packet_key: string }>(
		`
		SELECT packet_key
		FROM public.atlas_packets
		WHERE packet_key = ANY($1::text[])
		`,
		[packetKeys],
	);
	const joinedKeys = new Set(joined.rows.map((row) => row.packet_key));

	return {
		status:
			validReadback.length === selected.length &&
			joinedKeys.size === selected.length &&
			beforeInfo.result.points_count === afterInfo.result.points_count
				? 'PASS'
				: 'FAIL',
		selected: selected.length,
		missingVectors,
		ambiguousVectors,
		contractOnlyRepresentationRows,
		upserted: points.length,
		readback: readback.result.length,
		validReadback: validReadback.length,
		validationErrors,
		joined: joinedKeys.size,
		duplicatePrevention: {
			beforeSecondUpsert: beforeInfo.result.points_count ?? null,
			afterSecondUpsert: afterInfo.result.points_count ?? null,
			stable:
				beforeInfo.result.points_count === afterInfo.result.points_count,
		},
		proofCollection: config.proofCollection,
	};
}

function gate(
	id: string,
	title: string,
	status: Status,
	summary: string,
	evidence: unknown,
	nextAction?: string,
): Gate {
	return { id, title, status, summary, evidence, nextAction };
}

function markdown(report: {
	generatedAt: string;
	overall: Status;
	gates: Gate[];
	recommendations: string[];
}): string {
	const lines = [
		'# Parent Atlas Canonical Routing Validation',
		'',
		`- Generated: ${report.generatedAt}`,
		`- Overall: **${report.overall}**`,
		'',
		'## Gates',
		'',
		'| ID | Gate | Status |',
		'|---|---|---|',
		...report.gates.map((item) => `| ${item.id} | ${item.title} | ${item.status} |`),
		'',
	];

	for (const item of report.gates) {
		lines.push(
			`### ${item.id} — ${item.title}`,
			'',
			item.summary,
			'',
			'```json',
			JSON.stringify(item.evidence, null, 2),
			'```',
			'',
		);
		if (item.nextAction) {
			lines.push(`**Next action:** ${item.nextAction}`, '');
		}
	}

	lines.push('## Recommendations', '');
	for (const item of report.recommendations) lines.push(`- ${item}`);
	lines.push('');
	return `${lines.join('\n')}\n`;
}

async function main() {
	const config = loadConfig();
	const pool = new Pool({
		connectionString: config.databaseUrl,
		max: 4,
		application_name: 'parent-atlas-canonical-routing-validator',
	});

	const gates: Gate[] = [];
	const generatedAt = new Date().toISOString();

	try {
		const postgres = await inspectPostgres(pool);
		const pgPort = Number(postgres.connection.server_port);
		const pgVersion = String(postgres.connection.server_version ?? '');
		gates.push(
			gate(
				'PA-PG-ROUTE',
				'PostgreSQL 18 canonical source',
				pgPort === 5434 && pgVersion.startsWith('18') ? 'PASS' : 'PARTIAL',
				`Connected to ${postgres.connection.database} on port ${pgPort}, server ${pgVersion}.`,
				postgres,
				pgPort !== 5434
					? 'Confirm DATABASE_URL points to the intended PostgreSQL 18 instance on 5434.'
					: undefined,
			),
		);

		const xgboost = await inspectXgboost(config);
		const xgboostHealthValue = xgboost.health.ok ? xgboost.health.value : null;
		const modelLoaded =
			xgboost.health.ok &&
			((xgboostHealthValue as Record<string, unknown>).model_loaded === true ||
				(xgboostHealthValue as Record<string, unknown>).modelLoaded === true);

		gates.push(
			gate(
				'PA-XGB-HEALTH',
				'XGBoost sidecar and feature contract',
				xgboost.health.ok && modelLoaded && xgboost.score?.ok
					? 'PASS'
					: xgboost.health.ok
						? 'PARTIAL'
						: 'FAIL',
				xgboost.health.ok
					? 'XGBoost sidecar is reachable; model and scoring contract were probed.'
					: 'XGBoost sidecar is unavailable.',
				xgboost,
				!xgboost.score?.ok
					? 'Add or document one stable /score request/response schema and wire it into the canonical post-fusion rerank step.'
					: undefined,
			),
		);

		const llmModels = await inspectLlmModels(config);
		gates.push(
			gate(
				'PA-LLM-MODELS',
				'LLM model discovery at 8090/v1/models',
				llmModels.ok ? 'PASS' : 'FAIL',
				llmModels.ok
					? 'The orchestration server exposes an OpenAI-compatible model list.'
					: 'The model discovery endpoint failed.',
				llmModels,
			),
		);

		const langExtract = await inspectLangExtract(config);
		gates.push(
			gate(
				'PA-LANGEXTRACT',
				'LangExtract/NLP sidecar',
				langExtract.ok ? 'PASS' : 'FAIL',
				langExtract.ok
					? 'LangExtract/NLP sidecar is reachable.'
					: 'LangExtract/NLP sidecar is unavailable.',
				langExtract,
			),
		);

		let qdrant: Awaited<ReturnType<typeof inspectQdrant>> | null = null;
		try {
			qdrant = await inspectQdrant(config);
			const required = [
				'packet_key',
				'source_ref',
				'workspace_id',
				'workspace_revision',
				'representation_id',
				'representation_revision',
				'schema_version',
			];
			const complete =
				qdrant.sampled > 0 &&
				required.every((field) => qdrant!.coverage[field] === qdrant!.sampled);

			gates.push(
				gate(
					'PA-QDRANT-ENVELOPE',
					'Qdrant canonical payload envelope',
					complete && qdrant.duplicateEnvelopeCount === 0 ? 'PASS' : 'FAIL',
					`Sampled ${qdrant.sampled} points from ${config.qdrantCollection}.`,
					qdrant,
					complete
						? 'Keep deterministic point IDs and reject duplicate canonical envelope identities before upsert.'
						: 'Patch the active writer and repair/rebuild production payloads before trusting canonical hydration.',
				),
			);
		} catch (error) {
			gates.push(
				gate(
					'PA-QDRANT-ENVELOPE',
					'Qdrant canonical payload envelope',
					'FAIL',
					'Qdrant inspection failed.',
					error instanceof Error ? error.message : String(error),
				),
			);
		}

		if (qdrant) {
			const proof = await runIsolatedProof(config, pool, postgres, qdrant);
			gates.push(
				gate(
					'PA-ENVELOPE-PROOF',
					'Canonical envelope isolated upsert/readback/join',
					proof.status as Status,
					config.writeProof
						? 'Isolated deterministic upsert/readback/join proof executed.'
						: 'Write proof skipped; use --write-proof to execute only against a proof collection.',
					proof,
					config.writeProof
						? undefined
						: 'Run with --write-proof after reviewing the proof collection name.',
				),
			);
		}

		const postgresCoverage = postgres.coverage;
		const identityReady =
			postgresCoverage !== null &&
			postgresCoverage.packet_key_present === postgresCoverage.total_rows &&
			postgresCoverage.source_ref_present === postgresCoverage.total_rows &&
			postgresCoverage.workspace_id_present === postgresCoverage.total_rows;

		gates.push(
			gate(
				'PA-ROUTING-READY',
				'Canonical routing readiness',
				identityReady &&
				gates.find((item) => item.id === 'PA-XGB-HEALTH')?.status === 'PASS' &&
				gates.find((item) => item.id === 'PA-QDRANT-ENVELOPE')?.status === 'PASS'
					? 'PASS'
					: 'BLOCKED',
				'Canonical routing requires complete Postgres identity, complete Qdrant envelopes, and a stable XGBoost score contract.',
				{
					postgresCoverage,
					xgboost: gates.find((item) => item.id === 'PA-XGB-HEALTH')?.status,
					qdrant: gates.find((item) => item.id === 'PA-QDRANT-ENVELOPE')?.status,
				},
			),
		);

		const overall: Status = gates.some((item) =>
			['FAIL', 'BLOCKED'].includes(item.status),
		)
			? 'BLOCKED'
			: gates.some((item) => ['PARTIAL', 'SKIP'].includes(item.status))
				? 'PARTIAL'
				: 'PASS';

		const recommendations = [
			'Keep XGBoost after canonical hydration and RRF, not before identity validation.',
			'Deduplicate candidates by packet_key at packet level and symbol_version_id only when a canonical symbol-version owner is proven.',
			'Use deterministic Qdrant point IDs derived from packet/workspace/representation/schema revisions so repeat upserts overwrite instead of duplicating.',
			'Do not use trace_score dominance as proof that XGBoost adds value; run an ablation against trace_score-only and freshness-only baselines.',
			'Keep mixedbread or other neural rerankers as a separately versioned fallback/second-stage lane; record rerank_source in the receipt.',
			'Do not promote production Qdrant routing until envelope coverage and packet_key join-back are production-data proven.',
		];

		const report = {
			generatedAt,
			overall,
			config: {
				...config,
				databaseUrl: '[redacted]',
			},
			gates,
			recommendations,
		};

		await mkdir(config.reportDir, { recursive: true });
		const date = generatedAt.slice(0, 10);
		const jsonPath = path.join(
			config.reportDir,
			`PARENT_ATLAS_CANONICAL_ROUTING_${date}.json`,
		);
		const mdPath = path.join(
			config.reportDir,
			`PARENT_ATLAS_CANONICAL_ROUTING_${date}.md`,
		);
		await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		await writeFile(mdPath, markdown(report), 'utf8');

		console.log(JSON.stringify(report, null, 2));
		console.error(`\nReports:\n- ${jsonPath}\n- ${mdPath}`);

		if (config.strict && overall !== 'PASS') process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
	process.exitCode = 1;
});
