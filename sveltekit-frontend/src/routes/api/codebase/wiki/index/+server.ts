/**
 * Codebase Indexing API
 *
 * Architecture (3-layer separation):
 *   1. SvelteKit request layer (this file) — auth, validation, HTTP responses
 *   2. Job orchestration — RabbitMQ primary, mapreduce fallback
 *   3. Compute layer — embedding gen, chunking, GPU reranking (in consumers)
 *
 * Flow:
 *   POST → try RabbitMQ publish → if unavailable, fall back to mapreduce worker_threads
 *   GET  → check Redis (RabbitMQ jobs) OR DB (mapreduce jobs)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createCodebaseEmbeddingJob, processEmbeddingJob, getJobStatus } from '$lib/server/gpu/mapreduce-cuda-analyzer';
import crypto from 'crypto';

const indexRequestSchema = z.object({
	scope: z.enum(['lib', 'routes', 'all']).optional().default('all'),
	incremental: z.boolean().optional().default(false),
	patterns: z.array(z.string()).optional(),
	config: z.object({
		batchSize: z.number().int().min(1).max(1000).optional(),
		concurrency: z.number().int().min(1).max(16).optional()
	}).optional()
});

// Scope → glob pattern mapping for mapreduce fallback
const SCOPE_TO_PATTERNS: Record<string, string[]> = {
	lib: [
		'sveltekit-frontend/src/lib/**/*.ts',
		'sveltekit-frontend/src/lib/**/*.svelte',
	],
	routes: [
		'sveltekit-frontend/src/routes/**/*.ts',
		'sveltekit-frontend/src/routes/**/*.svelte',
	],
	all: [
		'sveltekit-frontend/src/lib/**/*.ts',
		'sveltekit-frontend/src/lib/**/*.svelte',
		'sveltekit-frontend/src/routes/**/*.ts',
		'sveltekit-frontend/src/routes/**/*.svelte',
	],
};

/**
 * Try to publish to RabbitMQ. Returns jobId on success, null if RabbitMQ unavailable.
 */
async function tryRabbitMQPath(
	scope: string,
	incremental: boolean,
	requestedBy?: string
): Promise<string | null> {
	try {
		const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
		const jobId = crypto.randomUUID();

    const published = await Promise.race([
      rabbitmq.publishCodebaseIndex({
        scope,
        incremental,
        requestedBy,
      }),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);

		if (!published) {
			console.warn('[codebase/wiki/index] RabbitMQ not ready, falling back to mapreduce');
			return null;
		}

		// Track job in Redis for status polling
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		await redis.set(
			`codebase:index:${jobId}`,
			JSON.stringify({
				jobId,
				backend: 'rabbitmq',
				scope,
				incremental,
				requestedBy,
				status: 'pending',
				progress: 0,
				startedAt: new Date().toISOString(),
				filesProcessed: 0,
				chunksProcessed: 0,
				error: null,
			}),
			'EX',
			3600 // 1 hour TTL
		);

		// Also store latest job id for this scope (for dashboard lookups)
		await redis.set(`codebase:index:latest:${scope}`, jobId, 'EX', 3600);

		console.log(`[codebase/wiki/index] Published to RabbitMQ: jobId=${jobId}, scope=${scope}`);
		return jobId;
	} catch (err) {
		console.warn('[codebase/wiki/index] RabbitMQ publish failed:', err);
		return null;
	}
}

/**
 * Fallback to mapreduce worker_threads path.
 */
async function fallbackMapReducePath(
	patterns: string[],
	config?: { batchSize?: number; concurrency?: number }
): Promise<string> {
	const jobId = await createCodebaseEmbeddingJob(patterns, config);

	processEmbeddingJob(jobId, (progress) => {
		console.log(`[mapreduce] Indexing progress: ${progress.toFixed(1)}%`);
	}).catch((error) => {
		console.error('[mapreduce] Background indexing error:', error);
	});

	return jobId;
}

// ─── POST /api/codebase/wiki/index ─── Start indexing job
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = indexRequestSchema.safeParse(body);

    if (!parsed.success) {
      return json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { scope, incremental, patterns: customPatterns, config } = parsed.data;
    const patterns = customPatterns ?? SCOPE_TO_PATTERNS[scope] ?? SCOPE_TO_PATTERNS.all;

    // Try RabbitMQ first (production path)
    const rmqJobId = await tryRabbitMQPath(scope, incremental, locals.user.id);

    if (rmqJobId) {
      return json({
        success: true,
        jobId: rmqJobId,
        backend: 'rabbitmq',
        message: 'Indexing queued via RabbitMQ',
        scope,
      });
    }

    // Fallback to mapreduce worker_threads
    const mrJobId = await fallbackMapReducePath(patterns, config ?? {});

    // Wait briefly for file scan
    await new Promise((r) => setTimeout(r, 1000));
    const status = await getJobStatus(mrJobId);

    return json({
      success: true,
      jobId: mrJobId,
      backend: 'mapreduce',
      message: 'Indexing started via mapreduce fallback',
      scope,
      totalFiles: status?.totalFiles || 0,
    });
  } catch (error: any) {
    console.error('[codebase/wiki/index] POST error:', error);
    return json({ success: false, error: 'Indexing operation failed' }, { status: 500 });
  }
};

// ─── GET /api/codebase/wiki/index?jobId=xxx ─── Check job status
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return json({ error: 'Missing jobId' }, { status: 400 });
    }

    // 1. Check Redis first (RabbitMQ-tracked jobs)
    try {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const redisData = await redis.get(`codebase:index:${jobId}`);
      if (redisData) {
        const job = JSON.parse(redisData);
        return json({ success: true, job });
      }
    } catch {
      // Redis unavailable — fall through to DB check
    }

    // 2. Fallback to DB (mapreduce-tracked jobs)
    const status = await getJobStatus(jobId);
    if (!status) {
      return json({ error: 'Job not found' }, { status: 404 });
    }

    return json({
      success: true,
      job: { ...status, backend: 'mapreduce' },
    });
  } catch (error: any) {
    console.error('[codebase/wiki/index] GET error:', error);
    return json({ success: false, error: 'Job lookup failed' }, { status: 500 });
  }
};
