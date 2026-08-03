/**
 * potential-recommendations.ts
 *
 * Dual-table recommendation strategy:
 *
 * 1. recommendations (Postgres) — visible to user, bounded 4 items
 * 2. potential_recommendations (Postgres) — deferred candidates, async scoring queue
 * 3. RabbitMQ queue (recommendations.score) — async worker pool for slow work
 *
 * Flow:
 *   Top-4 scoring → recommendations table (synchronous)
 *   Overflow (5-20) → potential_recommendations (async queue entry)
 *   RabbitMQ worker picks up → scores remaining → upserts back to potential_recommendations
 *   User sees "More recommendations" → paginated read from potential_recommendations
 *
 * This keeps UI responsive while background scoring completes.
 */

import { z } from 'zod';
import { eq, and, gt, asc } from 'drizzle-orm';

/**
 * Single recommendation item (both tables).
 */
export const RecommendationItemSchema = z.object({
  id: z.string().uuid().describe('Unique ID for this recommendation'),
  title: z.string().min(1).max(256),
  description: z.string().max(1024).nullable(),
  packet_key: z.string().optional().nullable().describe('Link to canonical packet'),
  score: z.number().min(0).max(1).describe('Normalized recommendation score (0-1)'),
  confidence: z.number().min(0).max(1).default(0.5).describe('Model confidence in this score'),
  reason: z.string().max(512).optional().nullable().describe('Why this was recommended'),
  action_type: z.enum(['explore', 'fix', 'refactor', 'document', 'test', 'review']),
  tags: z.array(z.string()).default([]),
  source_lane: z.enum(['vector_semantic', 'topology_knn', 'classifier', 'hybrid']).describe('Which lane generated this'),
  created_at: z.string().datetime().default(() => new Date().toISOString())
});

export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

/**
 * Full recommendations table (Postgres, visible to user).
 * Max 4 items per query_key, synchronized.
 */
export const RecommendationsTableSchema = z.object({
  id: z.string().uuid(),
  query_key: z.string().describe('Unique key for this query/session/context'),
  user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  items: z.array(RecommendationItemSchema).min(1).max(4).describe('Bounded to top-4'),
  total_available: z.number().int().min(0).describe('Total candidates (some in potential_recommendations)'),
  generated_at: z.string().datetime(),
  expires_at: z.string().datetime().describe('TTL for this recommendation set'),
  metadata: z.record(z.string(), z.any()).optional().nullable()
});

export type RecommendationsTable = z.infer<typeof RecommendationsTableSchema>;

/**
 * Potential recommendations table (Postgres, async scoring).
 * All candidates pending scoring or already scored but not in top-4.
 */
export const PotentialRecommendationsTableSchema = z.object({
  id: z.string().uuid(),
  query_key: z.string().describe('Links back to recommendations.query_key'),
  recommendation_id: z.string().uuid().optional().nullable().describe('If promoted to top-4'),
  user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  candidate_rank: z.number().int().min(5).describe('Rank 5+ (not in top-4)'),
  item: RecommendationItemSchema,
  scoring_status: z.enum(['pending', 'scoring', 'scored', 'archived']).default('pending'),
  score_attempt_count: z.number().int().min(0).default(0),
  last_scored_at: z.string().datetime().optional().nullable(),
  enqueued_at: z.string().datetime(),
  expires_at: z.string().datetime()
});

export type PotentialRecommendationsTable = z.infer<typeof PotentialRecommendationsTableSchema>;

/**
 * RabbitMQ message for async recommendation scoring.
 */
export const RecommendationScoringTaskSchema = z.object({
  task_id: z.string().uuid(),
  potential_recommendation_id: z.string().uuid(),
  query_key: z.string(),
  candidate_data: z.object({
    title: z.string(),
    description: z.string().optional().nullable(),
    packet_key: z.string().optional().nullable(),
  source_lane: z.string()
  }),
  scoring_config: z.object({
    weights: z.record(z.string(), z.number()).describe('Lane weights for composite scoring'),
    timeout_ms: z.number().int().default(5000)
  }).optional(),
  created_at: z.string().datetime(),
  attempt_number: z.number().int().default(1)
});

export type RecommendationScoringTask = z.infer<typeof RecommendationScoringTaskSchema>;

/**
 * Partition recommendations into top-4 (visible) + overflow (potential_recommendations).
 */
export async function partitionRecommendations(
  allCandidates: RecommendationItem[],
  queryKey: string,
  userId: string,
  workspaceId: string,
  db: any
): Promise<{
  top4: RecommendationsTable;
  overflow: PotentialRecommendationsTable[];
}> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h TTL

  // Sort by score descending
  const sorted = [...allCandidates].sort((a, b) => b.score - a.score);

  // Top 4
  const topItems = sorted.slice(0, 4);
  const top4: RecommendationsTable = {
    id: crypto.randomUUID(),
    query_key: queryKey,
    user_id: userId,
    workspace_id: workspaceId,
    items: topItems,
    total_available: sorted.length,
    generated_at: now,
    expires_at: expiresAt
  };

  // Overflow (5-20)
  const overflowItems = sorted.slice(4, 20);
  const overflow: PotentialRecommendationsTable[] = overflowItems.map((item, idx) => ({
    id: crypto.randomUUID(),
    query_key: queryKey,
    recommendation_id: null,
    user_id: userId,
    workspace_id: workspaceId,
    candidate_rank: 5 + idx,
    item,
    scoring_status: 'pending' as const,
    score_attempt_count: 0,
    last_scored_at: null,
    enqueued_at: now,
    expires_at: expiresAt
  }));

  return { top4, overflow };
}

/**
 * Queue recommendations for async scoring (RabbitMQ).
 * Used by a background worker to improve scores and potentially re-rank.
 */
export function createScoringTasks(
  potentialRecs: PotentialRecommendationsTable[],
  scoringWeights?: Record<string, number>
): RecommendationScoringTask[] {
  return potentialRecs.map(rec => ({
    task_id: crypto.randomUUID(),
    potential_recommendation_id: rec.id,
    query_key: rec.query_key,
    candidate_data: {
      title: rec.item.title,
      description: rec.item.description,
      packet_key: rec.item.packet_key,
      source_lane: rec.item.source_lane
    },
    scoring_config: {
      weights: scoringWeights ?? {
        vector_semantic: 0.4,
        topology_knn: 0.3,
        classifier: 0.2,
        hybrid: 0.1
      },
      timeout_ms: 5000
    },
    created_at: new Date().toISOString(),
    attempt_number: 1
  }));
}

/**
 * Fetch pending recommendations for scoring.
 */
export async function getPendingRecommendations(
  db: any,
  queryKey: string,
  limit: number = 10
): Promise<PotentialRecommendationsTable[]> {
  // Note: This is a type-only function; actual implementation depends on Drizzle schema
  // Pseudo-code:
  // const results = await db.select()
  //   .from(potentialRecommendationsTable)
  //   .where(
  //     and(
  //       eq(potentialRecommendationsTable.query_key, queryKey),
  //       eq(potentialRecommendationsTable.scoring_status, 'pending')
  //     )
  //   )
  //   .limit(limit);
  // return results;

  throw new Error('getPendingRecommendations: implement with actual Drizzle schema');
}

/**
 * Update a potential recommendation with new score.
 */
export async function updatePotentialRecommendationScore(
  db: any,
  potentialRecId: string,
  newScore: number,
  newStatus: 'scored' | 'archived' = 'scored'
): Promise<PotentialRecommendationsTable | null> {
  // Pseudo-code:
  // const updated = await db.update(potentialRecommendationsTable)
  //   .set({
  //     item: { ...existing.item, score: newScore },
  //     scoring_status: newStatus,
  //     last_scored_at: new Date().toISOString(),
  //     score_attempt_count: existing.score_attempt_count + 1
  //   })
  //   .where(eq(potentialRecommendationsTable.id, potentialRecId))
  //   .returning();
  // return updated[0] ?? null;

  throw new Error('updatePotentialRecommendationScore: implement with actual Drizzle schema');
}

/**
 * Fetch top-4 recommendations for a query.
 */
export async function getTopRecommendations(
  db: any,
  queryKey: string
): Promise<RecommendationsTable | null> {
  // Pseudo-code:
  // const result = await db.select()
  //   .from(recommendationsTable)
  //   .where(eq(recommendationsTable.query_key, queryKey))
  //   .limit(1);
  // return result[0] ?? null;

  throw new Error('getTopRecommendations: implement with actual Drizzle schema');
}

/**
 * RabbitMQ message schema for publishing scoring tasks.
 */
export const RecommendationQueueMessageSchema = z.object({
  exchange: z.literal('atlas.recommendations'),
  routingKey: z.literal('score'),
  message: RecommendationScoringTaskSchema
});

export type RecommendationQueueMessage = z.infer<typeof RecommendationQueueMessageSchema>;

/**
 * Helper to format a task for RabbitMQ.
 */
export function formatQueueMessage(task: RecommendationScoringTask): RecommendationQueueMessage {
  return {
    exchange: 'atlas.recommendations',
    routingKey: 'score',
    message: task
  };
}
