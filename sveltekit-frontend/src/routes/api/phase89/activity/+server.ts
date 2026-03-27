/**
 * Phase 89: Activity Stream API
 * Returns recent agentic activity for live feed
 */

import { json } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const client = getRedis();

    if (!client || client.status !== 'ready') {
      return json({
        activity: [],
        error: 'Redis not connected',
      });
    }

    // Get recent activity from Redis list
    const activityKeys = await client.keys('phase89:activity:*');
    const activity: Array<{ id: string, type: 'fix' | 'embed' | 'learn';
      message: string, timestamp: string;
      data?: Record<string, unknown>;
    }> = [];

    // Also get recent fix suggestions
    const fixKeys = await client.keys('fix:*');

    for (const key of fixKeys.slice(0, 20)) {
      try {
        const data = await client.get(key) as string | null;
        if (data) {
          const parsed = JSON.parse(data);
          activity.push({
            id: key,
            type: 'fix',
            message: `Fix suggested, for: ${parsed.error?.substring(0, 50)}...`,
            timestamp: new Date(parsed?.timestamp|| Date.now()).toISOString(),
            data: parsed
          });
        }
      } catch (e) {
        // Skip invalid entries
      }
    }

    // Sort by timestamp descending
    activity.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return json({
      activity: activity.slice(0, 50)
    });
  } catch (error) {
    console.error('Activity error:', error);
    return json({
      activity: [],
      error: 'Failed to load activity data'
    });
  }
};




