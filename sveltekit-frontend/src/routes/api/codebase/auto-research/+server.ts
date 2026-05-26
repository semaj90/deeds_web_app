/**
 * POST /api/codebase/auto-research — Karpathy Pattern for Codebase Understanding
 *
 * Applies the Karpathy LLM Wiki auto-research pattern to the codebase:
 * When a codebase query returns low-confidence results (< threshold),
 * automatically re-indexes the relevant code region with deeper analysis.
 *
 * Pipeline:
 *   1. Query codebase_chunks_768 for the topic
 *   2. If top score < threshold → trigger deeper indexing
 *   3. Use LLM to generate structured documentation (purpose, API, dependencies)
 *   4. Chunk → embed → upsert to codebase_chunks_768 with enriched metadata
 *   5. Return the enriched analysis
 *
 * Body: {
 *   query: string,           — what to understand (e.g. "how does auth work")
 *   scope?: string,          — directory scope (e.g. "src/lib/server/auth")
 *   threshold?: number,      — backfill score threshold (default 0.45)
 *   maxFiles?: number,       — max files to analyze (default 10)
 *   generateWiki?: boolean   — generate LLM wiki summary (default true)
 * }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

const researchSchema = z.object({
	query: z.string().trim().min(1, 'Query required').max(2000),
	scope: z.string().max(500).optional(),
	threshold: z.number().min(0.1).max(0.9).optional().default(0.45),
	maxFiles: z.number().int().min(1).max(30).optional().default(10),
	generateWiki: z.boolean().optional().default(true),
});

const COLLECTION = 'codebase_chunks_768';
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const LLM_MODEL = 'gemma4-rotorquant:latest';
const ROOT = resolve(process.cwd());

// Cooldown: don't re-research the same query within 15 minutes
const cooldownMap = new Map<string, number>();
const COOLDOWN_MS = 15 * 60_000;

function getCooldownKey(query: string): string {
	return createHash('md5').update(query.toLowerCase().trim()).digest('hex');
}

/** Embed text via Ollama */
async function embed(text: string): Promise<number[] | null> {
	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return null;
		const data = await res.json();
		return data.embeddings?.[0] ?? null;
	} catch {
		return null;
	}
}

/** Search Qdrant codebase_chunks_768 */
async function searchCodebase(
	queryVector: number[],
	limit: number,
	filter?: Record<string, unknown>
): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
	try {
		const body: Record<string, unknown> = {
			vector: { name: 'content', vector: queryVector },
			limit,
			with_payload: true,
			score_threshold: 0.2,
		};
		if (filter) body.filter = filter;

		const res = await fetch(`${ENV.QDRANT_URL}/collections/${COLLECTION}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return [];
		const data = await res.json();
		return (data.result ?? []).map((r: Record<string, unknown>) => ({
			id: String(r.id),
			score: Number(r.score ?? 0),
			payload: (r.payload as Record<string, unknown>) ?? {},
		}));
	} catch {
		return [];
	}
}

/** Read a file and generate LLM wiki entry */
async function generateWikiEntry(
	filePath: string,
	query: string
): Promise<{ summary: string; purpose: string; api: string[]; dependencies: string[] } | null> {
	try {
		const absPath = resolve(ROOT, filePath);
		const content = await readFile(absPath, 'utf-8').catch(() => null);
		if (!content || content.length < 50) return null;

		const truncated = content.slice(0, 6000);
		const prompt = `You are a codebase documentation assistant. Analyze this source file and generate structured documentation relevant to: "${query}"

File: ${filePath}

\`\`\`
${truncated}
\`\`\`

Respond with JSON only:
{
  "summary": "2-3 sentence description of what this file does",
  "purpose": "why this file exists in the architecture",
  "api": ["list", "of", "exported", "functions/classes"],
  "dependencies": ["key", "imports", "this", "file", "uses"]
}`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: LLM_MODEL,
				prompt,
				stream: false,
				format: 'json',
				options: { temperature: 0.1 },
			}),
			signal: AbortSignal.timeout(60_000),
		});

		if (!res.ok) return null;
		const data = await res.json();
		return JSON.parse(data.response ?? '{}');
	} catch {
		return null;
	}
}

/** Build a deterministic Qdrant point ID */
function buildPointId(path: string, chunkIndex: number): string {
	const hex = createHash('sha1').update(`codebase-wiki:${path}#${chunkIndex}`).digest('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Upsert enriched wiki chunks to Qdrant */
async function upsertWikiChunk(
	pointId: string,
	vector: number[],
	payload: Record<string, unknown>
): Promise<boolean> {
	try {
		const res = await fetch(`${ENV.QDRANT_URL}/collections/${COLLECTION}/points`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				points: [{ id: pointId, vector: { content: vector }, payload }],
			}),
			signal: AbortSignal.timeout(10_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const parsed = researchSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { query, scope, threshold, maxFiles, generateWiki } = parsed.data;
	const start = performance.now();

	// Cooldown check
	const cooldownKey = getCooldownKey(query);
	const lastRun = cooldownMap.get(cooldownKey);
	if (lastRun && Date.now() - lastRun < COOLDOWN_MS) {
		return json({
			success: false,
			skipped: true,
			reason: 'cooldown',
			durationMs: 0,
		});
	}

	try {
		// 1. Embed query
		const queryVector = await embed(query);
		if (!queryVector) {
			return json({ error: 'Embedding failed' }, { status: 500 });
		}

		// 2. Search existing codebase knowledge
		const scopeFilter = scope
			? { must: [{ key: 'relativePath', match: { text: scope } }] }
			: undefined;

		const existingResults = await searchCodebase(queryVector, 20, scopeFilter);
		const topScore = existingResults.length > 0 ? existingResults[0].score : 0;

		// 3. If score is adequate, return existing results without backfill
		if (topScore >= threshold && existingResults.length >= 3) {
			return json({
				success: true,
				backfilled: false,
				topScore,
				resultsCount: existingResults.length,
				results: existingResults.slice(0, 10).map((r) => ({
					path: r.payload.relativePath ?? r.payload.path,
					symbol: r.payload.symbol,
					kind: r.payload.kind,
					score: Math.round(r.score * 10000) / 10000,
				})),
				durationMs: Math.round(performance.now() - start),
			});
		}

		// 4. Knowledge gap detected — trigger deeper analysis
		cooldownMap.set(cooldownKey, Date.now());

		// Get file paths from existing low-confidence results
		const filePaths = [
			...new Set(
				existingResults
					.slice(0, maxFiles)
					.map((r) => String(r.payload.relativePath ?? r.payload.path ?? ''))
					.filter((p) => p.length > 0)
			),
		];

		if (filePaths.length === 0) {
			return json({
				success: false,
				backfilled: false,
				reason: 'no-matching-files',
				topScore,
				durationMs: Math.round(performance.now() - start),
			});
		}

		// 5. Generate LLM wiki entries for each file
		const wikiEntries: Array<{
			path: string;
			wiki: { summary: string; purpose: string; api: string[]; dependencies: string[] };
		}> = [];

		if (generateWiki) {
			for (const filePath of filePaths.slice(0, maxFiles)) {
				const wiki = await generateWikiEntry(filePath, query);
				if (wiki) {
					wikiEntries.push({ path: filePath, wiki });
				}
			}
		}

		// 6. Embed and index enriched wiki chunks
		let indexed = 0;
		for (const entry of wikiEntries) {
			const wikiText = [
				`File: ${entry.path}`,
				`Summary: ${entry.wiki.summary}`,
				`Purpose: ${entry.wiki.purpose}`,
				`API: ${entry.wiki.api.join(', ')}`,
				`Dependencies: ${entry.wiki.dependencies.join(', ')}`,
			].join('\n');

			const vector = await embed(wikiText);
			if (!vector) continue;

			const pointId = buildPointId(entry.path, 0);
			const success = await upsertWikiChunk(pointId, vector, {
				relativePath: entry.path,
				path: resolve(ROOT, entry.path),
				symbol: `wiki:${entry.path}`,
				kind: 'wiki-entry',
				content: wikiText,
				summary: entry.wiki.summary,
				purpose: entry.wiki.purpose,
				api: entry.wiki.api,
				dependencies: entry.wiki.dependencies,
				topic: query,
				indexed_at: new Date().toISOString(),
				auto_research: true,
			});

			if (success) indexed++;
		}

		return json({
			success: true,
			backfilled: true,
			gapDetected: true,
			topScore,
			existingResults: existingResults.length,
			filesAnalyzed: filePaths.length,
			wikiEntriesGenerated: wikiEntries.length,
			chunksIndexed: indexed,
			wikiEntries: wikiEntries.map((e) => ({
				path: e.path,
				summary: e.wiki.summary,
				purpose: e.wiki.purpose,
				apiCount: e.wiki.api.length,
			})),
			durationMs: Math.round(performance.now() - start),
		});
	} catch (err) {
		console.error('[/api/codebase/auto-research] Failed:', (err as Error)?.message);
		return json({ error: 'Auto-research failed' }, { status: 500 });
	}
};
