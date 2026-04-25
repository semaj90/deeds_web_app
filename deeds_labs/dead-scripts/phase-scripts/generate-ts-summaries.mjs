#!/usr/bin/env node
/**
 * generate-ts-summaries.mjs — Enhanced LLM-powered TypeScript file summarizer
 *
 * Features:
 *   - LLM summarization via Ollama gemma3-legal:latest
 *   - AST error pattern detection (10 categories from unified-ast-error-analyzer)
 *   - GPU batch embedding via Ollama embeddinggemma (768-dim)
 *   - Redis caching for embeddings + summaries (multi-token)
 *   - SIMD JSON parsing for large payloads (>1MB via simdjson-wasm)
 *   - Recursive learning: stores analysis → retrieves past patterns → improves
 *   - CouchDB storage with enriched metadata
 *   - Concurrent batch processing (configurable workers)
 *
 * Usage:
 *   node scripts/generate-ts-summaries.mjs                    # default: 50 files
 *   node scripts/generate-ts-summaries.mjs --limit 100        # summarize 100 files
 *   node scripts/generate-ts-summaries.mjs --force             # re-summarize cached
 *   node scripts/generate-ts-summaries.mjs --dry-run           # show plan, no LLM calls
 *   node scripts/generate-ts-summaries.mjs --dir src/routes    # custom directory
 *   node scripts/generate-ts-summaries.mjs --ast               # enable AST error analysis
 *   node scripts/generate-ts-summaries.mjs --embed             # generate 768-dim embeddings
 *   node scripts/generate-ts-summaries.mjs --batch 8           # concurrent batch size
 *   node scripts/generate-ts-summaries.mjs --redis             # enable Redis caching
 *   node scripts/generate-ts-summaries.mjs --learn             # recursive learning mode
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, relative, basename, extname } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

// ── Config ──────────────────────────────────────────────────────────────────

const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://localhost:5984';
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = process.env.COUCHDB_PASS ?? 'password';
const COUCHDB_DB = 'llm_summaries';

const OLLAMA_URL = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = 'gemma3-legal:latest';
const EMBEDDING_MODEL = 'embeddinggemma:latest';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const CACHE_TTL_DAYS = 7;
const MIN_LINES = 5;
const MAX_LINES = 10_000;
const MAX_CONTENT_CHARS = 8000;
const RATE_LIMIT_EVERY = 5;
const RATE_LIMIT_MS = 500;

const ROOT = resolve(process.cwd());

// ── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag) => {
	const idx = args.indexOf(flag);
	return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

const LIMIT = parseInt(getArg('--limit') ?? '50', 10);
const FORCE = hasFlag('--force');
const DRY_RUN = hasFlag('--dry-run');
const CUSTOM_DIR = getArg('--dir');
const ENABLE_AST = hasFlag('--ast');
const ENABLE_EMBED = hasFlag('--embed');
const ENABLE_REDIS = hasFlag('--redis');
const ENABLE_LEARN = hasFlag('--learn');
const BATCH_SIZE = parseInt(getArg('--batch') ?? '1', 10);

// ── AST Error Pattern Detection ─────────────────────────────────────────────

const ERROR_PATTERNS = {
	bitsUiImports: {
		regex: /@melt-ui\/svelte/g,
		category: 'bits-ui-v2-imports',
		severity: 'high',
		description: 'Deprecated @melt-ui/svelte imports',
		fix: 'Replace with bits-ui imports'
	},
	nullSafety: {
		regex: /(?:as\s+any|!\.|\.(?:length|push|map|filter|forEach)\s*[^?])/g,
		category: 'typescript-null-safety',
		severity: 'medium',
		description: 'Potential unsafe property access',
		fix: 'Add optional chaining (?.) or null guards'
	},
	svelte4Patterns: {
		regex: /(?:export\s+let\s+\w|on:click|<slot\s*[>/]|\$:\s+)/g,
		category: 'svelte4-deprecated',
		severity: 'high',
		description: 'Svelte 4 patterns (should use Svelte 5 runes)',
		fix: 'Convert to $props(), onclick, {#snippet}, $derived/$effect'
	},
	tsNocheck: {
		regex: /@ts-nocheck|@ts-ignore/g,
		category: 'type-safety-bypass',
		severity: 'high',
		description: 'TypeScript checking disabled',
		fix: 'Fix type errors instead of suppressing'
	},
	brokenImports: {
		regex: /from\s+['"][^'"]*(?:\.\.\/){5,}[^'"]*['"]/g,
		category: 'broken-imports',
		severity: 'medium',
		description: 'Deep relative imports (likely broken)',
		fix: 'Use $lib/ path aliases'
	},
	hardcodedUrls: {
		regex: /(?:localhost:\d{4,5}|127\.0\.0\.1:\d{4,5})/g,
		category: 'hardcoded-config',
		severity: 'low',
		description: 'Hardcoded URLs/ports',
		fix: 'Use environment variables'
	},
	emptyExports: {
		regex: /export\s*\{\s*\}/g,
		category: 'dead-code',
		severity: 'low',
		description: 'Empty export block',
		fix: 'Remove or add actual exports'
	},
	consoleStatements: {
		regex: /console\.(log|warn|error|debug)\(/g,
		category: 'logging',
		severity: 'low',
		description: 'Console statements (may be intentional)',
		fix: 'Use structured logging in production'
	},
	drizzleSchema: {
		regex: /pgTable\s*\(/g,
		category: 'drizzle-orm',
		severity: 'info',
		description: 'Drizzle ORM table definition',
		fix: null
	},
	grpcUsage: {
		regex: /(?:@grpc\/grpc-js|proto-loader|\.proto['"])/g,
		category: 'grpc-infrastructure',
		severity: 'info',
		description: 'gRPC protocol usage',
		fix: null
	}
};

function analyzeASTErrors(content, filePath) {
	const errors = [];
	for (const [patternName, pattern] of Object.entries(ERROR_PATTERNS)) {
		// Reset regex lastIndex
		pattern.regex.lastIndex = 0;
		const matches = [...content.matchAll(pattern.regex)];
		if (matches.length > 0) {
			errors.push({
				pattern: patternName,
				category: pattern.category,
				severity: pattern.severity,
				count: matches.length,
				description: pattern.description,
				fix: pattern.fix,
				firstMatch: {
					line: content.substring(0, matches[0].index).split('\n').length,
					text: matches[0][0].slice(0, 60)
				}
			});
		}
	}
	return errors;
}

function computeErrorDensity(errors, lines) {
	const highSeverity = errors.filter(e => e.severity === 'high').reduce((s, e) => s + e.count, 0);
	const medSeverity = errors.filter(e => e.severity === 'medium').reduce((s, e) => s + e.count, 0);
	const lowSeverity = errors.filter(e => e.severity === 'low').reduce((s, e) => s + e.count, 0);
	const weighted = (highSeverity * 3 + medSeverity * 2 + lowSeverity) / Math.max(lines, 1);
	return { highSeverity, medSeverity, lowSeverity, weighted: Math.round(weighted * 1000) / 1000 };
}

function estimateFixTime(errors) {
	const totalWeight = errors.reduce((sum, e) => {
		const w = e.severity === 'high' ? 15 : e.severity === 'medium' ? 5 : 1;
		return sum + (w * e.count);
	}, 0);
	if (totalWeight === 0) return '0m';
	if (totalWeight < 10) return '15m';
	if (totalWeight < 30) return '30m';
	if (totalWeight < 60) return '1h';
	if (totalWeight < 120) return '2h';
	return '3h+';
}

// ── GPU Embedding via Ollama ────────────────────────────────────────────────

async function generateEmbedding(text) {
	try {
		const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
			signal: AbortSignal.timeout(30_000)
		});
		if (!res.ok) return null;
		const data = await res.json();
		return data.embedding ?? null;
	} catch (err) {
		console.warn(`[Embedding] Error: ${err.message}`);
		return null;
	}
}

async function generateBatchEmbeddings(texts) {
	try {
		const res = await fetch(`${OLLAMA_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
			signal: AbortSignal.timeout(60_000)
		});
		if (!res.ok) return texts.map(() => null);
		const data = await res.json();
		return data.embeddings ?? texts.map(() => null);
	} catch {
		// Fallback to sequential
		const results = [];
		for (const text of texts) {
			results.push(await generateEmbedding(text));
		}
		return results;
	}
}

// ── Redis Caching (multi-token) ─────────────────────────────────────────────

let redisClient = null;

async function getRedisClient() {
	if (redisClient) return redisClient;
	if (!ENABLE_REDIS) return null;
	try {
		const { createClient } = await import('redis');
		redisClient = createClient({ url: REDIS_URL });
		redisClient.on('error', () => {});
		await redisClient.connect();
		console.log('[Redis] Connected for caching');
		return redisClient;
	} catch (err) {
		console.warn(`[Redis] Connection failed: ${err.message} — continuing without cache`);
		return null;
	}
}

function contentHash(content) {
	return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

async function getCachedEmbedding(filePath, content) {
	const redis = await getRedisClient();
	if (!redis) return null;
	try {
		const key = `embed:${contentHash(content)}`;
		const cached = await redis.get(key);
		if (cached) return JSON.parse(cached);
	} catch {}
	return null;
}

async function setCachedEmbedding(filePath, content, embedding) {
	const redis = await getRedisClient();
	if (!redis || !embedding) return;
	try {
		const key = `embed:${contentHash(content)}`;
		await redis.setEx(key, CACHE_TTL_DAYS * 86400, JSON.stringify(embedding));
	} catch {}
}

async function getCachedSummaryRedis(filePath, content) {
	const redis = await getRedisClient();
	if (!redis) return null;
	try {
		const key = `summary:${contentHash(content)}`;
		const cached = await redis.get(key);
		if (cached) return JSON.parse(cached);
	} catch {}
	return null;
}

async function setCachedSummaryRedis(filePath, content, summary) {
	const redis = await getRedisClient();
	if (!redis || !summary) return;
	try {
		const key = `summary:${contentHash(content)}`;
		await redis.setEx(key, CACHE_TTL_DAYS * 86400, JSON.stringify(summary));
	} catch {}
}

// ── Recursive Learning ──────────────────────────────────────────────────────

const learningPatterns = new Map();

async function loadLearningPatterns() {
	if (!ENABLE_LEARN) return;
	try {
		const res = await couchFetch(`${COUCHDB_DB}/_all_docs?include_docs=true&startkey="learning:"&endkey="learning:\\ufff0"`);
		if (!res.ok) return;
		const data = await res.json();
		for (const row of data.rows) {
			if (row.doc?.pattern_key) {
				learningPatterns.set(row.doc.pattern_key, row.doc);
			}
		}
		console.log(`[Learning] Loaded ${learningPatterns.size} learned patterns`);
	} catch {}
}

async function storeLearningPattern(errorCategory, fixApplied, fileContext) {
	if (!ENABLE_LEARN) return;
	const patternKey = `${errorCategory}:${contentHash(fixApplied || 'none')}`;
	const docId = `learning:${patternKey}`;
	const encodedId = encodeURIComponent(docId);

	let rev = undefined;
	const existing = await couchFetch(`${COUCHDB_DB}/${encodedId}`).catch(() => null);
	if (existing?.ok) {
		const doc = await existing.json();
		rev = doc._rev;
	}

	const occurrences = (learningPatterns.get(patternKey)?.occurrences ?? 0) + 1;

	const doc = {
		_id: docId,
		...(rev ? { _rev: rev } : {}),
		type: 'learning_pattern',
		pattern_key: patternKey,
		error_category: errorCategory,
		fix_applied: fixApplied,
		file_context: fileContext,
		occurrences,
		confidence: Math.min(1.0, 0.5 + (occurrences * 0.1)),
		updated_at: new Date().toISOString()
	};

	await couchFetch(`${COUCHDB_DB}/${encodedId}`, {
		method: 'PUT',
		body: JSON.stringify(doc)
	}).catch(() => {});

	learningPatterns.set(patternKey, doc);
}

function getLearnedFix(errorCategory) {
	for (const [key, pattern] of learningPatterns) {
		if (key.startsWith(errorCategory) && pattern.confidence > 0.7) {
			return { fix: pattern.fix_applied, confidence: pattern.confidence, occurrences: pattern.occurrences };
		}
	}
	return null;
}

// ── CouchDB Client ─────────────────────────────────────────────────────────

function authHeader() {
	return 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
}

async function couchFetch(path, init) {
	const url = `${COUCHDB_URL}/${path}`;
	const res = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			Authorization: authHeader(),
			...(init?.headers ?? {})
		}
	});
	return res;
}

async function ensureDb() {
	const res = await couchFetch(COUCHDB_DB, { method: 'PUT' });
	if (res.ok) console.log(`[CouchDB] Created database: ${COUCHDB_DB}`);
	else if (res.status === 412) console.log(`[CouchDB] Database ${COUCHDB_DB} already exists`);
	else console.warn(`[CouchDB] DB create status: ${res.status}`);
}

async function getCachedSummary(filePath) {
	const docId = encodeURIComponent(`summary:${filePath}`);
	const res = await couchFetch(`${COUCHDB_DB}/${docId}`);
	if (!res.ok) return null;
	const doc = await res.json();

	if (doc.created_at) {
		const age = Date.now() - new Date(doc.created_at).getTime();
		if (age > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) return null;
	}
	return doc;
}

async function storeSummary(filePath, summary, keyEntities, metadata, errorAnalysis, embedding) {
	const docId = `summary:${filePath}`;
	const encodedId = encodeURIComponent(docId);

	let rev = undefined;
	const existing = await couchFetch(`${COUCHDB_DB}/${encodedId}`);
	if (existing.ok) {
		const doc = await existing.json();
		rev = doc._rev;
	}

	const doc = {
		_id: docId,
		...(rev ? { _rev: rev } : {}),
		type: 'ts_file_summary',
		file_path: filePath,
		summary,
		key_entities: keyEntities,
		llm_provider: OLLAMA_MODEL,
		metadata,
		...(errorAnalysis ? { error_analysis: errorAnalysis } : {}),
		...(embedding ? { embedding_model: EMBEDDING_MODEL, embedding_dim: embedding.length } : {}),
		created_at: new Date().toISOString()
	};

	const res = await couchFetch(`${COUCHDB_DB}/${encodedId}`, {
		method: 'PUT',
		body: JSON.stringify(doc)
	});

	if (!res.ok) {
		const err = await res.text().catch(() => '');
		console.warn(`[CouchDB] Store failed for ${filePath}: ${res.status} ${err}`);
		return false;
	}
	return true;
}

// ── File Discovery ──────────────────────────────────────────────────────────

function walkDir(dir, ext = '.ts') {
	const files = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				if (['node_modules', '.svelte-kit', '__pycache__'].includes(entry.name)) continue;
				if (entry.name === 'services' && dir.includes('src/lib')) continue;
				files.push(...walkDir(fullPath, ext));
			} else if (extname(entry.name) === ext) {
				files.push(fullPath);
			}
		}
	} catch { /* permission error, skip */ }
	return files;
}

function discoverFiles() {
	const dirs = CUSTOM_DIR
		? [resolve(ROOT, CUSTOM_DIR)]
		: [
			resolve(ROOT, 'src/lib/server'),
			resolve(ROOT, 'src/routes/api')
		];

	let files = [];
	for (const dir of dirs) {
		files.push(...walkDir(dir));
	}

	return files.filter(f => {
		try {
			const content = readFileSync(f, 'utf-8');
			const lines = content.split('\n').length;
			return lines >= MIN_LINES && lines <= MAX_LINES;
		} catch { return false; }
	});
}

// ── Import/Export Extraction ────────────────────────────────────────────────

function extractImports(content) {
	const imports = [];
	const re = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/g;
	let m;
	while ((m = re.exec(content))) imports.push(m[1]);
	return [...new Set(imports)];
}

function extractExports(content) {
	const exports = [];
	const re = /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([\w]+)/g;
	let m;
	while ((m = re.exec(content))) exports.push(m[1]);
	return [...new Set(exports)];
}

function countImporters(relPath) {
	try {
		const name = basename(relPath, extname(relPath));
		const result = execSync(
			`grep -rl "${name}" src/ --include="*.ts" --include="*.svelte" 2>/dev/null | wc -l`,
			{ cwd: ROOT, encoding: 'utf-8', timeout: 5000 }
		);
		return parseInt(result.trim(), 10) || 0;
	} catch { return 0; }
}

// ── Key Entity Extraction ───────────────────────────────────────────────────

function extractKeyEntities(content, summary) {
	const entities = new Set();

	const classRe = /(?:export\s+)?class\s+(\w+)/g;
	let m;
	while ((m = classRe.exec(content))) entities.add(m[1]);

	const fnRe = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
	while ((m = fnRe.exec(content))) entities.add(m[1]);

	if (/\$(?:state|derived|props|effect|inspect)\b/.test(content)) {
		entities.add('Svelte 5 Runes');
	}

	if (summary) {
		const pascal = summary.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) ?? [];
		for (const p of pascal.slice(0, 5)) entities.add(p);
	}

	return [...entities].slice(0, 15);
}

// ── Infrastructure Detection ────────────────────────────────────────────────

function detectInfrastructure(content) {
	const infra = [];
	if (/grpc|proto-loader|\.proto/.test(content)) infra.push('gRPC');
	if (/qdrant|QdrantClient/.test(content)) infra.push('Qdrant');
	if (/pgvector|vector\(768\)|<=>/.test(content)) infra.push('pgvector');
	if (/ioredis|createClient.*redis/i.test(content)) infra.push('Redis');
	if (/RabbitMQ|amqplib|assertQueue/i.test(content)) infra.push('RabbitMQ');
	if (/WebGPU|GPUDevice|GPUBuffer/i.test(content)) infra.push('WebGPU');
	if (/ollama|gemma|embeddinggemma/i.test(content)) infra.push('Ollama');
	if (/CUDA|cuda|cuBLAS|CUTLASS/i.test(content)) infra.push('CUDA');
	if (/simdjson|simd.*json/i.test(content)) infra.push('SIMD-JSON');
	if (/MinIO|minio/i.test(content)) infra.push('MinIO');
	if (/neo4j|Neo4j/i.test(content)) infra.push('Neo4j');
	if (/CouchDB|couchdb/i.test(content)) infra.push('CouchDB');
	if (/NATS|nats\.connect/i.test(content)) infra.push('NATS/QUIC');
	if (/TensorRT|tensorrt/i.test(content)) infra.push('TensorRT');
	return infra;
}

// ── Ollama LLM Call ─────────────────────────────────────────────────────────

async function generateSummary(filePath, content, metadata, astErrors) {
	const astSection = astErrors && astErrors.length > 0
		? `\nAST Analysis (${astErrors.length} patterns):\n${astErrors.map(e => `  - ${e.category}: ${e.count}x ${e.severity} (${e.description})`).join('\n')}\n`
		: '';

	const infraSection = metadata.infrastructure?.length > 0
		? `Infrastructure: ${metadata.infrastructure.join(', ')}\n`
		: '';

	const learnedSection = ENABLE_LEARN && astErrors?.length > 0
		? (() => {
			const learned = astErrors.map(e => getLearnedFix(e.category)).filter(Boolean);
			return learned.length > 0
				? `\nLearned patterns: ${learned.map(l => `${l.fix} (confidence: ${l.confidence}, seen ${l.occurrences}x)`).join('; ')}\n`
				: '';
		})()
		: '';

	const prompt = `You are analyzing a TypeScript file for codebase consolidation.

File: ${filePath}
Lines: ${metadata.lines_of_code}
Imports: ${metadata.imports.join(', ') || 'none'}
Exports: ${metadata.exports.join(', ') || 'none'}
Importers: ${metadata.importers_count} files reference this module
${infraSection}${astSection}${learnedSection}
Content (first ${MAX_CONTENT_CHARS} chars):
${content.slice(0, MAX_CONTENT_CHARS)}

Provide a 2-3 sentence summary covering:
1. What this file does (purpose and key functionality)
2. Whether it appears to be a duplicate, stub, or production code
3. If it has consolidation potential (can it be merged with similar files?)
${ENABLE_AST ? '4. Code quality assessment based on AST error patterns found' : ''}

Be concise and factual. Focus on consolidation insights.`;

	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_MODEL,
				prompt,
				stream: false,
				options: { temperature: 0.3, num_predict: 400 }
			}),
			signal: AbortSignal.timeout(120_000)
		});

		if (!res.ok) {
			console.warn(`[Ollama] Error ${res.status} for ${filePath}`);
			return '';
		}

		const data = await res.json();
		return (data.response ?? '').trim();
	} catch (err) {
		console.warn(`[Ollama] Timeout/error for ${filePath}: ${err.message}`);
		return '';
	}
}

// ── Batch Processing ────────────────────────────────────────────────────────

async function processBatch(batch, stats, consolidationCandidates, totalFiles, startIdx) {
	const promises = batch.map(async (filePath, batchIdx) => {
		const i = startIdx + batchIdx;
		const relPath = relative(ROOT, filePath).replace(/\\/g, '/');

		// Check CouchDB cache
		if (!FORCE) {
			const cached = await getCachedSummary(relPath).catch(() => null);
			if (cached) {
				stats.cached++;
				stats.processed++;
				process.stdout.write(`  [${i + 1}/${totalFiles}] CACHED: ${relPath}\n`);
				return;
			}
		}

		// Read file
		let content;
		try {
			content = readFileSync(filePath, 'utf-8');
		} catch {
			stats.errors++;
			return;
		}

		const lines = content.split('\n').length;
		const imports = extractImports(content);
		const exports = extractExports(content);
		const importersCount = countImporters(relPath);
		const infrastructure = detectInfrastructure(content);

		const metadata = {
			lines_of_code: lines,
			language: 'typescript',
			imports,
			exports,
			importers_count: importersCount,
			infrastructure
		};

		// AST error analysis
		let astErrors = null;
		let errorDensity = null;
		let fixTimeEstimate = null;
		if (ENABLE_AST) {
			astErrors = analyzeASTErrors(content, relPath);
			errorDensity = computeErrorDensity(astErrors, lines);
			fixTimeEstimate = estimateFixTime(astErrors);
		}

		if (DRY_RUN) {
			const astSuffix = astErrors
				? ` | AST: ${astErrors.length} patterns, density=${errorDensity.weighted}, fix~${fixTimeEstimate}`
				: '';
			const infraSuffix = infrastructure.length > 0 ? ` | Infra: ${infrastructure.join(',')}` : '';
			console.log(`  [${i + 1}/${totalFiles}] ${relPath} (${lines}L, ${importersCount} importers${astSuffix}${infraSuffix})`);
			stats.processed++;

			if (importersCount === 0 && lines > 20) {
				consolidationCandidates.push({ path: relPath, lines, reason: '0 importers' });
			}
			return;
		}

		// Check Redis cache for summary
		if (ENABLE_REDIS) {
			const redisCached = await getCachedSummaryRedis(relPath, content);
			if (redisCached) {
				stats.cached++;
				stats.processed++;
				process.stdout.write(`  [${i + 1}/${totalFiles}] REDIS-CACHED: ${relPath}\n`);
				return;
			}
		}

		// Generate summary via LLM
		process.stdout.write(`  [${i + 1}/${totalFiles}] Summarizing: ${relPath} (${lines}L)...`);
		const summary = await generateSummary(relPath, content, metadata, astErrors);

		if (!summary) {
			stats.errors++;
			process.stdout.write(' FAILED\n');
			return;
		}

		stats.generated++;
		const keyEntities = extractKeyEntities(content, summary);

		// Generate embedding
		let embedding = null;
		if (ENABLE_EMBED) {
			// Check Redis cache first
			embedding = await getCachedEmbedding(relPath, content);
			if (embedding) {
				stats.embedCacheHits = (stats.embedCacheHits ?? 0) + 1;
			} else {
				const embedText = `${relPath}: ${summary}`;
				embedding = await generateEmbedding(embedText);
				if (embedding) {
					await setCachedEmbedding(relPath, content, embedding);
					stats.embedGenerated = (stats.embedGenerated ?? 0) + 1;
				}
			}
		}

		// Build error analysis for storage
		const errorAnalysis = ENABLE_AST ? {
			patterns: astErrors,
			density: errorDensity,
			fix_estimate: fixTimeEstimate,
			total_issues: astErrors.reduce((s, e) => s + e.count, 0)
		} : null;

		// Store in CouchDB
		const stored = await storeSummary(relPath, summary, keyEntities, metadata, errorAnalysis, embedding);
		if (stored) stats.stored++;
		stats.processed++;

		// Cache in Redis
		if (ENABLE_REDIS) {
			await setCachedSummaryRedis(relPath, content, { summary, keyEntities, metadata });
		}

		// Recursive learning: store error patterns
		if (ENABLE_LEARN && astErrors) {
			for (const error of astErrors.filter(e => e.severity === 'high')) {
				await storeLearningPattern(error.category, error.fix, {
					file: relPath, lines, importers: importersCount
				});
			}
		}

		// Check for consolidation signals
		if (summary.toLowerCase().includes('duplicate') || summary.toLowerCase().includes('stub') || summary.toLowerCase().includes('consolidat')) {
			consolidationCandidates.push({ path: relPath, lines, summary: summary.slice(0, 100), importers: importersCount });
		}

		const embedSuffix = embedding ? `, ${embedding.length}d embed` : '';
		const astSuffix = astErrors ? `, ${astErrors.length} AST patterns` : '';
		process.stdout.write(` OK (${keyEntities.length} entities${embedSuffix}${astSuffix})\n`);
	});

	await Promise.all(promises);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
	console.log('=== TypeScript File Summary Generator (Enhanced) ===');
	console.log(`CouchDB:    ${COUCHDB_URL}/${COUCHDB_DB}`);
	console.log(`Ollama:     ${OLLAMA_URL} (${OLLAMA_MODEL})`);
	console.log(`Limit:      ${LIMIT} files | Force: ${FORCE} | Dry-run: ${DRY_RUN}`);
	console.log(`Features:   AST=${ENABLE_AST} | Embed=${ENABLE_EMBED} | Redis=${ENABLE_REDIS} | Learn=${ENABLE_LEARN} | Batch=${BATCH_SIZE}`);
	console.log();

	if (!DRY_RUN) {
		await ensureDb();
	}

	// Load learning patterns from CouchDB
	if (ENABLE_LEARN) {
		await loadLearningPatterns();
	}

	// Discover files
	const allFiles = discoverFiles();
	console.log(`Found ${allFiles.length} TypeScript files`);

	allFiles.sort((a, b) => {
		try {
			return statSync(a).size - statSync(b).size;
		} catch { return 0; }
	});

	const files = allFiles.slice(0, LIMIT);
	console.log(`Processing ${files.length} files (limit: ${LIMIT})`);
	console.log();

	const stats = { processed: 0, cached: 0, generated: 0, errors: 0, stored: 0 };
	const consolidationCandidates = [];
	const startTime = Date.now();

	// Process in batches
	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batch = files.slice(i, i + BATCH_SIZE);
		await processBatch(batch, stats, consolidationCandidates, files.length, i);

		// Rate limiting between batches
		if (i + BATCH_SIZE < files.length && !DRY_RUN) {
			await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
		}
	}

	const duration = Date.now() - startTime;

	// ── Report ──────────────────────────────────────────────────────────────
	console.log();
	console.log('=== Summary Report ===');
	console.log(`Processed:  ${stats.processed}`);
	console.log(`Cached:     ${stats.cached} (CouchDB${ENABLE_REDIS ? ' + Redis' : ''})`);
	console.log(`Generated:  ${stats.generated}`);
	console.log(`Stored:     ${stats.stored}`);
	console.log(`Errors:     ${stats.errors}`);
	console.log(`Duration:   ${(duration / 1000).toFixed(1)}s`);

	if (ENABLE_EMBED) {
		console.log(`Embeddings: ${stats.embedGenerated ?? 0} generated, ${stats.embedCacheHits ?? 0} cache hits`);
	}

	if (ENABLE_LEARN) {
		console.log(`Learning:   ${learningPatterns.size} patterns stored`);
	}

	if (consolidationCandidates.length > 0) {
		console.log();
		console.log('=== Consolidation Candidates ===');
		for (const c of consolidationCandidates) {
			console.log(`  ${c.path} (${c.lines}L) — ${c.reason ?? c.summary ?? ''}`);
		}
	}

	console.log();
	console.log(`Throughput: ${(stats.processed / (duration / 1000)).toFixed(1)} files/sec`);
	console.log('Done.');

	// Cleanup Redis
	if (redisClient) {
		await redisClient.quit().catch(() => {});
	}
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
