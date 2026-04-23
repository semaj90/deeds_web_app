/**
 * POST /api/codebase-index/deep-research
 *
 * Standalone trigger for the agentic web-search deep-research indexer.
 * Defaults to deferred/queued execution. Callers can opt into `mode: 'wait'`
 * for synchronous smoke checks or operator-driven manual runs.
 *
 * Body (JSON):
 *   {
 *     mode?: 'deferred' | 'wait',
 *     maxClusters?: number,
 *     resultsPerQuery?: number,
 *     maxDepth?: number,
 *     maxPages?: number,
 *     childLinksPerPage?: number,
 *     contentCharBudget?: number,
 *     skipQdrant?: boolean,
 *     runMaintenance?: boolean,
 *   }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';
import { jobKey } from '$lib/server/cache-keys.js';
import {
	publishWorkflowComplete,
	publishWorkflowError,
	publishWorkflowEvent,
} from '$lib/server/queue/workflow-publish.js';

type DeepResearchJobStatus = {
	jobId: string;
	sessionId: string;
	status: 'queued' | 'running' | 'done' | 'error';
	createdAt: string;
	startedAt?: string;
	finishedAt?: string;
	lastMessage?: string;
	error?: string;
	result?: {
		queriesRun: number;
		pagesIndexed: number;
		pagesSkipped: number;
		pagesFailed: number;
		rowsInserted: number;
		rowsUpdated: number;
		durationMs: number;
	};
};

const jobStore = new Map<string, DeepResearchJobStatus>();
const JOB_TTL_S = 60 * 60;

const schema = z.object({
	mode: z.enum(['deferred', 'wait']).default('deferred'),
	maxClusters: z.number().int().min(1).max(20).default(20),
	resultsPerQuery: z.number().int().min(1).max(10).default(5),
	maxDepth: z.number().int().min(1).max(2).default(1),
	maxPages: z.number().int().min(1).max(100).default(25),
	childLinksPerPage: z.number().int().min(0).max(5).default(2),
	contentCharBudget: z.number().int().min(1000).max(8000).default(4000),
	skipQdrant: z.boolean().default(false),
	runMaintenance: z.boolean().default(false),
});

async function persistJobStatus(status: DeepResearchJobStatus): Promise<void> {
	jobStore.set(status.jobId, status);
	try {
		await getRedis().setex(
			jobKey.status('deep-research', status.jobId),
			JOB_TTL_S,
			JSON.stringify(status)
		);
	} catch {
		// Redis unavailable — in-memory status remains available on this instance.
	}
}

async function readJobStatus(jobId: string): Promise<DeepResearchJobStatus | null> {
	const cached = jobStore.get(jobId);
	if (cached) return cached;
	try {
		const raw = await getRedis().get(jobKey.status('deep-research', jobId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as DeepResearchJobStatus;
		jobStore.set(jobId, parsed);
		return parsed;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const jobId = url.searchParams.get('jobId');
	if (!jobId) {
		const jobs = [...jobStore.values()]
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
			.slice(0, 10);
		return json({ jobs });
	}

	const status = await readJobStatus(jobId);
	if (!status) return json({ error: 'Job not found' }, { status: 404 });
	return json(status);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
	}

	const {
		mode,
		maxClusters,
		resultsPerQuery,
		maxDepth,
		maxPages,
		childLinksPerPage,
		contentCharBudget,
		skipQdrant,
		runMaintenance,
	} = parsed.data;
	const runId = `dr-${randomUUID()}`;

	const startedAt = Date.now();
	try {
		const { runDeepResearchIndex } = await import('$lib/server/indexer/web-search-indexer.js');
		const runOptions = {
			runId,
			maxClusters,
			resultsPerQuery,
			maxDepth,
			maxPages,
			childLinksPerPage,
			contentCharBudget,
			skipQdrant,
			runMaintenance,
		};

		if (mode === 'wait') {
		const result = await runDeepResearchIndex({
			...runOptions,
		});

			return json({
				ok: true,
				runId,
				durationMs: Date.now() - startedAt,
				...result,
			});
		}

		const queuedStatus: DeepResearchJobStatus = {
			jobId: runId,
			sessionId: runId,
			status: 'queued',
			createdAt: new Date().toISOString(),
			lastMessage: 'Queued',
		};
		await persistJobStatus(queuedStatus);
		publishWorkflowEvent(runId, {
			type: 'PIPELINE_STAGE_START',
			label: 'deep-research queued',
			data: { jobId: runId },
		});

		void (async () => {
			const runningStatus: DeepResearchJobStatus = {
				...queuedStatus,
				status: 'running',
				startedAt: new Date().toISOString(),
				lastMessage: 'Running',
			};
			await persistJobStatus(runningStatus);

			try {
				const result = await runDeepResearchIndex({
					...runOptions,
					onProgress: (msg) => {
						const nextStatus: DeepResearchJobStatus = {
							...(jobStore.get(runId) ?? runningStatus),
							lastMessage: msg,
						};
						void persistJobStatus(nextStatus);
						publishWorkflowEvent(runId, {
							type: 'PIPELINE_STAGE_DONE',
							label: 'deep-research',
							data: { jobId: runId, message: msg },
						});
					},
				});

				const doneStatus: DeepResearchJobStatus = {
					...(jobStore.get(runId) ?? runningStatus),
					status: 'done',
					finishedAt: new Date().toISOString(),
					lastMessage: 'Complete',
					result,
				};
				await persistJobStatus(doneStatus);
				publishWorkflowComplete(runId, { jobId: runId, ...result });
			} catch (err) {
				const message = (err as Error).message;
				const failedStatus: DeepResearchJobStatus = {
					...(jobStore.get(runId) ?? runningStatus),
					status: 'error',
					finishedAt: new Date().toISOString(),
					lastMessage: message,
					error: message,
				};
				await persistJobStatus(failedStatus);
				publishWorkflowError(runId, message, { jobId: runId });
			}
		})();

		return json(
			{
				ok: true,
				deferred: true,
				jobId: runId,
				sessionId: runId,
				status: 'queued',
				statusUrl: `/api/codebase-index/deep-research?jobId=${encodeURIComponent(runId)}`,
				eventsUrl: `/api/workflow-events/${encodeURIComponent(runId)}`,
			},
			{ status: 202 }
		);
	} catch (err) {
		return json({
			ok: false,
			error: (err as Error).message,
			runId,
			durationMs: Date.now() - startedAt,
			queriesRun: 0,
			pagesIndexed: 0,
			pagesSkipped: 0,
			pagesFailed: 0,
			rowsInserted: 0,
			rowsUpdated: 0,
		});
	}
};
