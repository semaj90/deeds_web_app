#!/usr/bin/env node
/**
 * Parent Atlas next-steps planner.
 *
 * Read-only by default.
 *
 * Purpose:
 *   Inspect the current Parent Atlas workstation and repository, determine
 *   which parameters/contracts are known versus missing, validate readiness
 *   across identity, AST-aware semantics, classifications, retrieval, graph,
 *   reranking, and agentic error-fixing, then generate:
 *
 *   - a readiness matrix
 *   - a prioritized Kanban board
 *   - daily recommendations
 *   - one exact smallest next implementation task
 *
 * Suggested repository path:
 *   sveltekit-frontend/scripts/atlas/plan-parent-atlas-next-steps.mts
 *
 * Required:
 *   - Node 20+
 *   - pg package
 *   - DATABASE_URL
 *
 * Optional:
 *   - QDRANT_URL
 *   - QDRANT_COLLECTION
 *   - LLM_URL
 *   - EMBEDDING_URL
 *   - LANGEXTRACT_URL
 *   - XGBOOST_URL
 *   - RERANKER_URL
 *   - NLP_GPU_URL
 *   - --okf-root=<repo>/docs/.okf
 *   - --openwiki-root=<repo>/docs/openwiki
 *   - OTEL_COLLECTOR_HTTP_URL / --otel-http-url
 *   - OTEL_COLLECTOR_GRPC_HOST / --otel-grpc-host
 *   - OTEL_COLLECTOR_GRPC_PORT / --otel-grpc-port
 *   - QDRANT_GRPC_HOST / --qdrant-grpc-host
 *   - QDRANT_GRPC_PORT / --qdrant-grpc-port
 *   - OTEL_CONFIG_PATH / --otel-config
 *   - PARENT_ATLAS_DAG_LOG_DEBOUNCE_MS / --dag-log-debounce-ms
 *   - PARENT_ATLAS_DAG_LOG_MAX_PENDING / --dag-log-max-pending
 *   - PARENT_ATLAS_IDLE_PROMPT_DEBOUNCE_MS / --idle-prompt-debounce-ms
 *   - PARENT_ATLAS_IDLE_PROMPT_MIN_IDLE_MS / --idle-prompt-min-idle-ms
 *   - PARENT_ATLAS_IDLE_PROMPT_COOLDOWN_MS / --idle-prompt-cooldown-ms
 *   - PARENT_ATLAS_MAX_CONCURRENT_API_CALLS / --max-concurrent-api-calls
 *   - PARENT_ATLAS_CONTEXT_TOKEN_SOFT_LIMIT / --context-token-soft-limit
 *   - PARENT_ATLAS_CONTEXT_TOKEN_HARD_LIMIT / --context-token-hard-limit
 *   - PARENT_ATLAS_GPU_STRESS_SECONDS / --gpu-stress-seconds
 *
 * Example:
 *   $env:DATABASE_URL="postgresql://postgres:...@127.0.0.1:5434/legal_ai_db"
 *   npx tsx scripts/atlas/plan-parent-atlas-next-steps.mts
 *
 * Strict mode:
 *   npx tsx scripts/atlas/plan-parent-atlas-next-steps.mts --strict
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const execFileAsync = promisify(execFile);
const { Pool } = pg;

type Status =
	| 'PASS'
	| 'PARTIAL'
	| 'FAIL'
	| 'BLOCKED'
	| 'NOT_PROVEN'
	| 'SKIP';

type Proof =
	| 'SOURCE_PRESENT'
	| 'STATIC_WIRING_PROVEN'
	| 'FIXTURE_PROVEN'
	| 'RUNTIME_SMOKE_PROVEN'
	| 'PRODUCTION_DATA_PROVEN'
	| 'PARTIAL_PROVEN'
	| 'NOT_PROVEN'
	| 'BLOCKED'
	| 'FAIL';

type Area =
	| 'IDENTITY'
	| 'SCHEMA'
	| 'AST'
	| 'SEMANTIC'
	| 'CLASSIFICATION'
	| 'ONTOLOGY'
	| 'QDRANT'
	| 'RETRIEVAL'
	| 'GRAPH'
	| 'RERANK'
	| 'ACE'
	| 'EDIT'
	| 'DAG'
	| 'OPERATIONS'
	| 'GPU'
	| 'KNOWLEDGE'
	| 'NLP'
	| 'OBSERVABILITY';

type Gate = {
	id: string;
	order: number;
	area: Area;
	title: string;
	status: Status;
	proof: Proof;
	summary: string;
	evidence: unknown;
	dependencies: string[];
	definitionOfDone: string[];
	nextAction: string;
	prohibitedScope: string[];
};

type Task = {
	taskId: string;
	priority: 'P0' | 'P1' | 'P2' | 'P3';
	column: 'BLOCKED' | 'READY' | 'IN_PROGRESS' | 'VERIFY' | 'DONE' | 'DEFERRED';
	area: Area;
	title: string;
	ownerComponent: string;
	exactFiles: string[];
	dependencies: string[];
	definitionOfDone: string[];
	validationCommands: string[];
	expectedProof: Proof;
	prohibitedScope: string[];
	reason: string;
};

type Config = {
	repoRoot: string;
	appRoot: string;
	databaseUrl: string;
	qdrantUrl: string;
	qdrantCollection: string;
	llmUrl: string;
	embeddingUrl: string;
	langExtractUrl: string;
	xgboostUrl: string;
	rerankerUrl: string;
	nlpGpuUrl: string;
	otelCollectorHttpUrl: string;
	otelCollectorGrpcHost: string;
	otelCollectorGrpcPort: number;
	qdrantGrpcHost: string;
	qdrantGrpcPort: number;
	otelConfigPath: string;
	dagLogDebounceMs: number;
	dagLogMaxPending: number;
	idlePromptDebounceMs: number;
	idlePromptMinIdleMs: number;
	idlePromptCooldownMs: number;
	maxConcurrentApiCalls: number;
	contextTokenSoftLimit: number;
	contextTokenHardLimit: number;
	gpuStressSeconds: number;
	okfRoot: string;
	openWikiRoot: string;
	reportDir: string;
	graphFile: string;
	strict: boolean;
	qdrantSampleSize: number;
};

class PlannerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PlannerError';
	}
}

function argValue(name: string): string | undefined {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
	return process.argv.slice(2).includes(`--${name}`);
}

function loadConfig(): Config {
	const appRoot = path.resolve(argValue('app-root') ?? process.cwd());
	const repoRoot = path.resolve(argValue('repo-root') ?? path.join(appRoot, '..'));
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new PlannerError(
			'DATABASE_URL is required, e.g. postgresql://postgres:...@127.0.0.1:5434/legal_ai_db',
		);
	}

	return {
		repoRoot,
		appRoot,
		databaseUrl,
		qdrantUrl: (
			argValue('qdrant-url') ??
			process.env.QDRANT_URL ??
			'http://127.0.0.1:6333'
		).replace(/\/+$/, ''),
		qdrantCollection:
			argValue('qdrant-collection') ??
			process.env.QDRANT_COLLECTION ??
			'codebase_chunks_768',
		llmUrl: (
			argValue('llm-url') ??
			process.env.LLM_URL ??
			'http://127.0.0.1:8090'
		).replace(/\/+$/, ''),
		embeddingUrl: (
			argValue('embedding-url') ??
			process.env.EMBEDDING_URL ??
			'http://127.0.0.1:8081'
		).replace(/\/+$/, ''),
		langExtractUrl: (
			argValue('langextract-url') ??
			process.env.LANGEXTRACT_URL ??
			'http://127.0.0.1:8095'
		).replace(/\/+$/, ''),
		xgboostUrl: (
			argValue('xgboost-url') ??
			process.env.XGBOOST_URL ??
			'http://127.0.0.1:8765'
		).replace(/\/+$/, ''),
		rerankerUrl: (
			argValue('reranker-url') ??
			process.env.RERANKER_URL ??
			'http://127.0.0.1:8099'
		).replace(/\/+$/, ''),
		nlpGpuUrl: (
			argValue('nlp-gpu-url') ??
			process.env.NLP_GPU_URL ??
			'http://127.0.0.1:8095'
		).replace(/\/+$/, ''),
		otelCollectorHttpUrl: (
			argValue('otel-http-url') ??
			process.env.OTEL_COLLECTOR_HTTP_URL ??
			'http://127.0.0.1:4318'
		).replace(/\/+$/, ''),
		otelCollectorGrpcHost:
			argValue('otel-grpc-host') ??
			process.env.OTEL_COLLECTOR_GRPC_HOST ??
			'127.0.0.1',
		otelCollectorGrpcPort: Number(
			argValue('otel-grpc-port') ??
			process.env.OTEL_COLLECTOR_GRPC_PORT ??
			'4317',
		),
		qdrantGrpcHost:
			argValue('qdrant-grpc-host') ??
			process.env.QDRANT_GRPC_HOST ??
			'127.0.0.1',
		qdrantGrpcPort: Number(
			argValue('qdrant-grpc-port') ??
			process.env.QDRANT_GRPC_PORT ??
			'6334',
		),
		otelConfigPath: path.resolve(
			argValue('otel-config') ??
			process.env.OTEL_CONFIG_PATH ??
			path.join(repoRoot, 'config', 'otel-collector.yaml'),
		),
		dagLogDebounceMs: Number(
			argValue('dag-log-debounce-ms') ??
			process.env.PARENT_ATLAS_DAG_LOG_DEBOUNCE_MS ??
			'250',
		),
		dagLogMaxPending: Number(
			argValue('dag-log-max-pending') ??
			process.env.PARENT_ATLAS_DAG_LOG_MAX_PENDING ??
			'1000',
		),
		idlePromptDebounceMs: Number(
			argValue('idle-prompt-debounce-ms') ??
			process.env.PARENT_ATLAS_IDLE_PROMPT_DEBOUNCE_MS ??
			'1500',
		),
		idlePromptMinIdleMs: Number(
			argValue('idle-prompt-min-idle-ms') ??
			process.env.PARENT_ATLAS_IDLE_PROMPT_MIN_IDLE_MS ??
			'5000',
		),
		idlePromptCooldownMs: Number(
			argValue('idle-prompt-cooldown-ms') ??
			process.env.PARENT_ATLAS_IDLE_PROMPT_COOLDOWN_MS ??
			'30000',
		),
		maxConcurrentApiCalls: Number(
			argValue('max-concurrent-api-calls') ??
			process.env.PARENT_ATLAS_MAX_CONCURRENT_API_CALLS ??
			'4',
		),
		contextTokenSoftLimit: Number(
			argValue('context-token-soft-limit') ??
			process.env.PARENT_ATLAS_CONTEXT_TOKEN_SOFT_LIMIT ??
			'48000',
		),
		contextTokenHardLimit: Number(
			argValue('context-token-hard-limit') ??
			process.env.PARENT_ATLAS_CONTEXT_TOKEN_HARD_LIMIT ??
			'62000',
		),
		gpuStressSeconds: Number(
			argValue('gpu-stress-seconds') ??
			process.env.PARENT_ATLAS_GPU_STRESS_SECONDS ??
			'15',
		),
		okfRoot: path.resolve(
			argValue('okf-root') ??
			path.join(repoRoot, 'docs', '.okf'),
		),
		openWikiRoot: path.resolve(
			argValue('openwiki-root') ??
			path.join(repoRoot, 'docs', 'openwiki'),
		),
		reportDir: path.resolve(
			argValue('report-dir') ??
				path.join(appRoot, 'docs', 'reports', 'parent-atlas'),
		),
		graphFile: path.resolve(
			argValue('graph-file') ??
				path.join(appRoot, 'docs', 'graph', 'codebase-graph.json'),
		),
		strict: hasFlag('strict'),
		qdrantSampleSize: Number(argValue('qdrant-sample-size') ?? '200'),
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

async function run(
	file: string,
	args: string[],
	cwd: string,
	timeout = 20_000,
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
	try {
		const result = await execFileAsync(file, args, {
			cwd,
			timeout,
			maxBuffer: 20 * 1024 * 1024,
			windowsHide: true,
		});
		return { ok: true, stdout: result.stdout, stderr: result.stderr, code: 0 };
	} catch (error) {
		const value = error as {
			stdout?: string;
			stderr?: string;
			code?: number;
			message?: string;
		};
		return {
			ok: false,
			stdout: value.stdout ?? '',
			stderr: value.stderr ?? value.message ?? String(error),
			code: value.code ?? null,
		};
	}
}

async function fetchJson<T>(
	url: string,
	init?: RequestInit,
	timeoutMs = 8_000,
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
		const body = await response.text();
		if (!response.ok) {
			throw new PlannerError(`${url} HTTP ${response.status}: ${body.slice(0, 300)}`);
		}
		return (body ? JSON.parse(body) : {}) as T;
	} finally {
		clearTimeout(timer);
	}
}

async function tryEndpoints<T>(base: string, endpoints: string[]) {
	const errors: string[] = [];
	for (const endpoint of endpoints) {
		try {
			return {
				ok: true as const,
				endpoint,
				value: await fetchJson<T>(`${base}${endpoint}`),
			};
		} catch (error) {
			errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { ok: false as const, errors };
}

async function rg(config: Config, pattern: string): Promise<string[]> {
	const result = await run(
		'rg',
		[
			'-n',
			'--hidden',
			'--glob',
			'!.git/**',
			'--glob',
			'!node_modules/**',
			'--glob',
			'!build/**',
			'--glob',
			'!dist/**',
			'--glob',
			'!coverage/**',
			pattern,
			config.repoRoot,
		],
		config.repoRoot,
	);
	return result.ok
		? result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 150)
		: [];
}

async function inspectPostgres(config: Config) {
	const pool = new Pool({
		connectionString: config.databaseUrl,
		max: 4,
		application_name: 'parent-atlas-next-steps-planner',
	});
	try {
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
			is_nullable: string;
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
			WHERE table_schema='public'
			  AND table_name='atlas_packets'
			ORDER BY ordinal_position
		`);

		const names = new Set(columns.rows.map((row) => row.column_name));
		const required = [
			'packet_key',
			'source_ref',
			'workspace_id',
			'workspace_revision',
			'representation_revision',
		];
		const missingRequired = required.filter((name) => !names.has(name));

		let coverage: Record<string, number> | null = null;
		if (missingRequired.length === 0) {
			const result = await pool.query<Record<string, string>>(`
				SELECT
					COUNT(*)::text AS total_rows,
					COUNT(packet_key)::text AS packet_key_present,
					COUNT(source_ref)::text AS source_ref_present,
					COUNT(workspace_id)::text AS workspace_id_present,
					COUNT(workspace_revision)::text AS workspace_revision_present,
					COUNT(representation_revision)::text AS representation_revision_present,
					COUNT(*) FILTER (
						WHERE packet_key IS NULL OR btrim(packet_key)=''
					)::text AS packet_key_missing,
					COUNT(*) FILTER (
						WHERE source_ref IS NULL OR btrim(source_ref)=''
					)::text AS source_ref_missing,
					COUNT(*) FILTER (
						WHERE workspace_id IS NULL OR btrim(workspace_id)=''
					)::text AS workspace_id_missing,
					COUNT(*) FILTER (
						WHERE representation_revision=0
					)::text AS representation_revision_zero,
					COUNT(source_representation_id)::text AS source_representation_id_present,
					COUNT(projection_representation_id)::text AS projection_representation_id_present,
					COUNT(latent_64)::text AS latent_64_present,
					COUNT(*) FILTER (
						WHERE latent_64 IS NOT NULL
						  AND octet_length(latent_64) <> 256
					)::text AS latent_64_wrong_size
				FROM public.atlas_packets
			`);
			coverage = Object.fromEntries(
				Object.entries(result.rows[0] ?? {}).map(([key, value]) => [
					key,
					Number(value),
				]),
			);
		}

		const indexes = await pool.query<{
			indexname: string;
			indexdef: string;
		}>(`
			SELECT indexname, indexdef
			FROM pg_indexes
			WHERE schemaname='public'
			  AND tablename='atlas_packets'
			ORDER BY indexname
		`);

		return {
			connection: connection.rows[0],
			columns: columns.rows,
			missingRequired,
			coverage,
			indexes: indexes.rows,
		};
	} finally {
		await pool.end();
	}
}

async function inspectQdrant(config: Config) {
	const collection = await fetchJson<{
		result: { points_count?: number; config?: unknown };
	}>(`${config.qdrantUrl}/collections/${encodeURIComponent(config.qdrantCollection)}`);

	const scroll = await fetchJson<{
		result: {
			points: Array<{ id: string | number; payload?: Record<string, unknown> }>;
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

	for (const point of scroll.result.points) {
		const payload = point.payload ?? {};
		const signature = Object.keys(payload).sort().join(',');
		signatures[signature] = (signatures[signature] ?? 0) + 1;
		for (const field of fields) {
			if (payload[field] !== undefined && payload[field] !== null) {
				coverage[field] += 1;
			}
		}
	}

	return {
		pointsCount: collection.result.points_count ?? null,
		sampled: scroll.result.points.length,
		coverage,
		signatures,
		collectionConfig: collection.result.config ?? null,
		vectorContracts: qdrantVectorContracts({
			config: collection.result.config,
		}),
	};
}

async function inspectGraph(config: Config) {
	if (!(await exists(config.graphFile))) {
		return { exists: false, ageMinutes: null, size: null, modifiedAt: null };
	}
	const fileStat = await stat(config.graphFile);
	return {
		exists: true,
		ageMinutes: (Date.now() - fileStat.mtimeMs) / 60_000,
		size: fileStat.size,
		modifiedAt: fileStat.mtime.toISOString(),
	};
}



async function tcpProbe(
	host: string,
	port: number,
	timeoutMs = 3_000,
): Promise<{ ok: boolean; host: string; port: number; error?: string }> {
	const net = await import('node:net');
	return await new Promise((resolve) => {
		const socket = net.createConnection({ host, port });
		const timer = setTimeout(() => {
			socket.destroy();
			resolve({ ok: false, host, port, error: 'TIMEOUT' });
		}, timeoutMs);

		socket.once('connect', () => {
			clearTimeout(timer);
			socket.end();
			resolve({ ok: true, host, port });
		});
		socket.once('error', (error) => {
			clearTimeout(timer);
			socket.destroy();
			resolve({ ok: false, host, port, error: error.message });
		});
	});
}

async function inspectOtel(config: Config) {
	const hits = await rg(
		config,
		'@opentelemetry|OTEL_|OpenTelemetry|NodeSDK|TracerProvider|MeterProvider|OTLPTraceExporter|OTLPMetricExporter|routing\\/|routing connector|service\\.pipelines|4317|4318',
	);
	const configExists = await exists(config.otelConfigPath);
	const configText = configExists
		? await readFile(config.otelConfigPath, 'utf8')
		: '';
	const httpHealth = await tryEndpoints<Record<string, unknown>>(
		config.otelCollectorHttpUrl,
		['/', '/health', '/healthz', '/v1/traces'],
	);
	const grpc = await tcpProbe(
		config.otelCollectorGrpcHost,
		config.otelCollectorGrpcPort,
	);
	const routingConnectorPresent =
		/connectors:\s*[\s\S]*routing(?:\/[A-Za-z0-9_.-]+)?:/m.test(configText);
	const routingProcessorPresent =
		/processors:\s*[\s\S]*routing(?:\/[A-Za-z0-9_.-]+)?:/m.test(configText);
	const memoryLimiterPresent = /memory_limiter(?:\/[A-Za-z0-9_.-]+)?:/.test(configText);
	const batchPresent = /batch(?:\/[A-Za-z0-9_.-]+)?:/.test(configText);
	const redactionPresent =
		/attributes(?:\/[A-Za-z0-9_.-]+)?:|filter(?:\/[A-Za-z0-9_.-]+)?:|transform(?:\/[A-Za-z0-9_.-]+)?:/.test(
			configText,
		);
	const resourceKeys = [
		'service.name',
		'service.version',
		'deployment.environment.name',
		'parent_atlas.workspace_id',
		'parent_atlas.workspace_revision',
		'parent_atlas.lane',
		'parent_atlas.component',
		'parent_atlas.runtime',
		'parent_atlas.instance_id',
	];
	const resourceKeyCoverage = Object.fromEntries(
		resourceKeys.map((key) => [key, configText.includes(key) || hits.some((line) => line.includes(key))]),
	);
	const lanes = [
		'graphify',
		'semantic_retrieval',
		'gpu_oracle',
		'kafka_projection',
		'agent_workflow',
	];
	const laneCoverage = Object.fromEntries(
		lanes.map((lane) => [lane, configText.includes(lane) || hits.some((line) => line.includes(lane))]),
	);

	return {
		repositoryHits: hits.slice(0, 150),
		configPath: config.otelConfigPath,
		configExists,
		httpHealth,
		grpc,
		routingConnectorPresent,
		routingProcessorPresent,
		memoryLimiterPresent,
		batchPresent,
		redactionPresent,
		resourceKeyCoverage,
		laneCoverage,
	};
}

async function inspectQdrantTransports(config: Config) {
	const http = await tryEndpoints<Record<string, unknown>>(config.qdrantUrl, [
		'/readyz',
		'/healthz',
		'/collections',
	]);
	const grpc = await tcpProbe(config.qdrantGrpcHost, config.qdrantGrpcPort);
	const hits = await rg(
		config,
		'6333|6334|QDRANT_URL|QDRANT_GRPC|grpc.*qdrant|prefer_grpc|QdrantClient',
	);
	const grpcClientReferences = hits.filter((line) =>
		/grpc|6334|prefer_grpc/i.test(line),
	);
	const httpClientReferences = hits.filter((line) =>
		/6333|QDRANT_URL|http/i.test(line),
	);
	return {
		http,
		grpc,
		repositoryHits: hits.slice(0, 120),
		grpcClientReferences: grpcClientReferences.slice(0, 50),
		httpClientReferences: httpClientReferences.slice(0, 50),
	};
}


async function inspectDagLogger(config: Config) {
	const hits = await rg(
		config,
		'dag.*log|workflow.*log|orchestrat.*log|logger|debounce|throttle|checkpoint|state transition|trace\\.getTracer|startActiveSpan|addEvent|recordException',
	);
	const debounceHits = hits.filter((line) => /debounce|coalesce|throttle/i.test(line));
	const otelHits = hits.filter((line) =>
		/OpenTelemetry|trace\.getTracer|startActiveSpan|addEvent|recordException|OTEL_/i.test(line),
	);
	const dagHits = hits.filter((line) =>
		/DAG|workflow|orchestrat|checkpoint|state transition/i.test(line),
	);
	const lifecycleHits = hits.filter((line) =>
		/beforeExit|SIGINT|SIGTERM|shutdown|flush|drain|close/i.test(line),
	);
	const criticalEventHits = hits.filter((line) =>
		/error|failed|approved|rejected|complete|terminal|receipt|rollback/i.test(line),
	);

	return {
		hits: hits.slice(0, 180),
		debounceHits: debounceHits.slice(0, 80),
		otelHits: otelHits.slice(0, 80),
		dagHits: dagHits.slice(0, 80),
		lifecycleHits: lifecycleHits.slice(0, 80),
		criticalEventHits: criticalEventHits.slice(0, 80),
		config: {
			debounceMs: config.dagLogDebounceMs,
			maxPending: config.dagLogMaxPending,
		},
	};
}


async function inspectIdlePrompting(config: Config) {
	const hits = await rg(
		config,
		'idle.*prompt|self.prompt|auto.prompt|recommendation.*idle|debounce|cooldown|lastActivity|last_activity|context window|token budget|ACP|active_context',
	);
	const idleHits = hits.filter((line) => /idle|lastActivity|last_activity/i.test(line));
	const promptHits = hits.filter((line) => /self.prompt|auto.prompt|recommendation/i.test(line));
	const debounceHits = hits.filter((line) => /debounce|cooldown|throttle/i.test(line));
	const tokenHits = hits.filter((line) => /token|context window|active_context|ACP/i.test(line));
	return {
		hits: hits.slice(0, 180),
		idleHits: idleHits.slice(0, 80),
		promptHits: promptHits.slice(0, 80),
		debounceHits: debounceHits.slice(0, 80),
		tokenHits: tokenHits.slice(0, 80),
		config: {
			debounceMs: config.idlePromptDebounceMs,
			minIdleMs: config.idlePromptMinIdleMs,
			cooldownMs: config.idlePromptCooldownMs,
			contextTokenSoftLimit: config.contextTokenSoftLimit,
			contextTokenHardLimit: config.contextTokenHardLimit,
		},
	};
}

async function inspectApiCallingAwareness(config: Config) {
	const hits = await rg(
		config,
		'tool_call|function call|function_call|A2A|ACP|MCP|trpc|tRPC|Mastra|LangGraph|Deep Agents|Promise\\.all|p-limit|concurrency|semaphore|AbortSignal|timeout|retry|idempotency',
	);
	const apiHits = hits.filter((line) =>
		/tool_call|function call|function_call|MCP|A2A|ACP/i.test(line),
	);
	const parallelHits = hits.filter((line) =>
		/Promise\.all|p-limit|concurrency|semaphore|parallel/i.test(line),
	);
	const timeoutHits = hits.filter((line) =>
		/AbortSignal|timeout|retry|idempotency/i.test(line),
	);
	const trpcHits = hits.filter((line) => /trpc/i.test(line));
	const mastraHits = hits.filter((line) => /mastra/i.test(line));
	const langgraphHits = hits.filter((line) => /langgraph|deep agents/i.test(line));
	return {
		hits: hits.slice(0, 220),
		apiHits: apiHits.slice(0, 100),
		parallelHits: parallelHits.slice(0, 100),
		timeoutHits: timeoutHits.slice(0, 100),
		trpcHits: trpcHits.slice(0, 80),
		mastraHits: mastraHits.slice(0, 80),
		langgraphHits: langgraphHits.slice(0, 80),
		config: {
			maxConcurrentApiCalls: config.maxConcurrentApiCalls,
		},
	};
}

async function inspectSystemCapacity(config: Config) {
	const cpu = await run(
		process.execPath,
		[
			'-e',
			"const os=require('node:os'); console.log(JSON.stringify({logical:os.cpus().length,model:os.cpus()[0]?.model,totalMem:os.totalmem(),freeMem:os.freemem()}))",
		],
		config.appRoot,
	);
	let cpuInfo: Record<string, unknown> = {};
	try {
		cpuInfo = JSON.parse(cpu.stdout.trim() || '{}');
	} catch {
		cpuInfo = { error: cpu.stderr || 'CPU_INFO_PARSE_FAILED' };
	}

	const nodeMemory = process.memoryUsage();
	const v8 = await import('node:v8');
	const heap = v8.getHeapStatistics();

	const nvidia = await run(
		'nvidia-smi',
		[
			'--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu',
			'--format=csv,noheader,nounits',
		],
		config.appRoot,
		8_000,
	);

	const gpuHits = await rg(
		config,
		'nvidia-smi|torch\\.cuda|cuda|cuvs|cagra|gpu stress|memory\\.cuda|empty_cache|device_count',
	);
	const memoryHits = await rg(
		config,
		'process\\.memoryUsage|v8\\.getHeapStatistics|max-old-space-size|heapUsed|rss|memory leak|gc',
	);

	return {
		cpu: cpuInfo,
		nodeMemory,
		v8Heap: {
			heapSizeLimit: heap.heap_size_limit,
			totalAvailableSize: heap.total_available_size,
			usedHeapSize: heap.used_heap_size,
		},
		nvidia: {
			ok: nvidia.ok,
			stdout: nvidia.stdout.trim(),
			stderr: nvidia.stderr.trim(),
		},
		gpuHits: gpuHits.slice(0, 120),
		memoryHits: memoryHits.slice(0, 120),
		config: {
			gpuStressSeconds: config.gpuStressSeconds,
		},
	};
}

async function inspectKanbanAndMultiTurn(config: Config) {
	const hits = await rg(
		config,
		'Kanban|work_item|recommendation ledger|task board|conversation_id|thread_id|checkpoint|resume|multi.turn|session|context token|workflow state|human approval',
	);
	const kanbanHits = hits.filter((line) =>
		/Kanban|work_item|task board|recommendation ledger/i.test(line),
	);
	const multiTurnHits = hits.filter((line) =>
		/conversation_id|thread_id|checkpoint|resume|multi.turn|session|workflow state/i.test(line),
	);
	const approvalHits = hits.filter((line) => /human approval|approval|interrupt/i.test(line));
	return {
		hits: hits.slice(0, 180),
		kanbanHits: kanbanHits.slice(0, 100),
		multiTurnHits: multiTurnHits.slice(0, 100),
		approvalHits: approvalHits.slice(0, 80),
	};
}

type OkfDocumentAudit = {
	path: string;
	hasFrontmatter: boolean;
	type?: string;
	title?: string;
	status?: string;
	lifecycle?: string;
	sourceCount: number;
	hasParentAtlasExtension: boolean;
	schemaVersion?: string;
	errors: string[];
};

function parseSimpleFrontmatter(content: string): Record<string, unknown> {
	if (!content.startsWith('---')) return {};
	const end = content.indexOf('\n---', 3);
	if (end < 0) return {};
	const block = content.slice(3, end).trim();
	const result: Record<string, unknown> = {};
	let activeList: string | null = null;
	for (const rawLine of block.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		const listMatch = line.match(/^\s*-\s+(.+)$/);
		if (listMatch && activeList) {
			const list = (result[activeList] ?? []) as unknown[];
			list.push(listMatch[1]!.trim().replace(/^['"]|['"]$/g, ''));
			result[activeList] = list;
			continue;
		}
		const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
		if (!match) continue;
		const key = match[1]!;
		const raw = match[2]!.trim();
		if (!raw) {
			activeList = key;
			result[key] = [];
			continue;
		}
		activeList = null;
		result[key] = raw.replace(/^['"]|['"]$/g, '');
	}
	return result;
}

async function inspectOkf(config: Config) {
	if (!(await exists(config.okfRoot))) {
		return {
			exists: false,
			root: config.okfRoot,
			files: [] as OkfDocumentAudit[],
			validCount: 0,
			errorCount: 0,
		};
	}

	const listing = await run(
		'rg',
		['--files', config.okfRoot, '-g', '*.md'],
		config.repoRoot,
	);
	const paths = listing.ok
		? listing.stdout.split(/\r?\n/).filter(Boolean).slice(0, 1000)
		: [];
	const files: OkfDocumentAudit[] = [];

	for (const filePath of paths) {
		const content = await readFile(filePath, 'utf8');
		const metadata = parseSimpleFrontmatter(content);
		const errors: string[] = [];
		const hasFrontmatter = content.startsWith('---');
		if (!hasFrontmatter) errors.push('MISSING_FRONTMATTER');
		if (typeof metadata.type !== 'string') errors.push('MISSING_TYPE');
		if (typeof metadata.title !== 'string') errors.push('MISSING_TITLE');

		const sourceMatches = content.match(/^\s*-\s+resource:/gm) ?? [];
		const hasParentAtlasExtension =
			/extensions:\s*[\s\S]*parent_atlas:/m.test(content) ||
			/parent_atlas\./.test(content);
		const schemaVersion =
			typeof metadata.schema_version === 'string'
				? metadata.schema_version
				: typeof metadata.version === 'string'
					? metadata.version
					: undefined;

		files.push({
			path: path.relative(config.repoRoot, filePath),
			hasFrontmatter,
			type: typeof metadata.type === 'string' ? metadata.type : undefined,
			title: typeof metadata.title === 'string' ? metadata.title : undefined,
			status: typeof metadata.status === 'string' ? metadata.status : undefined,
			lifecycle:
				typeof metadata.lifecycle === 'string' ? metadata.lifecycle : undefined,
			sourceCount: sourceMatches.length,
			hasParentAtlasExtension,
			schemaVersion,
			errors,
		});
	}

	return {
		exists: true,
		root: config.okfRoot,
		files,
		validCount: files.filter((file) => file.errors.length === 0).length,
		errorCount: files.reduce((sum, file) => sum + file.errors.length, 0),
	};
}

async function inspectOpenWiki(config: Config) {
	const rootExists = await exists(config.openWikiRoot);
	const hits = await rg(
		config,
		'openwiki|OKF|docs/\\.okf|knowledge bundle|knowledge-catalog',
	);
	return {
		root: config.openWikiRoot,
		rootExists,
		hits: hits.slice(0, 100),
		generatedStagingPresent:
			await exists(path.join(config.openWikiRoot, 'generated')),
		canonicalPromotionPresent:
			await exists(path.join(config.okfRoot, 'canonical')),
	};
}

async function inspectNlpGpu(config: Config) {
	const health = await tryEndpoints<Record<string, unknown>>(config.nlpGpuUrl, [
		'/health',
		'/capabilities',
		'/v1/models',
		'/',
	]);
	const hits = await rg(
		config,
		'pytorch|torch\\.cuda|POS tag|pos_tagger|part.of.speech|spaCy|stanza|transformers|token classification',
	);
	const capabilityText = health.ok ? JSON.stringify(health.value).toLowerCase() : '';
	return {
		health,
		hits: hits.slice(0, 100),
		torchReported:
			/torch|pytorch|cuda/.test(capabilityText) ||
			hits.some((line) => /torch|pytorch|cuda/i.test(line)),
		posReported:
			/pos|part.of.speech|token.classification/.test(capabilityText) ||
			hits.some((line) => /pos.tag|part.of.speech|token classification/i.test(line)),
	};
}

function qdrantVectorContracts(info: unknown): Array<{
	name: string;
	size: number | null;
	distance: string | null;
}> {
	const root = info as {
		config?: {
			params?: {
				vectors?: unknown;
			};
		};
	};
	const vectors = root?.config?.params?.vectors;
	if (!vectors || typeof vectors !== 'object') return [];
	if ('size' in (vectors as Record<string, unknown>)) {
		const value = vectors as Record<string, unknown>;
		return [{
			name: 'default',
			size: typeof value.size === 'number' ? value.size : null,
			distance: typeof value.distance === 'string' ? value.distance : null,
		}];
	}
	return Object.entries(vectors as Record<string, unknown>).map(([name, raw]) => {
		const value = raw as Record<string, unknown>;
		return {
			name,
			size: typeof value.size === 'number' ? value.size : null,
			distance: typeof value.distance === 'string' ? value.distance : null,
		};
	});
}

function makeGate(
	id: string,
	order: number,
	area: Area,
	title: string,
	status: Status,
	proof: Proof,
	summary: string,
	evidence: unknown,
	dependencies: string[],
	definitionOfDone: string[],
	nextAction: string,
	prohibitedScope: string[],
): Gate {
	return {
		id,
		order,
		area,
		title,
		status,
		proof,
		summary,
		evidence,
		dependencies,
		definitionOfDone,
		nextAction,
		prohibitedScope,
	};
}

function taskFromGate(gate: Gate, files: string[], commands: string[]): Task {
	const dependenciesPassed = gate.dependencies.length === 0;
	const column: Task['column'] =
		gate.status === 'PASS'
			? 'DONE'
			: gate.status === 'PARTIAL'
				? 'VERIFY'
				: gate.status === 'NOT_PROVEN' && dependenciesPassed
					? 'READY'
					: gate.status === 'BLOCKED' || gate.status === 'FAIL'
						? 'BLOCKED'
						: 'READY';

	const priority: Task['priority'] =
		gate.order <= 4 ? 'P0' : gate.order <= 10 ? 'P1' : gate.order <= 15 ? 'P2' : 'P3';

	return {
		taskId: gate.id,
		priority,
		column,
		area: gate.area,
		title: gate.title,
		ownerComponent: gate.area.toLowerCase(),
		exactFiles: files,
		dependencies: gate.dependencies,
		definitionOfDone: gate.definitionOfDone,
		validationCommands: commands,
		expectedProof:
			gate.status === 'PASS' ? gate.proof : 'FIXTURE_PROVEN',
		prohibitedScope: gate.prohibitedScope,
		reason: gate.summary,
	};
}

async function main() {
	const config = loadConfig();
	const generatedAt = new Date().toISOString();

	const [
		postgres,
		graph,
		astHits,
		semanticHits,
		classificationHits,
		ontologyHits,
		qdrantWriterHits,
		hyperragHits,
		rrfHits,
		pagerankHits,
		summaryHits,
		aceHits,
		editHits,
		dagHits,
		cuvsHits,
		xgbHits,
		rerankerHits,
		okfAudit,
		openWikiAudit,
		nlpGpuAudit,
		latentHits,
		collectionHits,
		otelAudit,
		qdrantTransportAudit,
		dagLoggerAudit,
		idlePromptAudit,
		apiCallingAudit,
		systemCapacityAudit,
		kanbanMultiTurnAudit,
	] = await Promise.all([
		inspectPostgres(config),
		inspectGraph(config),
		rg(config, 'tree-sitter|ast-grep|ts-morph|web-tree-sitter|ast-treesitter'),
		rg(config, 'semantic_768|embeddinggemma|content_embedding|representation_revision'),
		rg(config, 'domain_class|domain classification|classifier|classification'),
		rg(config, 'ontology|USED_CONCEPT|concept edge|linked tuple|hyperedge'),
		rg(config, 'qdrant-sync-worker|qdrant-sync-payload|codebase_chunks_768|\\.upsert\\('),
		rg(config, 'canonical-hyperrag-adapter|search-unified|hyperrag|go-retrieval'),
		rg(config, 'rrf|reciprocal rank fusion|fuseCandidates'),
		rg(config, 'graphPageRank|pageRankScore|gds\\.pageRank|pagerank'),
		rg(config, 'summary-card-retrieval|summary_resolved|summary_layer'),
		rg(config, 'ace-materializer|canonical-packet-envelope|ACE'),
		rg(config, 'PatchTournament|prepare_patch_context|exact source|revision guard|worktree'),
		rg(config, 'validate_state_transition|analysis_run|analysis_artifact|DERIVED_FROM|SUPERSEDES'),
		rg(config, 'cuvs|brute_force.search|exact_topk|CAGRA|PyTorch topk'),
		rg(config, 'xgboost|8765|rerank_source'),
		rg(config, 'mixedbread|mxbai-rerank|bge-reranker|8099'),
		inspectOkf(config),
		inspectOpenWiki(config),
		inspectNlpGpu(config),
		rg(config, 'latent_128|latent_64|projection_dimension|source_dimension|representation_id'),
		rg(config, 'codebase_chunks_768|codebase_chunks_384|collection_name|vector_name|named vector'),
		inspectOtel(config),
		inspectQdrantTransports(config),
		inspectDagLogger(config),
		inspectIdlePrompting(config),
		inspectApiCallingAwareness(config),
		inspectSystemCapacity(config),
		inspectKanbanAndMultiTurn(config),
	]);

	const services = {
		llm: await tryEndpoints<Record<string, unknown>>(config.llmUrl, ['/v1/models']),
		embedding: await tryEndpoints<Record<string, unknown>>(config.embeddingUrl, [
			'/health',
			'/v1/models',
			'/',
		]),
		langextract: await tryEndpoints<Record<string, unknown>>(config.langExtractUrl, [
			'/health',
			'/',
		]),
		xgboost: await tryEndpoints<Record<string, unknown>>(config.xgboostUrl, [
			'/health',
			'/',
		]),
		reranker: await tryEndpoints<Record<string, unknown>>(config.rerankerUrl, [
			'/health',
			'/',
		]),
		nlpGpu: nlpGpuAudit.health,
	};

	let qdrant: Awaited<ReturnType<typeof inspectQdrant>> | null = null;
	let qdrantError: string | null = null;
	try {
		qdrant = await inspectQdrant(config);
	} catch (error) {
		qdrantError = error instanceof Error ? error.message : String(error);
	}

	const gates: Gate[] = [];
	const totalRows = postgres.coverage?.total_rows ?? 0;
	const identityComplete =
		postgres.coverage !== null &&
		postgres.coverage.packet_key_present === totalRows &&
		postgres.coverage.source_ref_present === totalRows &&
		postgres.coverage.workspace_id_present === totalRows;

	gates.push(
		makeGate(
			'PA-ID-001',
			1,
			'IDENTITY',
			'Canonical packet identity',
			identityComplete ? 'PASS' : 'FAIL',
			'PRODUCTION_DATA_PROVEN',
			identityComplete
				? 'Canonical packet/source/workspace identity is complete in live Postgres.'
				: 'Canonical identity coverage is incomplete.',
			postgres.coverage,
			[],
			[
				'packet_key coverage equals total qualified rows',
				'source_ref coverage equals total qualified rows',
				'workspace_id coverage equals total qualified rows',
			],
			'Repair or quarantine missing canonical identities before projection or edit recommendations.',
			[
				'Do not derive packet identity from qdrant_point_id',
				'Do not derive workspace_id from unrelated metadata',
			],
		),
	);

	gates.push(
		makeGate(
			'PA-SCHEMA-001',
			2,
			'SCHEMA',
			'Live Postgres and application schema alignment',
			postgres.missingRequired.length === 0 ? 'PARTIAL' : 'FAIL',
			'PRODUCTION_DATA_PROVEN',
			'Live atlas_packets fields and indexes were inspected; application-schema parity still requires repository comparison.',
			postgres,
			['PA-ID-001'],
			[
				'complete live-vs-Drizzle diff',
				'no unresolved type/nullability mismatch on active writer fields',
				'active writer fields exposed in application schema',
			],
			'Run the schema drift gates and classify each mismatch before altering tables.',
			['No ALTER TABLE during audit', 'No generic representation_id invention'],
		),
	);

	const astReady = astHits.length > 0;
	gates.push(
		makeGate(
			'PA-AST-001',
			3,
			'AST',
			'AST-aware source understanding',
			astReady ? 'PARTIAL' : 'NOT_PROVEN',
			astReady ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			astReady
				? 'AST parser and structural tooling exists; canonical symbol identity and runtime use remain to be proven.'
				: 'No AST-aware implementation was located.',
			astHits.slice(0, 50),
			['PA-ID-001', 'PA-SCHEMA-001'],
			[
				'one real parser path proven for TS/JS',
				'exact file/span output',
				'symbol occurrence mapped to canonical packet/source',
				'regex fallback clearly labeled',
			],
			'Choose the real tree-sitter path as structural authority and reconcile its outputs to packet/source identity.',
			['Do not call regex extraction tree-sitter', 'Do not use tree_node_id as stable symbol identity'],
		),
	);

	const semanticReady = semanticHits.length > 0 && services.embedding.ok;
	gates.push(
		makeGate(
			'PA-EMB-001',
			4,
			'SEMANTIC',
			'EmbeddingGemma semantic_768 contract',
			semanticReady ? 'PARTIAL' : 'FAIL',
			semanticReady ? 'RUNTIME_SMOKE_PROVEN' : 'NOT_PROVEN',
			semanticReady
				? 'Embedding service and semantic_768 code are present; exact dimension/model/revision/source-text contract still needs one proof receipt.'
				: 'Embedding runtime or semantic_768 implementation is missing.',
			{ service: services.embedding, hits: semanticHits.slice(0, 50) },
			['PA-ID-001', 'PA-AST-001'],
			[
				'output dimension exactly 768',
				'model and revision recorded',
				'normalization and pooling recorded',
				'source text/hash recorded',
				'packet_key manifest produced',
			],
			'Run one bounded embedding manifest proof before ANN or reranker promotion.',
			['Do not use latent_64 for packet ANN', 'Do not mix PageRank or SOM coordinates into semantic_768'],
		),
	);

	const classificationReady = classificationHits.length > 0;
	gates.push(
		makeGate(
			'PA-CLS-001',
			5,
			'CLASSIFICATION',
			'Domain classification lineage',
			classificationReady ? 'PARTIAL' : 'NOT_PROVEN',
			classificationReady ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			'Domain classification code/storage references exist, but producer, model revision, confidence, and active consumers require proof.',
			classificationHits.slice(0, 50),
			['PA-AST-001', 'PA-EMB-001'],
			[
				'classifier owner identified',
				'input feature contract recorded',
				'model/revision recorded',
				'confidence stored',
				'consumer purpose documented',
			],
			'Trace domain_class from producer to retrieval/reranking consumers and add lineage receipts.',
			['Do not treat domain_class as canonical identity'],
		),
	);

	const ontologyReady = ontologyHits.length > 0;
	gates.push(
		makeGate(
			'PA-ONT-001',
			6,
			'ONTOLOGY',
			'Ontology-linked tuples and concept edges',
			ontologyReady ? 'PARTIAL' : 'NOT_PROVEN',
			ontologyReady ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			'Concept/ontology/hyperedge code exists; canonical tuple identity, provenance, and retrieval use remain partially proven.',
			ontologyHits.slice(0, 50),
			['PA-AST-001', 'PA-CLS-001'],
			[
				'tuple schema defined',
				'source packet and exact span recorded',
				'concept edge provenance recorded',
				'duplicate tuple prevention defined',
			],
			'Prove one ontology tuple from AST/source evidence through storage and retrieval.',
			['Do not synthesize ontology facts without source evidence'],
		),
	);

	const qdrantRequired = [
		'packet_key',
		'source_ref',
		'workspace_id',
		'workspace_revision',
		'representation_id',
		'representation_revision',
		'schema_version',
	];
	const qdrantComplete =
		qdrant !== null &&
		qdrant.sampled > 0 &&
		qdrantRequired.every((field) => qdrant!.coverage[field] === qdrant!.sampled);

	gates.push(
		makeGate(
			'PA-PROJ-001',
			7,
			'QDRANT',
			'Canonical Qdrant payload routing',
			qdrantComplete ? 'PASS' : 'FAIL',
			qdrant ? 'PRODUCTION_DATA_PROVEN' : 'NOT_PROVEN',
			qdrantComplete
				? 'Sampled production points carry the packet-qualified canonical envelope.'
				: 'Production payload identity remains incomplete or Qdrant is unavailable.',
			qdrant ?? { error: qdrantError, writerHits: qdrantWriterHits.slice(0, 50) },
			['PA-ID-001', 'PA-EMB-001'],
			[
				'active writer uses strict builder',
				'production payload coverage is complete',
				'repeated delivery does not create duplicates',
				'packet_key join-back succeeds',
			],
			'Prove the active writer seam, then produce a read-only production reconciliation plan.',
			['No production upsert during audit', 'No migration before rollback plan'],
		),
	);

	const hyperragReady = hyperragHits.length > 0;
	const rrfReady = rrfHits.length > 0;
	gates.push(
		makeGate(
			'PA-RET-001',
			8,
			'RETRIEVAL',
			'Canonical retrieval and multi-hop route',
			hyperragReady && rrfReady ? 'PARTIAL' : 'NOT_PROVEN',
			hyperragReady ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			'HyperRAG/Go retrieval/RRF seams exist, but one canonical production route and bounded traversal receipt are not proven.',
			{
				hyperrag: hyperragHits.slice(0, 40),
				rrf: rrfHits.slice(0, 40),
			},
			['PA-PROJ-001', 'PA-ONT-001'],
			[
				'one app-facing route selected',
				'canonical Postgres hydration performed',
				'stale revisions rejected',
				'multi-hop traversal bounded',
				'lane provenance preserved',
			],
			'Select one production route and prove query → hydrate → expand → fuse → rerank → exact source.',
			['Do not keep duplicate TypeScript and Go orchestration owners'],
		),
	);

	const pagerankReady = pagerankHits.length > 0;
	gates.push(
		makeGate(
			'PA-GRAPH-001',
			9,
			'GRAPH',
			'Persisted graph authority and PageRank',
			pagerankReady ? 'PARTIAL' : 'NOT_PROVEN',
			pagerankReady ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			'PageRank/GDS code exists; canonical property, snapshot lineage, and post-hydration attachment need runtime proof.',
			pagerankHits.slice(0, 50),
			['PA-RET-001'],
			[
				'canonical PageRank property selected',
				'graph snapshot ID recorded',
				'PageRank attached after hydration',
				'missing value handled nonfatally',
			],
			'Prove persisted PageRank attachment on one canonical retrieval request.',
			['No per-request PageRank recomputation'],
		),
	);

	const xgbReady = xgbHits.length > 0 && services.xgboost.ok;
	const rerankerReady = rerankerHits.length > 0 || services.reranker.ok;
	gates.push(
		makeGate(
			'PA-RERANK-001',
			10,
			'RERANK',
			'XGBoost and neural reranker routing',
			xgbReady || rerankerReady ? 'PARTIAL' : 'NOT_PROVEN',
			xgbReady ? 'RUNTIME_SMOKE_PROVEN' : 'SOURCE_PRESENT',
			'Reranker services/code exist; canonical post-hydration routing, feature schema, ablation, and identity preservation are not fully proven.',
			{
				xgboostService: services.xgboost,
				rerankerService: services.reranker,
				xgboostHits: xgbHits.slice(0, 40),
				rerankerHits: rerankerHits.slice(0, 40),
			},
			['PA-RET-001'],
			[
				'packet-deduplicated inputs',
				'feature order/version recorded',
				'packet_key preserved',
				'latency and fallback recorded',
				'ablation beats simpler baseline',
			],
			'Run trace_score-only, XGBoost, and neural-reranker ablations on canonically hydrated candidates.',
			['Do not score raw Qdrant points as authoritative candidates'],
		),
	);

	const summaryReady = summaryHits.length > 0;
	const aceReady = aceHits.length > 0;
	gates.push(
		makeGate(
			'PA-ACE-001',
			11,
			'ACE',
			'Exact source and ACE provenance',
			summaryReady && aceReady ? 'PARTIAL' : 'NOT_PROVEN',
			aceReady ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			'Summary and ACE seams exist; exact current-source resolution and complete lane provenance remain unproven.',
			{
				summaries: summaryHits.slice(0, 40),
				ace: aceHits.slice(0, 40),
			},
			['PA-RERANK-001'],
			[
				'every evidence item resolves to exact current source',
				'stale summaries rejected',
				'contributing lanes recorded',
				'workspace/source revisions recorded where owned',
			],
			'Prove one ACE packet from a canonical retrieval request with exact current source spans.',
			['Do not allow summary-only edit recommendations'],
		),
	);

	const editReady = editHits.length > 0;
	gates.push(
		makeGate(
			'PA-EDIT-001',
			12,
			'EDIT',
			'Agentic file-edit recommendation readiness',
			editReady ? 'PARTIAL' : 'NOT_PROVEN',
			editReady ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			'Patch/error-fixing seams exist; exact target resolution, stale guards, and validation-plan completeness remain partial.',
			editHits.slice(0, 60),
			['PA-ACE-001', 'PA-AST-001'],
			[
				'file path and exact span resolved',
				'source hash/revision recorded',
				'symbol reconciled when available',
				'retrieval/graph evidence recorded',
				'validation commands identified',
				'ambiguous targets rejected',
			],
			'Build a read-only recommendation skill that outputs exact targets, evidence, confidence, and validation plan without editing.',
			['No file mutation', 'No summary-only target selection'],
		),
	);

	const dagReady = dagHits.length > 0;
	gates.push(
		makeGate(
			'PA-DAG-001',
			13,
			'DAG',
			'Guarded mutation DAG',
			dagReady ? 'PARTIAL' : 'NOT_PROVEN',
			dagReady ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			'State-transition and artifact-lineage concepts exist; the complete validated mutation DAG is not proven.',
			dagHits.slice(0, 60),
			['PA-EDIT-001'],
			[
				'read-only diagnosis state',
				'validated plan state',
				'dry-run state',
				'stale revision gate',
				'explicit approval boundary',
				'post-mutation receipt',
			],
			'Define and test state transitions before allowing any agentic write.',
			['No autonomous production mutation'],
		),
	);

	const exactOracleReady = cuvsHits.some((line) =>
		/brute_force|exact_topk|pytorch/i.test(line),
	);
	gates.push(
		makeGate(
			'PA-GPU-001',
			14,
			'GPU',
			'cuVS exact oracle and CAGRA eligibility',
			exactOracleReady ? 'PARTIAL' : 'NOT_PROVEN',
			exactOracleReady ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			'GPU exact-search and CAGRA references were found; same-matrix parity and CAGRA eligibility remain gated.',
			cuvsHits.slice(0, 60),
			['PA-EMB-001', 'PA-PROJ-001'],
			[
				'row-index manifest maps to packet_key',
				'cuVS brute force matches PyTorch top-k',
				'Qdrant HNSW recall measured on same matrix',
				'VRAM fit documented',
			],
			'Run exact semantic_768 parity before any CAGRA build.',
			['Do not run CAGRA before exact oracle parity'],
		),
	);


	const okfReady =
		okfAudit.exists &&
		okfAudit.files.length > 0 &&
		okfAudit.errorCount === 0;
	gates.push(
		makeGate(
			'PA-OKF-001',
			15,
			'KNOWLEDGE',
			'OKF knowledge bundle schema alignment',
			okfReady ? 'PASS' : okfAudit.exists ? 'PARTIAL' : 'NOT_PROVEN',
			okfReady ? 'PRODUCTION_DATA_PROVEN' : okfAudit.exists ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			okfReady
				? 'docs/.okf contains schema-valid knowledge documents.'
				: 'OKF staging is absent or contains frontmatter/schema gaps.',
			okfAudit,
			['PA-SCHEMA-001', 'PA-ONT-001'],
			[
				'docs/.okf generated and canonical zones exist',
				'every concept has type and title',
				'Parent Atlas extension records gate/proof/workspace lineage',
				'sources link to deterministic reports or canonical resources',
				'generated documents are not treated as canonical facts',
			],
			'Create a versioned Parent Atlas OKF profile and validate generated staging before promotion.',
			[
				'Do not let OKF write directly to Postgres or Qdrant',
				'Do not promote source-less generated claims',
			],
		),
	);

	const openWikiReady =
		openWikiAudit.rootExists &&
		openWikiAudit.generatedStagingPresent &&
		okfAudit.exists;
	gates.push(
		makeGate(
			'PA-OPENWIKI-001',
			16,
			'KNOWLEDGE',
			'OpenWiki generated documentation integration',
			openWikiReady ? 'PARTIAL' : 'NOT_PROVEN',
			openWikiReady ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			'OpenWiki must consume promoted or validated OKF and write only to generated documentation staging.',
			openWikiAudit,
			['PA-OKF-001'],
			[
				'OpenWiki input path is explicit',
				'generated output path is isolated',
				'OKF version/profile validation runs after generation',
				'canonical promotion requires review',
			],
			'Wire OpenWiki as a documentation consumer of validated OKF, not a canonical evidence writer.',
			[
				'No direct writes to atlas_packets, graph tables, Qdrant, or Neo4j',
				'No automatic canonical promotion',
			],
		),
	);

	const nlpGpuReady =
		nlpGpuAudit.health.ok &&
		nlpGpuAudit.torchReported &&
		nlpGpuAudit.posReported;
	gates.push(
		makeGate(
			'PA-NLP-001',
			17,
			'NLP',
			'PyTorch GPU POS and token-classification sidecar',
			nlpGpuReady ? 'PASS' : nlpGpuAudit.health.ok ? 'PARTIAL' : 'FAIL',
			nlpGpuAudit.health.ok ? 'RUNTIME_SMOKE_PROVEN' : 'NOT_PROVEN',
			'The NLP sidecar is checked for PyTorch/CUDA and POS or token-classification capabilities.',
			nlpGpuAudit,
			['PA-AST-001', 'PA-EMB-001'],
			[
				'health reports model ID and revision',
				'CUDA/device status reported',
				'POS/token classification response schema versioned',
				'output offsets map to exact source text',
				'fallback lane clearly labeled',
			],
			'Expose a typed capabilities endpoint and prove one GPU POS/tagging fixture with exact offsets.',
			[
				'Do not replace tree-sitter structure with POS tags',
				'Do not use NLP labels as canonical identity',
			],
		),
	);

	const qdrantSemantic768 =
		qdrant !== null &&
		qdrant.vectorContracts.some((contract) => contract.size === 768);
	const latent64Stored =
		(postgres.coverage?.latent_64_present ?? 0) > 0;
	const latent64Clean =
		(postgres.coverage?.latent_64_wrong_size ?? 0) === 0;
	const latent128Present = latentHits.some((line) => /latent_128/i.test(line));
	gates.push(
		makeGate(
			'PA-REP-001',
			18,
			'SEMANTIC',
			'Representation and collection alignment',
			qdrantSemantic768 && latent64Clean ? 'PARTIAL' : 'FAIL',
			qdrant ? 'PRODUCTION_DATA_PROVEN' : 'NOT_PROVEN',
			'Semantic collection dimensions and latent storage lanes are checked independently.',
			{
				qdrantVectorContracts: qdrant?.vectorContracts ?? [],
				latent64Stored,
				latent64Clean,
				latent128SourcePresent: latent128Present,
				latentHits: latentHits.slice(0, 80),
				collectionHits: collectionHits.slice(0, 80),
			},
			['PA-EMB-001', 'PA-PROJ-001'],
			[
				'semantic_768 collection has a 768-dimensional vector contract',
				'latent_64 rows are exactly 256 bytes when float32',
				'latent_128 has an explicit schema before use',
				'every representation has ID, dimension, and revision',
				'readers consume only the intended representation lane',
			],
			'Generate a representation registry and collection compatibility matrix before promoting latent or GPU lanes.',
			[
				'Do not use latent_64 for packet ANN',
				'Do not infer latent_128 storage from file names',
				'Do not mix legacy 384 and canonical 768 collections',
			],
		),
	);


	const otelResourceKeysComplete = Object.values(
		otelAudit.resourceKeyCoverage,
	).every(Boolean);
	const otelRoutesPresent =
		otelAudit.routingConnectorPresent &&
		Object.values(otelAudit.laneCoverage).filter(Boolean).length >= 3;
	gates.push(
		makeGate(
			'PA-OTEL-001',
			19,
			'OBSERVABILITY',
			'OpenTelemetry SDK and Collector wiring',
			otelAudit.grpc.ok && otelAudit.repositoryHits.length > 0
				? 'PARTIAL'
				: otelAudit.repositoryHits.length > 0
					? 'PARTIAL'
					: 'NOT_PROVEN',
			otelAudit.grpc.ok ? 'RUNTIME_SMOKE_PROVEN' : 'SOURCE_PRESENT',
			'Existing OTel SDK, OTLP endpoints, Collector configuration, and resource attributes were inventoried.',
			otelAudit,
			[],
			[
				'OTLP gRPC ingress on 4317 reachable',
				'OTLP HTTP ingress on 4318 configured or explicitly disabled',
				'service.name and Parent Atlas resource schema emitted',
				'memory limiter and batch processors configured',
				'sensitive attributes redacted before export',
			],
			'Normalize Parent Atlas resource attributes and prove one trace from each active runtime.',
			[
				'Do not put packet_key, query text, or source content in stable resource attributes',
				'Do not treat OTel as canonical business-event storage',
			],
		),
	);

	gates.push(
		makeGate(
			'PA-OTEL-002',
			20,
			'OBSERVABILITY',
			'Routing connector and lane isolation',
			otelRoutesPresent && otelAudit.memoryLimiterPresent
				? 'PARTIAL'
				: 'NOT_PROVEN',
			otelRoutesPresent ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			'Routing-connector availability, default routing, Parent Atlas lanes, batching, redaction, and memory controls were checked.',
			{
				routingConnectorPresent: otelAudit.routingConnectorPresent,
				deprecatedRoutingProcessorPresent: otelAudit.routingProcessorPresent,
				resourceKeyCoverage: otelAudit.resourceKeyCoverage,
				laneCoverage: otelAudit.laneCoverage,
				memoryLimiterPresent: otelAudit.memoryLimiterPresent,
				batchPresent: otelAudit.batchPresent,
				redactionPresent: otelAudit.redactionPresent,
				resourceSchemaComplete: otelResourceKeysComplete,
			},
			['PA-OTEL-001'],
			[
				'routing connector used instead of routing processor',
				'default route proven',
				'graphify route proven',
				'retrieval route proven',
				'GPU route proven',
				'agent route proven',
				'projection route proven',
				'no sensitive high-cardinality resource routing keys',
			],
			'Add a Collector routing connector with graphify, retrieval, GPU, projection, agent, and default pipelines; then run a blackholed-exporter containment test.',
			[
				'Do not claim complete fault isolation inside one Collector process',
				'Do not route by packet_key, trace ID, span name, or query text',
			],
		),
	);

	const qdrantDualTransport =
		qdrantTransportAudit.http.ok && qdrantTransportAudit.grpc.ok;
	gates.push(
		makeGate(
			'PA-QDRANT-TRANSPORT-001',
			21,
			'QDRANT',
			'Qdrant HTTP and gRPC transport health',
			qdrantDualTransport
				? 'PASS'
				: qdrantTransportAudit.http.ok || qdrantTransportAudit.grpc.ok
					? 'PARTIAL'
					: 'FAIL',
			qdrantDualTransport ? 'RUNTIME_SMOKE_PROVEN' : 'PARTIAL_PROVEN',
			'Qdrant REST health and gRPC TCP reachability were checked separately.',
			qdrantTransportAudit,
			['PA-PROJ-001'],
			[
				'HTTP collections/health endpoint succeeds',
				'gRPC port 6334 accepts connections',
				'active client transport is documented',
				'HTTP and gRPC target the same Qdrant instance',
				'one bounded gRPC collection/read request is proven',
			],
			'Add a real Qdrant gRPC health/list-collections smoke using the installed client, while retaining HTTP for inspection and administrative validation.',
			[
				'Do not infer gRPC API correctness from TCP connectivity alone',
				'Do not send production upserts during a transport smoke',
			],
		),
	);


	const dagLoggerSourcePresent = dagLoggerAudit.dagHits.length > 0;
	const dagLoggerDebouncePresent = dagLoggerAudit.debounceHits.length > 0;
	const dagLoggerFlushPresent = dagLoggerAudit.lifecycleHits.length > 0;
	const dagLoggerOtelPresent = dagLoggerAudit.otelHits.length > 0;

	gates.push(
		makeGate(
			'PA-DAG-LOG-001',
			22,
			'OBSERVABILITY',
			'Debounced DAG orchestration logger',
			dagLoggerDebouncePresent &&
			dagLoggerFlushPresent &&
			dagLoggerOtelPresent
				? 'PARTIAL'
				: dagLoggerSourcePresent
					? 'NOT_PROVEN'
					: 'FAIL',
			dagLoggerDebouncePresent
				? 'STATIC_WIRING_PROVEN'
				: dagLoggerSourcePresent
					? 'SOURCE_PRESENT'
					: 'NOT_PROVEN',
			'The orchestration logger is checked for keyed debounce, immediate critical-event delivery, bounded pending state, shutdown flush, and OpenTelemetry integration.',
			dagLoggerAudit,
			['PA-DAG-001', 'PA-OTEL-001'],
			[
				'progress and heartbeat events coalesce by workflow/run/node/event key',
				'errors, approvals, rejections, terminal transitions, rollback events, and receipts bypass debounce',
				'canonical DAG state mutations are never debounced',
				'pending keys are bounded and overflow is observable',
				'flushAll runs on transition barriers and shutdown',
				'OTel span start/end boundaries are not suppressed',
				'debounced count and original time range are preserved',
				'unit tests use fake timers and deterministic clocks',
			],
			'Wire one reusable DebouncedDagLogger around noncanonical orchestration telemetry, then prove coalescing, critical bypass, bounded overflow, transition flush, and shutdown flush.',
			[
				'Do not debounce Postgres state writes or mutation receipts',
				'Do not debounce error/terminal/approval events',
				'Do not use debounce as event deduplication or idempotency',
				'Do not retain source content, prompts, packet_key, or symbol IDs as OTel resource attributes',
			],
		),
	);


	const idlePromptReady =
		idlePromptAudit.idleHits.length > 0 &&
		idlePromptAudit.debounceHits.length > 0 &&
		idlePromptAudit.tokenHits.length > 0;
	gates.push(
		makeGate(
			'PA-IDLE-001',
			23,
			'DAG',
			'Idle self-prompt debounce and recommendation gating',
			idlePromptReady ? 'PARTIAL' : 'NOT_PROVEN',
			idlePromptReady ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			'Idle recommendation prompting is checked for user-activity awareness, debounce, cooldown, token-budget gates, and duplicate suppression.',
			idlePromptAudit,
			['PA-DAG-LOG-001', 'PA-EDIT-001'],
			[
				'no self-prompt while user/tool/API activity is in flight',
				'minimum idle interval enforced',
				'trigger signals are debounced',
				'cooldown prevents repeated recommendations',
				'one recommendation key emitted per unresolved dependency',
				'soft token limit produces compact recommendation only',
				'hard token limit blocks new exploration and emits handoff state',
				'critical failures bypass idle debounce',
			],
			'Add an IdleRecommendationCoordinator keyed by workspace, conversation, workflow, and unresolved dependency; integrate it with ACP token telemetry and Kanban deduplication.',
			[
				'Do not self-prompt continuously',
				'Do not treat elapsed time alone as permission to act',
				'Do not create duplicate Kanban cards',
				'Do not mutate files from an idle recommendation',
			],
		),
	);

	const apiAwarenessReady =
		apiCallingAudit.apiHits.length > 0 &&
		apiCallingAudit.parallelHits.length > 0 &&
		apiCallingAudit.timeoutHits.length > 0;
	gates.push(
		makeGate(
			'PA-API-001',
			24,
			'DAG',
			'API/function/tool-call awareness and bounded concurrency',
			apiAwarenessReady ? 'PARTIAL' : 'NOT_PROVEN',
			apiAwarenessReady ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			'ACP, A2A, MCP/function calls, retries, timeouts, idempotency, and parallel execution controls were inventoried.',
			apiCallingAudit,
			['PA-DAG-001', 'PA-OTEL-001'],
			[
				'every call has call_id, parent_run_id, tool/function name, attempt, timeout, and idempotency key',
				'read-only independent calls may execute concurrently',
				'dependent or mutating calls remain ordered',
				'maximum concurrency is explicit',
				'AbortSignal cancellation propagates',
				'retry policy is classified by operation safety',
				'results are joined deterministically',
				'partial failure is represented in DAG state',
			],
			'Create one ApiCallCoordinator with semaphore, timeout, retry classification, idempotency receipts, and OTel spans for ACP/A2A/MCP calls.',
			[
				'Do not use Promise.all for dependent writes',
				'Do not retry non-idempotent mutations without a receipt',
				'Do not hide partial failures',
			],
		),
	);

	const orchestrationOwnerKnown =
		apiCallingAudit.trpcHits.length > 0 ||
		apiCallingAudit.mastraHits.length > 0 ||
		apiCallingAudit.langgraphHits.length > 0;
	gates.push(
		makeGate(
			'PA-ORCH-001',
			25,
			'DAG',
			'tRPC, Mastra, LangGraph, and A2A ownership boundaries',
			orchestrationOwnerKnown ? 'PARTIAL' : 'NOT_PROVEN',
			orchestrationOwnerKnown ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			'Potential orchestration frameworks were located; one owner must govern each workflow while adapters remain thin.',
			{
				trpc: apiCallingAudit.trpcHits,
				mastra: apiCallingAudit.mastraHits,
				langgraph: apiCallingAudit.langgraphHits,
			},
			['PA-API-001'],
			[
				'tRPC owns typed app/API transport only',
				'one workflow engine owns durable orchestration',
				'Mastra/LangGraph duplication is removed or explicitly partitioned',
				'A2A carries delegated task envelopes',
				'ACP carries active-context and approval state',
				'all adapters preserve workflow/run/call identity',
			],
			'Publish an orchestration owner matrix and choose one durable workflow owner per workflow family.',
			[
				'Do not let tRPC become a workflow engine',
				'Do not execute the same workflow in Mastra and LangGraph',
			],
		),
	);

	const logicalThreads = Number(systemCapacityAudit.cpu.logical ?? 0);
	const cpuReady = logicalThreads > 0;
	const gpuReady = systemCapacityAudit.nvidia.ok;
	const heapLimit = Number(systemCapacityAudit.v8Heap.heapSizeLimit ?? 0);
	const heapReady = heapLimit > 0;
	gates.push(
		makeGate(
			'PA-CAPACITY-001',
			26,
			'OPERATIONS',
			'CPU, TypeScript heap, and GPU capacity awareness',
			cpuReady && heapReady && gpuReady ? 'PASS' : cpuReady && heapReady ? 'PARTIAL' : 'FAIL',
			cpuReady ? 'RUNTIME_SMOKE_PROVEN' : 'NOT_PROVEN',
			'Logical CPU threads, Node/V8 heap, process memory, NVIDIA GPU memory/utilization, and repository capacity checks were collected.',
			systemCapacityAudit,
			[],
			[
				'logical CPU thread count recorded',
				'worker concurrency capped below resource saturation',
				'Node heap limit and process RSS recorded',
				'GPU memory total/free recorded',
				'capacity metrics emitted to OTel',
				'stress checks are opt-in and bounded',
			],
			'Use measured CPU/GPU/heap capacity to derive separate concurrency limits for parsing, API calls, embeddings, reranking, and GPU proofs.',
			[
				'Do not auto-run destructive or prolonged stress tests',
				'Do not assume logical threads equal safe worker count',
				'Do not run CAGRA stress before exact-oracle readiness',
			],
		),
	);

	const kanbanReady = kanbanMultiTurnAudit.kanbanHits.length > 0;
	const multiTurnReady = kanbanMultiTurnAudit.multiTurnHits.length > 0;
	gates.push(
		makeGate(
			'PA-KANBAN-001',
			27,
			'DAG',
			'Kanban recommendation deduplication and lifecycle',
			kanbanReady ? 'PARTIAL' : 'NOT_PROVEN',
			kanbanReady ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			'Kanban/work-item and recommendation-ledger code was checked for deterministic deduplication and evidence-backed lifecycle.',
			kanbanMultiTurnAudit,
			['PA-IDLE-001', 'PA-EDIT-001'],
			[
				'dedup key includes gate, owner, workspace revision, and normalized scope',
				'one unresolved dependency maps to one active card',
				'evidence IDs and validation commands are attached',
				'status transitions are validated',
				'resolved cards suppress new idle prompts',
			],
			'Connect idle recommendations to a deterministic AtlasWorkItem upsert rather than free-form card creation.',
			[
				'Do not let the LLM invent work-item identity',
				'Do not create a card without evidence',
			],
		),
	);

	gates.push(
		makeGate(
			'PA-MULTITURN-001',
			28,
			'DAG',
			'Multi-turn agentic workflow continuity',
			multiTurnReady ? 'PARTIAL' : 'NOT_PROVEN',
			multiTurnReady ? 'SOURCE_PRESENT' : 'NOT_PROVEN',
			'Conversation/thread identity, checkpoints, resumability, approvals, and context-token continuity were inventoried.',
			kanbanMultiTurnAudit,
			['PA-DAG-001', 'PA-API-001'],
			[
				'conversation_id, thread_id, workflow_id, and run_id remain distinct',
				'checkpoint resumes without replaying completed mutations',
				'tool receipts survive context compaction',
				'active_context is rebuilt from canonical receipts',
				'approval interrupts resume deterministically',
				'soft/hard token limits produce summary and handoff artifacts',
			],
			'Add a versioned MultiTurnWorkflowContext envelope and prove resume after context compaction with no duplicate tool calls.',
			[
				'Do not use raw conversation history as canonical workflow state',
				'Do not replay successful mutations on resume',
			],
		),
	);

	const graphFresh =
		graph.exists &&
		typeof graph.ageMinutes === 'number' &&
		graph.ageMinutes <= 180;
	gates.push(
		makeGate(
			'PA-OPS-001',
			29,
			'OPERATIONS',
			'Graphify freshness and stage isolation',
			graphFresh ? 'PASS' : 'FAIL',
			'PRODUCTION_DATA_PROVEN',
			graphFresh
				? 'Graph artifact is fresh.'
				: 'Graph artifact is stale or missing.',
			graph,
			[],
			[
				'graph artifact below freshness threshold',
				'code graph can refresh without optional SOM/topology stages',
				'stage receipts emitted',
			],
			'Repair graph-only stage isolation; keep this separate from Qdrant writer work.',
			['No broad SOM retraining during graph-only repair'],
		),
	);

	const filesByGate: Record<string, string[]> = {
		'PA-ID-001': ['src/lib/server/db/schema/atlas-packets.ts'],
		'PA-SCHEMA-001': [
			'src/lib/server/db/schema/atlas-packets.ts',
			'../scripts/atlas/schema/compare-schema-snapshots.mjs',
		],
		'PA-AST-001': ['scripts/atlas/ast-treesitter-facts.mjs'],
		'PA-EMB-001': [
			'scripts/smoke/embeddinggemma-smoke.mjs',
			'src/lib/server/ai/embedding*',
		],
		'PA-CLS-001': ['scripts/atlas/*classification*', 'src/lib/server/**/*classifier*'],
		'PA-ONT-001': ['scripts/atlas/*concept*', 'scripts/atlas/*ontology*'],
		'PA-PROJ-001': [
			'src/lib/server/retrieval/qdrant-sync-payload.ts',
			'src/lib/server/workers/qdrant-sync-worker.ts',
			'scripts/atlas/prove-qdrant-packet-joinback.mts',
		],
		'PA-RET-001': [
			'src/lib/server/retrieval/canonical-hyperrag-adapter.ts',
			'src/lib/server/retrieval/*orchestrator*',
		],
		'PA-GRAPH-001': ['src/lib/server/**/*pagerank*', 'src/lib/server/**/*neo4j-gds*'],
		'PA-RERANK-001': [
			'scripts/atlas/serve-xgboost-reranker.py',
			'src/lib/server/retrieval/**/*rerank*',
		],
		'PA-ACE-001': [
			'src/lib/server/ace/ace-materializer.ts',
			'src/lib/server/**/*summary*',
		],
		'PA-EDIT-001': [
			'src/lib/server/agent/**/*patch*',
			'src/lib/server/mcp/**/*prepare*patch*',
		],
		'PA-DAG-001': ['src/lib/server/**/*state-transition*', 'src/lib/server/**/*analysis*'],
		'PA-GPU-001': ['../scripts/atlas/gpu-knn-search.py', '../scripts/atlas/**/*cuvs*'],
		'PA-OKF-001': ['../docs/.okf/**/*', '../scripts/atlas/**/*okf*'],
		'PA-OPENWIKI-001': ['../docs/openwiki/**/*', '../scripts/**/*openwiki*'],
		'PA-NLP-001': ['../scripts/launch-miniforge-nlp-sidecar.ps1', '../scripts/**/*nlp*', '../scripts/**/*pos*'],
		'PA-REP-001': ['src/lib/server/db/schema/atlas-packets.ts', 'src/lib/server/retrieval/**/*qdrant*', '../scripts/atlas/**/*latent*'],
		'PA-OTEL-001': ['../config/**/*otel*', 'src/**/*telemetry*', '../scripts/**/*otel*'],
		'PA-OTEL-002': ['../config/otel-collector.yaml', '../scripts/atlas/**/*otel*'],
		'PA-QDRANT-TRANSPORT-001': ['src/lib/server/vector/**/*qdrant*', '../scripts/atlas/**/*qdrant*'],
		'PA-DAG-LOG-001': ['src/lib/server/observability/dag-debounced-logger.ts', 'src/lib/server/**/*orchestrat*', 'src/lib/server/**/*workflow*'],
		'PA-IDLE-001': ['src/lib/server/agent/idle-recommendation-coordinator.ts', 'src/lib/server/**/*active-context*', 'src/lib/server/**/*recommendation*'],
		'PA-API-001': ['src/lib/server/orchestration/api-call-coordinator.ts', 'src/mcp/**/*', 'src/lib/server/**/*a2a*', 'src/lib/server/**/*acp*'],
		'PA-ORCH-001': ['src/lib/server/**/*mastra*', 'src/lib/server/**/*langgraph*', 'src/lib/trpc/**/*'],
		'PA-CAPACITY-001': ['scripts/atlas/smoke-workstation-capacity.mts', 'src/lib/server/observability/**/*capacity*'],
		'PA-KANBAN-001': ['src/lib/server/**/*work-item*', 'src/lib/server/**/*kanban*', 'src/lib/server/**/*recommendation*'],
		'PA-MULTITURN-001': ['src/lib/server/orchestration/multi-turn-workflow-context.ts', 'src/lib/server/**/*checkpoint*'],
		'PA-OPS-001': ['scripts/graphify-daily.mjs', 'docs/graph/codebase-graph.json'],
	};

	const commandsByGate: Record<string, string[]> = {
		'PA-ID-001': ['npm run schema:inspect', 'npm run schema:drift:check'],
		'PA-SCHEMA-001': ['npm run schema:ci:full'],
		'PA-AST-001': ['npm run batch:a:validate'],
		'PA-EMB-001': ['npm run smoke:embeddinggemma'],
		'PA-CLS-001': ['npm run batch:f:validate'],
		'PA-ONT-001': ['npm run batch:c:validate'],
		'PA-PROJ-001': [
			'npx tsx scripts/atlas/prove-qdrant-packet-joinback.mts',
			'npx tsx scripts/atlas/validate-parent-atlas-canonical-routing.mts',
		],
		'PA-RET-001': ['npm run smoke:retrieval:canonical-rerank'],
		'PA-GRAPH-001': ['npm run atlas:som:audit'],
		'PA-RERANK-001': ['npm run reranker:health', 'npm run batch:g:validate'],
		'PA-ACE-001': ['npm run test -- src/lib/server/ace/ace-materializer.spec.ts'],
		'PA-EDIT-001': ['npm run test -- --run patch-tournament'],
		'PA-DAG-001': ['npm run test -- --run state-transition'],
		'PA-GPU-001': ['npm run atlas:gpu:knn:health', 'npm run atlas:phase3:smoke'],
		'PA-OKF-001': ['npx tsx scripts/atlas/validate-okf-parent-atlas.mts'],
		'PA-OPENWIKI-001': ['npx tsx scripts/atlas/validate-openwiki-okf.mts'],
		'PA-NLP-001': ['npm run nlp:sidecar:health', 'npx tsx scripts/atlas/prove-nlp-pos-sidecar.mts'],
		'PA-REP-001': ['npm run atlas:audit:embeddings -- --verbose', 'npm run atlas:som:audit'],
		'PA-OTEL-001': ['npx tsx scripts/atlas/smoke-otel-parent-atlas.mts'],
		'PA-OTEL-002': ['npx tsx scripts/atlas/prove-otel-routing-isolation.mts'],
		'PA-QDRANT-TRANSPORT-001': ['npx tsx scripts/atlas/smoke-qdrant-transports.mts'],
		'PA-DAG-LOG-001': ['npm run test -- --run src/lib/server/observability/dag-debounced-logger.spec.ts', 'npx tsx scripts/atlas/smoke-dag-logger-otel.mts'],
		'PA-IDLE-001': ['npm run test -- --run idle-recommendation-coordinator', 'npx tsx scripts/atlas/smoke-idle-recommendations.mts'],
		'PA-API-001': ['npm run test -- --run api-call-coordinator', 'npx tsx scripts/atlas/smoke-api-call-awareness.mts'],
		'PA-ORCH-001': ['npx tsx scripts/atlas/audit-orchestration-owners.mts'],
		'PA-CAPACITY-001': ['npx tsx scripts/atlas/smoke-workstation-capacity.mts'],
		'PA-KANBAN-001': ['npm run test -- --run atlas-work-item', 'npx tsx scripts/atlas/prove-kanban-dedup.mts'],
		'PA-MULTITURN-001': ['npm run test -- --run multi-turn-workflow-context', 'npx tsx scripts/atlas/prove-multiturn-resume.mts'],
		'PA-OPS-001': ['npm run graphify:daily'],
	};

	const tasks = gates.map((gate) =>
		taskFromGate(
			gate,
			filesByGate[gate.id] ?? [],
			commandsByGate[gate.id] ?? [],
		),
	);

	// Recalculate task columns using actual dependency statuses.
	const gateById = new Map(gates.map((gate) => [gate.id, gate]));
	for (const task of tasks) {
		const gateValue = gateById.get(task.taskId)!;
		const dependenciesPassed = gateValue.dependencies.every(
			(id) => gateById.get(id)?.status === 'PASS',
		);
		if (gateValue.status === 'PASS') task.column = 'DONE';
		else if (gateValue.status === 'PARTIAL') task.column = 'VERIFY';
		else if (gateValue.status === 'NOT_PROVEN' && dependenciesPassed) task.column = 'READY';
		else if (!dependenciesPassed || gateValue.status === 'FAIL' || gateValue.status === 'BLOCKED') {
			task.column = 'BLOCKED';
		}
	}

	// Derived graph expansion is intentionally deferred until canonical foundations pass.
	tasks.push({
		taskId: 'PA-GRAPH-099',
		priority: 'P3',
		column: 'DEFERRED',
		area: 'GRAPH',
		title: 'Derived graph enhancements',
		ownerComponent: 'graph',
		exactFiles: [],
		dependencies: ['PA-ID-001', 'PA-PROJ-001', 'PA-RET-001', 'PA-GRAPH-001'],
		definitionOfDone: [
			'canonical graph snapshot proven',
			'PageRank lineage proven',
			'derived edge usefulness measured',
		],
		validationCommands: [],
		expectedProof: 'FIXTURE_PROVEN',
		prohibitedScope: ['No SHARES_CLUSTER or HIGH_AUTHORITY edges before prerequisites'],
		reason: 'Derived graph enhancements are premature while canonical identity and retrieval remain incomplete.',
	});

	const firstNext =
		tasks
			.filter((task) => task.column === 'READY')
			.sort((a, b) => a.priority.localeCompare(b.priority))[0] ??
		tasks
			.filter((task) => task.column === 'VERIFY')
			.sort((a, b) => a.priority.localeCompare(b.priority))[0] ??
		tasks
			.filter((task) => task.column === 'BLOCKED')
			.sort((a, b) => a.priority.localeCompare(b.priority))[0] ??
		null;

	const overall: Status = gates.some((gate) => gate.status === 'FAIL')
		? 'BLOCKED'
		: gates.some((gate) => ['PARTIAL', 'NOT_PROVEN', 'BLOCKED'].includes(gate.status))
			? 'PARTIAL'
			: 'PASS';

	const board = {
		BLOCKED: tasks.filter((task) => task.column === 'BLOCKED'),
		READY: tasks.filter((task) => task.column === 'READY'),
		IN_PROGRESS: tasks.filter((task) => task.column === 'IN_PROGRESS'),
		VERIFY: tasks.filter((task) => task.column === 'VERIFY'),
		DONE: tasks.filter((task) => task.column === 'DONE'),
		DEFERRED: tasks.filter((task) => task.column === 'DEFERRED'),
	};

	const recommendations = {
		today: firstNext
			? {
					taskId: firstNext.taskId,
					title: firstNext.title,
					action: firstNext.reason,
					definitionOfDone: firstNext.definitionOfDone,
					validationCommands: firstNext.validationCommands,
				}
			: null,
		dailyReadOnly: [
			'Postgres identity coverage',
			'Qdrant canonical payload sample',
			'graph artifact freshness',
			'model/sidecar health',
			'git/workspace revision drift',
			'OKF schema/profile validation',
			'NLP GPU capability/model revision',
			'OTLP gRPC/HTTP collector reachability',
			'Qdrant HTTP/gRPC transport health',
			'Collector dropped/refused/export-failure metrics',
			'DAG logger pending-key count and coalesced-event count',
			'idle self-prompt suppression/cooldown counters',
			'API-call concurrency, timeout, retry, and partial-failure counters',
			'Node RSS/heap, CPU load, and GPU memory/utilization',
		],
		nightlyBounded: [
			'isolated Qdrant worker fixture',
			'EmbeddingGemma manifest proof',
			'bounded canonical retrieval receipt',
			'exact-source ACE sample',
			'OKF generated-staging validation',
			'POS/token-classification exact-offset fixture',
			'OTel per-lane trace routing smoke',
			'Qdrant gRPC list/read smoke',
			'DAG logger coalescing and transition-barrier flush smoke',
			'idle recommendation dedup and token-limit smoke',
			'parallel read-only API-call cancellation smoke',
			'multi-turn checkpoint/resume replay smoke',
		],
		weeklyManual: [
			'cuVS exact vs Qdrant HNSW parity',
			'XGBoost and neural reranker ablation',
			'cuGraph/NetworkX parity',
			'production projection reconciliation',
			'agentic mutation DAG replay',
			'OpenWiki generated-output review and OKF normalization',
			'representation/collection compatibility audit',
			'OTel exporter blackhole/backpressure containment experiment',
			'Collector process split assessment for noisy lanes',
			'DAG logger debounce tuning from measured event rates',
			'bounded CUDA/CPU/Node-memory stress characterization',
			'orchestration owner review across tRPC, Mastra, LangGraph, ACP, and A2A',
		],
	};

	const report = {
		generatedAt,
		overall,
		config: { ...config, databaseUrl: '[redacted]' },
		parametersResolved: {
			postgres: postgres.connection,
			qdrantCollection: config.qdrantCollection,
			llmEndpoint: services.llm,
			embeddingEndpoint: services.embedding,
			langExtractEndpoint: services.langextract,
			xgboostEndpoint: services.xgboost,
			rerankerEndpoint: services.reranker,
			nlpGpuEndpoint: services.nlpGpu,
			otelCollectorHttpUrl: config.otelCollectorHttpUrl,
			otelCollectorGrpc: `${config.otelCollectorGrpcHost}:${config.otelCollectorGrpcPort}`,
			qdrantGrpc: `${config.qdrantGrpcHost}:${config.qdrantGrpcPort}`,
			otelConfigPath: config.otelConfigPath,
			dagLogDebounceMs: config.dagLogDebounceMs,
			dagLogMaxPending: config.dagLogMaxPending,
			idlePromptDebounceMs: config.idlePromptDebounceMs,
			idlePromptMinIdleMs: config.idlePromptMinIdleMs,
			idlePromptCooldownMs: config.idlePromptCooldownMs,
			maxConcurrentApiCalls: config.maxConcurrentApiCalls,
			contextTokenSoftLimit: config.contextTokenSoftLimit,
			contextTokenHardLimit: config.contextTokenHardLimit,
			gpuStressSeconds: config.gpuStressSeconds,
			okfRoot: config.okfRoot,
			openWikiRoot: config.openWikiRoot,
		},
		gates,
		board,
		recommendations,
	};

	await mkdir(config.reportDir, { recursive: true });
	const date = generatedAt.slice(0, 10);
	const jsonFile = path.join(
		config.reportDir,
		`PARENT_ATLAS_NEXT_STEPS_${date}.json`,
	);
	const mdFile = path.join(
		config.reportDir,
		`PARENT_ATLAS_NEXT_STEPS_${date}.md`,
	);
	const kanbanFile = path.join(
		config.reportDir,
		`PARENT_ATLAS_KANBAN_${date}.md`,
	);
	const dailyFile = path.join(
		config.reportDir,
		`PARENT_ATLAS_DAILY_RECOMMENDATIONS_${date}.md`,
	);

	await writeFile(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

	const mdLines = [
		'# Parent Atlas Next Steps',
		'',
		`- Generated: ${generatedAt}`,
		`- Overall: **${overall}**`,
		'',
		'## Readiness matrix',
		'',
		'| Order | ID | Area | Gate | Status | Proof |',
		'|---:|---|---|---|---|---|',
		...gates.map(
			(gate) =>
				`| ${gate.order} | ${gate.id} | ${gate.area} | ${gate.title} | ${gate.status} | ${gate.proof} |`,
		),
		'',
		'## Exact next task',
		'',
		firstNext
			? `**${firstNext.taskId} — ${firstNext.title}**`
			: 'No next task selected.',
		'',
		firstNext?.reason ?? '',
		'',
	];
	for (const gateValue of gates) {
		mdLines.push(
			`## ${gateValue.id} — ${gateValue.title}`,
			'',
			`**Status:** ${gateValue.status}`,
			'',
			gateValue.summary,
			'',
			`**Next:** ${gateValue.nextAction}`,
			'',
		);
	}
	await writeFile(mdFile, `${mdLines.join('\n')}\n`, 'utf8');

	const kanbanLines = ['# Parent Atlas Kanban', ''];
	for (const [column, columnTasks] of Object.entries(board)) {
		kanbanLines.push(`## ${column}`, '');
		if (columnTasks.length === 0) {
			kanbanLines.push('- None', '');
			continue;
		}
		for (const task of columnTasks) {
			kanbanLines.push(
				`### ${task.priority} ${task.taskId} — ${task.title}`,
				'',
				`- Area: ${task.area}`,
				`- Owner component: ${task.ownerComponent}`,
				`- Dependencies: ${task.dependencies.join(', ') || 'none'}`,
				`- Expected proof: ${task.expectedProof}`,
				`- Reason: ${task.reason}`,
				'- Definition of done:',
				...task.definitionOfDone.map((item) => `  - ${item}`),
				'- Validation:',
				...(task.validationCommands.length
					? task.validationCommands.map((item) => `  - \`${item}\``)
					: ['  - Not yet defined']),
				'- Prohibited scope:',
				...task.prohibitedScope.map((item) => `  - ${item}`),
				'',
			);
		}
	}
	await writeFile(kanbanFile, `${kanbanLines.join('\n')}\n`, 'utf8');

	const dailyLines = [
		'# Parent Atlas Daily Recommendations',
		'',
		`- Generated: ${generatedAt}`,
		'',
		'## Today',
		'',
		firstNext
			? `**${firstNext.taskId} — ${firstNext.title}**`
			: 'No task selected.',
		'',
		firstNext?.reason ?? '',
		'',
		'## Daily read-only',
		'',
		...recommendations.dailyReadOnly.map((item) => `- ${item}`),
		'',
		'## Nightly bounded',
		'',
		...recommendations.nightlyBounded.map((item) => `- ${item}`),
		'',
		'## Weekly or manual',
		'',
		...recommendations.weeklyManual.map((item) => `- ${item}`),
		'',
	];
	await writeFile(dailyFile, `${dailyLines.join('\n')}\n`, 'utf8');

	console.log(JSON.stringify(report, null, 2));
	console.error(`\nReports:\n- ${jsonFile}\n- ${mdFile}\n- ${kanbanFile}\n- ${dailyFile}`);
	if (firstNext) {
		console.error(`\nExact next task:\n${firstNext.taskId}: ${firstNext.title}`);
	}

	if (config.strict && overall !== 'PASS') process.exitCode = 1;
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
	process.exitCode = 1;
});
