/**
 * Case-Timeline Query Builder — Consolidation 3
 *
 * Supports dual SQL (PostgreSQL JSONB payload query) and Neo4j Cypher query modes
 * to reconstruct case timelines.
 */

import { db } from '$lib/server/db/client.js';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';
import { desc, sql as drizzleSql } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { CACHE_KEYS, CACHE_TTL, type TimelineEvent } from '../cache/cache-config.js';

interface TimelineQueryOptions {
  caseId: string;
  limit?: number;
  useCache?: boolean;
  mode?: 'sql' | 'neo4j' | 'dual';
}

/**
 * Fetch timeline events from PostgreSQL using JSONB extraction
 */
async function fetchSqlTimeline(caseId: string, limit: number): Promise<TimelineEvent[]> {
  try {
    const rows = await db
      .select()
      .from(contextTimeline)
      .where(drizzleSql`payload->>'caseId' = ${caseId}`)
      .orderBy(desc(contextTimeline.createdAt))
      .limit(limit);

    const validTypes = ['citation_saved', 'dwell_long', 'dwell_short', 'rl_adapt'];

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      caseId,
      eventType: validTypes.includes(r.eventType) ? (r.eventType as any) : 'rl_adapt',
      details: {
        ...(r.payload as Record<string, any>),
        pipeline: r.pipeline,
        signal: r.signal,
        grpoReward: r.grpoReward,
      },
    }));
  } catch (err) {
    console.error('[TimelineBuilder] SQL fetch failed:', err);
    return [];
  }
}

/**
 * Fetch timeline events from Neo4j
 */
async function fetchNeo4jTimeline(caseId: string, limit: number): Promise<TimelineEvent[]> {
  try {
    const neo4jUrl = ENV.NEO4J_HTTP_URL;
    const user = ENV.NEO4J_USER;
    const pass = ENV.NEO4J_PASSWORD;

    const cypher = `
      MATCH (c:Case {id: $caseId})-[r:HAS_EVENT]->(e:Event)
      RETURN e.id AS id, e.timestamp AS timestamp, e.eventType AS eventType, e.details AS details
      ORDER BY e.timestamp DESC
      LIMIT $limit
    `;

    const res = await fetch(`${neo4jUrl}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
      },
      body: JSON.stringify({
        statements: [{ statement: cypher, parameters: { caseId, limit } }],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Neo4j returned status ${res.status}`);
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors[0].message);

    const rows = body.results[0]?.data ?? [];
    const validTypes = ['citation_saved', 'dwell_long', 'dwell_short', 'rl_adapt'];

    return rows.map((row: any) => {
      const [id, timestamp, eventType, detailsRaw] = row.row;
      let details: Record<string, any> = {};
      try {
        details = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : (detailsRaw ?? {});
      } catch {
        // Fallback
      }
      return {
        id: String(id),
        timestamp: String(timestamp),
        caseId,
        eventType: validTypes.includes(eventType) ? (eventType as any) : 'rl_adapt',
        details,
      };
    });
  } catch (err) {
    console.warn('[TimelineBuilder] Neo4j fetch failed:', err);
    return [];
  }
}

/**
 * Main API: Build and return case timeline
 */
export async function buildCaseTimeline(opts: TimelineQueryOptions): Promise<TimelineEvent[]> {
  const caseId = opts.caseId;
  const limit = opts.limit ?? 100;
  const useCache = opts.useCache !== false;
  const mode = opts.mode ?? 'dual';

  if (!caseId) return [];

  const redis = getRedis();
  const cacheKey = CACHE_KEYS.CASE_TIMELINE(caseId);

  // 1. Try cache if enabled
  if (useCache) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as TimelineEvent[];
      }
    } catch {
      // Ignore cache read failures
    }
  }

  // 2. Fetch based on mode
  let events: TimelineEvent[] = [];
  if (mode === 'sql') {
    events = await fetchSqlTimeline(caseId, limit);
  } else if (mode === 'neo4j') {
    events = await fetchNeo4jTimeline(caseId, limit);
  } else {
    // Dual mode: fetch both and merge
    const [sqlEvents, neo4jEvents] = await Promise.all([
      fetchSqlTimeline(caseId, limit),
      fetchNeo4jTimeline(caseId, limit),
    ]);

    // Merge and deduplicate by event ID
    const seen = new Set<string>();
    const merged = [...sqlEvents, ...neo4jEvents];
    for (const ev of merged) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        events.push(ev);
      }
    }

    // Sort descending by timestamp
    events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    events = events.slice(0, limit);
  }

  // 3. Cache results
  if (useCache && events.length > 0) {
    try {
      await redis.setex(cacheKey, CACHE_TTL.CASE_TIMELINE, JSON.stringify(events));
    } catch {
      // Ignore cache write failures
    }
  }

  return events;
}
