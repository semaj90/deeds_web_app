/**
 * POST /api/research/concurrent-deep
 *
 * LangGraph-style concurrent deep research over codebase_chunks_768.
 *
 * Runs a supervisor → parallel domain workers → synthesizer DAG:
 *   1. supervisor.plan()  — classifies query into 2-5 research domains
 *   2. N workers in parallel — each traverses Qdrant for its semantic domain
 *   3. supervisor.merge() — Ollama synthesizes cross-domain findings
 *
 * Designed for the Claude Code VS Code extension to call via:
 *   MCP tool: codebase:concurrent_research
 *   Direct:   POST /api/research/concurrent-deep
 *
 * Body: {
 *   query:           string          — research question (required)
 *   domains?:        string[]        — explicit domains (auto-detected if omitted)
 *   limitPerWorker?: number          — Qdrant hits per domain (default 12, max 30)
 *   format?:         'json'|'markdown' — response format (default 'json')
 * }
 *
 * Auth: requires locals.user
 * Cost: ZERO — Ollama local + Bifrost L1/L2 cache
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { runConcurrentResearch, formatGraphForClaudeCode } from '$lib/server/ai/langgraph-research.js';
import type { ResearchDomain } from '$lib/server/ai/langgraph-research.js';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';
import { COMPACT_DEFAULTS } from '$lib/server/ai/compact-budgets.js';

/** 8-char FNV-1a hash of query string — used as queryHash + cache key fingerprint. */
function fnv1a8(s: string): string {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(36).slice(0, 8).padStart(8, '0');
}

/** Fire-and-forget context_timeline insert. Never throws. */
function emitTimeline(
	userId: string,
	eventType: string,
	payload: Record<string, unknown>,
	summaryId?: string | null,
): void {
	db.insert(contextTimeline).values({
		userId,
		sessionId:  '',
		eventType,
		pipeline:   'langgraph',
		summaryId:  summaryId ?? null,
		payload,
	}).catch(() => {});
}

const VALID_DOMAINS = [
	'api-routes', 'state-machines', 'database', 'error-patterns',
	'ml-inference', 'auth', 'cache', 'rag-pipeline', 'ui-components',
	'graph-db', 'general',
] as const;

const bodySchema = z.object({
	query:           z.string().min(3).max(1_000),
	domains:         z.array(z.enum(VALID_DOMAINS)).max(6).optional(),
	limitPerWorker:  z.number().int().min(3).max(30).optional().default(12),
	format:          z.enum(['json', 'markdown']).optional().default('json'),
	compact:         z.boolean().optional().default(false),
	debug:           z.boolean().optional().default(false),
	maxFindings:     z.number().int().min(1).max(50).optional().default(COMPACT_DEFAULTS.maxFindings),
	maxFiles:        z.number().int().min(1).max(30).optional().default(COMPACT_DEFAULTS.maxFiles),
	maxActionItems:  z.number().int().min(1).max(20).optional().default(COMPACT_DEFAULTS.maxActionItems),
	maxSummaryChars: z.number().int().min(100).max(10_000).optional().default(COMPACT_DEFAULTS.maxSummaryChars),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try { raw = await request.json(); } catch { raw = {}; }

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const {
		query, domains, limitPerWorker, format,
		compact, debug, maxFindings, maxFiles, maxActionItems, maxSummaryChars,
	} = parsed.data;

	const queryHash   = fnv1a8(query);
	const workerCount = domains?.length ?? 0; // 0 = auto-detected by supervisor

	// ── context_timeline: research started ────────────────────────────────────
	emitTimeline(locals.user.id, 'research.concurrent.started', {
		pipeline:   'langgraph',
		source:     'codebase',
		entityType: 'concurrent-research',
		queryHash,
		workerCount,
		cache: { l1: false, l2: false, l3: false },
	});

	let graph;
	try {
		graph = await runConcurrentResearch(query, {
			domains:         domains as ResearchDomain[] | undefined,
			limitPerWorker,
		});
	} catch (err) {
		// ── context_timeline: research failed ─────────────────────────────────
		emitTimeline(locals.user.id, 'research.concurrent.failed', {
			pipeline:   'langgraph',
			source:     'codebase',
			entityType: 'concurrent-research',
			queryHash,
			workerCount,
			error: (err as Error).message,
			cache: { l1: false, l2: false, l3: false },
		});
		return json({ error: 'Research pipeline failed' }, { status: 500 });
	}

	// ── context_timeline: supervisor done ─────────────────────────────────────
	emitTimeline(locals.user.id, 'research.concurrent.supervisor_done', {
		pipeline:    'langgraph',
		source:      'codebase',
		entityType:  'concurrent-research',
		queryHash,
		workerCount: graph.workerFindings.length,
		durationMs:  graph.totalDurationMs,
		totalChunks: graph.totalChunks,
		cache: { l1: false, l2: false, l3: false },
	});

	if (format === 'markdown') {
		const md = formatGraphForClaudeCode(graph);
		return new Response(
			compact ? md.slice(0, maxSummaryChars) : md,
			{ headers: { 'Content-Type': 'text/markdown; charset=utf-8' } },
		);
	}

	// Fire-and-forget: Karpathy wiki research note
	import('$lib/server/indexer/karpathy-wiki.js')
		.then(({ recordResearchNote }) => recordResearchNote({
			query,
			outsideSources: [],
			internalAreas: graph.workerFindings.flatMap(w => w.relevantPaths.slice(0, 5)),
			confidence: Math.min(1, graph.totalChunks / 50),
			pipeline: 'langgraph',
			unresolvedQuestions: graph.actionItems.slice(0, 5),
		}))
		.catch(() => { /* non-fatal */ });

	// ── Build response (apply compact limits) ────────────────────────────────
	const workerPayloads = graph.workerFindings.map(w => {
		const base: Record<string, unknown> = {
			domain:    w.domain,
			chunkCount: w.chunks.length,
			summary:   compact ? w.summary.slice(0, 300) : w.summary,
			keyInsights:   w.keyInsights.slice(0, compact ? 3 : 10),
			relevantPaths: w.relevantPaths.slice(0, maxFiles),
			durationMs:    Math.round(w.durationMs),
			source:        w.source,
			cached:        w.cached,
		};
		return base;
	});

	return json({
		ok:              true,
		compact,
		query,
		domains:           graph.domains,
		supervisorSummary: compact
			? graph.supervisorSummary.slice(0, maxSummaryChars)
			: graph.supervisorSummary,
		keyFindings:       graph.keyFindings.slice(0, maxFindings),
		actionItems:       graph.actionItems.slice(0, maxActionItems),
		totalChunks:       graph.totalChunks,
		totalDurationMs:   graph.totalDurationMs,
		cacheKey:          graph.cacheKey,
		workers:           workerPayloads,
		// Only include diagnostics when debug=true
		...(debug ? {
			diagnostics: {
				workerCount: graph.workerFindings.length,
				perWorkerChunks: graph.workerFindings.map(w => ({ domain: w.domain, chunks: w.chunks.length })),
			}
		} : {}),
	});
};

/** GET — supported domains + brief endpoint description for Claude Code discovery */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	return json({
		endpoint:    'POST /api/research/concurrent-deep',
		description: 'LangGraph concurrent codebase research — supervisor + parallel domain workers + Ollama synthesis',
		domains:     VALID_DOMAINS,
		cacheInfo:   'Worker results cached 10min, graph cached 5min, LLM calls via L1 Redis → L2 Bifrost → L3 Ollama',
		formats:     ['json', 'markdown'],
		mcpTool:     'codebase:concurrent_research',
	});
};
