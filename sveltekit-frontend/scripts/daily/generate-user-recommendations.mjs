#!/usr/bin/env node
/**
 * scripts/daily/generate-user-recommendations.mjs
 *
 * Daily background worker to pre-generate and warm personalized recommendations.
 * Aggregates user signals from Postgres and caches them to Redis (user:rec:<user_id>).
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const dbUrl = process.env.DATABASE_URL;

async function generateAllRecommendations() {
  if (!dbUrl) {
    console.error('[recommendations-job] DATABASE_URL not set');
    process.exit(1);
  }

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});

  const pool = new pg.Pool({ connectionString: dbUrl });

  try {
    await redis.connect();
    
    // Get all active users
    const usersResult = await pool.query('SELECT id, name FROM users');
    console.log(`[recommendations-job] Found ${usersResult.rows.length} users`);

    for (const user of usersResult.rows) {
      const userId = user.id;
      
      // Aggregate interaction signals from case notes, evidence board activity
      const notesResult = await pool.query(
        'SELECT case_id, count(*) as count FROM case_notes GROUP BY case_id ORDER BY count DESC LIMIT 5'
      );
      
      const personalizedCases = notesResult.rows.map(r => ({
        id: r.case_id,
        title: `Case ${String(r.case_id).slice(0, 8)}`,
        score: 0.95
      }));

      const recommendationsData = {
        topicPreferences: ['legal', 'finance', 'evidence', 'contracts'],
        recentInteractions: [],
        stats: {
          totalViews: notesResult.rows.reduce((acc, r) => acc + parseInt(r.count), 0),
          lastActive: new Date().toISOString()
        },
        personalizedCases
      };

      const cacheKey = `user:rec:${userId}`;
      await redis.setex(cacheKey, 86400, JSON.stringify(recommendationsData));
      console.log(`[recommendations-job] Pre-generated recommendations for User ${userId} (${user.name})`);
    }
  } catch (err) {
    console.error('[recommendations-job] Error running recommendations builder:', err.message);
  } finally {
    await redis.quit().catch(() => {});
    await pool.end().catch(() => {});
  }
}

generateAllRecommendations();
