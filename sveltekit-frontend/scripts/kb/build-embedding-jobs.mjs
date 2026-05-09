#!/usr/bin/env node
/**
 * N9a — Build embedding_jobs.jsonl from notecard corpus.
 *
 * Reads memory/kb/cards/codebase_graph_cards.jsonl + .rank.json, emits a
 * deterministic work queue at memory/kb/cards/embedding_jobs.jsonl that a
 * future N9b script (Qdrant upsert / pgvector mirror) will consume.
 *
 * IMPORTANT — what this does NOT do:
 *   - Does NOT call Ollama, Qdrant, Postgres, or any embedding endpoint.
 *   - Does NOT mutate cards.jsonl, rank.json, or any Redis key.
 *   - Does NOT trigger network I/O.
 *
 * Local-only emitter. Idempotent: same input → identical bytes (no timestamps).
 *
 * Usage:
 *   node scripts/kb/build-embedding-jobs.mjs                  # all cards (sorted by rank)
 *   node scripts/kb/build-embedding-jobs.mjs --top 200        # rank-filtered top-N
 *   node scripts/kb/build-embedding-jobs.mjs --tag-filter llm,evidence  # tag filter
 *   $env:KB_TOP=200; npm run kb:embed:jobs
 *
 * Output schema (one JSON object per line):
 *   {
 *     "job_id":       "embed:codebase:<source_id>:<card_hash>",   // deterministic, sortable
 *     "card_id":      "card:codebase:<source_id>:<hash>",
 *     "source_path":  "src/lib/ai/client-cache.ts",
 *     "source_hash":  "08f51a78",
 *     "rank":         42,                                          // 1-indexed; null if not in rank file
 *     "rank_score":   0.1779,                                      // null if not in rank file
 *     "model":        "embeddinggemma:latest",                     // target model (placeholder)
 *     "dim":          768,                                         // target dimension
 *     "text":         "<context_text — what gets embedded>",
 *     "text_hash":    "<sha1 of text, first 12 chars>"             // idempotency key for N9b
 *   }
 *
 * Why text_hash? When N9b runs, it can skip jobs whose text_hash already exists
 * in Qdrant payload, avoiding re-embedding unchanged cards.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, '..', '..');
const CARDS_DIR  = join(ROOT, 'memory', 'kb', 'notecards');
const CARDS_PATH = join(CARDS_DIR, 'graph_file_cards.jsonl');
const RANK_PATH  = join(CARDS_DIR, 'graph_file_cards.rank.json');
const OUT_PATH   = join(CARDS_DIR, 'embedding_jobs.jsonl');

// Defaults — caller can override via flag or env var.
const DEFAULT_MODEL = 'embeddinggemma:latest';
const DEFAULT_DIM   = 768;

function parseArgs(argv) {
	const args = { top: null, tagFilter: null, model: DEFAULT_MODEL, dim: DEFAULT_DIM };
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === '--top') {
			args.top = Number(argv[i + 1]) || null;
			i += 1;
			continue;
		}
		if (token.startsWith('--top=')) {
			args.top = Number(token.slice('--top='.length)) || null;
			continue;
		}
		if (token === '--tag-filter') {
			args.tagFilter = argv[i + 1] ?? null;
			i += 1;
			continue;
		}
		if (token.startsWith('--tag-filter=')) {
			args.tagFilter = token.slice('--tag-filter='.length);
			continue;
		}
		if (token === '--model') {
			args.model = argv[i + 1] ?? DEFAULT_MODEL;
			i += 1;
			continue;
		}
		if (token.startsWith('--model=')) {
			args.model = token.slice('--model='.length) || DEFAULT_MODEL;
		}
	}
	// Env-var overrides for PowerShell ergonomics (same pattern as KB_GRAPH_JSONL_INPUT).
	if (args.top == null && process.env.KB_TOP) args.top = Number(process.env.KB_TOP) || null;
	if (!args.tagFilter && process.env.KB_TAG_FILTER) args.tagFilter = process.env.KB_TAG_FILTER;
	if (process.env.KB_EMBED_MODEL) args.model = process.env.KB_EMBED_MODEL;
	return args;
}

function loadCards() {
	if (!existsSync(CARDS_PATH)) {
		throw new Error(`Cards not found: ${CARDS_PATH}\nRun: npm run kb:graph-cards`);
	}
	const out = [];
	for (const line of readFileSync(CARDS_PATH, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try { out.push(JSON.parse(trimmed)); } catch { /* skip malformed */ }
	}
	return out;
}

function loadRankIndex() {
	// Returns Map<card_id, { rank: number, rank_score: number }> or null if rank file missing.
	if (!existsSync(RANK_PATH)) return null;
	try {
		const payload = JSON.parse(readFileSync(RANK_PATH, 'utf8'));
		const map = new Map();
		const rows = Array.isArray(payload?.ranked_cards) ? payload.ranked_cards : [];
		rows.forEach((row, idx) => {
			if (typeof row?.card_id === 'string') {
				map.set(row.card_id, { rank: idx + 1, rank_score: Number(row.rank_score ?? 0) });
			}
		});
		return map;
	} catch {
		return null;
	}
}

function textHash(text) {
	return createHash('sha1').update(text || '').digest('hex').slice(0, 12);
}

function buildJob(card, model, dim, rankInfo) {
	const text = (card.context_text ?? '').toString();
	return {
		job_id:      `embed:codebase:${card.source_id}:${card.source_hash}`,
		card_id:     card.card_id,
		source_path: card.source_path ?? null,
		source_hash: card.source_hash,
		rank:        rankInfo?.rank ?? null,
		rank_score:  rankInfo?.rank_score ?? null,
		model,
		dim,
		text,
		text_hash:   textHash(text),
	};
}

function main() {
	const args     = parseArgs(process.argv.slice(2));
	const cards    = loadCards();
	const rankMap  = loadRankIndex();
	const tagSet   = args.tagFilter
		? new Set(args.tagFilter.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
		: null;

	mkdirSync(CARDS_DIR, { recursive: true });

	// Build all candidate jobs.
	let jobs = cards.map((card) => buildJob(card, args.model, args.dim, rankMap?.get(card.card_id)));

	// Tag filter (intersection): keep card if any of its tags ∈ tagSet.
	if (tagSet && tagSet.size > 0) {
		jobs = jobs.filter((job) => {
			const card = cards.find((c) => c.card_id === job.card_id);
			const tags = Array.isArray(card?.tags) ? card.tags.map((t) => String(t).toLowerCase()) : [];
			return tags.some((t) => tagSet.has(t));
		});
	}

	// Sort by rank ASC (best first), null ranks last by source_path for stability.
	jobs.sort((a, b) => {
		if (a.rank == null && b.rank == null) return (a.source_path ?? '').localeCompare(b.source_path ?? '');
		if (a.rank == null) return 1;
		if (b.rank == null) return -1;
		return a.rank - b.rank;
	});

	// Top-N filter (after sort, so we keep the highest-rank cards).
	const totalBeforeTop = jobs.length;
	if (args.top && args.top > 0) jobs = jobs.slice(0, args.top);

	// Write JSONL — newline-terminated, no trailing whitespace, no timestamp metadata.
	const body = jobs.map((j) => JSON.stringify(j)).join('\n');
	writeFileSync(OUT_PATH, body + (jobs.length ? '\n' : ''));

	// Console summary (not part of the file; safe to vary).
	console.log(`[kb-jobs] cards=${cards.length} ranked=${rankMap?.size ?? 0}`);
	if (tagSet) console.log(`[kb-jobs] tag-filter=${[...tagSet].join(',')} (kept ${totalBeforeTop} after tags)`);
	if (args.top) console.log(`[kb-jobs] top=${args.top} (truncated from ${totalBeforeTop})`);
	console.log(`[kb-jobs] emitted=${jobs.length} jobs → ${OUT_PATH}`);
	console.log(`[kb-jobs] model=${args.model} dim=${args.dim}`);

	const previewN = Math.min(5, jobs.length);
	if (previewN > 0) {
		console.log(`[kb-jobs] top-${previewN} preview:`);
		for (let i = 0; i < previewN; i += 1) {
			const j = jobs[i];
			const path = (j.source_path ?? '?').split('/').slice(-2).join('/');
			console.log(`[kb-jobs]   ${String(i + 1).padStart(2, ' ')}. rank=${j.rank ?? '-'} score=${j.rank_score?.toFixed(4) ?? '-'}  ${path}  text_hash=${j.text_hash}`);
		}
	}
}

try {
	main();
} catch (error) {
	console.error(`[kb-jobs] ${error.message}`);
	process.exit(1);
}
