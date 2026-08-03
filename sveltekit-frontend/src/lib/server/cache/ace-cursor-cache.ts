/**
 * ACE Cursor Cache — Redis-backed retrieval state persistence
 *
 * Stores the cursor position through a multi-step retrieval pipeline so that:
 * 1. Interrupted searches can resume from the last valid candidate
 * 2. Pagination works across session boundaries
 * 3. Cost tracking is possible (resume cheaper than restart)
 */

import { z } from 'zod';

export const ACECursorSchema = z.object({
  id: z.string().uuid(),
  query_text: z.string(),
  query_hash: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 hex
  last_rank: z.number().int().min(0),
  last_score: z.number().min(0).max(1),
  candidates_retrieved: z.number().int().min(0),
  lanes_completed: z.array(z.enum(['qdrant', 'turbovec', 'postgres', 'neo4j'])),
  next_lane: z.enum(['qdrant', 'turbovec', 'postgres', 'neo4j']).optional(),
  session_id: z.string().optional(),
  created_at: z.string().datetime(),
  last_accessed_at: z.string().datetime(),
  ttl_seconds: z.number().int().min(60).max(86400).default(3600),
  packet_key: z.string().optional(),
  last_retrieved_at: z.string().datetime().optional(),
  validation_gates: z.record(z.string(), z.enum(['PASS', 'FAIL', 'NOT_PROVEN', 'PARTIAL_PROVEN'])).optional(),
  dimension_verified: z.number().int().optional(),
  embedding_lane: z.enum(['dense_384', 'dense_768']).optional(),
  projection_version: z.string().nullable().optional(),
  retrieval_trace: z
    .object({
      qdrant_elapsed_ms: z.number().nonnegative(),
      postgres_join_elapsed_ms: z.number().nonnegative(),
      total_elapsed_ms: z.number().nonnegative(),
    })
    .optional(),
});

export type ACECursor = z.infer<typeof ACECursorSchema>;

/**
 * Validate and type-check a cursor object
 */
export function validateACECursor(data: unknown): ACECursor | null {
  try {
    return ACECursorSchema.parse(data);
  } catch {
    return null;
  }
}

/**
 * Redis key pattern for cursor storage
 */
export function getCursorKey(cursorId: string): string {
  return `ace:cursor:${cursorId}`;
}

/**
 * Session-based cursor lookup (maps session → cursor ID)
 */
export function getSessionCursorKey(sessionId: string): string {
  return `ace:session:${sessionId}:cursor`;
}

/**
 * Query-based cursor lookup (find by query hash to resume similar searches)
 */
export function getQueryCursorKey(queryHash: string): string {
  return `ace:query:${queryHash}:cursor`;
}

/**
 * Persist cursor to Redis with TTL
 */
export async function setACECursor(
  redis: any,
  cursor: ACECursor
): Promise<void> {
  const key = getCursorKey(cursor.id);
  const sessionKey = cursor.session_id ? getSessionCursorKey(cursor.session_id) : null;
  const queryKey = getQueryCursorKey(cursor.query_hash);

  try {
    await redis.setex(key, cursor.ttl_seconds, JSON.stringify(cursor));
    if (sessionKey) {
      await redis.setex(sessionKey, cursor.ttl_seconds, cursor.id);
    }
    await redis.setex(queryKey, cursor.ttl_seconds, cursor.id);
  } catch (err) {
    console.error('[ACE Cursor] setACECursor failed:', err);
    throw err;
  }
}

/**
 * Fetch cursor by ID
 */
export async function getACECursor(
  redis: any,
  cursorId: string
): Promise<ACECursor | null> {
  try {
    const key = getCursorKey(cursorId);
    const data = await redis.get(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return validateACECursor(parsed);
  } catch (err) {
    console.error('[ACE Cursor] getACECursor failed:', err);
    return null;
  }
}

/**
 * Find cursor by session ID
 */
export async function getACECursorBySession(
  redis: any,
  sessionId: string
): Promise<ACECursor | null> {
  try {
    const sessionKey = getSessionCursorKey(sessionId);
    const cursorId = await redis.get(sessionKey);
    if (!cursorId) return null;
    return getACECursor(redis, cursorId);
  } catch (err) {
    console.error('[ACE Cursor] getACECursorBySession failed:', err);
    return null;
  }
}

/**
 * Find cursor by query hash (for resumption)
 */
export async function getACECursorByQuery(
  redis: any,
  queryHash: string
): Promise<ACECursor | null> {
  try {
    const queryKey = getQueryCursorKey(queryHash);
    const cursorId = await redis.get(queryKey);
    if (!cursorId) return null;
    return getACECursor(redis, cursorId);
  } catch (err) {
    console.error('[ACE Cursor] getACECursorByQuery failed:', err);
    return null;
  }
}

/**
 * Update cursor progress in Redis
 */
export async function updateACECursor(
  redis: any,
  cursorId: string,
  updates: Partial<Omit<ACECursor, 'id' | 'query_text' | 'query_hash' | 'created_at'>>
): Promise<ACECursor | null> {
  try {
    const cursor = await getACECursor(redis, cursorId);
    if (!cursor) return null;
    const updated: ACECursor = {
      ...cursor,
      ...updates,
      last_accessed_at: new Date().toISOString(),
    };
    const validated = validateACECursor(updated);
    if (!validated) {
      console.error('[ACE Cursor] Updated cursor failed validation');
      return null;
    }
    await setACECursor(redis, validated);
    return validated;
  } catch (err) {
    console.error('[ACE Cursor] updateACECursor failed:', err);
    return null;
  }
}

/**
 * Delete cursor (cleanup after completion or timeout)
 */
export async function deleteACECursor(
  redis: any,
  cursorId: string
): Promise<void> {
  try {
    const cursor = await getACECursor(redis, cursorId);
    if (!cursor) return;
    const key = getCursorKey(cursorId);
    const sessionKey = cursor.session_id ? getSessionCursorKey(cursor.session_id) : null;
    const queryKey = getQueryCursorKey(cursor.query_hash);
    const pipeline = redis.pipeline();
    pipeline.del(key);
    if (sessionKey) pipeline.del(sessionKey);
    pipeline.del(queryKey);
    await pipeline.exec();
  } catch (err) {
    console.error('[ACE Cursor] deleteACECursor failed:', err);
  }
}

/**
 * Clear all cursors for a session (logout / session cleanup)
 */
export async function clearSessionCursors(
  redis: any,
  sessionId: string
): Promise<void> {
  try {
    const sessionKey = getSessionCursorKey(sessionId);
    const cursorId = await redis.get(sessionKey);
    if (cursorId) {
      await deleteACECursor(redis, cursorId);
    }
  } catch (err) {
    console.error('[ACE Cursor] clearSessionCursors failed:', err);
  }
}
