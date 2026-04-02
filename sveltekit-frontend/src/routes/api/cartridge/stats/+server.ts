/**
 * CHR-ROM97 Cartridge Cache Stats API
 *
 * GET → Returns Redis cartridge cache statistics
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCartridgeCacheStats } from '$lib/server/cache/cartridge-tensor-bridge.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) {
    return json(
      {
        cachedCases: 0,
        totalSizeBytes: 0,
        redisConnected: false,
        nesMemory: {
          totalDocuments: 0,
          allocatedBanks: 0,
          bankSizeBytes: 0,
          totalMemoryBytes: 0,
          utilizationPercent: 0,
        },
        totalSizeMB: 0,
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }
	try {
		const stats = await getCartridgeCacheStats();
		return json({
			...stats,
			totalSizeMB: +(stats.totalSizeBytes / (1024 * 1024)).toFixed(2),
		});
	} catch (err) {
		console.error('[cartridge-stats] Error:', err);
		return json(
      {
        cachedCases: 0,
        totalSizeBytes: 0,
        redisConnected: false,
        nesMemory: {
          totalDocuments: 0,
          allocatedBanks: 0,
          bankSizeBytes: 0,
          totalMemoryBytes: 0,
          utilizationPercent: 0,
        },
        totalSizeMB: 0,
        error: 'Stats query failed',
      },
    );
	}
};
