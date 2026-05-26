import { createHash } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { agentMemoryObservations } from '$lib/server/db/schema.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { getRedis, setJsonWithTtl } from '$lib/server/redis.js';

export const agentObservationSchema = z.object({
  source: z.string().min(1).default('claude-mem'),
  ide: z.string().min(1).default('opencode'),
  sessionId: z.string().min(1).optional(),
  observationId: z.string().min(1).optional(),
  projectPath: z.string().optional(),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  sourceRefs: z.array(z.string()).default([]),
  toolCalls: z.array(z.any()).default([]),
  rawJson: z.record(z.string(), z.any()).default({}),
});

export type AgentObservationInput = z.infer<typeof agentObservationSchema>;

export type AgentObservationIngestResult = {
  ok: true;
  postgres_id: string;
  qdrant_point_id: string | null;
  redis_key: string;
  embedding_model: string;
  embedding_dim: number;
  degraded: boolean;
  degraded_reason: string | null;
};

function buildObservationKey(payload: AgentObservationInput): string {
  const basis = [
    payload.source,
    payload.ide,
    payload.sessionId ?? '',
    payload.observationId ?? '',
    payload.projectPath ?? '',
    payload.summary,
  ].join('|');
  return createHash('sha256').update(basis).digest('hex');
}

function serializeToolCalls(toolCalls: AgentObservationInput['toolCalls']): Array<Record<string, unknown> | string> {
  return toolCalls.map((entry) => (typeof entry === 'string' ? entry : entry));
}

function makeHotPayload(
  row: { id: string; createdAt: string },
  payload: AgentObservationInput,
  qdrantPointId: string | null,
  degraded: boolean,
  degradedReason: string | null
) {
  return {
    id: row.id,
    source: payload.source,
    ide: payload.ide,
    session_id: payload.sessionId ?? null,
    observation_id: payload.observationId ?? null,
    project_path: payload.projectPath ?? null,
    summary: payload.summary,
    tags: payload.tags,
    source_refs: payload.sourceRefs,
    tool_calls: payload.toolCalls,
    created_at: row.createdAt,
    embedding_model: 'embeddinggemma:latest',
    embedding_dim: 768,
    qdrant_point_id: qdrantPointId,
    degraded,
    degraded_reason: degradedReason,
  };
}

let agentMemoryCollectionReady = false;

async function ensureAgentMemoryObservationCollection(): Promise<void> {
  if (agentMemoryCollectionReady) return;

  const collectionName = qdrant.collections.agent_memory_observations;
  try {
    await qdrant.client.getCollection(collectionName);
    agentMemoryCollectionReady = true;
    return;
  } catch {
    // create below
  }

  await qdrant.client.createCollection(collectionName, {
    vectors: {
      size: VECTOR_CONFIG.DIMENSIONS,
      distance: VECTOR_CONFIG.DISTANCE_METRIC.QDRANT,
    },
    on_disk_payload: true,
    hnsw_config: VECTOR_CONFIG.QDRANT_HNSW,
    quantization_config: VECTOR_CONFIG.QDRANT_QUANTIZATION,
  } as any);

  agentMemoryCollectionReady = true;
}

export async function ingestAgentObservation(
  input: AgentObservationInput
): Promise<AgentObservationIngestResult> {
  const payload = agentObservationSchema.parse(input);
  const observationKey = buildObservationKey(payload);
  const redisKey = 'ace:memory:claude-mem:latest';

  const insertedRows = await db
    .insert(agentMemoryObservations)
    .values({
      source: payload.source,
      ide: payload.ide,
      sessionId: payload.sessionId ?? null,
      observationId: payload.observationId ?? null,
      projectPath: payload.projectPath ?? null,
      summary: payload.summary,
      tags: payload.tags,
      sourceRefs: payload.sourceRefs,
      toolCalls: serializeToolCalls(payload.toolCalls),
      rawJson: payload.rawJson,
      embeddingModel: 'embeddinggemma:latest',
      embeddingDim: 768,
    })
    .returning({
      id: agentMemoryObservations.id,
      createdAt: agentMemoryObservations.createdAt,
    });

  const row = insertedRows[0];
  if (!row) {
    throw new Error('Insert failed');
  }

  const response: AgentObservationIngestResult = {
    ok: true,
    postgres_id: row.id,
    qdrant_point_id: null,
    redis_key: redisKey,
    embedding_model: 'embeddinggemma:latest',
    embedding_dim: 768,
    degraded: false,
    degraded_reason: null,
  };

  let embedding: number[] | null = null;
  try {
    embedding = await generateSingleEmbedding(payload.summary);
    if (Array.isArray(embedding) && embedding.length > 0) {
      try {
        await db
          .update(agentMemoryObservations)
          .set({
            embedding: sql`${JSON.stringify(embedding)}::vector`,
          })
          .where(eq(agentMemoryObservations.id, row.id));
      } catch (error) {
        response.degraded = true;
        response.degraded_reason =
          response.degraded_reason ??
          (error instanceof Error ? error.message : 'pgvector_update_failed');
      }
    }
  } catch (error) {
    response.degraded = true;
    response.degraded_reason = error instanceof Error ? error.message : 'embedding_failed';
  }

  const pointId = deterministicPointId(observationKey);

  if (embedding && embedding.length > 0) {
    try {
      await ensureAgentMemoryObservationCollection();
      await qdrant.client.upsert(qdrant.collections.agent_memory_observations, {
        wait: true,
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: {
              source: payload.source,
              ide: payload.ide,
              session_id: payload.sessionId ?? null,
              observation_id: payload.observationId ?? null,
              project_path: payload.projectPath ?? null,
              summary: payload.summary.slice(0, 2000),
              tags: payload.tags,
              source_refs: payload.sourceRefs,
              tool_calls: payload.toolCalls,
              embedding_model: 'embeddinggemma:latest',
              embedding_dim: 768,
              created_at: row.createdAt,
            },
          },
        ],
      });

      await db
        .update(agentMemoryObservations)
        .set({ qdrantPointId: String(pointId) })
        .where(eq(agentMemoryObservations.id, row.id));

      response.qdrant_point_id = String(pointId);
    } catch (error) {
      response.degraded = true;
      response.degraded_reason =
        response.degraded_reason ??
        (error instanceof Error ? error.message : 'qdrant_upsert_failed');
    }
  } else {
    response.degraded = true;
    response.degraded_reason = response.degraded_reason ?? 'embedding_missing';
  }

  const hotPayload = makeHotPayload(
    { id: row.id, createdAt: row.createdAt },
    payload,
    response.qdrant_point_id,
    response.degraded,
    response.degraded_reason
  );

  try {
    const redis = getRedis();
    await setJsonWithTtl(redisKey, hotPayload, 24 * 60 * 60);
    if (payload.sessionId) {
      await setJsonWithTtl(`ace:memory:claude-mem:session:${payload.sessionId}`, hotPayload, 24 * 60 * 60);
    }
    void redis.ping().catch(() => {});
  } catch (error) {
    response.degraded = true;
    response.degraded_reason =
      response.degraded_reason ??
      (error instanceof Error ? error.message : 'redis_hot_write_failed');
  }

  return response;
}
