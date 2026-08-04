#!/usr/bin/env node
/**
 * Parent Atlas readiness health check.
 *
 * Read-only. It does not mutate Postgres, Qdrant, Neo4j, files, OpenSpec, or Git.
 *
 * Purpose:
 *   Validate the proposed Parent Atlas execution order against repository and
 *   runtime evidence, stop at the first unmet prerequisite, and emit JSON/MD
 *   reports plus a Kanban-ready recommendation.
 *
 * Suggested repository path:
 *   scripts/atlas/parent-atlas-health-check.mts
 *
 * Requirements:
 *   - Node 20+ (22 recommended)
 *   - `pg` available in the workspace
 *   - DATABASE_URL
 *
 * Optional runtime inputs:
 *   - QDRANT_URL (default http://127.0.0.1:6333)
 *   - QDRANT_COLLECTION (default codebase_chunks_768)
 *   - NEO4J_HTTP_URL (default http://127.0.0.1:7474)
 *   - NEO4J_USER / NEO4J_PASSWORD
 *
 * Example:
 *   npx tsx scripts/atlas/parent-atlas-health-check.mts
 *
 * Strict CI mode:
 *   npx tsx scripts/atlas/parent-atlas-health-check.mts --strict
 */

import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;

type Status =
	| 'PASS'
	| 'PARTIAL'
	| 'FAIL'
	| 'BLOCKED'
	| 'NOT_PROVEN'
	| 'SKIP';

type EvidenceLevel =
	| 'SOURCE_PRESENT'
	| 'STATIC_WIRING_PROVEN'
	| 'FIXTURE_PROVEN'
	| 'RUNTIME_SMOKE_PROVEN'
	| 'PRODUCTION_DATA_PROVEN'
	| 'NOT_PROVEN';

type GateId =
	| 'PA-ID-001'
	| 'PA-ID-002'
	| 'PA-ID-003'
	| 'PA-PROJ-001'
	| 'PA-PROJ-002'
	| 'PA-PROJ-003'
	| 'PA-RET-001'
	| 'PA-GRAPH-001'
	| 'PA-RET-002'
	| 'PA-SUM-001'
	| 'PA-ACE-001'
	| 'PA-EVAL-001'
	| 'PA-OPS-001'
	| 'PA-GRAPH-002';

type GateResult = {
	id: GateId;
	order: number;
	title: string;
	status: Status;
	evidenceLevel: EvidenceLevel;
	blockedBy: GateId[];
	summary: string;
	evidence: string[];
	recommendation: string;
	files: string[];
	metrics?: Record<string, string | number | boolean | null>;
};

type Config = {
	repoRoot: string;
	appRoot: string;
	databaseUrl: string;
	qdrantUrl: string;
	qdrantCollection: string;
	qdrantSampleSize: number;
	reportDir: string;
	graphFile: string;
	graphMaxAgeMinutes: number;
	strict: boolean;
};

type ColumnInfo = {
	column_name: string;
	data_type: string;
	is_nullable: 'YES' | 'NO';
	column_default: string | null;
	ordinal_position: number;
};

type QdrantPoint = {
	id: string | number;
	payload?: Record<string, unknown>;
};

class HealthCheckError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'HealthCheckError';
	}
}

function parseArgs(argv: string[]): Config {
	const getArg = (name: string): string | undefined => {
		const prefix = `--${name}=`;
		return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
	};
	const hasFlag = (name: string): boolean => argv.includes(`--${name}`);

	const repoRoot =
		getArg('repo-root') ??
		process.env.PARENT_ATLAS_REPO_ROOT ??
		process.cwd();

	const appRoot =
		getArg('app-root') ??
		process.env.PARENT_ATLAS_APP_ROOT ??
		path.join(repoRoot, 'sveltekit-frontend');

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new HealthCheckError('DATABASE_URL is required.');
	}

	return {
		repoRoot,
		appRoot,
		databaseUrl,
		qdrantUrl: (
			getArg('qdrant-url') ??
			process.env.QDRANT_URL ??
			'http://127.0.0.1:6333'
		).replace(/\/+$/, ''),
		qdrantCollection:
			getArg('qdrant-collection') ??
			process.env.QDRANT_COLLECTION ??
			'codebase_chunks_768',
		qdrantSampleSize: Number(
			getArg('qdrant-sample-size') ??
				process.env.QDRANT_SAMPLE_SIZE ??
				'200',
		),
		reportDir:
			getArg('report-dir') ??
			path.join(repoRoot, 'docs', 'reports', 'parent-atlas'),
		graphFile:
			getArg('graph-file') ??
			path.join(appRoot, 'docs', 'graph', 'codebase-graph.json'),
		graphMaxAgeMinutes: Number(
			getArg('graph-max-age-minutes') ??
				process.env.GRAPH_MAX_AGE_MINUTES ??
				'180',
		),
		strict: hasFlag('strict'),
	};
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readText(filePath: string): Promise<string> {
	return readFile(filePath, 'utf8');
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
	let body: unknown = {};
	try {
		body = text ? JSON.parse(text) : {};
	} catch {
		throw new HealthCheckError(
			`Qdrant returned non-JSON for ${endpoint}: ${text.slice(0, 300)}`,
		);
	}
	if (!response.ok) {
		throw new HealthCheckError(
			`Qdrant ${endpoint} failed: HTTP ${response.status} ${JSON.stringify(body)}`,
		);
	}
	return body as T;
}

async function inspectLiveSchema(pool: pg.Pool): Promise<{
	connection: Record<string, unknown>;
	columns: ColumnInfo[];
	counts: Record<string, number>;
}> {
	const connection = await pool.query(`
		SELECT
			current_database() AS database,
			current_schema() AS schema,
			inet_server_addr()::text AS server_address,
			inet_server_port() AS server_port,
			current_setting('search_path') AS search_path
	`);

	const columns = await pool.query<ColumnInfo>(`
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

	const countsResult = await pool.query<{
		total_rows: string;
		packet_key_non_null: string;
		source_ref_non_null: string;
		workspace_id_non_null: string;
		workspace_revision_non_null: string;
		representation_revision_non_null: string;
		source_representation_id_non_null: string;
		source_dimension_non_null: string;
		projection_representation_id_non_null: string;
		projection_dimension_non_null: string;
	}>(`
		SELECT
			COUNT(*)::text AS total_rows,
			COUNT(packet_key)::text AS packet_key_non_null,
			COUNT(source_ref)::text AS source_ref_non_null,
			COUNT(workspace_id)::text AS workspace_id_non_null,
			COUNT(workspace_revision)::text AS workspace_revision_non_null,
			COUNT(representation_revision)::text AS representation_revision_non_null,
			COUNT(source_representation_id)::text AS source_representation_id_non_null,
			COUNT(source_dimension)::text AS source_dimension_non_null,
			COUNT(projection_representation_id)::text AS projection_representation_id_non_null,
			COUNT(projection_dimension)::text AS projection_dimension_non_null
		FROM public.atlas_packets
	`);

	const row = countsResult.rows[0]!;
	return {
		connection: connection.rows[0] ?? {},
		columns: columns.rows,
		counts: Object.fromEntries(
			Object.entries(row).map(([key, value]) => [key, Number(value)]),
		),
	};
}

function parseDrizzleColumns(source: string): Map<string, { type: string; notNull: boolean }> {
	const result = new Map<string, { type: string; notNull: boolean }>();

	const propertyRegex =
		/^\s*([A-Za-z0-9_]+)\s*:\s*(uuid|text|varchar|integer|bigint|boolean|timestamp|jsonb|bytea)\(\s*['"]([^'"]+)['"]/gm;

	for (const match of source.matchAll(propertyRegex)) {
		const [, , type, columnName] = match;
		const lineStart = match.index ?? 0;
		const lineEnd = source.indexOf('\n', lineStart);
		const local = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
		result.set(columnName!, {
			type: type!,
			notNull: local.includes('.notNull()'),
		});
	}

	return result;
}

function reconcileSchema(
	liveColumns: ColumnInfo[],
	drizzle: Map<string, { type: string; notNull: boolean }>,
): {
	liveOnly: string[];
	drizzleOnly: string[];
	typeMismatches: string[];
	nullabilityMismatches: string[];
	keyFindings: string[];
} {
	const live = new Map(liveColumns.map((column) => [column.column_name, column]));
	const liveOnly = [...live.keys()].filter((name) => !drizzle.has(name)).sort();
	const drizzleOnly = [...drizzle.keys()].filter((name) => !live.has(name)).sort();

	const normalize = (type: string): string => {
		const map: Record<string, string> = {
			'character varying': 'varchar',
			'text': 'text',
			'uuid': 'uuid',
			'integer': 'integer',
			'bigint': 'bigint',
			'boolean': 'boolean',
			'timestamp without time zone': 'timestamp',
			'timestamp with time zone': 'timestamp',
			'jsonb': 'jsonb',
			'bytea': 'bytea',
		};
		return map[type] ?? type;
	};

	const typeMismatches: string[] = [];
	const nullabilityMismatches: string[] = [];

	for (const [name, drizzleColumn] of drizzle) {
		const liveColumn = live.get(name);
		if (!liveColumn) continue;
		if (normalize(liveColumn.data_type) !== normalize(drizzleColumn.type)) {
			typeMismatches.push(
				`${name}: live=${liveColumn.data_type}, drizzle=${drizzleColumn.type}`,
			);
		}
		const liveNotNull = liveColumn.is_nullable === 'NO';
		if (liveNotNull !== drizzleColumn.notNull) {
			nullabilityMismatches.push(
				`${name}: live_not_null=${liveNotNull}, drizzle_not_null=${drizzleColumn.notNull}`,
			);
		}
	}

	const keyFindings: string[] = [];
	const workspace = live.get('workspace_id');
	if (workspace && !drizzle.has('workspace_id')) {
		keyFindings.push(
			`workspace_id: live col ${workspace.ordinal_position}, ${workspace.data_type}, nullable=${workspace.is_nullable}; missing in Drizzle`,
		);
	}
	const packetId = live.get('packet_id');
	const drizzlePacketId = drizzle.get('packet_id');
	if (packetId && drizzlePacketId && normalize(packetId.data_type) !== normalize(drizzlePacketId.type)) {
		keyFindings.push(
			`packet_id mismatch: live=${packetId.data_type}, drizzle=${drizzlePacketId.type}`,
		);
	}
	const packetKey = live.get('packet_key');
	const drizzlePacketKey = drizzle.get('packet_key');
	if (
		packetKey &&
		drizzlePacketKey &&
		(packetKey.is_nullable === 'YES') === drizzlePacketKey.notNull
	) {
		keyFindings.push(
			`packet_key nullability mismatch: live nullable=${packetKey.is_nullable}, drizzle notNull=${drizzlePacketKey.notNull}`,
		);
	}

	return {
		liveOnly,
		drizzleOnly,
		typeMismatches,
		nullabilityMismatches,
		keyFindings,
	};
}

async function searchRepository(
	config: Config,
	patterns: string[],
): Promise<Record<string, string[]>> {
	const { spawn } = await import('node:child_process');

	const runRg = (pattern: string): Promise<string[]> =>
		new Promise((resolve) => {
			const child = spawn(
				'rg',
				[
					'-n',
					'--hidden',
					'--glob',
					'!.git/**',
					'--glob',
					'!node_modules/**',
					'--glob',
					'!dist/**',
					'--glob',
					'!build/**',
					pattern,
					config.repoRoot,
				],
				{ shell: false },
			);
			let stdout = '';
			child.stdout.on('data', (chunk) => {
				stdout += String(chunk);
			});
			child.on('close', () => {
				resolve(
					stdout
						.split(/\r?\n/)
						.filter(Boolean)
						.slice(0, 200),
				);
			});
			child.on('error', () => resolve([]));
		});

	const entries = await Promise.all(
		patterns.map(async (pattern) => [pattern, await runRg(pattern)] as const),
	);
	return Object.fromEntries(entries);
}

async function inspectQdrant(config: Config): Promise<{
	pointsCount: number | null;
	sampled: number;
	fieldCoverage: Record<string, number>;
	signatures: Record<string, number>;
}> {
	const info = await qdrantRequest<{ result: { points_count?: number } }>(
		config,
		`/collections/${encodeURIComponent(config.qdrantCollection)}`,
	);

	const fields = [
		'packet_key',
		'symbol_version_id',
		'workspace_id',
		'workspace_revision',
		'source_revision',
		'representation_id',
		'representation_revision',
		'schema_version',
	];

	const coverage = Object.fromEntries(fields.map((field) => [field, 0]));
	const signatures: Record<string, number> = {};
	let sampled = 0;
	let offset: string | number | null | undefined = undefined;

	while (sampled < config.qdrantSampleSize) {
		const limit = Math.min(100, config.qdrantSampleSize - sampled);
		const body: Record<string, unknown> = {
			limit,
			with_payload: true,
			with_vector: false,
		};
		if (offset !== undefined && offset !== null) body.offset = offset;

		const response = await qdrantRequest<{
			result: {
				points: QdrantPoint[];
				next_page_offset?: string | number | null;
			};
		}>(
			config,
			`/collections/${encodeURIComponent(config.qdrantCollection)}/points/scroll`,
			{
				method: 'POST',
				body: JSON.stringify(body),
			},
		);

		for (const point of response.result.points) {
			const payload = point.payload ?? {};
			const keys = Object.keys(payload).sort();
			const signature = keys.join(',');
			signatures[signature] = (signatures[signature] ?? 0) + 1;
			for (const field of fields) {
				if (payload[field] !== undefined && payload[field] !== null) {
					coverage[field] += 1;
				}
			}
			sampled += 1;
		}

		offset = response.result.next_page_offset;
		if (!offset || response.result.points.length === 0) break;
	}

	return {
		pointsCount:
			typeof info.result.points_count === 'number'
				? info.result.points_count
				: null,
		sampled,
		fieldCoverage: coverage,
		signatures,
	};
}

async function inspectGraph(config: Config): Promise<{
	exists: boolean;
	size: number | null;
	modifiedAt: string | null;
	ageMinutes: number | null;
	fresh: boolean;
}> {
	if (!(await exists(config.graphFile))) {
		return {
			exists: false,
			size: null,
			modifiedAt: null,
			ageMinutes: null,
			fresh: false,
		};
	}

	const fileStat = await stat(config.graphFile);
	const ageMinutes = (Date.now() - fileStat.mtimeMs) / 60_000;
	return {
		exists: true,
		size: fileStat.size,
		modifiedAt: fileStat.mtime.toISOString(),
		ageMinutes: Number(ageMinutes.toFixed(2)),
		fresh: ageMinutes <= config.graphMaxAgeMinutes,
	};
}

function hasRelevantHits(
	searches: Record<string, string[]>,
	pattern: string,
): boolean {
	return (searches[pattern] ?? []).length > 0;
}

function gate(
	id: GateId,
	order: number,
	title: string,
	status: Status,
	evidenceLevel: EvidenceLevel,
	summary: string,
	recommendation: string,
	options?: {
		blockedBy?: GateId[];
		evidence?: string[];
		files?: string[];
		metrics?: Record<string, string | number | boolean | null>;
	},
): GateResult {
	return {
		id,
		order,
		title,
		status,
		evidenceLevel,
		blockedBy: options?.blockedBy ?? [],
		summary,
		evidence: options?.evidence ?? [],
		recommendation,
		files: options?.files ?? [],
		metrics: options?.metrics,
	};
}

function buildGates(args: {
	config: Config;
	schema: Awaited<ReturnType<typeof inspectLiveSchema>>;
	reconciliation: ReturnType<typeof reconcileSchema>;
	searches: Record<string, string[]>;
	qdrant: Awaited<ReturnType<typeof inspectQdrant>> | null;
	qdrantError: string | null;
	graph: Awaited<ReturnType<typeof inspectGraph>>;
}): GateResult[] {
	const { config, schema, reconciliation, searches, qdrant, qdrantError, graph } = args;
	const liveColumnNames = new Set(schema.columns.map((column) => column.column_name));
	const totalRows = schema.counts.total_rows ?? 0;

	const schemaAligned =
		reconciliation.liveOnly.length === 0 &&
		reconciliation.drizzleOnly.length === 0 &&
		reconciliation.typeMismatches.length === 0 &&
		reconciliation.nullabilityMismatches.length === 0;

	const identityOwnersProven =
		liveColumnNames.has('packet_key') &&
		liveColumnNames.has('source_ref') &&
		liveColumnNames.has('workspace_id') &&
		schema.counts.packet_key_non_null === totalRows &&
		schema.counts.source_ref_non_null === totalRows &&
		schema.counts.workspace_id_non_null === totalRows;

	const writerHits = [
		...(searches['INSERT INTO atlas_packets'] ?? []),
		...(searches['UPDATE atlas_packets'] ?? []),
		...(searches['db.insert(atlasPackets)'] ?? []),
		...(searches['db.update(atlasPackets)'] ?? []),
	];
	const writerPresent = writerHits.length > 0;

	const projectionEnvelopePresent =
		hasRelevantHits(searches, 'AtlasProjectionIdentity') ||
		hasRelevantHits(searches, 'projection_version') ||
		hasRelevantHits(searches, 'projection_writer');

	const qdrantIdentityComplete =
		qdrant !== null &&
		qdrant.sampled > 0 &&
		[
			'packet_key',
			'workspace_id',
			'workspace_revision',
			'representation_id',
			'representation_revision',
			'schema_version',
		].every((field) => qdrant.fieldCoverage[field] === qdrant.sampled);

	const isolatedProofPresent =
		hasRelevantHits(searches, 'prove-reduced-packet-transport') ||
		hasRelevantHits(searches, 'REDUCED_PACKET_TRANSPORT_FIXTURE');

	const hyperragPresent =
		hasRelevantHits(searches, '/api/search/hyperrag') ||
		hasRelevantHits(searches, 'canonical-hyperrag-adapter');

	const pageRankPresent =
		hasRelevantHits(searches, 'graphPageRank') &&
		(hasRelevantHits(searches, 'neo4j-gds') ||
			hasRelevantHits(searches, 'gds.pageRank'));

	const rrfPresent =
		hasRelevantHits(searches, 'rrf-integration') ||
		hasRelevantHits(searches, 'rrf-multi-vector') ||
		hasRelevantHits(searches, 'reciprocal rank fusion');

	const summaryPresent =
		hasRelevantHits(searches, 'summary-card-retrieval') ||
		hasRelevantHits(searches, 'summary_resolved_count');

	const acePresent =
		hasRelevantHits(searches, 'canonical-packet-envelope') ||
		hasRelevantHits(searches, 'ace-materializer');

	const exactOraclePresent =
		hasRelevantHits(searches, 'brute_force.search') ||
		hasRelevantHits(searches, 'exact_topk_cuvs') ||
		hasRelevantHits(searches, 'prove-symbol-identity-knn');

	const graphifyBlocked =
		hasRelevantHits(searches, 'trainSOM') ||
		hasRelevantHits(searches, 'atlas_topology_eval_times');

	const gates: GateResult[] = [];

	gates.push(
		gate(
			'PA-ID-001',
			1,
			'Reconcile live Postgres and application schema',
			schemaAligned ? 'PASS' : 'FAIL',
			schemaAligned ? 'PRODUCTION_DATA_PROVEN' : 'PRODUCTION_DATA_PROVEN',
			schemaAligned
				? 'Live atlas_packets and Drizzle declarations align.'
				: `Schema drift remains: ${reconciliation.liveOnly.length} live-only, ${reconciliation.drizzleOnly.length} Drizzle-only, ${reconciliation.typeMismatches.length} type, ${reconciliation.nullabilityMismatches.length} nullability mismatches.`,
			schemaAligned
				? 'Keep this gate in the daily read-only suite.'
				: 'Make live-vs-Drizzle reconciliation the next implementation task before projection or retrieval promotion.',
			{
				evidence: reconciliation.keyFindings,
				files: [
					path.join(config.appRoot, 'src/lib/server/db/schema/atlas-packets.ts'),
				],
				metrics: {
					live_column_count: schema.columns.length,
					live_only_count: reconciliation.liveOnly.length,
					drizzle_only_count: reconciliation.drizzleOnly.length,
					type_mismatch_count: reconciliation.typeMismatches.length,
					nullability_mismatch_count:
						reconciliation.nullabilityMismatches.length,
				},
			},
		),
	);

	gates.push(
		gate(
			'PA-ID-002',
			2,
			'Establish canonical identity owners',
			identityOwnersProven ? 'PARTIAL' : 'BLOCKED',
			identityOwnersProven
				? 'PRODUCTION_DATA_PROVEN'
				: 'NOT_PROVEN',
			identityOwnersProven
				? 'Packet, source, and workspace fields are populated, but symbol/source-revision/schema ownership still requires explicit contracts.'
				: 'At least one base canonical identity field is absent or unpopulated in live atlas_packets.',
			'Publish one owner matrix for packet, workspace, source revision, symbol version, representation, and schema identity. Do not derive unresolved IDs.',
			{
				blockedBy: schemaAligned ? [] : ['PA-ID-001'],
				metrics: {
					total_rows: totalRows,
					packet_key_non_null: schema.counts.packet_key_non_null ?? 0,
					source_ref_non_null: schema.counts.source_ref_non_null ?? 0,
					workspace_id_non_null: schema.counts.workspace_id_non_null ?? 0,
					source_representation_id_non_null:
						schema.counts.source_representation_id_non_null ?? 0,
					projection_representation_id_non_null:
						schema.counts.projection_representation_id_non_null ?? 0,
				},
			},
		),
	);

	gates.push(
		gate(
			'PA-ID-003',
			3,
			'Correct the canonical packet writer',
			writerPresent ? 'PARTIAL' : 'NOT_PROVEN',
			writerPresent ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			writerPresent
				? `Found ${writerHits.length} atlas_packets insert/update references; active ownership and field completeness still require runtime classification.`
				: 'No atlas_packets writer references were found by the configured search.',
			'Classify active insert/update owners and patch only the canonical writer after the identity owner matrix is settled.',
			{
				blockedBy: ['PA-ID-001', 'PA-ID-002'],
				evidence: writerHits.slice(0, 20),
			},
		),
	);

	gates.push(
		gate(
			'PA-PROJ-001',
			4,
			'Define one projection envelope',
			projectionEnvelopePresent ? 'PARTIAL' : 'NOT_PROVEN',
			projectionEnvelopePresent ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			projectionEnvelopePresent
				? 'Projection-envelope concepts exist, but one enforced versioned contract is not proven across Qdrant, Neo4j, summaries, and cache lanes.'
				: 'No shared projection envelope was located.',
			'Define one versioned projection identity envelope after canonical identity ownership is fixed.',
			{ blockedBy: ['PA-ID-002', 'PA-ID-003'] },
		),
	);

	gates.push(
		gate(
			'PA-PROJ-002',
			5,
			'Prove isolated Qdrant write/read/join',
			isolatedProofPresent ? 'PARTIAL' : 'NOT_PROVEN',
			isolatedProofPresent ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			isolatedProofPresent
				? 'A reduced packet transport proof harness exists; runtime evidence must still be read from its dated JSON/Markdown report.'
				: 'No isolated Qdrant round-trip proof harness was located.',
			'Run the isolated proof only after schema, identity owner, writer, and projection-envelope gates are ready.',
			{ blockedBy: ['PA-ID-001', 'PA-ID-002', 'PA-ID-003', 'PA-PROJ-001'] },
		),
	);

	gates.push(
		gate(
			'PA-PROJ-003',
			6,
			'Repair or rebuild production Qdrant projections',
			qdrantIdentityComplete ? 'PASS' : 'FAIL',
			qdrantIdentityComplete
				? 'PRODUCTION_DATA_PROVEN'
				: qdrant
					? 'PRODUCTION_DATA_PROVEN'
					: 'NOT_PROVEN',
			qdrantIdentityComplete
				? `All ${qdrant.sampled} sampled points carry the required packet/representation identity fields.`
				: qdrant
					? `Production Qdrant payload identity is incomplete across ${qdrant.sampled} sampled points.`
					: `Qdrant could not be inspected: ${qdrantError}`,
			'Do not trust production retrieval until points are deterministically re-upserted or rebuilt from canonical Postgres.',
			{
				blockedBy: ['PA-PROJ-002'],
				metrics: qdrant
					? {
							points_count: qdrant.pointsCount,
							sampled: qdrant.sampled,
							...qdrant.fieldCoverage,
							writer_signature_count: Object.keys(qdrant.signatures).length,
						}
					: undefined,
			},
		),
	);

	gates.push(
		gate(
			'PA-RET-001',
			7,
			'Prove one canonical HyperRAG route',
			hyperragPresent ? 'PARTIAL' : 'NOT_PROVEN',
			hyperragPresent ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			hyperragPresent
				? 'HyperRAG route/adapters exist, but production end-to-end evidence is blocked by projection identity.'
				: 'No canonical HyperRAG route/adaptor was located.',
			'After production projection repair, prove retrieve → hydrate → validate → fuse → rerank → exact source → ACE on one route.',
			{ blockedBy: ['PA-PROJ-003'] },
		),
	);

	gates.push(
		gate(
			'PA-GRAPH-001',
			8,
			'Attach persisted PageRank after canonical hydration',
			pageRankPresent ? 'PARTIAL' : 'NOT_PROVEN',
			pageRankPresent ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			pageRankPresent
				? 'Persisted PageRank code is present; attachment after canonical hydration is not production-proven.'
				: 'No persisted PageRank reader path was located.',
			'Verify PageRank is read after hydration, is nonfatal when missing, and is never recomputed per request.',
			{ blockedBy: ['PA-RET-001'] },
		),
	);

	gates.push(
		gate(
			'PA-RET-002',
			9,
			'Prove independent RRF lanes',
			rrfPresent ? 'PARTIAL' : 'NOT_PROVEN',
			rrfPresent ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			rrfPresent
				? 'RRF implementations exist; ordered semantic, lexical, graph, PageRank, and summary inputs are not runtime-proven on one canonical route.'
				: 'No RRF implementation was located.',
			'Capture pre-fusion ordered lane lists and prove rank-based fusion without raw-score collapse.',
			{ blockedBy: ['PA-RET-001', 'PA-GRAPH-001'] },
		),
	);

	gates.push(
		gate(
			'PA-SUM-001',
			10,
			'Resolve summaries to exact current source',
			summaryPresent ? 'PARTIAL' : 'NOT_PROVEN',
			summaryPresent ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			summaryPresent
				? 'Summary retrieval code exists; stale-target rejection and exact-current-source resolution are not proven.'
				: 'No summary retrieval path was located.',
			'Require summary hits to resolve through canonical identity and revision checks before evidence inclusion.',
			{ blockedBy: ['PA-RET-001'] },
		),
	);

	gates.push(
		gate(
			'PA-ACE-001',
			11,
			'Prove ACE provenance',
			acePresent ? 'PARTIAL' : 'NOT_PROVEN',
			acePresent ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			acePresent
				? 'ACE envelope/materializer code exists; one provenance-complete production receipt is not proven.'
				: 'No canonical ACE path was located.',
			'Prove exact source, revision receipt, and contributing-lane provenance for every final ACE item.',
			{ blockedBy: ['PA-RET-002', 'PA-SUM-001'] },
		),
	);

	gates.push(
		gate(
			'PA-EVAL-001',
			12,
			'Compare Qdrant HNSW with the exact semantic_768 oracle',
			exactOraclePresent ? 'PARTIAL' : 'NOT_PROVEN',
			exactOraclePresent ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			exactOraclePresent
				? 'An exact-search seam exists, but same-matrix HNSW recall@k and rank-correlation evidence is not proven here.'
				: 'No checked-in exact semantic_768 oracle was located.',
			'Run parity only after canonical projection identity and corpus manifest alignment are proven.',
			{ blockedBy: ['PA-PROJ-003'] },
		),
	);

	gates.push(
		gate(
			'PA-OPS-001',
			13,
			'Repair graphify stage isolation and freshness',
			graph.fresh ? 'PASS' : graph.exists ? 'FAIL' : 'BLOCKED',
			graph.fresh ? 'PRODUCTION_DATA_PROVEN' : 'PRODUCTION_DATA_PROVEN',
			graph.fresh
				? `Graph artifact age ${graph.ageMinutes} minutes is within the ${config.graphMaxAgeMinutes}-minute threshold.`
				: graph.exists
					? `Graph artifact is stale at ${graph.ageMinutes} minutes.`
					: 'Graph artifact is missing.',
			graph.fresh
				? 'Keep freshness as a daily health gate.'
				: 'Isolate code-graph refresh from optional SOM/topology stages and publish stage receipts.',
			{
				evidence: graphifyBlocked
					? [
							'Repository contains trainSOM and/or atlas_topology_eval_times references associated with the known failure boundary.',
						]
					: [],
				files: [config.graphFile],
				metrics: {
					graph_exists: graph.exists,
					graph_size: graph.size,
					graph_modified_at: graph.modifiedAt,
					graph_age_minutes: graph.ageMinutes,
					graph_fresh: graph.fresh,
				},
			},
		),
	);

	gates.push(
		gate(
			'PA-GRAPH-002',
			14,
			'Add derived graph enhancements',
			'BLOCKED',
			'NOT_PROVEN',
			'Derived graph enhancements are intentionally deferred until identity, projection, retrieval, evidence, evaluation, and freshness prerequisites pass.',
			'Do not add SHARES_CLUSTER, HIGH_AUTHORITY, new graph algorithms, or broad topology reruns yet.',
			{
				blockedBy: [
					'PA-ID-001',
					'PA-ID-002',
					'PA-PROJ-003',
					'PA-RET-001',
					'PA-ACE-001',
					'PA-EVAL-001',
					'PA-OPS-001',
				],
			},
		),
	);

	return gates;
}

function deriveRecommendation(gates: GateResult[]): {
	firstBlockingGate: GateResult | null;
	todayTask: string;
	kanban: Record<string, GateId[]>;
} {
	const ordered = [...gates].sort((a, b) => a.order - b.order);
	const firstBlockingGate =
		ordered.find((gate) => gate.status === 'FAIL' || gate.status === 'BLOCKED') ??
		ordered.find((gate) => gate.status === 'NOT_PROVEN' || gate.status === 'PARTIAL') ??
		null;

	const kanban: Record<string, GateId[]> = {
		BLOCKED: [],
		READY: [],
		'IN PROGRESS': [],
		VERIFY: [],
		DONE: [],
		DEFERRED: [],
	};

	for (const gate of ordered) {
		if (gate.id === 'PA-GRAPH-002') {
			kanban.DEFERRED.push(gate.id);
		} else if (gate.status === 'PASS') {
			kanban.DONE.push(gate.id);
		} else if (gate.status === 'PARTIAL') {
			kanban.VERIFY.push(gate.id);
		} else if (gate.status === 'FAIL' || gate.status === 'BLOCKED') {
			kanban.BLOCKED.push(gate.id);
		} else {
			const dependenciesPassed = gate.blockedBy.every((dependency) => {
				const dep = ordered.find((item) => item.id === dependency);
				return dep?.status === 'PASS';
			});
			(dependenciesPassed ? kanban.READY : kanban.BLOCKED).push(gate.id);
		}
	}

	return {
		firstBlockingGate,
		todayTask: firstBlockingGate
			? `${firstBlockingGate.id}: ${firstBlockingGate.title} — ${firstBlockingGate.recommendation}`
			: 'All defined readiness gates pass.',
		kanban,
	};
}

function markdownReport(report: Record<string, unknown>): string {
	const gates = report.gates as GateResult[];
	const recommendation = report.recommendation as ReturnType<typeof deriveRecommendation>;
	const connection = report.database_connection as Record<string, unknown>;
	const schema = report.schema_reconciliation as ReturnType<typeof reconcileSchema>;

	const lines: string[] = [
		'# Parent Atlas Health Check',
		'',
		`- Generated: ${report.generated_at}`,
		`- Overall status: **${report.overall_status}**`,
		`- Database: \`${String(connection.database ?? 'unknown')}\``,
		`- Schema: \`${String(connection.schema ?? 'unknown')}\``,
		'',
		'## Today’s recommendation',
		'',
		recommendation.todayTask,
		'',
		'## Ordered readiness gates',
		'',
		'| Order | ID | Gate | Status | Evidence |',
		'|---:|---|---|---|---|',
		...gates
			.sort((a, b) => a.order - b.order)
			.map(
				(gate) =>
					`| ${gate.order} | ${gate.id} | ${gate.title} | ${gate.status} | ${gate.evidenceLevel} |`,
			),
		'',
		'## Gate details',
		'',
	];

	for (const gate of [...gates].sort((a, b) => a.order - b.order)) {
		lines.push(
			`### ${gate.id} — ${gate.title}`,
			'',
			`**Status:** ${gate.status}`,
			'',
			gate.summary,
			'',
			`**Recommendation:** ${gate.recommendation}`,
			'',
		);
		if (gate.blockedBy.length > 0) {
			lines.push(`**Blocked by:** ${gate.blockedBy.join(', ')}`, '');
		}
		if (gate.evidence.length > 0) {
			lines.push('**Evidence:**', '', ...gate.evidence.map((item) => `- ${item}`), '');
		}
		if (gate.metrics) {
			lines.push(
				'**Metrics:**',
				'',
				...Object.entries(gate.metrics).map(([key, value]) => `- ${key}: ${String(value)}`),
				'',
			);
		}
	}

	lines.push(
		'## Critical schema reconciliation',
		'',
		`- Live-only columns: ${schema.liveOnly.length}`,
		`- Drizzle-only columns: ${schema.drizzleOnly.length}`,
		`- Type mismatches: ${schema.typeMismatches.length}`,
		`- Nullability mismatches: ${schema.nullabilityMismatches.length}`,
		'',
		...schema.keyFindings.map((item) => `- ${item}`),
		'',
		'## Kanban counts',
		'',
		...Object.entries(recommendation.kanban).map(
			([column, ids]) => `- ${column}: ${ids.length} (${ids.join(', ') || 'none'})`,
		),
		'',
	);

	return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
	const config = parseArgs(process.argv.slice(2));
	const pool = new Pool({
		connectionString: config.databaseUrl,
		max: 4,
		application_name: 'parent-atlas-health-check',
	});

	const generatedAt = new Date().toISOString();
	const datePart = generatedAt.slice(0, 10);
	const jsonPath = path.join(
		config.reportDir,
		`PARENT_ATLAS_HEALTH_CHECK_${datePart}.json`,
	);
	const mdPath = path.join(
		config.reportDir,
		`PARENT_ATLAS_HEALTH_CHECK_${datePart}.md`,
	);

	try {
		const schema = await inspectLiveSchema(pool);
		const drizzlePath = path.join(
			config.appRoot,
			'src/lib/server/db/schema/atlas-packets.ts',
		);
		const drizzleSource = (await exists(drizzlePath))
			? await readText(drizzlePath)
			: '';
		const drizzleColumns = parseDrizzleColumns(drizzleSource);
		const reconciliation = reconcileSchema(schema.columns, drizzleColumns);

		const searchPatterns = [
			'INSERT INTO atlas_packets',
			'UPDATE atlas_packets',
			'db.insert(atlasPackets)',
			'db.update(atlasPackets)',
			'AtlasProjectionIdentity',
			'projection_version',
			'projection_writer',
			'prove-reduced-packet-transport',
			'REDUCED_PACKET_TRANSPORT_FIXTURE',
			'/api/search/hyperrag',
			'canonical-hyperrag-adapter',
			'graphPageRank',
			'neo4j-gds',
			'gds.pageRank',
			'rrf-integration',
			'rrf-multi-vector',
			'reciprocal rank fusion',
			'summary-card-retrieval',
			'summary_resolved_count',
			'canonical-packet-envelope',
			'ace-materializer',
			'brute_force.search',
			'exact_topk_cuvs',
			'prove-symbol-identity-knn',
			'trainSOM',
			'atlas_topology_eval_times',
		];
		const searches = await searchRepository(config, searchPatterns);

		let qdrant: Awaited<ReturnType<typeof inspectQdrant>> | null = null;
		let qdrantError: string | null = null;
		try {
			qdrant = await inspectQdrant(config);
		} catch (error) {
			qdrantError = error instanceof Error ? error.message : String(error);
		}

		const graph = await inspectGraph(config);

		const gates = buildGates({
			config,
			schema,
			reconciliation,
			searches,
			qdrant,
			qdrantError,
			graph,
		});
		const recommendation = deriveRecommendation(gates);

		const overallStatus = gates.some(
			(gate) => gate.status === 'FAIL' || gate.status === 'BLOCKED',
		)
			? 'BLOCKED'
			: gates.some(
						(gate) =>
							gate.status === 'PARTIAL' ||
							gate.status === 'NOT_PROVEN',
					)
				? 'PARTIAL'
				: 'PASS';

		const report: Record<string, unknown> = {
			generated_at: generatedAt,
			overall_status: overallStatus,
			repo_root: config.repoRoot,
			app_root: config.appRoot,
			database_connection: schema.connection,
			live_atlas_packets_column_count: schema.columns.length,
			live_population_counts: schema.counts,
			schema_reconciliation: reconciliation,
			qdrant: qdrant ?? { error: qdrantError },
			graph,
			gates,
			recommendation,
			daily_gate_policy: {
				fast_read_only: [
					'PA-ID-001 schema reconciliation',
					'PA-ID-002 identity population',
					'PA-PROJ-003 Qdrant payload sample',
					'PA-OPS-001 graph artifact freshness',
				],
				nightly_medium: [
					'PA-PROJ-002 isolated Qdrant round-trip fixture',
					'PA-RET-001 canonical HyperRAG route fixture after prerequisites pass',
				],
				weekly_or_manual: [
					'PA-EVAL-001 exact semantic_768 versus Qdrant HNSW parity',
					'production projection rebuilds',
					'derived graph enhancements',
				],
			},
		};

		await mkdir(config.reportDir, { recursive: true });
		await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		await writeFile(mdPath, markdownReport(report), 'utf8');

		console.log(JSON.stringify(report, null, 2));
		console.error(`\nReports:\n- ${jsonPath}\n- ${mdPath}`);
		console.error(`\nToday's recommendation:\n${recommendation.todayTask}`);

		if (
			config.strict &&
			(overallStatus === 'BLOCKED' || overallStatus === 'PARTIAL')
		) {
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
