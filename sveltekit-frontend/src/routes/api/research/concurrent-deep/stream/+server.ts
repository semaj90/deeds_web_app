/**
 * POST /api/research/concurrent-deep/stream
 *
 * SSE streaming variant of the concurrent LangGraph research pipeline.
 *
 * Unlike the batch endpoint (which waits for all workers before responding),
 * this endpoint emits each worker's findings the moment it completes, so the
 * Claude Code VS Code extension — or any EventSource consumer — sees incremental
 * results rather than waiting up to 45s for all domains to finish.
 *
 * Event sequence:
 *   event: plan      — { domains: string[] }
 *   event: worker    — { domain, chunkCount, summary, keyInsights, relevantPaths, source, cached, durationMs }
 *   event: merging   — { domainCount, totalChunks }   (emitted before supervisor call)
 *   event: complete  — { supervisorSummary, keyFindings, actionItems, totalChunks, totalDurationMs, persistedId? }
 *   event: error     — { message }                     (only on fatal failure)
 *
 * The stream closes after `complete` or `error`.
 *
 * Persistence:
 *   On completion the supervisor summary is stored in `research_summaries` via
 *   Drizzle (pipeline='langgraph', source='codebase'). The row ID is included in
 *   the `complete` event so the client can link back to the stored result.
 *
 * Auth: requires locals.user
 * Cost: ZERO — Ollama local + Bifrost L1/L2 cache (same as batch endpoint)
 */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	supervisorPlan,
	runWorker,
	supervisorMerge,
	formatGraphForClaudeCode,
} from '$lib/server/ai/langgraph-research.js';
import type { ResearchDomain, WorkerFinding } from '$lib/server/ai/langgraph-research.js';
import { db } from '$lib/server/db/client';
import { researchSummaries, contextTimeline } from '$lib/server/db/schema-postgres.js';
import { COMPACT_DEFAULTS } from '$lib/server/ai/compact-budgets.js';

/** 8-char FNV-1a hash of query string. */
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
	query:          z.string().min(3).max(1_000),
	domains:        z.array(z.enum(VALID_DOMAINS)).max(6).optional(),
	limitPerWorker: z.number().int().min(3).max(30).optional().default(12),
	persist:        z.boolean().optional().default(true),
	compact:        z.boolean().optional().default(false),
	maxFindings:    z.number().int().min(1).max(50).optional().default(COMPACT_DEFAULTS.maxFindings),
	maxFiles:       z.number().int().min(1).max(30).optional().default(COMPACT_DEFAULTS.maxFiles),
	maxActionItems: z.number().int().min(1).max(20).optional().default(COMPACT_DEFAULTS.maxActionItems),
	maxSummaryChars: z.number().int().min(100).max(10_000).optional().default(COMPACT_DEFAULTS.maxSummaryChars),
});

// ── SSE helpers ────────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): Uint8Array {
	return new TextEncoder().encode(
		`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
	);
}

// ── Persistence ────────────────────────────────────────────────────────────────

async function persistGraph(
	query:   string,
	summary: string,
	domains: ResearchDomain[],
	totalChunks: number,
	userId: string,
): Promise<string | null> {
	try {
		// 8-char FNV-1a hash for queryHash column (varchar 8)
		let h = 0x811c9dc5 >>> 0;
		for (let i = 0; i < query.length; i++) {
			h ^= query.charCodeAt(i);
			h = Math.imul(h, 0x01000193) >>> 0;
		}
		const queryHash = h.toString(36).slice(0, 8).padStart(8, '0');

		const [row] = await db.insert(researchSummaries).values({
			source:         'codebase',
			pipeline:       'langgraph',
			entityType:     'concurrent-research',
			query,
			queryHash,
			title:          `LangGraph: ${query.slice(0, 80)}`,
			summary,
			entityTags:     domains,
			relevanceScore: Math.min(1, totalChunks / 100),
			userId,
		}).returning({ id: researchSummaries.id });

		return row?.id ?? null;
	} catch {
		// Non-fatal — DB may be unavailable
		return null;
	}
}

// ── POST handler ───────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try { raw = await request.json(); } catch { raw = {}; }

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const {
		query, domains: explicitDomains, limitPerWorker, persist,
		compact, maxFindings, maxFiles, maxActionItems, maxSummaryChars,
	} = parsed.data;
	const userId = locals.user.id;
	const queryHash = fnv1a8(query);

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: string, data: unknown) =>
				controller.enqueue(sseEvent(event, data));

			try {
				const t0 = performance.now();

				// ── context_timeline: research started ────────────────────────
				emitTimeline(userId, 'research.concurrent.started', {
					pipeline:   'langgraph',
					source:     'codebase',
					entityType: 'concurrent-research',
					queryHash,
					workerCount: explicitDomains?.length ?? 0,
					mode: 'stream',
					cache: { l1: false, l2: false, l3: false },
				});

				// 1. Supervisor plan
				const domains = explicitDomains?.length
					? (explicitDomains as ResearchDomain[])
					: await supervisorPlan(query);

				send('plan', { domains });

				// 2. Concurrent workers — emit each finding as it arrives
				const workerFindings: WorkerFinding[] = [];

				await Promise.allSettled(
					domains.map(async (domain) => {
						const finding = await Promise.race([
							runWorker(domain, query, limitPerWorker),
							new Promise<WorkerFinding>((_, reject) =>
								setTimeout(() => reject(new Error('worker timeout')), 45_000)
							),
						]).catch((err: Error): WorkerFinding => ({
							domain,
							chunks:        [],
							summary:       `Timeout or error: ${err.message}`,
							keyInsights:   [],
							relevantPaths: [],
							durationMs:    45_000,
							source:        'degraded',
							cached:        false,
						}));

						workerFindings.push(finding);

						// ── context_timeline: worker done ─────────────────────────
						emitTimeline(userId, 'research.concurrent.worker_done', {
							pipeline:   'langgraph',
							source:     'codebase',
							entityType: 'concurrent-research',
							queryHash,
							domain: finding.domain,
							chunkCount: finding.chunks.length,
							cached: finding.cached,
							source_type: finding.source,
							durationMs: Math.round(finding.durationMs),
						});

						// Emit immediately — don't wait for other workers
						send('worker', {
							domain:        finding.domain,
							chunkCount:    finding.chunks.length,
							summary:       compact ? finding.summary.slice(0, 300) : finding.summary,
							keyInsights:   finding.keyInsights.slice(0, compact ? 3 : 10),
							relevantPaths: finding.relevantPaths.slice(0, maxFiles),
							source:        finding.source,
							cached:        finding.cached,
							durationMs:    Math.round(finding.durationMs),
						});
					})
				);

				// 3. Supervisor merge
				const totalChunks = workerFindings.reduce((n, w) => n + w.chunks.length, 0);
				send('merging', { domainCount: workerFindings.length, totalChunks });

				const { supervisorSummary, keyFindings, actionItems } =
					await supervisorMerge(query, workerFindings);

				// ── context_timeline: supervisor done ─────────────────────────
				emitTimeline(userId, 'research.concurrent.supervisor_done', {
					pipeline:    'langgraph',
					source:      'codebase',
					entityType:  'concurrent-research',
					queryHash,
					workerCount: workerFindings.length,
					totalChunks,
					durationMs:  Math.round(performance.now() - t0),
					mode: 'stream',
					cache: { l1: false, l2: false, l3: false },
				});

				// 4. Persist (fire-and-forget, include row ID in complete event)
				const persistedId = persist
					? await persistGraph(query, supervisorSummary, domains, totalChunks, userId)
					: null;

				// ── context_timeline: persisted (if summary was stored) ───────
				if (persistedId) {
					emitTimeline(userId, 'research.concurrent.persisted', {
						pipeline:   'langgraph',
						source:     'codebase',
						entityType: 'concurrent-research',
						queryHash,
						workerCount: workerFindings.length,
						totalChunks,
						durationMs:  Math.round(performance.now() - t0),
						mode: 'stream',
					}, persistedId);
				}

				send('complete', {
					supervisorSummary: compact
						? supervisorSummary.slice(0, maxSummaryChars)
						: supervisorSummary,
					keyFindings:   keyFindings.slice(0, maxFindings),
					actionItems:   actionItems.slice(0, maxActionItems),
					totalChunks,
					totalDurationMs: Math.round(performance.now() - t0),
					persistedId,
					compact,
					// Inline markdown for direct Claude Code ingestion
					markdown: compact
						? undefined
						: formatGraphForClaudeCode({
								query,
								domains,
								workerFindings,
								supervisorSummary,
								keyFindings,
								actionItems,
								totalChunks,
								totalDurationMs: Math.round(performance.now() - t0),
								cacheKey: '',
							}),
				});
			} catch (err) {
				// ── context_timeline: research failed ────────────────────────
				emitTimeline(userId, 'research.concurrent.failed', {
					pipeline:   'langgraph',
					source:     'codebase',
					entityType: 'concurrent-research',
					queryHash,
					error: (err as Error).message,
					mode: 'stream',
					cache: { l1: false, l2: false, l3: false },
				});
				send('error', { message: (err as Error).message ?? 'Research pipeline failed' });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type':      'text/event-stream',
			'Cache-Control':     'no-cache',
			'Connection':        'keep-alive',
			'X-Accel-Buffering': 'no',  // disable Nginx/Caddy proxy buffering
		},
	});
};