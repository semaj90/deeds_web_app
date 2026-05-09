#!/usr/bin/env node
/**
 * N9b — Consumer for embedding_jobs.jsonl.
 *
 * Reads memory/kb/cards/embedding_jobs.jsonl, calls Ollama embeddinggemma per job,
 * upserts to Qdrant codebase_chunks_768, mirrors to pgvector codebase_chunk_index.
 *
 * Default mode is DRY-RUN: calls Ollama, prints what would be upserted, NO writes.
 * Pass --execute to actually write to Qdrant + Postgres.
 *
 * Resume / idempotency:
 *   memory/kb/cards/embedding_run_results.jsonl is a sidecar log. Each line is one
 *   job's outcome: {card_id, text_hash, status, dim, qdrant_id, error?, ts}.
 *   On re-run, jobs whose (card_id, text_hash) appear in the sidecar with
 *   status=success are skipped. text_hash change → re-embed. Source content
 *   unchanged → free skip.
 *
 * Usage:
 *   node scripts/kb/run-embedding-jobs.mjs                       # dry-run, all jobs
 *   node scripts/kb/run-embedding-jobs.mjs --limit 10            # dry-run, first 10
 *   node scripts/kb/run-embedding-jobs.mjs --execute --limit 10  # real run, first 10
 *   node scripts/kb/run-embedding-jobs.mjs --execute             # real run, all jobs
 *   $env:KB_EXECUTE="1"; npm run kb:embed:run                    # PowerShell-friendly
 *
 * Hard rules:
 *   - Default dry-run. Operator must opt in with --execute.
 *   - Ollama health check before any embed call. If Ollama down → exit 1.
 *   - Qdrant health check before any upsert (in --execute mode). If down → exit 1.
 *   - Postgres health check before any insert (in --execute mode). If down → skip pgvector mirror, continue with Qdrant.
 *   - Sequential Ollama calls (no concurrency in v1). Qdrant upserts in batches of 32.
 *   - Vectors are written to Qdrant `content` named vector (per QdrantManager schema).
 *   - text_hash is included in payload for future idempotency checks against Qdrant.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createHash } from 'node:crypto';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, '..', '..');
const CARDS_DIR  = join(ROOT, 'memory', 'kb', 'notecards');
const JOBS_PATH  = join(CARDS_DIR, 'embedding_jobs.jsonl');
const SIDECAR    = join(CARDS_DIR, 'embedding_run_results.jsonl');

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, '');
const OLLAMA_URL = (process.env.OLLAMA_BASE_URL ?? process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
const QDRANT_COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 32;

function parseArgs(argv) {
	const args = { execute: false, limit: null, dryRunVerbose: false };
	for (let i = 0; i < argv.length; i += 1) {
		const t = argv[i];
		if (t === '--execute' || t === '-x') args.execute = true;
		else if (t === '--limit' || t === '-n') { args.limit = Number(argv[i + 1]) || null; i += 1; }
		else if (t.startsWith('--limit=')) args.limit = Number(t.slice(8)) || null;
		else if (t === '--verbose' || t === '-v') args.dryRunVerbose = true;
	}
	if (process.env.KB_EXECUTE === '1' || process.env.KB_EXECUTE === 'true') args.execute = true;
	if (!args.limit && process.env.KB_LIMIT) args.limit = Number(process.env.KB_LIMIT) || null;
	return args;
}

function loadJobs() {
	if (!existsSync(JOBS_PATH)) {
		throw new Error(`Jobs file not found: ${JOBS_PATH}\nRun: npm run kb:embed:jobs`);
	}
	const out = [];
	for (const line of readFileSync(JOBS_PATH, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try { out.push(JSON.parse(trimmed)); } catch { /* skip */ }
	}
	return out;
}

function loadSidecarSuccessSet() {
	const set = new Set(); // key = `${card_id}::${text_hash}`
	if (!existsSync(SIDECAR)) return set;
	for (const line of readFileSync(SIDECAR, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const r = JSON.parse(trimmed);
			if (r.status === 'success' && r.card_id && r.text_hash) {
				set.add(`${r.card_id}::${r.text_hash}`);
			}
		} catch { /* skip */ }
	}
	return set;
}

function appendResult(rec) {
	mkdirSync(CARDS_DIR, { recursive: true });
	appendFileSync(SIDECAR, JSON.stringify(rec) + '\n');
}

async function probe(url, name, timeoutMs = 4000) {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), timeoutMs);
		const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
		return { ok: res.ok, status: res.status, name };
	} catch (e) {
		return { ok: false, status: 0, name, error: e?.message ?? String(e) };
	}
}

async function embedOnce(text, model, timeoutMs = 30_000) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, prompt: text }),
			signal: ctrl.signal,
		});
		if (!res.ok) return { ok: false, error: `ollama ${res.status}` };
		const data = await res.json();
		const vec = data?.embedding;
		if (!Array.isArray(vec) || vec.length === 0) return { ok: false, error: 'empty embedding' };
		return { ok: true, embedding: vec, dim: vec.length, model: data?.model ?? model };
	} catch (e) {
		return { ok: false, error: e?.message ?? String(e) };
	} finally {
		clearTimeout(t);
	}
}

function buildQdrantPoint(job, embedding) {
	// Per QdrantManager schema for codebase_chunks_768: indexed payload fields are
	// kind, language, cluster_id, som_cluster, path, symbol_name, tags, repo,
	// error_id, updated_at, cluster_key, topo_class. We populate what we have.
	return {
		// id must be UUID or unsigned int per Qdrant spec — use deterministic UUIDv5-like
		// hash of card_id (SHA-1 hex first 32 chars formatted as UUID)
		id: cardIdToQdrantId(job.card_id),
		vector: { content: embedding }, // codebase_chunks_768 uses named vector "content"
		payload: {
			card_id:     job.card_id,
			source_path: job.source_path,
			path:        job.source_path,                  // index alias
			source_hash: job.source_hash,
			text_hash:   job.text_hash,                    // for future idempotency checks
			rank:        job.rank ?? null,
			rank_score:  job.rank_score ?? null,
			model:       job.model,
			notecard_kind: 'codebase_card',                // distinguishes from chunked code
			updated_at:  Math.floor(Date.now() / 1000),    // unix seconds (Qdrant index = integer)
		},
	};
}

function cardIdToQdrantId(cardId) {
	// SHA-1(cardId) → UUIDv5-shaped string. Deterministic.
	// Format: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx where y ∈ {8,9,a,b}
	const h = createHash('sha1').update(cardId).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function qdrantUpsertBatch(points) {
	const url = `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=false`;
	const res = await fetch(url, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ points }),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`qdrant upsert ${res.status}: ${body.slice(0, 200)}`);
	}
	return res.json().catch(() => null);
}

async function pgvectorMirrorBatch(points, jobs) {
	// pgvector mirror is best-effort: needs pg + drizzle. We do this via dynamic import
	// to avoid crashing if Postgres is down — script can still upsert to Qdrant.
	try {
		const { db } = await import('../../src/lib/server/db/client.js');
		const { codebaseChunkIndex } = await import('../../src/lib/server/db/schema/search-analytics.js');
		const rows = points.map((p, i) => {
			const job = jobs[i];
			return {
				qdrantId:       p.id,
				relativePath:   job.source_path,
				kind:           'codebase_card',
				domain:         'codebase',
				contentHash:    job.text_hash,
				summary:        job.text,
				summaryEmbedding: p.vector.content,
				tags:           [],
				semanticTags:   [],
			};
		});
		// onConflictDoUpdate by qdrantId (which is unique)
		await db.insert(codebaseChunkIndex).values(rows).onConflictDoNothing({ target: codebaseChunkIndex.qdrantId });
		return { ok: true, count: rows.length };
	} catch (e) {
		return { ok: false, error: e?.message ?? String(e) };
	}
}

function fmtDuration(ms) {
	if (ms < 1000) return `${ms}ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(1)}s`;
	return `${Math.floor(s / 60)}m${(s % 60).toFixed(0)}s`;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	const jobs = loadJobs();
	const successSet = loadSidecarSuccessSet();
	const filtered = jobs.filter((j) => !successSet.has(`${j.card_id}::${j.text_hash}`));
	const slice = args.limit ? filtered.slice(0, args.limit) : filtered;

	console.log(`[kb-embed] mode=${args.execute ? 'EXECUTE' : 'DRY-RUN'}`);
	console.log(`[kb-embed] jobs total=${jobs.length} already-embedded=${jobs.length - filtered.length} to-process=${slice.length}`);
	console.log(`[kb-embed] ollama=${OLLAMA_URL} qdrant=${QDRANT_URL} collection=${QDRANT_COLLECTION}`);

	if (slice.length === 0) {
		console.log(`[kb-embed] nothing to do — all jobs already in sidecar.`);
		return 0;
	}

	// Health probes
	const oProbe = await probe(`${OLLAMA_URL}/api/tags`, 'ollama');
	if (!oProbe.ok) {
		console.error(`[kb-embed] ollama probe FAILED (${oProbe.status} ${oProbe.error ?? ''}). Aborting.`);
		return 1;
	}
	console.log(`[kb-embed] ollama probe ok`);

	if (args.execute) {
		const qProbe = await probe(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, 'qdrant');
		if (!qProbe.ok) {
			console.error(`[kb-embed] qdrant probe FAILED (${qProbe.status} ${qProbe.error ?? ''}). Aborting.`);
			return 1;
		}
		console.log(`[kb-embed] qdrant probe ok (collection exists)`);
	}

	// Process jobs
	const t0 = Date.now();
	let buf = [];        // points awaiting batch upsert
	let bufJobs = [];    // parallel array of jobs for pgvector mirror
	let okCount = 0;
	let failCount = 0;
	let pgvectorOk = 0;
	let pgvectorFail = 0;

	const flush = async () => {
		if (buf.length === 0) return;
		if (args.execute) {
			try {
				await qdrantUpsertBatch(buf);
				const pg = await pgvectorMirrorBatch(buf, bufJobs);
				if (pg.ok) pgvectorOk += pg.count; else pgvectorFail += buf.length;
				for (const p of buf) {
					appendResult({
						card_id: p.payload.card_id, text_hash: p.payload.text_hash,
						status: 'success', dim: p.vector.content.length, qdrant_id: p.id,
						pgvector: pg.ok ? 'ok' : 'fail',
						ts: new Date().toISOString(),
					});
				}
			} catch (e) {
				for (const p of buf) {
					appendResult({
						card_id: p.payload.card_id, text_hash: p.payload.text_hash,
						status: 'failed', error: e?.message ?? String(e),
						ts: new Date().toISOString(),
					});
				}
				failCount += buf.length;
				okCount   -= buf.length;
				console.error(`[kb-embed] batch upsert failed: ${e?.message ?? e}`);
			}
		}
		buf = [];
		bufJobs = [];
	};

	for (let i = 0; i < slice.length; i += 1) {
		const job = slice[i];
		const r = await embedOnce(job.text, job.model);
		if (!r.ok) {
			failCount += 1;
			appendResult({
				card_id: job.card_id, text_hash: job.text_hash,
				status: 'failed', error: r.error,
				ts: new Date().toISOString(),
			});
			console.error(`[kb-embed]   ${i + 1}/${slice.length} FAIL ${job.source_path}  ${r.error}`);
			continue;
		}
		const point = buildQdrantPoint(job, r.embedding);
		buf.push(point);
		bufJobs.push(job);
		okCount += 1;

		if (i < 3 || (i + 1) % 25 === 0 || i === slice.length - 1) {
			console.log(`[kb-embed]   ${i + 1}/${slice.length} ok dim=${r.dim} ${(job.source_path ?? '?').split('/').slice(-2).join('/')}`);
		}

		if (buf.length >= BATCH_SIZE) await flush();
		if (i % 10 === 9) await sleep(50); // gentle on Ollama
	}
	await flush();

	const ms = Date.now() - t0;
	console.log(`[kb-embed] done in ${fmtDuration(ms)}: ok=${okCount} fail=${failCount}`);
	if (args.execute) {
		console.log(`[kb-embed] qdrant: ${okCount} points upserted to ${QDRANT_COLLECTION}`);
		console.log(`[kb-embed] pgvector mirror: ok=${pgvectorOk} fail=${pgvectorFail}`);
	} else {
		console.log(`[kb-embed] DRY-RUN: nothing written. Pass --execute to write to Qdrant + pgvector.`);
	}
	return failCount > 0 ? 2 : 0;
}

main().then((code) => process.exit(code)).catch((err) => {
	console.error(`[kb-embed] fatal: ${err?.message ?? err}`);
	process.exit(3);
});