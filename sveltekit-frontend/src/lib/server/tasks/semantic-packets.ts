// Server helpers for Task Semantic Packets
// - createTaskSemanticPacket(taskId)
// - attachRelevantFilesFromQdrant(taskId)
// - simple trace helper: traceTaskPacketLifecycle

import { db } from '$lib/server/db/client';
import { qdrant as QdrantManager, deterministicChunkId } from '$lib/server/vector/qdrant-manager';
import { randomUUID } from 'crypto';
import { getRedis } from '$lib/server/redis';
import { workspaceTasks, taskSemanticPackets, taskFileLinks, agentPickupQueue } from '../db/schema/tasks';
import { eq, desc } from 'drizzle-orm';

// NOTE: This file contains scaffolds and minimal implementations.
// Replace the placeholder Gemma4 / embedding calls with your project's callers.

export async function traceTaskPacketLifecycle(taskId: number, step: string, meta: Record<string, any> = {}) {
  // TODO: wire to Langfuse or project's tracing helper
  console.log(`[traceTaskPacket:${taskId}] ${step}`, meta);
}

export async function createTaskSemanticPacket(taskId: number) {
  await traceTaskPacketLifecycle(taskId, 'start');

  // 1. Load task from DB
  const task = await db.select().from(workspaceTasks).where(eq(workspaceTasks.id, taskId)).limit(1).then(r => r[0]);
  if (!task) throw new Error(`Task ${taskId} not found`);

  // 2. Produce a short Gemma4 summary (stubbed)
  const summary = `Summary for task ${taskId}: ${task.title || task.name || ''}`;
  const summaryModel = 'gemma4-rotorquant:latest';
  const summaryHash = (await import('crypto')).createHash('sha256').update(summary).digest('hex');

  await traceTaskPacketLifecycle(taskId, 'summarize', { summaryModel, summaryHash });

  // 3. Produce embedding (stub) — replace with embedding client
  const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);

  // 4. Synthesize deterministic point id
  const pointId = deterministicChunkId(String(task.workspace_id || task.workspaceId || '0'), `task:${taskId}`, 0, summaryHash) || `task-${taskId}-${randomUUID()}`;

  // 5. Upsert to Qdrant
  const payload = {
    point_kind: 'task_packet',
    workspace_id: String(task.workspace_id || task.workspaceId || ''),
    workspace_task_id: taskId,
    feature_id: task.feature_id || null,
    summary_model: summaryModel,
    summary_hash: summaryHash,
    agent_pickup_ready: false,
    observed_at: new Date().toISOString(),
  };

  await QdrantManager.batchUpsert({
    collection: process.env.TASKS_QDRANT_COLLECTION || 'codebase_chunks_768',
    points: [{
      id: pointId,
      vector: embedding,
      payload,
    }]
  });

  await traceTaskPacketLifecycle(taskId, 'qdrant_upsert', { pointId });

  // 6. Mirror into Postgres task_semantic_packets
  await db.insert(taskSemanticPackets).values({
    qdrant_point_id: pointId,
    workspace_task_id: taskId,
    feature_id: task.feature_id || null,
    summary_model: summaryModel,
    summary_hash: summaryHash,
    confidence: '0.0',
    status: 'created',
    agent_pickup_ready: false,
    created_at: new Date(),
    updated_at: new Date(),
    deleted: false,
  }).execute();

  await traceTaskPacketLifecycle(taskId, 'db_mirror_created');

  return { taskId, pointId, summaryHash };
}

export async function attachRelevantFilesFromQdrant(taskId: number) {
  await traceTaskPacketLifecycle(taskId, 'attach_files:start');

  // Query Qdrant for similar code chunks or feature summaries
  const manager = QdrantManager;
  const taskRow = await db.select().from(workspaceTasks).where(eq(workspaceTasks.id, taskId)).limit(1).then(r => r[0]);
  if (!taskRow) throw new Error(`Task ${taskId} not found`);

  const res = await manager._denseSearch({
    query: `task:${taskId}`,
    queryEmbedding: new Array(768).fill(0).map(() => Math.random() * 2 - 1),
    collection: process.env.TASKS_QDRANT_COLLECTION || 'codebase_chunks_768',
    limit: 10,
    filters: { must: [{ key: 'point_kind', match: { value: 'code_chunk' } }] }
  });

  // Mirror links into task_file_links
  for (const hit of (res.results || [])) {
    const filePath = (hit.payload as any)?.file_path || (hit.payload as any)?.path || null;
    if (!filePath) continue;
    await db.insert(taskFileLinks).values({ workspace_task_id: taskId, file_path: filePath, created_at: new Date() }).execute();
  }

  await traceTaskPacketLifecycle(taskId, 'attach_files:done', { found: (res.results || []).length });
  return { attached: (res.results || []).length };
}

export async function enqueueAgentPickup(taskId: number) {
  await traceTaskPacketLifecycle(taskId, 'enqueue:start');
  // Durable enqueue: create a queue row in Postgres, then nudge Redis list
  // 1) ensure there's a task_semantic_packets mirror row
  const packet = await db
    .select()
    .from(taskSemanticPackets)
    .where(eq(taskSemanticPackets.workspace_task_id, taskId))
    .orderBy(desc(taskSemanticPackets.created_at))
    .limit(1)
    .then((r: any[]) => r[0]);

  const packetId = packet ? String(packet.id) : null;

  // Insert durable queue row
  const insert = await db
    .insert(agentPickupQueue)
    .values({
      task_id: String(taskId),
      packet_id: packetId,
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      available_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    })
    .returning({ id: agentPickupQueue.id })
    .then((r: any[]) => (r && r[0] ? r[0].id : null));

  // Update packet row flag
  try {
    await db
      .update(taskSemanticPackets)
      .set({ agent_pickup_ready: true, updated_at: new Date() })
      .where(eq(taskSemanticPackets.workspace_task_id, taskId))
      .execute();
  } catch (err) {
    // non-fatal
  }

  // Push to Redis list to nudge workers (fire-and-forget)
  try {
    const redis = getRedis();
    const payload = JSON.stringify({ queue_id: insert, task_id: String(taskId), packet_id: packetId });
    await redis.rpush('agent:pickup:queue', payload);
    // Optionally publish a channel for low-latency notification
    await redis.publish('agent:pickup:notify', payload);
  } catch (err) {
    console.warn('Redis enqueue failed, will remain in Postgres pickup queue', err);
  }

  await traceTaskPacketLifecycle(taskId, 'enqueue:done', { queue_id: insert });
}

export default { createTaskSemanticPacket, attachRelevantFilesFromQdrant, enqueueAgentPickup, traceTaskPacketLifecycle };
