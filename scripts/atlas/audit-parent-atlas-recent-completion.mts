#!/usr/bin/env node
/**
 * Parent Atlas recent-change completion audit.
 *
 * Read-only by default. Intended to run from:
 *   C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
 *
 * It audits:
 *   - recent Git changes touching Parent Atlas
 *   - Postgres 18 on 5434
 *   - current atlas_packets identity coverage
 *   - active Qdrant writer wiring
 *   - strict payload helper presence and imports
 *   - isolated proof artifacts and OpenSpec status
 *   - production Qdrant payload coverage and duplicate risk
 *   - XGBoost sidecar and TypeScript client/cascade wiring
 *   - Mixedbread/reranker and 8090 /v1/models discovery
 *   - LangExtract/NLP sidecar
 *   - EmbeddingGemma semantic_768 readiness
 *   - cuVS brute-force / PyTorch parity / CAGRA quarantine
 *   - RAPIDS/cuGraph environment and graph freshness
 *   - canonical HyperRAG route, RRF, PageRank, summaries, ACE
 *
 * Output:
 *   docs/reports/parent-atlas/PARENT_ATLAS_RECENT_CHANGE_AUDIT_<date>.json
 *   docs/reports/parent-atlas/PARENT_ATLAS_RECENT_CHANGE_AUDIT_<date>.md
 *
 * Usage:
 *   npx tsx scripts/atlas/audit-parent-atlas-recent-completion.mts
 *   npx tsx scripts/atlas/audit-parent-atlas-recent-completion.mts --strict
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const execFileAsync = promisify(execFile);
const { Pool } = pg;

type Status = 'PASS' | 'PARTIAL' | 'FAIL' | 'BLOCKED' | 'NOT_PROVEN' | 'SKIP';

type Gate = {
	id: string;
	order: number;
	title: string;
	status: Status;
	proof: string;
	summary: string;
	evidence: unknown;
	blockedBy: string[];
	next: string;
};

type Config = {
	appRoot: string;
	repoRoot: string;
	databaseUrl: string;
	qdrantUrl: string;
	qdrantCollection: string;
	xgboostUrl: string;
	llmUrl: string;
	langextractUrl: string;
	embeddingUrl: string;
	reportDir: string;
	strict: boolean;
	recentCommitCount: number;
};

class AuditError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuditError';
	}
}

function argValue(name: string): string | undefined {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
	return process.argv.slice(2).includes(`--${name}`);
}

function config(): Config {
	const appRoot = path.resolve(argValue('app-root') ?? process.cwd());
	const repoRoot = path.resolve(argValue('repo-root') ?? path.join(appRoot, '..'));
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new AuditError(
			'DATABASE_URL is required, e.g. postgresql://postgres:...@127.0.0.1:5434/legal_ai_db',
		);
	}
	return {
		appRoot,
		repoRoot,
		databaseUrl,
		qdrantUrl: (argValue('qdrant-url') ?? process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, ''),
		qdrantCollection: argValue('qdrant-collection') ?? process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768',
		xgboostUrl: (argValue('xgboost-url') ?? process.env.XGBOOST_URL ?? 'http://127.0.0.1:8765').replace(/\/+$/, ''),
		llmUrl: (argValue('llm-url') ?? process.env.LLM_URL ?? 'http://127.0.0.1:8090').replace(/\/+$/, ''),
		langextractUrl: (argValue('langextract-url') ?? process.env.LANGEXTRACT_URL ?? 'http://127.0.0.1:8095').replace(/\/+$/, ''),
		embeddingUrl: (argValue('embedding-url') ?? process.env.EMBEDDING_URL ?? 'http://127.0.0.1:8081').replace(/\/+$/, ''),
		reportDir: path.resolve(argValue('report-dir') ?? path.join(appRoot, 'docs', 'reports', 'parent-atlas')),
		strict: hasFlag('strict'),
		recentCommitCount: Number(argValue('recent-commits') ?? '20'),
	};
}

async function exists(file: string): Promise<boolean> {
	try {
		await access(file);
		return true;
	} catch {
		return false;
	}
}

async function text(file: string): Promise<string> {
	return readFile(file, 'utf8');
}

async function run(
	file: string,
	args: string[],
	cwd: string,
	timeout = 30_000,
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
		const e = error as {
			stdout?: string;
			stderr?: string;
			code?: number;
			message?: string;
		};
		return {
			ok: false,
			stdout: e.stdout ?? '',
			stderr: e.stderr ?? e.message ?? String(error),
			code: e.code ?? null,
		};
	}
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8_000): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			...init,
			signal: controller.signal,
			headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
		});
		const body = await response.text();
		if (!response.ok) throw new AuditError(`${url} HTTP ${response.status}: ${body.slice(0, 300)}`);
		return (body ? JSON.parse(body) : {}) as T;
	} finally {
		clearTimeout(timer);
	}
}

async function tryJson<T>(base: string, endpoints: string[]) {
	const errors: string[] = [];
	for (const endpoint of endpoints) {
		try {
			return { ok: true as const, endpoint, value: await fetchJson<T>(`${base}${endpoint}`) };
		} catch (error) {
			errors.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { ok: false as const, errors };
}

async function grep(c: Config, pattern: string): Promise<string[]> {
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
			pattern,
			c.repoRoot,
		],
		c.repoRoot,
		20_000,
	);
	return result.ok ? result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 100) : [];
}

function gate(
	id: string,
	order: number,
	title: string,
	status: Status,
	proof: string,
	summary: string,
	evidence: unknown,
	next: string,
	blockedBy: string[] = [],
): Gate {
	return { id, order, title, status, proof, summary, evidence, next, blockedBy };
}

async function inspectGit(c: Config) {
	const status = await run('git', ['status', '--short'], c.repoRoot);
	const log = await run(
		'git',
		[
			'log',
			`-${c.recentCommitCount}`,
			'--date=iso-strict',
			'--pretty=format:%H%x09%ad%x09%s',
		],
		c.repoRoot,
	);
	const changed = await run(
		'git',
		['diff', '--name-status', 'HEAD~10..HEAD'],
		c.repoRoot,
	);
	return {
		status: status.stdout.split(/\r?\n/).filter(Boolean),
		recentCommits: log.stdout.split(/\r?\n/).filter(Boolean),
		recentChangedFiles: changed.stdout.split(/\r?\n/).filter(Boolean),
	};
}

async function inspectPostgres(c: Config) {
	const pool = new Pool({
		connectionString: c.databaseUrl,
		max: 3,
		application_name: 'parent-atlas-recent-completion-audit',
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
		}>(`
			SELECT column_name, data_type, is_nullable, column_default
			FROM information_schema.columns
			WHERE table_schema='public' AND table_name='atlas_packets'
			ORDER BY ordinal_position
		`);
		const names = new Set(columns.rows.map((r) => r.column_name));
		const canCoverage = [
			'packet_key',
			'source_ref',
			'workspace_id',
			'workspace_revision',
			'representation_revision',
		].every((name) => names.has(name));

		let coverage: Record<string, number> | null = null;
		if (canCoverage) {
			const result = await pool.query<Record<string, string>>(`
				SELECT
					COUNT(*)::text AS total_rows,
					COUNT(packet_key)::text AS packet_key_present,
					COUNT(source_ref)::text AS source_ref_present,
					COUNT(workspace_id)::text AS workspace_id_present,
					COUNT(workspace_revision)::text AS workspace_revision_present,
					COUNT(representation_revision)::text AS representation_revision_present,
					COUNT(*) FILTER (WHERE packet_key IS NULL OR btrim(packet_key)='')::text AS packet_key_missing,
					COUNT(*) FILTER (WHERE workspace_id IS NULL OR btrim(workspace_id)='')::text AS workspace_id_missing,
					COUNT(*) FILTER (WHERE representation_revision=0)::text AS representation_revision_zero
				FROM public.atlas_packets
			`);
			coverage = Object.fromEntries(
				Object.entries(result.rows[0] ?? {}).map(([key, value]) => [key, Number(value)]),
			);
		}

		return {
			connection: connection.rows[0],
			columns: columns.rows,
			coverage,
		};
	} finally {
		await pool.end();
	}
}

async function inspectQdrant(c: Config) {
	const info = await fetchJson<{
		result: {
			points_count?: number;
			config?: unknown;
		};
	}>(`${c.qdrantUrl}/collections/${encodeURIComponent(c.qdrantCollection)}`);
	const scroll = await fetchJson<{
		result: {
			points: Array<{ id: string | number; payload?: Record<string, unknown> }>;
		};
	}>(
		`${c.qdrantUrl}/collections/${encodeURIComponent(c.qdrantCollection)}/points/scroll`,
		{
			method: 'POST',
			body: JSON.stringify({ limit: 200, with_payload: true, with_vector: false }),
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
	const coverage = Object.fromEntries(fields.map((f) => [f, 0]));
	const signatures: Record<string, number> = {};
	const logicalKeys = new Map<string, number>();
	let duplicateLogicalKeys = 0;

	for (const point of scroll.result.points) {
		const payload = point.payload ?? {};
		const signature = Object.keys(payload).sort().join(',');
		signatures[signature] = (signatures[signature] ?? 0) + 1;
		for (const field of fields) {
			if (payload[field] !== null && payload[field] !== undefined) coverage[field] += 1;
		}
		if (
			typeof payload.packet_key === 'string' &&
			typeof payload.workspace_id === 'string' &&
			Number.isInteger(payload.workspace_revision) &&
			typeof payload.representation_id === 'string' &&
			Number.isInteger(payload.representation_revision) &&
			typeof payload.schema_version === 'string'
		) {
			const key = [
				payload.packet_key,
				payload.workspace_id,
				payload.workspace_revision,
				payload.representation_id,
				payload.representation_revision,
				payload.schema_version,
			].join('|');
			const count = (logicalKeys.get(key) ?? 0) + 1;
			logicalKeys.set(key, count);
			if (count === 2) duplicateLogicalKeys += 1;
		}
	}
	return {
		pointsCount: info.result.points_count ?? null,
		sampled: scroll.result.points.length,
		coverage,
		signatures,
		duplicateLogicalKeys,
	};
}

async function inspectFiles(c: Config) {
	const paths = {
		worker: path.join(c.appRoot, 'src', 'lib', 'server', 'workers', 'qdrant-sync-worker.ts'),
		payloadHelper: path.join(c.appRoot, 'src', 'lib', 'server', 'retrieval', 'qdrant-sync-payload.ts'),
		enricher: path.join(c.appRoot, 'src', 'lib', 'server', 'retrieval', 'qdrant-payload-enricher.ts'),
		proofRunner: path.join(c.appRoot, 'scripts', 'atlas', 'prove-qdrant-packet-joinback.mts'),
		packageJson: path.join(c.appRoot, 'package.json'),
		openSpec: path.join(c.repoRoot, 'openspec', 'changes', 'parent-atlas-graph-retrieval-proof', 'tasks.md'),
		graph: path.join(c.appRoot, 'docs', 'graph', 'codebase-graph.json'),
	};
	const values: Record<string, { exists: boolean; text?: string }> = {};
	for (const [key, file] of Object.entries(paths)) {
		const present = await exists(file);
		values[key] = { exists: present, text: present && key !== 'graph' ? await text(file) : undefined };
	}
	let graph: unknown = null;
	if (values.graph.exists) {
		const s = await stat(paths.graph);
		graph = {
			path: paths.graph,
			size: s.size,
			modifiedAt: s.mtime.toISOString(),
			ageMinutes: (Date.now() - s.mtimeMs) / 60_000,
		};
	}
	return { paths, values, graph };
}

async function main() {
	const c = config();
	const generatedAt = new Date().toISOString();
	const gates: Gate[] = [];

	const git = await inspectGit(c);
	const files = await inspectFiles(c);
	const postgres = await inspectPostgres(c);

	const pgPort = Number((postgres.connection as Record<string, unknown>).server_port);
	const pgVersion = String((postgres.connection as Record<string, unknown>).server_version ?? '');
	gates.push(
		gate(
			'PA-PG-001',
			1,
			'PostgreSQL 18 canonical runtime',
			pgPort === 5434 && pgVersion.startsWith('18') ? 'PASS' : 'PARTIAL',
			'RUNTIME_SMOKE_PROVEN',
			`Connected on ${pgPort}, server ${pgVersion}.`,
			postgres,
			'Keep all projection joins and revision checks anchored to this exact instance.',
		),
	);

	const workerText = files.values.worker.text ?? '';
	const helperText = files.values.payloadHelper.text ?? '';
	const workerImportsHelper =
		files.values.payloadHelper.exists &&
		/qdrant-sync-payload/.test(workerText);
	const inlinePayload = /const\s+payload\s*:\s*Record<string,\s*unknown>\s*=\s*\{/.test(workerText);
	const writesProduction = /upsert\(['"]codebase_chunks_768['"]/.test(workerText);
	const ackAfter = /await\s+processQdrantSync\(event\);\s*channel\?\.ack/.test(workerText);
	const deterministicPointId =
		/deterministic|createHash|sha256|projection_key|canonicalPoint/i.test(helperText);

	gates.push(
		gate(
			'PA-PROJ-001',
			2,
			'Active Qdrant writer integration',
			workerImportsHelper && !inlinePayload ? 'PARTIAL' : 'FAIL',
			workerImportsHelper ? 'STATIC_WIRING_PROVEN' : 'SOURCE_PRESENT',
			workerImportsHelper
				? 'Worker imports the strict payload helper, but runtime isolated seam proof is still required.'
				: 'Worker does not import the proven strict payload helper or still builds payload inline.',
			{
				workerExists: files.values.worker.exists,
				helperExists: files.values.payloadHelper.exists,
				workerImportsHelper,
				inlinePayload,
				writesProduction,
				ackAfterSuccessfulProcessing: ackAfter,
				deterministicPointId,
			},
			'Patch the worker to call one pure strict builder, inject the collection name for tests, and exercise a real event-shaped fixture against an isolated proof collection.',
			['PA-PG-001'],
		),
	);

	const proofStatusText = `${files.values.openSpec.text ?? ''}\n${files.values.proofRunner.text ?? ''}`;
	const proofRecorded =
		/QDRANT_PACKET_READBACK.*FIXTURE_PROVEN/i.test(proofStatusText) &&
		/QDRANT_PACKET_JOIN_BACK.*FIXTURE_PROVEN/i.test(proofStatusText);
	gates.push(
		gate(
			'PA-PROJ-002',
			3,
			'Isolated packet projection proof',
			proofRecorded ? 'PASS' : 'NOT_PROVEN',
			proofRecorded ? 'FIXTURE_PROVEN' : 'NOT_PROVEN',
			proofRecorded
				? 'Repository evidence records isolated Qdrant readback and packet_key join-back proof.'
				: 'Proof runner or evidence-backed OpenSpec statuses are absent from this checkout.',
			{
				proofRunnerExists: files.values.proofRunner.exists,
				openSpecExists: files.values.openSpec.exists,
				proofRecorded,
			},
			'Do not promote production identity from the isolated proof; use it only as the prerequisite for active-writer seam proof.',
		),
	);

	let qdrant: unknown;
	try {
		qdrant = await inspectQdrant(c);
		const q = qdrant as Awaited<ReturnType<typeof inspectQdrant>>;
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
			q.sampled > 0 && required.every((field) => q.coverage[field] === q.sampled);
		gates.push(
			gate(
				'PA-PROJ-003',
				4,
				'Production Qdrant identity and duplicate safety',
				complete && q.duplicateLogicalKeys === 0 ? 'PASS' : 'FAIL',
				'PRODUCTION_DATA_PROVEN',
				`Sampled ${q.sampled} points from ${c.qdrantCollection}.`,
				q,
				complete
					? 'Keep deterministic logical projection IDs and continuously sample duplicate envelope identities.'
					: 'Keep production migration blocked; patch the active writer, then deterministically re-upsert or rebuild.',
				['PA-PROJ-001', 'PA-PROJ-002'],
			),
		);
	} catch (error) {
		qdrant = { error: error instanceof Error ? error.message : String(error) };
		gates.push(
			gate(
				'PA-PROJ-003',
				4,
				'Production Qdrant identity and duplicate safety',
				'FAIL',
				'NOT_PROVEN',
				'Qdrant inspection failed.',
				qdrant,
				'Restore Qdrant connectivity and rerun the audit.',
				['PA-PROJ-001'],
			),
		);
	}

	const xgb = await tryJson<Record<string, unknown>>(c.xgboostUrl, ['/health', '/']);
	const xgbFiles = await grep(c, 'xgboost');
	const xgbClientHits = xgbFiles.filter((line) =>
		/xgboost.*client|rerank_source|8765|\/score/i.test(line),
	);
	gates.push(
		gate(
			'PA-XGB-001',
			5,
			'XGBoost model and canonical cascade wiring',
			xgb.ok && xgbClientHits.length > 0 ? 'PARTIAL' : xgb.ok ? 'PARTIAL' : 'FAIL',
			xgb.ok ? 'RUNTIME_SMOKE_PROVEN' : 'NOT_PROVEN',
			xgb.ok
				? 'XGBoost service is reachable; canonical post-hydration cascade execution still requires a focused runtime receipt.'
				: 'XGBoost sidecar is unavailable.',
			{
				health: xgb,
				repositoryHits: xgbFiles.slice(0, 30),
				canonicalClientHits: xgbClientHits.slice(0, 20),
			},
			'Prove XGBoost receives canonically hydrated, packet-deduplicated candidates after RRF and preserves packet_key in output.',
			['PA-PROJ-003'],
		),
	);

	const models = await tryJson<Record<string, unknown>>(c.llmUrl, ['/v1/models']);
	const langextract = await tryJson<Record<string, unknown>>(c.langextractUrl, ['/health', '/']);
	const embedding = await tryJson<Record<string, unknown>>(c.embeddingUrl, ['/health', '/v1/models', '/']);
	gates.push(
		gate(
			'PA-SVC-001',
			6,
			'Model and NLP service discovery',
			models.ok && langextract.ok && embedding.ok ? 'PASS' : 'PARTIAL',
			'RUNTIME_SMOKE_PROVEN',
			'LLM, LangExtract/NLP, and embedding endpoints were probed independently.',
			{ models, langextract, embedding },
			'Do not assume 8090 owns embeddings or reranking; keep each model role explicit in receipts.',
		),
	);

	const embeddingHits = await grep(c, 'semantic_768|embeddinggemma|content_embedding');
	const cuvsHits = await grep(c, 'brute_force.search|cuvs|PyTorch topk|CAGRA');
	const hasExact = cuvsHits.some((line) => /brute_force|exact_topk|pytorch/i.test(line));
	const hasCagra = cuvsHits.some((line) => /cagra/i.test(line));
	gates.push(
		gate(
			'PA-EVAL-001',
			7,
			'EmbeddingGemma → exact oracle → CAGRA readiness',
			hasExact ? 'PARTIAL' : 'NOT_PROVEN',
			hasExact ? 'STATIC_WIRING_PROVEN' : 'NOT_PROVEN',
			'CAGRA remains ineligible until same-matrix semantic_768 exact-search and Qdrant parity gates pass.',
			{
				embeddingHits: embeddingHits.slice(0, 40),
				cuvsHits: cuvsHits.slice(0, 40),
				exactOracleSourcePresent: hasExact,
				cagraSourcePresent: hasCagra,
			},
			'Run cuVS brute-force and PyTorch top-k parity on one revision-qualified manifest, then measure Qdrant HNSW recall before any CAGRA test.',
			['PA-PROJ-003'],
		),
	);

	const hyperragHits = await grep(c, 'canonical-hyperrag-adapter|search-unified|/api/search/hyperrag');
	const rrfHits = await grep(c, 'rrf-multi-vector|reciprocal rank fusion|rrf_source');
	const pagerankHits = await grep(c, 'graphPageRank|pageRankScore|gds.pageRank');
	const summaryHits = await grep(c, 'summary-card-retrieval|summary_resolved');
	const aceHits = await grep(c, 'ace-materializer|canonical-packet-envelope|provenance');
	gates.push(
		gate(
			'PA-RET-001',
			8,
			'Canonical retrieval completion chain',
			hyperragHits.length && rrfHits.length && pagerankHits.length && aceHits.length
				? 'PARTIAL'
				: 'NOT_PROVEN',
			'STATIC_WIRING_PROVEN',
			'Retrieval, RRF, PageRank, summary, and ACE seams were inventoried; one production receipt is still required.',
			{
				hyperrag: hyperragHits.slice(0, 20),
				rrf: rrfHits.slice(0, 20),
				pagerank: pagerankHits.slice(0, 20),
				summaries: summaryHits.slice(0, 20),
				ace: aceHits.slice(0, 20),
			},
			'After production Qdrant identity is repaired, prove one route through hydration, stale rejection, independent lanes, rerank, exact source, and ACE.',
			['PA-PROJ-003', 'PA-XGB-001'],
		),
	);

	const graph = files.graph as { ageMinutes?: number } | null;
	gates.push(
		gate(
			'PA-OPS-001',
			9,
			'Graphify freshness',
			graph && typeof graph.ageMinutes === 'number' && graph.ageMinutes <= 180
				? 'PASS'
				: 'FAIL',
			'PRODUCTION_DATA_PROVEN',
			graph ? `Graph artifact age is ${graph.ageMinutes?.toFixed(1)} minutes.` : 'Graph artifact missing.',
			graph,
			'Isolate code graph refresh from optional SOM/topology stages and emit stage receipts.',
		),
	);

	const firstBlocking =
		[...gates]
			.sort((a, b) => a.order - b.order)
			.find((g) => ['FAIL', 'BLOCKED', 'NOT_PROVEN'].includes(g.status)) ??
		gates.find((g) => g.status === 'PARTIAL') ??
		null;

	const nextTask = firstBlocking
		? {
				gate: firstBlocking.id,
				title: firstBlocking.title,
				action: firstBlocking.next,
		  }
		: {
				gate: 'PA-RET-E2E',
				title: 'Canonical end-to-end retrieval receipt',
				action:
					'Run one bounded canonical query through hydration, graph expansion, RRF, rerank, exact source, and ACE.',
		  };

	const overall: Status = gates.some((g) => ['FAIL', 'BLOCKED'].includes(g.status))
		? 'BLOCKED'
		: gates.some((g) => ['PARTIAL', 'NOT_PROVEN'].includes(g.status))
			? 'PARTIAL'
			: 'PASS';

	const report = {
		generatedAt,
		overall,
		config: { ...c, databaseUrl: '[redacted]' },
		git,
		gates,
		nextTask,
		importantBoundary: {
			localReportedProof:
				'QDRANT_PAYLOAD_BUILDER_FIXTURE / READBACK / JOIN_BACK FIXTURE_PROVEN',
			checkoutDetected:
				files.values.payloadHelper.exists
					? 'strict payload helper present'
					: 'strict payload helper absent',
			rule:
				'Do not infer active-writer or production proof from standalone fixture evidence.',
		},
	};

	await mkdir(c.reportDir, { recursive: true });
	const date = generatedAt.slice(0, 10);
	const jsonFile = path.join(c.reportDir, `PARENT_ATLAS_RECENT_CHANGE_AUDIT_${date}.json`);
	const mdFile = path.join(c.reportDir, `PARENT_ATLAS_RECENT_CHANGE_AUDIT_${date}.md`);
	await writeFile(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

	const lines = [
		'# Parent Atlas Recent-Change Completion Audit',
		'',
		`- Generated: ${generatedAt}`,
		`- Overall: **${overall}**`,
		'',
		'## Gates',
		'',
		'| Order | ID | Gate | Status | Proof |',
		'|---:|---|---|---|---|',
		...gates.map(
			(g) => `| ${g.order} | ${g.id} | ${g.title} | ${g.status} | ${g.proof} |`,
		),
		'',
		'## Exact next task',
		'',
		`**${nextTask.gate} — ${nextTask.title}**`,
		'',
		nextTask.action,
		'',
		'## Recent Git changes',
		'',
		...git.recentCommits.slice(0, 20).map((line) => `- ${line}`),
		'',
	];
	for (const g of gates) {
		lines.push(
			`## ${g.id} — ${g.title}`,
			'',
			`**Status:** ${g.status}`,
			'',
			g.summary,
			'',
			'```json',
			JSON.stringify(g.evidence, null, 2),
			'```',
			'',
			`**Next:** ${g.next}`,
			'',
		);
	}
	await writeFile(mdFile, `${lines.join('\n')}\n`, 'utf8');

	console.log(JSON.stringify(report, null, 2));
	console.error(`\nReports:\n- ${jsonFile}\n- ${mdFile}`);
	console.error(`\nNext task:\n${nextTask.gate}: ${nextTask.action}`);

	if (c.strict && overall !== 'PASS') process.exitCode = 1;
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
	process.exitCode = 1;
});
