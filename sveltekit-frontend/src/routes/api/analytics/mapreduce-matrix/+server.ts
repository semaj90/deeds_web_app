/**
 * POST /api/analytics/mapreduce-matrix
 *   Execute MapReduce matrix analysis across RAG/KAG/DAG/ACE pipelines.
 *   Returns ranked chunks, pipeline coverage, glyph topology context,
 *   and LangGraph-compatible synthesis with self-prompting topics.
 *
 * GET  /api/analytics/mapreduce-matrix
 *   Returns cached results (if available) or runs fresh analysis.
 *
 * POST /api/analytics/mapreduce-matrix  { action: 'self-prompt', selfPrompt, pipeline }
 *   Execute a self-prompt from a synthesis topic.
 *
 * DELETE /api/analytics/mapreduce-matrix
 *   Invalidate cached matrix results.
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	executeMapReduceAnalysis,
	invalidateMatrixCache,
	executeSelfPrompt,
} from '$lib/server/analytics/mapreduce-matrix-analysis.js';

// ── Schemas ──────────────────────────────────────────────────────────────

const analysisSchema = z.object({
	days:       z.number().int().min(1).max(30).default(7),
	topK:       z.number().int().min(1).max(100).default(20),
	synthesize: z.boolean().default(true),
});

const selfPromptSchema = z.object({
	action:     z.literal('self-prompt'),
	selfPrompt: z.string().min(1).max(1000),
	pipeline:   z.string().max(30).default('cross-pipeline'),
});

// ── GET — cached or fresh analysis ───────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const refresh = url.searchParams.get('refresh') === 'true';
	const days = Math.min(parseInt(url.searchParams.get('days') ?? '7') || 7, 30);

	try {
		if (refresh) {
			await invalidateMatrixCache(locals.user.id);
		}

		const result = await executeMapReduceAnalysis(locals.user.id, {
			days,
			synthesize: true,
			cacheResults: true,
		});

		return json({
			matrix:           result.matrix.map((r) => ({
				chunkId:   r.chunkId,
				filePath:  r.filePath,
				scores:    Array.from(r.scores),
				composite: r.composite,
			})),
			totalChunks:      result.totalChunks,
			pipelineCoverage: result.pipelineCoverage,
			topChunks:        result.topChunks,
			glyphTiles:       result.glyphTiles,
			synthesis:        result.synthesis,
			cachedAt:         result.cachedAt,
			buildMs:          result.buildMs,
		});
	} catch (err) {
		console.error('MapReduce matrix error:', err);
		return json({
			matrix: [],
			totalChunks: 0,
			pipelineCoverage: {},
			topChunks: [],
			glyphTiles: [],
			synthesis: null,
			cachedAt: null,
			buildMs: 0,
		});
	}
};

// ── POST — analysis or self-prompt ──────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));

	// Branch: self-prompt execution
	if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).action === 'self-prompt') {
		const parsed = selfPromptSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const result = await executeSelfPrompt(parsed.data.selfPrompt, parsed.data.pipeline);
		return json(result);
	}

	// Branch: full matrix analysis
	const parsed = analysisSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const result = await executeMapReduceAnalysis(locals.user.id, {
			days: parsed.data.days,
			topK: parsed.data.topK,
			synthesize: parsed.data.synthesize,
			cacheResults: true,
		});

		return json({
			matrix:           result.matrix.map((r) => ({
				chunkId:   r.chunkId,
				filePath:  r.filePath,
				scores:    Array.from(r.scores),
				composite: r.composite,
			})),
			totalChunks:      result.totalChunks,
			pipelineCoverage: result.pipelineCoverage,
			topChunks:        result.topChunks,
			glyphTiles:       result.glyphTiles,
			synthesis:        result.synthesis,
			cachedAt:         result.cachedAt,
			buildMs:          result.buildMs,
		});
	} catch (err) {
		console.error('MapReduce matrix error:', err);
		return json({
			matrix: [],
			totalChunks: 0,
			pipelineCoverage: {},
			topChunks: [],
			glyphTiles: [],
			synthesis: null,
			cachedAt: null,
			buildMs: 0,
		});
	}
};

// ── DELETE — invalidate cache ────────────────────────────────────────────

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	await invalidateMatrixCache(locals.user.id);
	return json({ ok: true });
};
