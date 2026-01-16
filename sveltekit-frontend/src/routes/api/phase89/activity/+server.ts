/**
 * Phase 89: Activity Stream API
 * Returns recent agentic activity for live feed
 */

import { json } from '@sveltejs/kit';
import { createClient } from 'redis';
import type { RequestHandler } from './$types';

let redis: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (!redis) {
    redis = createClient({
      url: process.env?.REDIS_URL?? 'redis://127.0.0.1:6379'
    });
    await redis.connect().catch(() => null);
  }
  return redis;
}

export const GET: RequestHandler = async () => {
  try {
    const client = await getRedis();

    if (!client?.isOpen) {
      return json({
        activity: [],
        error: 'Redis not connected'
      });
    }

    // Get recent activity from Redis list
    const activityKeys = await client.keys('phase89:activity:*');
    const activity: Array<{ id: string;
      type: 'fix' | 'embed' | 'learn';
      message: string; timestamp: string;
      data?: any;
    }> = [];

    // Also get recent fix suggestions
    const fixKeys = await client.keys('fix:*');

    for (const key of fixKeys.slice(0, 20)) {
      try {
        const data = await client.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          activity.push({
            id: key,
            type: 'fix',
            message: `Fix suggested for: ${parsed.error?.substring(0, 50)}...`,
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
  } catch (error: any) {
    console.error('Activity error:', error);
    return json({
      activity: [],
      error: error.message
    });
  }
};




