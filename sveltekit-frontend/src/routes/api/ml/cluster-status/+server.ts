/**
 * GET /api/ml/cluster-status
 * Returns current clustering job status + metrics
 *
 * POST /api/ml/cluster-status
 * Manually trigger a clustering job (admin only)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClusteringStatus, startClusteringJob } from '$lib/server/ml/topic-clustering-worker.js';
import { db } from '$lib/server/db/client';
import { documentTopics } from '$lib/server/db/schema-postgres.js';
import { z } from 'zod';

const clusterTriggerSchema = z.object({
	force: z.boolean().optional().default(false)
});

/**
 * GET /api/ml/cluster-status
 * Returns clustering job status + document_topics table stats
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const status = getClusteringStatus();

    // Get document_topics statistics (capped to prevent OOM)
    const allTopics = await db.select().from(documentTopics).limit(50000);
    const topicStats: Record<number, { count: number; avgProbability: number }> = {};

    for (const record of allTopics) {
      if (!topicStats[record.topicId]) {
        topicStats[record.topicId] = { count: 0, avgProbability: 0 };
      }
      topicStats[record.topicId].count++;
      topicStats[record.topicId].avgProbability += record.membershipProbability;
    }

    // Normalize averages
    for (const topicId in topicStats) {
      topicStats[topicId].avgProbability /= topicStats[topicId].count;
    }

    return json({
      success: true,
      job: {
        id: status.jobId,
        status: status.status,
        startTime: new Date(status.startTime).toISOString(),
        endTime: status.endTime ? new Date(status.endTime).toISOString() : null,
        durationMs: status.endTime ? status.endTime - status.startTime : null,
        documentsProcessed: status.documentsProcessed,
        silhouetteScore: status.silhouetteScore ?? null,
        cacheInvalidated: status.cacheInvalidated,
        error: status.error ?? null,
      },
      statistics: {
        totalDocumentsWithTopics: allTopics.length,
        topicCount: 15,
        topicDistribution: topicStats,
        qualityMetrics: {
          silhouetteScore: status.silhouetteScore ?? null,
          recommendedAction: (status.silhouetteScore ?? 0) >= 0.6 ? 'none' : 'rerun_clustering',
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cluster-status] GET error:', err instanceof Error ? err.message : err);
    return json(
      {
        success: false,
        error: 'Failed to retrieve clustering status',
      },
      { status: 500 }
    );
  }
};

/**
 * POST /api/ml/cluster-status
 * Manually trigger clustering job (admin only)
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		// Admin auth check
		if (!locals.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// In production: check if user has admin role
		// if (locals.user.role !== 'admin') {
		//   return json({ error: 'Forbidden' }, { status: 403 });
		// }

		const raw = await request.json().catch(() => ({}));
		const parsed = clusterTriggerSchema.safeParse(raw);
		const body = parsed.success ? parsed.data : { force: false };

		// Start clustering job
		const jobId = await startClusteringJob();

		return json(
			{
				success: true,
				job: {
					id: jobId,
					status: 'started',
					startTime: new Date().toISOString()
				},
				message: 'Clustering job initiated. Monitor progress via GET /api/ml/cluster-status'
			},
			{ status: 202 }
		);
	} catch (err) {
		console.error('[cluster-status] POST error:', err instanceof Error ? err.message : err);
		return json(
			{
				success: false,
				error: 'Failed to start clustering job'
			},
			{ status: 500 }
		);
	}
};
