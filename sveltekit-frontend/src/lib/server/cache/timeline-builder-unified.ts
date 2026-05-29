/**
 * Unified Timeline Builder — 5 duplicate queries → 1 builder class
 *
 * Consolidates timeline query patterns across case contexts.
 * Replaces hardcoded `select().from(contextTimeline).where()` in 5 files.
 *
 * Single API: TimelineBuilder.forCase(caseId).execute()
 */

import { cacheTTL } from './shared-cache-api';
import { CACHE_KEYS, CACHE_TTL, TimelineEventSchema } from './cache-config';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════

export interface TimelineEvent {
  id: string;
  timestamp: string;
  caseId: string;
  eventType: 'citation_saved' | 'dwell_long' | 'dwell_short' | 'rl_adapt';
  details?: Record<string, any>;
}

export class TimelineBuilder {
  private caseId: string;
  private hoursBack: number = 24;
  private eventTypes: string[] = [];

  constructor(caseId: string) {
    this.caseId = caseId;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Fluent Query Builder
  // ═══════════════════════════════════════════════════════════════════

  static forCase(caseId: string): TimelineBuilder {
    return new TimelineBuilder(caseId);
  }

  sinceHours(hours: number): TimelineBuilder {
    this.hoursBack = hours;
    return this;
  }

  filterEvents(...types: string[]): TimelineBuilder {
    this.eventTypes = types;
    return this;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Execution
  // ═══════════════════════════════════════════════════════════════════

  async execute(): Promise<TimelineEvent[]> {
    // Generate cache key based on query parameters
    const cacheKey = CACHE_KEYS.CASE_TIMELINE(
      `${this.caseId}:${this.hoursBack}:${this.eventTypes.join(',')}`
    );

    // Use shared cache pattern
    return cacheTTL(
      cacheKey,
      CACHE_TTL.CASE_TIMELINE,
      () => this.query(),
      {
        onMiss: (key) => {
          console.debug(`[TimelineBuilder] MISS: ${key}`);
        },
        onError: (err) => {
          console.warn(`[TimelineBuilder] Cache error:`, err);
        },
      }
    );
  }

  private async query(): Promise<TimelineEvent[]> {
    // Build query dynamically
    const cutoffTime = new Date(Date.now() - this.hoursBack * 60 * 60 * 1000);

    const conditions = [
      // Filter by caseId inside the payload JSONB field
      eq(sql`payload->>'caseId'`, this.caseId),
      gte(contextTimeline.createdAt, cutoffTime),
    ];

    if (this.eventTypes.length > 0) {
      // Add event type filter (would need IN operator from drizzle-orm)
      // For now, filter in memory after query
    }

    const rows = await db
      .select()
      .from(contextTimeline)
      .where(and(...conditions))
      .orderBy(desc(contextTimeline.createdAt))
      .limit(1000);

    // Map to TimelineEvent and apply memory filters
    return rows
      .map((row) => ({
        id: row.id,
        timestamp: row.createdAt?.toISOString() || '',
        caseId: (row.payload as any)?.caseId || this.caseId,
        eventType: row.eventType as TimelineEvent['eventType'],
        details: row.payload as Record<string, any> | undefined,
      }))
      .filter((event) => {
        if (this.eventTypes.length === 0) return true;
        return this.eventTypes.includes(event.eventType);
      });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Convenience Functions (for simple cases)
// ═══════════════════════════════════════════════════════════════════════

export async function getRecentTimeline(caseId: string, hoursBack: number = 24) {
  return TimelineBuilder.forCase(caseId).sinceHours(hoursBack).execute();
}

export async function getTimelineByEvent(
  caseId: string,
  eventType: string,
  hoursBack: number = 24
) {
  return TimelineBuilder.forCase(caseId)
    .sinceHours(hoursBack)
    .filterEvents(eventType)
    .execute();
}

export async function getCitationTimeline(caseId: string) {
  return TimelineBuilder.forCase(caseId).filterEvents('citation_saved').execute();
}

export async function getUserDwellEvents(caseId: string, hoursBack: number = 24) {
  return TimelineBuilder.forCase(caseId)
    .sinceHours(hoursBack)
    .filterEvents('dwell_long', 'dwell_short')
    .execute();
}

// ═══════════════════════════════════════════════════════════════════════
// Invalidation
// ═══════════════════════════════════════════════════════════════════════

import { getRedis } from '$lib/server/redis';

export async function clearTimelineCache(caseId?: string): Promise<number> {
  const redis = getRedis();

  if (caseId) {
    const pattern = `case:timeline:${caseId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      return redis.del(...keys);
    }
    return 0;
  } else {
    const keys = await redis.keys('case:timeline:*');
    if (keys.length > 0) {
      return redis.del(...keys);
    }
    return 0;
  }
}

// Invalidate on new timeline event
export async function invalidateTimelineOnEvent(caseId: string): Promise<void> {
  const redis = getRedis();
  const pattern = `case:timeline:${caseId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
