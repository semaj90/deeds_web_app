import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, tool } from 'ai';
import { z } from 'zod';
import {
	buildPhase101PacketId,
	nesPacketV1DraftSchema,
	nesPacketV1Schema,
	NES_PACKET_SCHEMA_ID,
} from './nes-packet-v1.schema.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../../../../../');
const parentAtlasTocPath = path.resolve(
	repoRoot,
	'docs/atlas/parent-atlas-table-of-contents.md'
);
const parentAtlasDataSpinePath = path.resolve(
	repoRoot,
	'docs/atlas/parent-atlas-data-spine.md'
);
const parentAtlasFeatureAtlasPath = path.resolve(
	repoRoot,
	'docs/reports/parent-atlas-feature-command-atlas.json'
);
const rgOrganizerPath = path.resolve(repoRoot, 'docs/reports/parent-atlas-rg-dump-organizer.json');
const rgProjectionPath = path.resolve(repoRoot, 'docs/reports/parent-atlas-rg-dump-projection.json');
const hotJoinPath = path.resolve(repoRoot, 'docs/reports/sourceRef-first-hot-join-warmup.json');
const joinWarmupPath = path.resolve(repoRoot, 'docs/reports/sourceRef-first-join-warmup.json');
const cypherApplyPath = path.resolve(repoRoot, 'docs/reports/parent-atlas-cypher-apply-report.json');
const consistencyAuditPath = path.resolve(
	repoRoot,
	'docs/reports/parent-atlas-consistency-audit-report.json'
);
const cacheDir = path.resolve(repoRoot, '.tmp/engram-cache');
const phase101ScannerCommand = `cd ${toBashPath(repoRoot)} && cat IMPLEMENTATION_STATUS.md | grep -A3 "Phase 101|✅.*101|Phase 102" | head -40`;

const safeCommandPattern = /(?:--dry-run\b|audit\b|validate\b|report\b|status\b|readPhaseStatus\b)/i;
const mutatingCommandPattern = /\b(apply|write|delete|drop|push|archive|remove|prune|truncate|migrate|seed|sync)\b/i;
let cachedRedisClient = null;
let cachedRedisPromise = null;

const LOCAL_ENV = {
	REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
	BIFROST_OPENAI_BASE_URL: process.env.BIFROST_OPENAI_BASE_URL || 'http://127.0.0.1:3040/v1',
	TURBOQUANT_BASE_URL: process.env.TURBOQUANT_BASE_URL || 'http://127.0.0.1:8090',
	FUNCTION_GEMMA_MODEL: process.env.FUNCTION_GEMMA_MODEL || process.env.GEMMA4_MODEL || 'gemma4-rotorquant:latest',
	GEMMA4_MODEL: process.env.GEMMA4_MODEL || 'gemma4-rotorquant:latest',
};

function nowIso() {
	return new Date().toISOString();
}

function sha256(input) {
	return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function toPosix(p) {
	return p.split(path.sep).join('/');
}

function toBashPath(p) {
	const posix = toPosix(p);
	return posix.replace(/^([A-Za-z]):\//, (_match, drive) => `/mnt/${drive.toLowerCase()}/`);
}

function trimText(text, limit = 4000) {
	const normalized = String(text ?? '').replace(/\r\n/g, '\n');
	return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

function safeReadJson(text, fallback = null) {
	try {
		return JSON.parse(text);
	} catch {
		return fallback;
	}
}

function summarizeJsonObject(input) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return input;
	}
	const entries = Object.entries(input);
	const summary = {};
	for (const [key, value] of entries) {
		if (value == null) continue;
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			summary[key] = value;
			continue;
		}
		if (Array.isArray(value)) {
			summary[key] = { kind: 'array', length: value.length };
			continue;
		}
		if (typeof value === 'object') {
			const nested = Object.entries(value)
				.filter(([, nestedValue]) =>
					typeof nestedValue === 'string' ||
					typeof nestedValue === 'number' ||
					typeof nestedValue === 'boolean'
				)
				.reduce((acc, [nestedKey, nestedValue]) => {
					acc[nestedKey] = nestedValue;
					return acc;
				}, {});
			if (Object.keys(nested).length > 0) {
				summary[key] = nested;
			}
		}
	}
	return summary;
}

async function readTextIfExists(filePath, limit = 4000) {
	if (!existsSync(filePath)) return null;
	const text = await readFile(filePath, 'utf8');
	return trimText(text, limit);
}

async function readJsonIfExists(filePath) {
	if (!existsSync(filePath)) return null;
	const text = await readFile(filePath, 'utf8');
	const json = safeReadJson(text, null);
	if (!json) {
		return { filePath: toPosix(filePath), raw_excerpt: trimText(text, 3000) };
	}
	return { filePath: toPosix(filePath), summary: summarizeJsonObject(json) };
}

function isMutatingCommand(command) {
	return mutatingCommandPattern.test(command) && !/\b--dry-run\b/i.test(command);
}

function assertSafeRecommendation(recommendation) {
	if (!recommendation || typeof recommendation.command !== 'string') {
		throw new Error('recommendation_missing_command');
	}
	if (!recommendation.read_only) {
		throw new Error('recommendation_not_read_only');
	}
	if (isMutatingCommand(recommendation.command)) {
		throw new Error('recommendation_mutating_command');
	}
	if (!safeCommandPattern.test(recommendation.command) && !/\bphase101\b/i.test(recommendation.command)) {
		throw new Error('recommendation_not_safe_or_dry_run');
	}
}

async function getOptionalRedisClient() {
	if (cachedRedisClient) return cachedRedisClient;
	if (cachedRedisPromise) return cachedRedisPromise;

	cachedRedisPromise = (async () => {
		try {
			const { default: Redis } = await import('ioredis');
			const client = new Redis(LOCAL_ENV.REDIS_URL, {
				lazyConnect: false,
				maxRetriesPerRequest: 1,
				enableOfflineQueue: false,
				connectTimeout: 1000,
			});
			client.on('error', () => {});
			await client.ping();
			cachedRedisClient = client;
			return client;
		} catch {
			return null;
		} finally {
			cachedRedisPromise = null;
		}
	})();

	return cachedRedisPromise;
}

export function readPhaseStatus() {
	const primary = spawnSync('bash', ['-lc', phase101ScannerCommand], {
		cwd: repoRoot,
		encoding: 'utf8',
		maxBuffer: 1024 * 1024,
	});

	let commandUsed = phase101ScannerCommand;
	let stdout = trimText(primary.stdout ?? '', 8000);
	let stderr = trimText(primary.stderr ?? '', 3000);
	let exitCode = typeof primary.status === 'number' ? primary.status : 1;
	let fallbackUsed = false;

	if (!stdout.trim()) {
		const fallbackCommand = phase101ScannerCommand
			.replace('grep -A3 "', 'grep -E -A3 "')
			.replace(' | head -40', '');
		const fallback = spawnSync('bash', ['-lc', fallbackCommand], {
			cwd: repoRoot,
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
		});
		const fallbackStdout = trimText(fallback.stdout ?? '', 8000);
		if (fallbackStdout.trim()) {
			stdout = fallbackStdout;
			stderr = trimText(fallback.stderr ?? '', 3000);
			exitCode = typeof fallback.status === 'number' ? fallback.status : exitCode;
			commandUsed = fallbackCommand;
			fallbackUsed = true;
		}
	}

	const lines = stdout
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter(Boolean);

	return {
		command: phase101ScannerCommand,
		effectiveCommand: commandUsed,
		exitCode,
		fallbackUsed,
		stdout,
		stderr,
		lines,
		excerpt: trimText(stdout, 4000),
		hits: lines,
		ranAt: nowIso(),
	};
}

export async function retrieveContextPack() {
	const packRefs = [
		parentAtlasTocPath,
		parentAtlasDataSpinePath,
		parentAtlasFeatureAtlasPath,
		rgOrganizerPath,
		rgProjectionPath,
		hotJoinPath,
		joinWarmupPath,
		cypherApplyPath,
		consistencyAuditPath,
	];

	const contextPacksDir = path.resolve(repoRoot, 'sveltekit-frontend/.cache/ace/context-packs');
	const latestPack = await findLatestFile(contextPacksDir);
	if (latestPack) {
		packRefs.push(latestPack);
	}

	const excerpts = [];
	for (const filePath of packRefs) {
		const summary = await readJsonIfExists(filePath);
		if (summary) {
			excerpts.push(summary);
			continue;
		}
		const text = await readTextIfExists(filePath, 3200);
		if (text) {
			excerpts.push({ filePath: toPosix(filePath), raw_excerpt: text });
		}
	}

	return {
		refs: packRefs.filter((filePath) => existsSync(filePath)).map(toPosix),
		excerpts,
		latestContextPack: latestPack ? toPosix(latestPack) : null,
	};
}

async function findLatestFile(dirPath) {
	if (!existsSync(dirPath)) return null;
	const entries = await readdir(dirPath, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const filePath = path.resolve(dirPath, entry.name);
		const fileStat = await stat(filePath).catch(() => null);
		if (fileStat?.isFile()) {
			files.push({ filePath, mtimeMs: fileStat.mtimeMs });
		}
	}
	files.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return files[0]?.filePath ?? null;
}

export function recommendNextOpenCodeTask(phaseStatus, contextPack) {
	const text = `${phaseStatus?.excerpt ?? ''}\n${JSON.stringify(contextPack?.excerpts ?? []).slice(0, 2500)}`;
	const fallback = {
		command: 'node scripts/atlas/phase101-parent-atlas-packetize.mjs --dry-run',
		read_only: true,
		reason: 'Dry-run the Phase 101 packetizer to keep the lane read-only while the remaining blockers are resolved.',
	};

	const candidates = [
		{
			match: /knowledge-card-validation/i,
			command: 'node scripts/atlas/audit-parent-atlas-consistency.mjs',
			reason: 'Audit Parent Atlas consistency before any write path is attempted.',
		},
		{
			match: /alias-id-schema-preflight/i,
			command: 'node scripts/atlas/phase101-parent-atlas-packetize.mjs --dry-run',
			reason: 'Keep Phase 101 packetization read-only until alias_id schema preflight lands.',
		},
		{
			match: /offline-synthesis-dry-run/i,
			command: 'node scripts/atlas/run-offline-synthesis.mjs --dry-run --limit 25',
			reason: 'Run the bounded offline synthesis dry-run before any apply path.',
		},
		{
			match: /parent-atlas-validation/i,
			command: 'node scripts/atlas/audit-parent-atlas-consistency.mjs',
			reason: 'Validate the Parent Atlas structure without mutating data.',
		},
	];

	for (const candidate of candidates) {
		if (candidate.match.test(text)) {
			const recommendation = { ...candidate, read_only: true };
			assertSafeRecommendation(recommendation);
			return recommendation;
		}
	}

	assertSafeRecommendation(fallback);
	return fallback;
}

function buildModelPrompt(input) {
	return [
		'You are emitting a single JSON packet for Phase 101.',
		'Return only data that matches the provided schema.',
		'Never emit narrative, markdown, or code fences.',
		'Never recommend a mutating command.',
		'Use only read-only or dry-run next actions.',
		'',
		'Phase status excerpt:',
		input.phaseStatus.excerpt,
		'',
		'Context pack refs:',
		input.contextPack.refs.join('\n'),
		'',
		'Context pack excerpts:',
		JSON.stringify(input.contextPack.excerpts, null, 2),
		'',
		'Recommended next action:',
		JSON.stringify(input.recommendation, null, 2),
		'',
		'MISSING_ENV_VARS:',
		JSON.stringify(input.missingEnvVars, null, 2),
	].join('\n');
}

function resolveProviderConfig() {
	const missingEnvVars = [];
	const baseUrl =
		process.env.LOCAL_OPENAI_BASE_URL?.trim() ||
		LOCAL_ENV.BIFROST_OPENAI_BASE_URL?.trim() ||
		LOCAL_ENV.TURBOQUANT_BASE_URL?.trim() ||
		'http://127.0.0.1:3040/v1';
	const apiKey = process.env.LOCAL_OPENAI_API_KEY?.trim() || 'local';
	const model =
		process.env.LOCAL_GEMMA_MODEL?.trim() ||
		LOCAL_ENV.FUNCTION_GEMMA_MODEL?.trim() ||
		LOCAL_ENV.GEMMA4_MODEL?.trim() ||
		'gemma4-rotorquant:latest';

	if (!process.env.LOCAL_OPENAI_BASE_URL) missingEnvVars.push('LOCAL_OPENAI_BASE_URL');
	if (!process.env.LOCAL_OPENAI_API_KEY) missingEnvVars.push('LOCAL_OPENAI_API_KEY');
	if (!process.env.LOCAL_GEMMA_MODEL) missingEnvVars.push('LOCAL_GEMMA_MODEL');

	return { baseUrl, apiKey, model, missingEnvVars };
}

function buildDeterministicDraft(input) {
	const summary = `Phase 101 Parent Atlas packetize lane is dry-run wired. Scanner exit=${input.phaseStatus.exitCode}. Context refs=${input.contextPack.refs.length}.`;
	return {
		schema_version: NES_PACKET_SCHEMA_ID,
		packet_kind: 'parent_atlas_phase101',
		workspace_id: 'deeds-web-app',
		workspace_task_id: 'phase101:parent-atlas-packetize',
		title_id: 'phase101.parent-atlas.packetize',
		feature_id: 'phase101.parent_atlas.packetize',
		source_ref: 'IMPLEMENTATION_STATUS.md:194-213',
		source_refs: [
			'IMPLEMENTATION_STATUS.md:194-213',
			'docs/atlas/parent-atlas-table-of-contents.md',
			'docs/atlas/parent-atlas-data-spine.md',
		],
		point_kind: 'task_summary',
		semantic_path: ['parent_atlas', 'phase101', 'gemma4', 'engram', 'nes'],
		related_feature_ids: ['parent_atlas', 'engram.cache', 'phase101.parent_atlas.packetize'],
		related_task_ids: ['phase101:alias-id-schema-preflight', 'phase101:knowledge-card-validation'],
		related_file_paths: [
			'IMPLEMENTATION_STATUS.md',
			'docs/atlas/parent-atlas-table-of-contents.md',
			'docs/atlas/parent-atlas-data-spine.md',
		],
		cluster_id: null,
		centroid_id: null,
		parent_centroid_id: null,
		summary_llm: summary,
		summary_model: 'fallback-local',
		confidence: 0.79,
		status: 'todo',
		agent_pickup_ready: true,
		recommendation: input.recommendation,
		phase_status_excerpt: input.phaseStatus.excerpt,
		context_pack_refs: input.contextPack.refs,
		missing_env_vars: input.missingEnvVars,
		notes: [
			'Fallback packet used because the local OpenAI-compatible env vars were missing or the model call failed.',
			'The recommendation remains read-only/dry-run only.',
		],
	};
}

export async function emitNesPacket(input) {
	const provider = resolveProviderConfig();
	const prompt = buildModelPrompt({
		...input,
		missingEnvVars: provider.missingEnvVars,
	});

	const draftBase = {
		schema_version: NES_PACKET_SCHEMA_ID,
		packet_kind: 'parent_atlas_phase101',
		workspace_id: 'deeds-web-app',
		workspace_task_id: 'phase101:parent-atlas-packetize',
		title_id: 'phase101.parent-atlas.packetize',
		feature_id: 'phase101.parent_atlas.packetize',
		source_ref: 'IMPLEMENTATION_STATUS.md:194-213',
		source_refs: [
			'IMPLEMENTATION_STATUS.md:194-213',
			'docs/atlas/parent-atlas-table-of-contents.md',
			'docs/atlas/parent-atlas-data-spine.md',
		],
		point_kind: 'task_summary',
		semantic_path: ['parent_atlas', 'phase101', 'gemma4', 'engram', 'nes'],
		related_feature_ids: ['parent_atlas', 'engram.cache', 'phase101.parent_atlas.packetize'],
		related_task_ids: ['phase101:alias-id-schema-preflight', 'phase101:knowledge-card-validation'],
		related_file_paths: [
			'IMPLEMENTATION_STATUS.md',
			'docs/atlas/parent-atlas-table-of-contents.md',
			'docs/atlas/parent-atlas-data-spine.md',
		],
		cluster_id: null,
		centroid_id: null,
		parent_centroid_id: null,
		recommendation: input.recommendation,
		phase_status_excerpt: input.phaseStatus.excerpt,
		context_pack_refs: input.contextPack.refs,
		missing_env_vars: provider.missingEnvVars,
		notes: [
			`provider.baseUrl=${provider.baseUrl}`,
			`provider.model=${provider.model}`,
		],
	};

	let modelPacket = null;
	let modelUsed = false;
	let modelError = null;

	try {
		const ai = createOpenAICompatible({
			name: 'local-openai',
			baseURL: provider.baseUrl.replace(/\/$/, ''),
			apiKey: provider.apiKey,
		});

		const result = await generateObject({
			model: ai(provider.model),
			schema: nesPacketV1DraftSchema,
			prompt,
			system: 'Emit a single dry-run-safe parent atlas NES packet. Never recommend mutating actions.',
		});

		modelPacket = result.object;
		modelUsed = true;
	} catch (error) {
		modelError = error instanceof Error ? error.message : String(error);
		const errorText = modelError.toLowerCase();
		const validationFailure =
			errorText.includes('json') ||
			errorText.includes('schema') ||
			errorText.includes('validation') ||
			errorText.includes('object') ||
			errorText.includes('parse');

		if (validationFailure) {
			throw new Error(`phase101_packet_json_validation_failed: ${modelError}`);
		}

		if (!input.dryRun) {
			throw error;
		}
	}

	const draft = modelPacket ?? buildDeterministicDraft(input);
	const normalizedDraft = {
		...draft,
		phase_status_excerpt:
			typeof draft.phase_status_excerpt === 'string' && draft.phase_status_excerpt.trim().length > 0
				? draft.phase_status_excerpt
				: trimText(input.phaseStatus.excerpt || input.phaseStatus.stdout || 'Phase 101 status unavailable', 4000),
		context_pack_refs:
			Array.isArray(draft.context_pack_refs) && draft.context_pack_refs.length > 0
				? draft.context_pack_refs
				: input.contextPack.refs,
		missing_env_vars: Array.isArray(draft.missing_env_vars)
			? draft.missing_env_vars
			: provider.missingEnvVars,
		notes: Array.isArray(draft.notes) ? draft.notes : [],
	};
	assertSafeRecommendation(normalizedDraft.recommendation);

	const packet = {
		...draftBase,
		...normalizedDraft,
		packet_id: buildPhase101PacketId({
			...draftBase,
			...normalizedDraft,
		}),
		cache_key: buildPhase101PacketId({
			...draftBase,
			...normalizedDraft,
		}),
		summary_hash: sha256(normalizedDraft.summary_llm),
		confidence:
			typeof normalizedDraft.confidence === 'number' && Number.isFinite(normalizedDraft.confidence)
				? Math.max(0, Math.min(1, normalizedDraft.confidence))
				: 0.79,
		observed_at: nowIso(),
		updated_at: nowIso(),
		valid_from: nowIso(),
		valid_to: null,
		deleted: false,
		cache_backend: input.dryRun ? 'dry-run' : 'none',
	};

	const validated = nesPacketV1Schema.parse(packet);

	return {
		packet: validated,
		modelUsed,
		modelError,
		provider,
		missingEnvVars: provider.missingEnvVars,
	};
}

export async function storeEngramPacket(packet, { dryRun = true } = {}) {
	const cacheKey = packet.cache_key;
	const redisKey = `engram:packet:v1:${cacheKey}`;
	if (dryRun) {
		return {
			cacheBackend: 'dry-run',
			cacheKey,
			redisKey,
			filePath: null,
			stored: false,
		};
	}

	try {
		const redis = await getOptionalRedisClient();
		if (!redis) {
			throw new Error('redis_unavailable');
		}
		await redis.set(redisKey, JSON.stringify(packet));
		return {
			cacheBackend: 'redis',
			cacheKey,
			redisKey,
			filePath: null,
			stored: true,
		};
	} catch (redisError) {
		await mkdir(cacheDir, { recursive: true });
		const safeFile = path.join(cacheDir, `${cacheKey}.json`);
		await writeFile(safeFile, JSON.stringify(packet, null, 2), 'utf8');
		return {
			cacheBackend: 'file',
			cacheKey,
			redisKey,
			filePath: toPosix(safeFile),
			stored: true,
			redisError: redisError instanceof Error ? redisError.message : String(redisError),
		};
	}
}

export function buildPhase101ToolMap() {
	return {
		readPhaseStatus: tool({
			description: 'Read the Phase 101 status excerpt using the exact deterministic grep command.',
			parameters: z.object({}),
			execute: async () => readPhaseStatus(),
		}),
		retrieveContextPack: tool({
			description: 'Load a compact context pack from the Parent Atlas and nearby reports.',
			parameters: z.object({}),
			execute: async () => retrieveContextPack(),
		}),
		recommendNextOpenCodeTask: tool({
			description: 'Recommend the next safe OpenCode task. Read-only or dry-run only.',
			parameters: z.object({}),
			execute: async () => {
				const phaseStatus = readPhaseStatus();
				const contextPack = await retrieveContextPack();
				return recommendNextOpenCodeTask(phaseStatus, contextPack);
			},
		}),
		emitNesPacket: tool({
			description: 'Emit a validated nes.packet.v1 packet for Phase 101.',
			parameters: z.object({ dryRun: z.boolean().default(true) }),
			execute: async ({ dryRun }) => {
				const phaseStatus = readPhaseStatus();
				const contextPack = await retrieveContextPack();
				const recommendation = recommendNextOpenCodeTask(phaseStatus, contextPack);
				const emitted = await emitNesPacket({
					dryRun,
					phaseStatus,
					contextPack,
					recommendation,
				});
				return emitted.packet;
			},
		}),
		storeEngramPacket: tool({
			description: 'Store a validated Engram packet in Redis or the file-backed dev stub.',
			parameters: z.object({ dryRun: z.boolean().default(true) }),
			execute: async ({ dryRun }) => {
				const phaseStatus = readPhaseStatus();
				const contextPack = await retrieveContextPack();
				const recommendation = recommendNextOpenCodeTask(phaseStatus, contextPack);
				const emitted = await emitNesPacket({
					dryRun,
					phaseStatus,
					contextPack,
					recommendation,
				});
				return storeEngramPacket(emitted.packet, { dryRun });
			},
		}),
	};
}

export async function packetizePhase101ParentAtlas({ dryRun = true } = {}) {
	const phaseStatus = readPhaseStatus();
	const contextPack = await retrieveContextPack();
	const recommendation = recommendNextOpenCodeTask(phaseStatus, contextPack);
	const emitted = await emitNesPacket({
		dryRun,
		phaseStatus,
		contextPack,
		recommendation,
	});
	const storage = await storeEngramPacket(emitted.packet, { dryRun });

	return {
		dryRun,
		scanner: phaseStatus,
		contextPack,
		recommendation,
		...emitted,
		storage,
		report: {
			cacheKey: emitted.packet.cache_key,
			phaseStatusExcerpt: emitted.packet.phase_status_excerpt,
			packetId: emitted.packet.packet_id,
			modelUsed: emitted.modelUsed,
			modelError: emitted.modelError,
			missingEnvVars: emitted.missingEnvVars,
			cacheBackend: storage.cacheBackend,
		},
	};
}
