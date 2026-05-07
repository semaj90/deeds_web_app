/**
 * CHR-ROM UI Pattern schema and generators
 * Tiny, ready-to-render UI blocks: text, svg, or component state
 */
import { ENV } from '$lib/server/env.server.js';

export type CHRPatternType = 'text' | 'svg' | 'state';

export interface CHRPatternBase {
	key: string;
	type: CHRPatternType;
	ttlMs?: number;
	createdAt: string;
	meta?: Record<string, any>;
}

export interface CHRTextPattern extends CHRPatternBase {
	type: 'text';
	payload: {
		text: string;
		style?: 'mono' | 'body' | 'small' | 'title';
	};
}

export interface CHRSVGPattern extends CHRPatternBase {
	type: 'svg';
	payload: {
		svg: string;
		viewBox?: string;
	};
}

export interface CHRStatePattern extends CHRPatternBase {
	type: 'state';
	payload: Record<string, unknown>;
}

export type CHRPattern = CHRTextPattern | CHRSVGPattern | CHRStatePattern;

export interface PrecomputeContext {
	userId?: string;
	sessionId?: string;
	caseId?: string;
	docId?: string;
	query?: string;
}

// Configuration
const ENHANCED_RAG_BASE = ENV.ENHANCED_RAG_URL;
const FRONTEND_BASE = ENV.FRONTEND_BASE_URL;
const PATTERN_CACHE_TTL_SECONDS = 120;

// Helpers
async function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
	const timeout = new Promise<never>((_, rej) =>
		setTimeout(() => rej(new Error('timeout')), ms)
	);
	return Promise.race([p, timeout]);
}

async function fetchJson(url: string, init?: RequestInit, ms = 8000) {
	try {
		const res = await withTimeout(fetch(url, init), ms);
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			return { ok: false, data: err, status: res.status };
		}
		const data = await res.json();
		return { ok: true, data, status: res.status };
	} catch (e) {
		return { ok: false, data: {
	error: String(e) },
	status: 0 };
	}
}

function hashKey(s: string): string {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = ((h * 31) + s.charCodeAt(i)) | 0;
	}
	return Math.abs(h).toString(16);
}

// Simple in-memory cache
const patternCache = new Map<string, { pattern: CHRPattern;
	expires: number }>();

async function readThrough(
	key: string,
	compute: () => Promise<CHRPattern | null>,
	ttl = PATTERN_CACHE_TTL_SECONDS
): Promise<CHRPattern | null> {
	const cached = patternCache.get(key);
	if (cached && cached.expires > Date.now()) {
		return cached.pattern;
	}

	const val = await compute();
	if (val) {
		patternCache.set(key, { pattern: val, expires: Date.now() + ttl * 1000 });
	}
	return val;
}

/**
 * Generate CHR patterns for precomputed UI blocks
 */
export async function generateCHRPatterns(ctx: PrecomputeContext): Promise<CHRPattern[]> {
	const now = new Date().toISOString();
	const out: CHRPattern[] = [];

	// Document-focused precompute
	if (ctx.docId) {
		const docKey = `doc:${ctx.docId}`;
		const summaryQuery = 'Summarize this legal document in 3 concise bullets.';

		try {
			const rag = await fetchJson(
				`${ENHANCED_RAG_BASE}/api/rag`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	query: summaryQuery,
						document_ids: [ctx.docId],
						max_results: 5,
						temperature: 0.2
					})
				},
	10000
			);

			if (rag.ok) {
				const answer = String(rag.data?.answer || rag.data?.response || '');
				const bullets = answer
					.split(/\n+/)
					.filter((l) => l.trim())
					.slice(0, 3);
				const summaryText = bullets.length
					? bullets.map((b) => (b.startsWith('- ') ? b : `- ${b}`)).join('\n')
					: answer.slice(0, 400);

				if (summaryText) {
					const patternKey = `${docKey}:summary`;
					const summaryPattern = await readThrough(`chr:${patternKey}`, async () => ({
						key: patternKey,
						type: 'text' as const,
						createdAt: now,
						ttlMs: 60000,
						meta: {
	precomputed: true, source: 'enhanced-rag' },
	payload: {
	text: summaryText, style: 'body' as const }
					}));
					if (summaryPattern) out.push(summaryPattern);
				}
			}
		} catch (error) {
			console.warn('CHR pattern generation failed for doc:', ctx.docId);
		}
	}

	// Query-focused precompute
	if (ctx.query) {
		const qKey = `query:${hashKey(ctx.query)}`;

		try {
			const rag = await fetchJson(
				`${ENHANCED_RAG_BASE}/api/rag`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	query: ctx.query,
						include_metadata: true
					})
				},
	10000
			);

			if (rag.ok) {
				const answer = String(rag.data?.answer || rag.data?.response || '');
				const snippet = answer.length > 320 ? `${answer.slice(0, 317)}…` : answer;

				if (snippet) {
					const patternKey = `${qKey}:answer`;
					const answerPattern = await readThrough(`chr:${patternKey}`, async () => ({
						key: patternKey,
						type: 'text' as const,
						createdAt: now,
						ttlMs: 45000,
						meta: {
	source: 'enhanced-rag' },
	payload: {
	text: snippet, style: 'body' as const }
					}));
					if (answerPattern) out.push(answerPattern);
				}
			}
		} catch (error) {
			console.warn('CHR pattern generation failed for query:', ctx.query);
		}
	}

	return out;
}

