import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

/** GET /api/yorha/cluster-health — Cluster health metrics for YoRHa dashboard */
export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user?.id) {
    return json(
      {
        timestamp: new Date().toISOString(),
        metrics: {},
        thresholds: {
          cpu_warning: 70,
          cpu_critical: 90,
          memory_warning: 75,
          memory_critical: 90,
          gpu_warning: 80,
          gpu_critical: 95,
        },
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }
	try {
		// Collect system metrics
		const memUsage = process.memoryUsage();
		const totalMem = require('os').totalmem();
		const freeMem = require('os').freemem();

		const responseData = {
			timestamp: new Date().toISOString(),
			metrics: {
				cpu_usage: Math.round(Math.random() * 30 + 10), // Placeholder — real CPU requires sampling
				memory_usage: Math.round(((totalMem - freeMem) / totalMem) * 100),
				gpu_usage: 0, // Would need nvidia-smi
				heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
				heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
				rss_mb: Math.round(memUsage.rss / 1024 / 1024)
			},
			thresholds: {
				cpu_warning: 70,
				cpu_critical: 90,
				memory_warning: 75,
				memory_critical: 90,
				gpu_warning: 80,
				gpu_critical: 95
			}
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch (err) {
		console.error('[/api/yorha/cluster-health] error:', err);
		return json({
      timestamp: new Date().toISOString(),
      metrics: {},
      thresholds: {
        cpu_warning: 70,
        cpu_critical: 90,
        memory_warning: 75,
        memory_critical: 90,
        gpu_warning: 80,
        gpu_critical: 95,
      },
    }, {
			headers: cacheControl.short
		});
	}
};