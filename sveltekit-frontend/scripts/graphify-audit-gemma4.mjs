#!/usr/bin/env node

/**
 * Graphify Audit + LangExtract Bridge (llama-server; Ornith 1.5 profile)
 *
 * File name kept for the existing npm entries (graphify:audit:gemma4 is a legacy alias).
 * This script PROPOSES advisory features. It never publishes to Redis, Kanban, RabbitMQ,
 * PostgreSQL, Qdrant or Neo4j, and nothing it writes is canonical.
 *
 * Extraction origins (every record carries one; none is a measured accuracy):
 *   LLM_ADVISORY  - bounded JSON from the served model, schema-validated      -> status PROPOSED
 *   REGEX_FIXTURE - regex plumbing check, no model                            -> FIXTURE_ONLY / DIAGNOSTIC_ONLY
 * A model failure is REJECTED (default, fail closed) or DIAGNOSTIC_ONLY when
 * GRAPHIFY_FALLBACK=diagnostic-only. A regex result is never reported as a pass.
 *
 * Environment:
 *   LLAMA_SERVER_URL          default http://127.0.0.1:8090
 *   GRAPHIFY_LLM_MODEL        model id sent in requests (default ornith-1.5-9b)
 *   GRAPHIFY_EXPECTED_MODEL   id that /v1/models must report (default = GRAPHIFY_LLM_MODEL)
 *   GRAPHIFY_LLM_ENABLED      'false' = regex fixture only (legacy alias: GEMMA4_ENABLED)
 *   GRAPHIFY_FALLBACK         'reject' (default) | 'diagnostic-only'
 *   DRY_RUN=true              write NO files (console summary only)
 *   LIMIT, VERBOSE
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dir, '..');
const tmpDir = path.join(projectRoot, '.tmp');

// ─── Configuration ───────────────────────────────────────────────────────

const LLAMA_SERVER_URL = (process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
const LLAMA_MODEL = process.env.GRAPHIFY_LLM_MODEL || process.env.LLAMA_MODEL || 'ornith-1.5-9b';
const EXPECTED_MODEL = process.env.GRAPHIFY_EXPECTED_MODEL || LLAMA_MODEL;
const LIMIT = parseInt(process.env.LIMIT || '50');
const DRY_RUN = process.env.DRY_RUN === 'true';
const LLM_ENABLED = (process.env.GRAPHIFY_LLM_ENABLED ?? process.env.GEMMA4_ENABLED) !== 'false';
const FALLBACK = process.env.GRAPHIFY_FALLBACK === 'diagnostic-only' ? 'diagnostic-only' : 'reject';
const VERBOSE = process.env.VERBOSE === 'true';
const SCHEMA_REVISION = 'graphify-audit-extraction.v2';
const MAX_EXCERPT_BYTES = 2048;

function writeOut(name, value) {
	if (DRY_RUN) {
		console.log(`  DRY_RUN: would write .tmp/${name}`);
		return;
	}
	if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
	fs.writeFileSync(path.join(tmpDir, name), JSON.stringify(value, null, 2));
}

// ─── Model readiness (llama-server, never Ollama /api/tags) ──────────────

async function checkModel() {
	try {
		const health = await fetch(`${LLAMA_SERVER_URL}/health`, { signal: AbortSignal.timeout(5000) });
		if (!health.ok) return { ok: false, served: [], error: `HEALTH_HTTP_${health.status}` };
		const res = await fetch(`${LLAMA_SERVER_URL}/v1/models`, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return { ok: false, served: [], error: `HTTP_${res.status}` };
		const body = await res.json();
		const served = (body.data ?? []).map((m) => m.id).filter(Boolean);
		if (!served.includes(EXPECTED_MODEL)) {
			return { ok: false, served, error: `MODEL_MISMATCH: expected "${EXPECTED_MODEL}", server reports [${served.join(', ')}]` };
		}
		return { ok: true, served, error: null };
	} catch (err) {
		return { ok: false, served: [], error: `LLAMA_SERVER_UNAVAILABLE: ${err.message}` };
	}
}

// ─── Model extraction (advisory, schema-validated, no silent fallback) ───

const LIST_KEYS = ['exports', 'functions', 'classes', 'imports', 'keywords'];

function validateFeatures(obj) {
	if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('SCHEMA_NOT_OBJECT');
	const out = {};
	for (const key of LIST_KEYS) {
		const v = obj[key] ?? [];
		if (!Array.isArray(v)) throw new Error(`SCHEMA_${key}_NOT_ARRAY`);
		out[key] = v.slice(0, 64).map((s) => {
			if (typeof s !== 'string' || s.length === 0 || s.length > 200) throw new Error(`SCHEMA_${key}_BAD_ITEM`);
			return s;
		});
	}
	return out;
}

async function extractViaModel(excerpt, rel) {
	const prompt = `You are a code analysis tool. Extract features from this source code excerpt (file: ${rel}).
Use only symbols that literally appear in the excerpt. Do not invent names.

Excerpt:
\`\`\`
${excerpt}
\`\`\`

Return only a JSON object with string arrays:
{"exports":[],"functions":[],"classes":[],"imports":[],"keywords":[]}`;

	const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: LLAMA_MODEL,
			messages: [{ role: 'user', content: prompt }],
			response_format: { type: 'json_object' },
			temperature: 0,
			max_tokens: 512,
			stream: false
		}),
		signal: AbortSignal.timeout(30_000)
	});
	if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
	const data = await response.json();
	const content = data.choices?.[0]?.message?.content || '';
	const jsonMatch = content.match(/\{[\s\S]*\}/);
	if (!jsonMatch) throw new Error('MODEL_NO_JSON');
	let parsed;
	try {
		parsed = JSON.parse(jsonMatch[0]);
	} catch {
		throw new Error('MODEL_INVALID_JSON');
	}
	return validateFeatures(parsed);
}

// ─── Regex fixture (plumbing check only; no confidence is claimed) ───────

function extractFixture(sourceCode, filePath) {
	const exports = [];
	const functions = [];
	const classes = [];
	const imports = [];
	const keywords = [];

	for (const match of sourceCode.matchAll(/export\s+(default\s+)?(async\s+)?(function|class|const|let|var)\s+(\w+)/g)) {
		if (match[4]) {
			if (match[3] === 'class') classes.push(match[4]);
			else if (match[3] === 'function') functions.push(match[4]);
			else exports.push(match[4]);
		}
	}
	for (const match of sourceCode.matchAll(/(?:async\s+)?function\s+(\w+)/g)) {
		if (match[1] && !functions.includes(match[1])) functions.push(match[1]);
	}
	for (const match of sourceCode.matchAll(/class\s+(\w+)/g)) {
		if (match[1] && !classes.includes(match[1])) classes.push(match[1]);
	}
	for (const match of sourceCode.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
		if (match[1] && !imports.includes(match[1])) imports.push(match[1]);
	}

	const keywordPatterns = {
		auth: /(auth|session|token|password|login|lucia)/i,
		data: /(database|query|db|drizzle|sql|postgres)/i,
		api: /(route|endpoint|server|handler|fetch|request|response)/i,
		ai: /(ornith|gemma|ollama|embeddings|qdrant|neural|model|inference)/i,
		gpu: /(cuda|gpu|tensor|torch|wasm|simd)/i
	};
	for (const [keyword, pattern] of Object.entries(keywordPatterns)) {
		if (pattern.test(sourceCode) || pattern.test(filePath)) keywords.push(keyword);
	}

	return {
		exports,
		functions: functions.slice(0, 20),
		classes: classes.slice(0, 20),
		imports: imports.slice(0, 20),
		keywords
	};
}

// ─── Per-file extraction (one model call per file, cached) ───────────────

const extractionCache = new Map();

async function extractOne(filePath, modelState) {
	if (extractionCache.has(filePath)) return extractionCache.get(filePath);
	const rel = path.relative(projectRoot, filePath);
	const record = { file: rel, sourceRevision: null, origin: null, status: null, features: null, error: null, canonicalAuthority: false };
	try {
		const bytes = fs.readFileSync(filePath);
		record.sourceRevision = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
		record.excerptTruncated = bytes.length > MAX_EXCERPT_BYTES;
		const excerpt = bytes.subarray(0, MAX_EXCERPT_BYTES).toString('utf8');
		const fixture = () => extractFixture(bytes.toString('utf8'), rel);

		if (!LLM_ENABLED) {
			Object.assign(record, { origin: 'REGEX_FIXTURE', status: 'FIXTURE_ONLY', features: fixture() });
		} else {
			let failure = modelState.ok ? null : modelState.error;
			if (!failure) {
				try {
					Object.assign(record, { origin: 'LLM_ADVISORY', status: 'PROPOSED', features: await extractViaModel(excerpt, rel), modelId: LLAMA_MODEL });
				} catch (err) {
					failure = err.message;
				}
			}
			if (failure) {
				if (VERBOSE) console.log(`  ${rel}: ${failure}`);
				if (FALLBACK === 'diagnostic-only') {
					Object.assign(record, { origin: 'REGEX_FIXTURE', status: 'DIAGNOSTIC_ONLY', features: fixture(), error: failure });
				} else {
					Object.assign(record, { origin: 'LLM_ADVISORY', status: 'REJECTED', error: failure });
				}
			}
		}
	} catch (err) {
		Object.assign(record, { status: 'REJECTED', error: `READ_FAILED: ${err.message}` });
	}
	extractionCache.set(filePath, record);
	return record;
}

// ─── File Discovery ─────────────────────────────────────────────────────

function discoverFiles(srcDir, maxFiles = LIMIT) {
	const files = [];
	const extensions = ['.ts', '.js', '.tsx', '.svelte'];

	function walk(dir) {
		try {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (files.length >= maxFiles) return;
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
					walk(fullPath);
				} else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
					files.push(fullPath);
				}
			}
		} catch (err) {
			if (VERBOSE) console.log(`Error reading ${dir}: ${err.message}`);
		}
	}

	walk(srcDir);
	return files.slice(0, maxFiles).sort();
}

// ─── Outputs (local receipts only; nothing is published) ─────────────────

const countBy = (records) => records.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
const featureCount = (f) => (f ? f.exports.length + f.functions.length + f.classes.length : 0);

function buildReceipts(files, records, modelState) {
	const stamp = new Date().toISOString();
	const base = { schemaRevision: SCHEMA_REVISION, canonicalAuthority: false, generatedAt: stamp };
	const manifest = {
		...base,
		config: { dryRun: DRY_RUN, llmEnabled: LLM_ENABLED, fallback: FALLBACK, limit: LIMIT, model: LLAMA_MODEL, expectedModel: EXPECTED_MODEL },
		model: { ok: modelState.ok, served: modelState.served, error: modelState.error },
		files: files.map((f) => path.relative(projectRoot, f)),
		fileCount: files.length
	};
	const results = records.map((r) => ({
		file: r.file,
		sourceRevision: r.sourceRevision,
		origin: r.origin,
		status: r.status,
		error: r.error,
		featureCount: featureCount(r.features),
		keywords: r.features?.keywords ?? [],
		canonicalAuthority: false
	}));
	const proposals = records
		.filter((r) => r.features && (r.status === 'PROPOSED' || r.status === 'DIAGNOSTIC_ONLY'))
		.map((r) => ({
			type: 'file-features-proposal',
			source: r.file,
			sourceRevision: r.sourceRevision,
			origin: r.origin,
			status: r.status,
			features: r.features.exports.concat(r.features.functions).slice(0, 10),
			keywords: r.features.keywords,
			redisWritten: false
		}));
	const totalFeatures = results.reduce((sum, r) => sum + r.featureCount, 0);
	const summary = {
		...base,
		statusCounts: countBy(records),
		featuresProposed: records.filter((r) => r.status === 'PROPOSED').reduce((s, r) => s + featureCount(r.features), 0),
		featuresAllOrigins: totalFeatures,
		kanbanWritten: false
	};
	return { manifest, results, proposals, summary };
}

// ─── Health ──────────────────────────────────────────────────────────────

const run = (cmd, args) =>
	new Promise((resolve) => execFile(cmd, args, { timeout: 3000 }, (err, stdout) => resolve({ err, stdout: String(stdout ?? '') })));

async function runHealthChecks(modelState) {
	const checks = {
		llama_server: { ok: modelState.ok, expectedModel: EXPECTED_MODEL, served: modelState.served, message: modelState.error ?? 'online' },
		redis: { ok: false, message: 'not checked' },
		qdrant: { ok: false, message: 'not checked' }
	};
	const ping = await run('redis-cli', ['ping']);
	checks.redis = ping.err ? { ok: false, message: ping.err.message.slice(0, 120) } : { ok: ping.stdout.includes('PONG'), message: ping.stdout.trim() };
	try {
		const res = await fetch('http://127.0.0.1:6333/collections', { signal: AbortSignal.timeout(3000) });
		checks.qdrant = { ok: res.ok, message: res.ok ? 'online' : `HTTP_${res.status}` };
	} catch (err) {
		checks.qdrant = { ok: false, message: err.message };
	}
	return checks;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
	console.log('[graphify-audit] Advisory feature proposals (no publication)');
	console.log(`  LLM: ${LLM_ENABLED ? `${LLAMA_MODEL} (expects "${EXPECTED_MODEL}")` : 'disabled (REGEX_FIXTURE only)'}`);
	console.log(`  Fallback: ${FALLBACK}   Limit: ${LIMIT}   Dry-run: ${DRY_RUN}`);

	const modelState = LLM_ENABLED ? await checkModel() : { ok: true, served: [], error: null };
	if (LLM_ENABLED && !modelState.ok && FALLBACK === 'reject') {
		console.error(`❌ Model not ready: ${modelState.error}`);
		console.error('   Fail closed: nothing scanned. Start the runtime via the VS Code task, or set GRAPHIFY_FALLBACK=diagnostic-only.');
		process.exit(1);
	}

	try {
		const files = discoverFiles(path.join(projectRoot, 'src'));
		console.log(`✓ Found ${files.length} files`);

		const records = [];
		for (const f of files) records.push(await extractOne(f, modelState));

		const { manifest, results, proposals, summary } = buildReceipts(files, records, modelState);
		writeOut('graphify-audit-manifest.json', manifest);
		writeOut('gan-validation-results.json', results);
		writeOut('ace-cache-search.json', proposals);
		writeOut('kanban-update.json', summary);
		writeOut('health-check-results.json', { schemaRevision: SCHEMA_REVISION, services: await runHealthChecks(modelState), timestamp: new Date().toISOString() });

		console.log();
		console.log('═══════════════════════════════════════════════════════════');
		console.log('✓ Graphify Audit finished (proposals only)');
		console.log(`  Status counts: ${JSON.stringify(summary.statusCounts)}`);
		console.log(`  Features proposed (LLM_ADVISORY): ${summary.featuresProposed}`);
		console.log('  Nothing was written to Redis, Kanban, RabbitMQ, Postgres, Qdrant or Neo4j.');
		console.log('═══════════════════════════════════════════════════════════');

		if (LLM_ENABLED && FALLBACK === 'reject' && (summary.statusCounts.REJECTED ?? 0) > 0) {
			console.error(`❌ ${summary.statusCounts.REJECTED} file(s) REJECTED (fail closed); exit 1`);
			process.exit(1);
		}
	} catch (err) {
		console.error('❌ Graphify Audit failed:', err);
		process.exit(1);
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
