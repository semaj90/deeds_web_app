/**
 * /api/analytics/web-research
 *
 * POST — crawl: run web research for one or more selfPrompt queries
 *   Body: { selfPrompts: string[], pipeline?: string, maxResults?: number }
 *   Returns: { batches: WebResearchBatch[], totalSummaries: number, indexedAt: string }
 *
 * GET  — query: return cached summaries from Redis index
 *   Params: pipeline? (default 'all'), limit? (default 20)
 *   Returns: { summaries: WebResearchSummary[], stats: { builtAt, totalByPipeline } }
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
	crawlWebResearch,
	queryWebResearchIndex,
	getWebResearchStats,
	invalidateWebResearchCache,
	crawlLegalCorpus,
	queryCorpusIndex,
	getCorpusSearchStats,
	invalidateCorpusCache,
} from '$lib/server/analytics/web-research-crawler.js';
import { getRedis } from '$lib/server/redis.js';

const RESEARCH_JOB_KEY = (jobId: string) => `web:research:job:${jobId}`;
const RESEARCH_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const RESEARCH_JOB_TTL_SECONDS = Math.floor(RESEARCH_JOB_TTL_MS / 1000);

type ResearchJob = {
  jobId: string;
  action: 'crawl' | 'corpus-search' | 'invalidate';
  pipeline: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled';
  progress: number;
  message: string;
  result: {
    cleared?: boolean;
    totalSummaries?: number;
    indexedAt?: string;
    source?: string;
    batches?: Array<{ summaries: Array<Record<string, unknown>> }>;
  } | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  totalSummaries: number;
  selfPrompts: string[];
  indexedAt?: string;
  source?: string;
  batches?: Array<{ summaries: Array<Record<string, unknown>> }>;
};

const researchJobs = new Map<string, ResearchJob>();

type ResearchActionResult = {
  cleared?: boolean;
  totalSummaries: number;
  source?: string;
  indexedAt?: string;
  batches?: Array<{ summaries: Array<Record<string, unknown>> }>;
  message: string;
  result: NonNullable<ResearchJob['result']>;
};

const postSchema = z.object({
  selfPrompts: z.array(z.string().min(3).max(400)).min(1).max(10),
  pipeline: z.enum(['ace', 'rag', 'kag', 'dag', 'codebase', 'all']).default('ace'),
  maxResults: z.number().int().min(1).max(10).default(5),
  action: z.enum(['crawl', 'corpus-search', 'invalidate']).default('crawl'),
  defer: z.boolean().default(false),
});

async function runResearchAction(
  action: 'crawl' | 'corpus-search' | 'invalidate',
  selfPrompts: string[],
  pipeline: string,
  maxResults: number
): Promise<ResearchActionResult> {
  if (action === 'invalidate') {
    await Promise.all([
      invalidateWebResearchCache().catch(() => {}),
      invalidateCorpusCache().catch(() => {}),
    ]);
    const indexedAt = new Date().toISOString();
    return {
      cleared: true,
      totalSummaries: 0,
      source: 'none',
      indexedAt,
      message: 'Caches cleared',
      result: { cleared: true },
    };
  }

  if (action === 'corpus-search') {
    const batches = [];
    let totalSummaries = 0;
    let failures = 0;
    for (const query of selfPrompts) {
      try {
        const batch = await crawlLegalCorpus(query, pipeline, maxResults);
        batches.push(batch);
        totalSummaries += batch.summaries.length;
      } catch {
        // Non-fatal — keep processing the remaining prompts.
        failures += 1;
      }
    }
    if (!totalSummaries && selfPrompts.length > 0 && failures === selfPrompts.length) {
      throw new Error('Research job failed');
    }
    const indexedAt = new Date().toISOString();
    return {
      batches,
      totalSummaries,
      source: 'corpus',
      indexedAt,
      message: failures ? 'Completed with partial failures' : 'Corpus research completed',
      result: { batches, totalSummaries, source: 'corpus', indexedAt },
    };
  }

  const batches = [];
  let totalSummaries = 0;
  let failures = 0;

  for (const query of selfPrompts) {
    try {
      const batch = await crawlWebResearch(query, pipeline, maxResults);
      batches.push(batch);
      totalSummaries += batch.summaries.length;
    } catch {
      // Non-fatal — skip this prompt
      failures += 1;
    }
  }
  if (!totalSummaries && selfPrompts.length > 0 && failures === selfPrompts.length) {
    throw new Error('Research job failed');
  }
  const indexedAt = new Date().toISOString();

  return {
    batches,
    totalSummaries,
    source: 'web',
    indexedAt,
    message: failures ? 'Completed with partial failures' : 'Web research completed',
    result: { batches, totalSummaries, source: 'web', indexedAt },
  };
}

function isExpired(job: ResearchJob) {
  return Date.parse(job.expiresAt) <= Date.now();
}

function makeTimedOutJob(jobId: string, base?: Partial<ResearchJob>): ResearchJob {
  const now = new Date().toISOString();
  return {
    jobId,
    action: base?.action ?? 'crawl',
    pipeline: base?.pipeline ?? 'ace',
    status: 'timed_out',
    progress: 100,
    message: 'Job expired or is no longer available',
    result: null,
    error: 'Job expired or is no longer available',
    createdAt: base?.createdAt ?? now,
    updatedAt: base?.updatedAt ?? now,
    expiresAt: base?.expiresAt ?? now,
    totalSummaries: base?.totalSummaries ?? 0,
    selfPrompts: base?.selfPrompts ?? [],
    indexedAt: base?.indexedAt,
    source: base?.source,
    batches: base?.batches,
  };
}

async function persistResearchJob(job: ResearchJob) {
  try {
    const redis = getRedis();
    await redis.set(
      RESEARCH_JOB_KEY(job.jobId),
      JSON.stringify(job),
      'EX',
      RESEARCH_JOB_TTL_SECONDS
    );
  } catch {
    // Non-fatal — in-memory state still serves the current process.
  }
}

async function getResearchJob(jobId: string): Promise<ResearchJob> {
  const inMemory = researchJobs.get(jobId);
  if (inMemory) {
    if (!isExpired(inMemory)) return inMemory;
    researchJobs.delete(jobId);
    return makeTimedOutJob(jobId, inMemory);
  }

  try {
    const redis = getRedis();
    const raw = await redis.get(RESEARCH_JOB_KEY(jobId));
    if (!raw) return makeTimedOutJob(jobId);
    const parsed = JSON.parse(raw) as ResearchJob;
    if (!isExpired(parsed)) return parsed;
    return makeTimedOutJob(jobId, parsed);
  } catch {
    return makeTimedOutJob(jobId);
  }
}

// ── GET — cached summaries (web + corpus) ────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return json({ summaries: [], corpusSummaries: [], stats: { builtAt: null, totalByPipeline: {} }, corpusStats: { builtAt: null, totalByPipeline: {} } });
	}

	const jobId = url.searchParams.get('jobId');
  if (jobId) {
    return json({ job: await getResearchJob(jobId) });
  }

	const pipeline = (url.searchParams.get('pipeline') ?? 'all') as string;
	const limit    = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);
	const source   = url.searchParams.get('source') ?? 'web'; // 'web' | 'corpus' | 'all'

	try {
		const results = await Promise.all([
			source !== 'corpus' ? queryWebResearchIndex(pipeline, limit) : Promise.resolve([]),
			source !== 'corpus' ? getWebResearchStats() : Promise.resolve({ builtAt: null, totalByPipeline: {} }),
			source !== 'web'    ? queryCorpusIndex(pipeline, limit)    : Promise.resolve([]),
			source !== 'web'    ? getCorpusSearchStats()               : Promise.resolve({ builtAt: null, totalByPipeline: {} }),
		]);
		return json({ summaries: results[0], stats: results[1], corpusSummaries: results[2], corpusStats: results[3] });
	} catch {
		return json({ summaries: [], corpusSummaries: [], stats: { builtAt: null, totalByPipeline: {} }, corpusStats: { builtAt: null, totalByPipeline: {} } });
	}
};

// ── POST — crawl or invalidate ────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw    = await request.json().catch(() => ({}));
	const parsed = postSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { action, selfPrompts, pipeline, maxResults, defer } = parsed.data;

  if (defer && action !== 'invalidate') {
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const baseJob: ResearchJob = {
      jobId,
      action,
      pipeline,
      status: 'queued',
      progress: 0,
      message: 'Queued for background execution',
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + RESEARCH_JOB_TTL_MS).toISOString(),
      totalSummaries: 0,
      selfPrompts,
    };

    researchJobs.set(jobId, baseJob);
    void persistResearchJob(baseJob);

    setImmediate(() => {
      void (async () => {
        try {
          const runningJob: ResearchJob = {
            ...baseJob,
            status: 'running',
            progress: 40,
            message: 'Running background research',
            updatedAt: new Date().toISOString(),
          };
          researchJobs.set(jobId, runningJob);
          void persistResearchJob(runningJob);
          const result = await runResearchAction(action, selfPrompts, pipeline, maxResults);
          const completedJob: ResearchJob = {
            ...runningJob,
            status: 'completed',
            progress: 100,
            message: result.message,
            updatedAt: new Date().toISOString(),
            totalSummaries: typeof result.totalSummaries === 'number' ? result.totalSummaries : 0,
            indexedAt:
              typeof result.indexedAt === 'string' ? result.indexedAt : new Date().toISOString(),
            source: typeof result.source === 'string' ? result.source : undefined,
            batches: Array.isArray(result.batches) ? result.batches : undefined,
            result: result.result,
            error: null,
          };
          researchJobs.set(jobId, completedJob);
          void persistResearchJob(completedJob);
        } catch (err) {
          const failedJob: ResearchJob = {
            ...baseJob,
            status: 'failed',
            progress: 100,
            message: 'Research job failed',
            updatedAt: new Date().toISOString(),
            result: null,
            error: 'Research job failed',
          };
          researchJobs.set(jobId, failedJob);
          void persistResearchJob(failedJob);
        }
      })();
    });

    return json({ jobId, status: 'queued' }, { status: 202 });
  }

	return json(await runResearchAction(action, selfPrompts, pipeline, maxResults));
};
