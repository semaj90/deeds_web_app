// Task Semantic Packet workflow
// - createTaskSemanticPacket(taskId)
// - attachRelevantFilesFromQdrant(taskId)
// - enqueueAgentPickup(taskId)
// - claimNextAgentPickupTask()
// - hydrateAgentPickupTask(queueId)
// - traceTaskPacketLifecycle

import { createHash } from 'crypto';
import { db, pgRows } from '$lib/server/db/client';
import {
  workspaceTasks,
  taskSemanticPackets,
  taskFileLinks,
  taskClusterLinks,
  agentPickupQueue,
} from '../db/schema/tasks';
import { qdrant as qdrantManager, sha256ToUuid } from '$lib/server/vector/qdrant-manager';
import { getRedis } from '$lib/server/redis';
import { getJson, setJsonWithTtl } from '$lib/server/redis';
import { callOllamaChat } from '$lib/server/ollama';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client';
import { traceSpan } from '$lib/server/observability/langfuse';
import { desc, eq, sql } from 'drizzle-orm';

const TASK_COLLECTION = process.env.TASKS_QDRANT_COLLECTION || 'codebase_chunks_768';
const TASK_COLLECTION_NAME = qdrantManager.collections.codebase_chunks;
const TASK_PACKET_MODEL = process.env.GEMMA4_MODEL || 'gemma4-rotorquant:latest';
const TASK_PACKET_SEMANTIC_PATH = ['kanban', 'task_summary', 'agent_pickup'];
const TASK_PACKET_CACHE_PREFIX = 'task:semantic-packet';
const TASK_PACKET_CACHE_TTL_SECONDS = 60 * 60 * 24;
let agentPickupLaneColumnExists: boolean | null = null;
let taskFileLinksTableExists: boolean | null = null;

type TaskSummaryPlan = {
  summary: string;
  next_action: string;
  confidence: number;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  semantic_path?: string[];
  related_feature_ids?: string[];
  related_task_ids?: string[];
  related_file_paths?: string[];
};

type TaskSemanticPacketCacheRecord = {
  taskId: number;
  packetId: string;
  queueId: string | null;
  qdrantPointId: string;
  workspaceId: string | null;
  featureId: string | null;
  sourceRef: string;
  summary: string;
  nextAction: string;
  confidence: number;
  status: TaskSemanticPacketBundle['status'];
  relatedFeatureIds: string[];
  relatedTaskIds: string[];
  relatedFilePaths: string[];
  clusterId: string | null;
  centroidId: string | null;
  parentCentroidId: string | null;
  agentPickupReady: boolean;
  cachedAt: string;
};

export interface TaskSemanticPacketBundle {
  queueId?: string;
  taskId: number;
  packetId: string;
  qdrantPointId: string;
  workspaceId: string | null;
  featureId: string | null;
  summary: string;
  nextAction: string;
  confidence: number;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  relatedFeatureIds: string[];
  relatedTaskIds: string[];
  relatedFilePaths: string[];
  clusterId: string | null;
  centroidId: string | null;
  packetRow?: Record<string, unknown>;
  taskRow?: Record<string, unknown>;
  summaryHash?: string;
  summaryModel?: string;
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .flatMap((item) => (typeof item === 'string' ? [item.trim()] : []))
        .filter(Boolean)
    )
  );
}

function readJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeStringArray(value);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeStringArray(parsed);
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

function parsePacketJson(raw: string): TaskSummaryPlan | null {
  const text = raw.trim();
  const candidate = text.startsWith('```')
    ? text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    : text;

  try {
    const parsed = JSON.parse(candidate) as Partial<TaskSummaryPlan>;
    return {
      summary: normalizeText(parsed.summary) || candidate.slice(0, 1000),
      next_action: normalizeText(parsed.next_action) || normalizeText(parsed.summary) || 'Review the task and identify the next file-level change.',
      confidence: Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0.7,
      status: parsed.status === 'doing' || parsed.status === 'blocked' || parsed.status === 'done' ? parsed.status : 'todo',
      semantic_path: normalizeStringArray(parsed.semantic_path),
      related_feature_ids: normalizeStringArray(parsed.related_feature_ids),
      related_task_ids: normalizeStringArray(parsed.related_task_ids),
      related_file_paths: normalizeStringArray(parsed.related_file_paths),
    };
  } catch {
    return null;
  }
}

function getWorkspaceId(task: Record<string, unknown>): string {
  return normalizeText(task.workspace_id ?? task.workspaceId) || 'workspace:default';
}

function getTaskTitle(task: Record<string, unknown>): string {
  return normalizeText(task.title) || normalizeText(task.name) || `Task ${task.id ?? ''}`.trim();
}

function getTaskSourceRef(task: Record<string, unknown>): string {
  const workspaceId = getWorkspaceId(task);
  const taskId = normalizeText(task.id);
  return `${workspaceId}:task:${taskId || 'unknown'}`;
}

export async function traceTaskPacketLifecycle(
  taskId: number,
  step: string,
  meta: Record<string, unknown> = {}
) {
  await traceSpan(`task-packet:${step}`, { taskId, ...meta }, async () => undefined);
}

async function loadTaskRow(taskId: number) {
  return db
    .select()
    .from(workspaceTasks)
    .where(eq(workspaceTasks.id, taskId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function getLatestPacketRow(taskId: number) {
  return db
    .select()
    .from(taskSemanticPackets)
    .where(eq(taskSemanticPackets.workspace_task_id, taskId))
    .orderBy(desc(taskSemanticPackets.created_at))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function updatePacketRow(packetId: number | string, patch: Record<string, unknown>) {
  await db
    .update(taskSemanticPackets)
    .set({ ...patch, updated_at: new Date() } as any)
    .where(eq(taskSemanticPackets.id, Number(packetId)))
    .execute();
}

async function updatePacketPayloadOnQdrant(pointId: string, payload: Record<string, unknown>) {
  await qdrantManager.client.setPayload(TASK_COLLECTION_NAME, {
    points: [pointId],
    payload,
  });
}

async function generateTaskSummary(task: Record<string, unknown>): Promise<TaskSummaryPlan> {
  const taskId = Number(task.id);
  const title = getTaskTitle(task);
  const workspaceId = getWorkspaceId(task);
  const featureId = normalizeText(task.feature_id);

  const prompt = [
    'You are producing a task semantic packet for an engineering Kanban system.',
    'Return JSON only with keys:',
    'summary, next_action, confidence, status, semantic_path, related_feature_ids, related_task_ids, related_file_paths.',
    'Status must be one of todo, doing, blocked, done.',
    'Keep summary short and concrete. Keep next_action as the immediate operator action.',
    '',
    'Task context:',
    JSON.stringify(
      {
        workspace_id: workspaceId,
        task_id: taskId,
        feature_id: featureId || null,
        title,
        name: normalizeText(task.name),
        task: task,
      },
      null,
      2
    ),
  ].join('\n');

  const raw = await callOllamaChat(
    'You convert Kanban tasks into compact semantic packets for agent pickup.',
    prompt,
    { format: 'json', temperature: 0.1, num_predict: 512 }
  );

  const parsed = parsePacketJson(raw);
  if (parsed) return parsed;

  return {
    summary: `Task ${taskId}: ${title}`.trim(),
    next_action: `Review task ${taskId} and identify the immediate code or documentation change.`,
    confidence: 0.55,
    status: 'todo',
    semantic_path: [...TASK_PACKET_SEMANTIC_PATH],
    related_feature_ids: featureId ? [featureId] : [],
    related_task_ids: [String(taskId)],
    related_file_paths: [],
  };
}

function summarizeSearchHit(hit: { id: string | number; payload?: Record<string, unknown>; score?: number }) {
  const payload = hit.payload ?? {};
  return {
    qdrant_id: String(hit.id),
    filePath: normalizeText(payload.file_path ?? payload.path),
    featureId: normalizeText(payload.feature_id),
    taskId: normalizeText(payload.workspace_task_id ?? payload.workspaceTaskId),
    clusterId: normalizeText(payload.cluster_id),
    centroidId: normalizeText(payload.centroid_id),
    parentCentroidId: normalizeText(payload.parent_centroid_id),
    sourceRef: normalizeText(payload.source_ref ?? payload.sourceRef),
    kind: normalizeText(payload.kind ?? payload.point_kind),
    score: typeof hit.score === 'number' ? hit.score : 0,
  };
}

function mergeUnique(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming].map((v) => v.trim()).filter(Boolean)));
}

function getTaskPacketCacheKey(taskId: number) {
  return `${TASK_PACKET_CACHE_PREFIX}:${taskId}`;
}

async function cacheTaskSemanticPacketRecord(taskId: number, record: TaskSemanticPacketCacheRecord) {
  try {
    await setJsonWithTtl(getTaskPacketCacheKey(taskId), record, TASK_PACKET_CACHE_TTL_SECONDS);
  } catch {
    /* non-fatal */
  }
}

export async function getCachedTaskSemanticPacketRecord(taskId: number) {
  try {
    return await getJson<TaskSemanticPacketCacheRecord>(getTaskPacketCacheKey(taskId));
  } catch {
    return null;
  }
}

function buildTaskSemanticPacketCacheRecord(bundle: TaskSemanticPacketBundle): TaskSemanticPacketCacheRecord {
  const packetRow = (bundle.packetRow ?? {}) as Record<string, unknown>;
  return {
    taskId: bundle.taskId,
    packetId: bundle.packetId,
    queueId: bundle.queueId ?? null,
    qdrantPointId: bundle.qdrantPointId,
    workspaceId: bundle.workspaceId,
    featureId: bundle.featureId,
    sourceRef: normalizeText(packetRow.source_ref) || `${bundle.workspaceId ?? 'workspace:default'}:task:${bundle.taskId}`,
    summary: bundle.summary,
    nextAction: bundle.nextAction,
    confidence: Number(bundle.confidence ?? 0),
    status: bundle.status,
    relatedFeatureIds: [...bundle.relatedFeatureIds],
    relatedTaskIds: [...bundle.relatedTaskIds],
    relatedFilePaths: [...bundle.relatedFilePaths],
    clusterId: bundle.clusterId,
    centroidId: bundle.centroidId,
    parentCentroidId: normalizeText(packetRow.parent_centroid_id) || null,
    agentPickupReady: Boolean(packetRow.agent_pickup_ready ?? false),
    cachedAt: new Date().toISOString(),
  };
}

async function queueLaneColumnExists(): Promise<boolean> {
  if (agentPickupLaneColumnExists !== null) return agentPickupLaneColumnExists;
  try {
    const rows = await db.execute(sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_pickup_queue'
        AND column_name = 'lane'
      LIMIT 1
    `);
    agentPickupLaneColumnExists = pgRows(rows).length > 0;
  } catch {
    agentPickupLaneColumnExists = false;
  }
  return agentPickupLaneColumnExists;
}

async function fileLinksTableExists(): Promise<boolean> {
  if (taskFileLinksTableExists !== null) return taskFileLinksTableExists;
  try {
    const rows = await db.execute(sql`
      SELECT to_regclass('public.task_file_links') IS NOT NULL AS exists
    `);
    const row = pgRows<{ exists: boolean }>(rows)[0];
    taskFileLinksTableExists = Boolean(row?.exists);
  } catch {
    taskFileLinksTableExists = false;
  }
  return taskFileLinksTableExists;
}

export async function createTaskSemanticPacket(taskId: number) {
  await traceTaskPacketLifecycle(taskId, 'start');

  const task = await loadTaskRow(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const workspaceId = getWorkspaceId(task);
  const featureId = normalizeText(task.feature_id) || null;
  const sourceRef = getTaskSourceRef(task);
  const semanticPath = [...TASK_PACKET_SEMANTIC_PATH];

  const plan = await generateTaskSummary(task);
  const summary = plan.summary;
  const nextAction = plan.next_action;
  const confidence = Number.isFinite(plan.confidence) ? plan.confidence : 0.7;
  const status = plan.status ?? 'todo';
  const summaryModel = TASK_PACKET_MODEL;
  const summaryHash = createHash('sha256').update(`${workspaceId}:${taskId}:${summary}`).digest('hex');
  const embedding = (await generateEmbeddings([`${summary}\n\nNext action: ${nextAction}`])).vectors[0];

  if (!embedding?.length) {
    throw new Error(`Embedding generation failed for task ${taskId}`);
  }

  const qdrantPointId = sha256ToUuid(`${workspaceId}:task:${taskId}:${summaryHash}`);

  const packetRow = {
    point_kind: 'task_summary',
    kind: 'task_summary',
    workspace_id: workspaceId,
    source_ref: sourceRef,
    sourceRefs: [sourceRef],
    workspace_task_id: taskId,
    feature_id: featureId,
    file_path: null,
    semantic_path: semanticPath,
    related_feature_ids: plan.related_feature_ids ?? (featureId ? [featureId] : []),
    related_task_ids: plan.related_task_ids ?? [String(taskId)],
    related_file_paths: plan.related_file_paths ?? [],
    cluster_id: null,
    centroid_id: null,
    parent_centroid_id: null,
    summary_llm: summary,
    summary: summary,
    summary_model: summaryModel,
    next_action: nextAction,
    summary_hash: summaryHash,
    confidence,
    status,
    agent_pickup_ready: false,
    observed_at: new Date().toISOString(),
    valid_from: new Date().toISOString(),
    valid_to: null,
    updated_at: new Date().toISOString(),
    deleted: false,
  };

  await qdrantManager.upsert({
    collection: 'codebase_chunks',
    points: [
      {
        id: qdrantPointId,
        vector: { content: embedding },
        payload: packetRow,
      },
    ],
    wait: true,
  });

  await traceTaskPacketLifecycle(taskId, 'qdrant_upsert', {
    qdrantPointId,
    summaryHash,
    summaryModel,
  });

  const inserted = await db
    .insert(taskSemanticPackets)
    .values({
      point_kind: 'task_summary',
      qdrant_point_id: qdrantPointId,
      workspace_id: workspaceId,
      workspace_task_id: taskId,
      feature_id: featureId,
      alias_id: null,
      source_ref: sourceRef,
      file_path: null,
      semantic_path: semanticPath,
      related_feature_ids: plan.related_feature_ids ?? (featureId ? [featureId] : []),
      related_task_ids: plan.related_task_ids ?? [String(taskId)],
      related_file_paths: plan.related_file_paths ?? [],
      cluster_id: null,
      centroid_id: null,
      parent_centroid_id: null,
      summary_llm: summary,
      summary_model: summaryModel,
      next_action: nextAction,
      summary_hash: summaryHash,
      confidence: confidence.toFixed(4) as any,
      status,
      agent_pickup_ready: false,
      observed_at: new Date(),
      valid_from: new Date(),
      valid_to: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted: false,
    })
    .returning({ id: taskSemanticPackets.id });

  const packetId = String(inserted[0]?.id ?? '');
  await traceTaskPacketLifecycle(taskId, 'db_mirror_created', { packetId });
  const packetRowLike = {
    workspace_id: workspaceId,
    source_ref: sourceRef,
    observed_at: new Date().toISOString(),
    agent_pickup_ready: false,
    semantic_path: semanticPath,
  };

  const bundle: TaskSemanticPacketBundle = {
    taskId,
    packetId,
    qdrantPointId,
    workspaceId,
    featureId,
    summary,
    nextAction,
    confidence,
    status,
    relatedFeatureIds: plan.related_feature_ids ?? (featureId ? [featureId] : []),
    relatedTaskIds: plan.related_task_ids ?? [String(taskId)],
    relatedFilePaths: plan.related_file_paths ?? [],
    clusterId: null,
    centroidId: null,
    packetRow: packetRowLike,
    taskRow: task as Record<string, unknown>,
    summaryHash,
    summaryModel,
  };

  await cacheTaskSemanticPacketRecord(taskId, buildTaskSemanticPacketCacheRecord(bundle));

  return bundle;
}

export async function attachRelevantFilesFromQdrant(taskId: number, packetId?: string) {
  await traceTaskPacketLifecycle(taskId, 'attach_files:start', { packetId });

  const task = await loadTaskRow(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const packetRow = packetId
    ? await db
        .select()
        .from(taskSemanticPackets)
        .where(eq(taskSemanticPackets.id, Number(packetId)))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : await getLatestPacketRow(taskId);

  if (!packetRow) {
    throw new Error(`Semantic packet for task ${taskId} not found`);
  }

  const packetQdrantPointId = normalizeText(packetRow.qdrant_point_id);
  const summaryText = normalizeText(packetRow.summary_llm ?? packetRow.summary_model ?? getTaskTitle(task));
  const workspaceId = normalizeText(packetRow.workspace_id ?? task.workspace_id ?? task.workspaceId) || getWorkspaceId(task);
  const embedding = (await generateEmbeddings([summaryText])).vectors[0];
  if (!embedding?.length) throw new Error(`Embedding generation failed for task ${taskId}`);

  const collections = Array.from(new Set([TASK_COLLECTION_NAME, TASK_COLLECTION, 'feature_maps']));
  const hitBuckets = await Promise.all(
    collections.map(async (collection) => {
      try {
        const res = await qdrantManager.hybridSearch({
          query: summaryText,
          queryEmbedding: embedding,
          collection,
          limit: 10,
          filters: { kind: ['code_chunk', 'feature_summary'] },
        });
        return res.results.map((hit) => ({ collection, ...summarizeSearchHit(hit) }));
      } catch {
        return [] as ReturnType<typeof summarizeSearchHit>[];
      }
    })
  );

  const hits = hitBuckets.flat();
  const filePaths = mergeUnique(
    [],
    hits.map((hit) => hit.filePath).filter((value): value is string => Boolean(value))
  );
  const featureIds = mergeUnique(
    packetRow.related_feature_ids ?? [],
    hits.map((hit) => hit.featureId).filter((value): value is string => Boolean(value))
  );
  const taskIds = mergeUnique(
    packetRow.related_task_ids ?? [String(taskId)],
    hits.map((hit) => hit.taskId).filter((value): value is string => Boolean(value))
  );

  const clusterCounts = new Map<string, number>();
  const centroidCounts = new Map<string, number>();
  const parentCentroidCounts = new Map<string, number>();
  for (const hit of hits) {
    if (hit.clusterId) clusterCounts.set(hit.clusterId, (clusterCounts.get(hit.clusterId) ?? 0) + 1);
    if (hit.centroidId) centroidCounts.set(hit.centroidId, (centroidCounts.get(hit.centroidId) ?? 0) + 1);
    if (hit.parentCentroidId) {
      parentCentroidCounts.set(
        hit.parentCentroidId,
        (parentCentroidCounts.get(hit.parentCentroidId) ?? 0) + 1
      );
    }
  }

  const clusterId = Array.from(clusterCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const centroidId = Array.from(centroidCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const parentCentroidId =
    Array.from(parentCentroidCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const relatedTaskIds = mergeUnique(packetRow.related_task_ids ?? [], taskIds);
  const relatedFeatureIds = mergeUnique(packetRow.related_feature_ids ?? [], featureIds);
  const relatedFilePaths = mergeUnique(packetRow.related_file_paths ?? [], filePaths);

  const qdrantPatch: Record<string, unknown> = {
    point_kind: 'task_summary',
    kind: 'task_summary',
    workspace_id: normalizeText(packetRow.workspace_id ?? getWorkspaceId(task)),
    workspace_task_id: taskId,
    feature_id: normalizeText(packetRow.feature_id ?? task.feature_id),
    source_ref: normalizeText(packetRow.source_ref ?? getTaskSourceRef(task)),
    sourceRefs: [normalizeText(packetRow.source_ref ?? getTaskSourceRef(task))],
    file_path: relatedFilePaths[0] ?? packetRow.file_path ?? null,
    semantic_path: packetRow.semantic_path ?? TASK_PACKET_SEMANTIC_PATH,
    related_feature_ids: relatedFeatureIds,
    related_task_ids: relatedTaskIds,
    related_file_paths: relatedFilePaths,
    cluster_id: clusterId,
    centroid_id: centroidId,
    parent_centroid_id: parentCentroidId,
    summary_llm: normalizeText(packetRow.summary_llm),
    summary: normalizeText(packetRow.summary_llm ?? summaryText),
    summary_model: normalizeText(packetRow.summary_model),
    next_action: normalizeText(packetRow.next_action),
    summary_hash: normalizeText(packetRow.summary_hash),
    confidence: packetRow.confidence,
    status: packetRow.status ?? 'todo',
    agent_pickup_ready: true,
    observed_at: packetRow.observed_at ?? new Date().toISOString(),
    valid_from: packetRow.valid_from ?? new Date().toISOString(),
    valid_to: packetRow.valid_to ?? null,
    updated_at: new Date().toISOString(),
    deleted: Boolean(packetRow.deleted ?? false),
  };

  await updatePacketPayloadOnQdrant(packetQdrantPointId, qdrantPatch);

  await db
    .update(taskSemanticPackets)
    .set({
      file_path: (relatedFilePaths[0] ?? null) as any,
      related_feature_ids: relatedFeatureIds,
      related_task_ids: relatedTaskIds,
      related_file_paths: relatedFilePaths,
      cluster_id: clusterId,
      centroid_id: centroidId,
      parent_centroid_id: parentCentroidId,
      agent_pickup_ready: true,
      status: packetRow.status === 'blocked' ? 'blocked' : 'todo',
      updated_at: new Date(),
    } as any)
    .where(eq(taskSemanticPackets.id, Number(packetRow.id)))
    .execute();

  const fileRows = filePaths.map((filePath) => ({ workspace_task_id: taskId, file_path: filePath, created_at: new Date() }));
  for (const row of fileRows) {
    await db.insert(taskFileLinks).values(row).execute().catch(() => {});
  }

  const clusterRows = [
    clusterId ? { cluster_id: clusterId, centroid_id: centroidId, relation_kind: 'cluster', qdrant_point_id: packetQdrantPointId } : null,
    centroidId ? { cluster_id: clusterId, centroid_id: centroidId, relation_kind: 'centroid', qdrant_point_id: packetQdrantPointId } : null,
  ].filter(Boolean) as Array<Record<string, unknown>>;

  for (const row of clusterRows) {
    await db
      .insert(taskClusterLinks)
      .values({
        workspace_task_id: taskId,
        feature_id: normalizeText(task.feature_id) || null,
        qdrant_point_id: packetQdrantPointId,
        cluster_id: row.cluster_id as string | null,
        centroid_id: row.centroid_id as string | null,
        relation_kind: row.relation_kind as string,
        source_ref: normalizeText(packetRow.source_ref ?? getTaskSourceRef(task)),
        created_at: new Date(),
      })
      .execute()
      .catch(() => {});
  }

  await traceTaskPacketLifecycle(taskId, 'attach_files:done', {
    found: hits.length,
    clusterId,
    centroidId,
    fileCount: filePaths.length,
  });

  await cacheTaskSemanticPacketRecord(taskId, {
    taskId,
    packetId: String(packetRow.id),
    queueId: null,
    qdrantPointId: packetQdrantPointId,
    workspaceId,
    featureId: normalizeText(packetRow.feature_id ?? task.feature_id) || null,
    sourceRef: normalizeText(packetRow.source_ref ?? getTaskSourceRef(task)),
    summary: normalizeText(packetRow.summary_llm ?? packetRow.summary_model ?? summaryText),
    nextAction: normalizeText(packetRow.next_action ?? ''),
    confidence: Number(packetRow.confidence ?? 0),
    status: normalizeText(packetRow.status) as TaskSemanticPacketBundle['status'],
    relatedFeatureIds,
    relatedTaskIds,
    relatedFilePaths,
    clusterId,
    centroidId,
    parentCentroidId,
    agentPickupReady: true,
    cachedAt: new Date().toISOString(),
  });

  return {
    attached: filePaths.length,
    relatedFilePaths: filePaths,
    relatedFeatureIds,
    relatedTaskIds,
    clusterId,
    centroidId,
    parentCentroidId,
  };
}

export async function enqueueAgentPickup(taskId: number, packetId?: string) {
  await traceTaskPacketLifecycle(taskId, 'enqueue:start', { packetId });

  const task = await loadTaskRow(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const packet = packetId
    ? await db
        .select()
        .from(taskSemanticPackets)
        .where(eq(taskSemanticPackets.id, Number(packetId)))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : await getLatestPacketRow(taskId);

  if (!packet) {
    throw new Error(`Semantic packet for task ${taskId} not found`);
  }

  const packetRow = packet as Record<string, unknown>;
  const existingQueue = await db
    .select()
    .from(agentPickupQueue)
    .where(eq(agentPickupQueue.packet_id, String(packetRow.id)))
    .orderBy(desc(agentPickupQueue.created_at))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingQueue && ['queued', 'processing'].includes(normalizeText(existingQueue.status))) {
    await traceTaskPacketLifecycle(taskId, 'enqueue:existing_queue', { queueId: existingQueue.id });
    return { queueId: String(existingQueue.id), packetId: String(packetRow.id), reused: true };
  }

  const laneExists = await queueLaneColumnExists();
  let insert: string | number | null = null;
  try {
    insert = await db
      .insert(agentPickupQueue)
      .values({
        task_id: String(taskId),
        packet_id: String(packetRow.id),
        status: 'queued',
        ...(laneExists ? { lane: 'semantic_packet' } : {}),
        attempts: 0,
        max_attempts: 3,
        available_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      } as any)
      .returning({ id: agentPickupQueue.id })
      .then((rows) => rows[0]?.id ?? null);
  } catch (error: any) {
    if (laneExists && String(error?.message ?? '').includes('lane')) {
      agentPickupLaneColumnExists = false;
      insert = await db
        .insert(agentPickupQueue)
        .values({
          task_id: String(taskId),
          packet_id: String(packetRow.id),
          status: 'queued',
          attempts: 0,
          max_attempts: 3,
          available_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        } as any)
        .returning({ id: agentPickupQueue.id })
        .then((rows) => rows[0]?.id ?? null);
    } else {
      throw error;
    }
  }

  await db
    .update(taskSemanticPackets)
    .set({
      agent_pickup_ready: true,
      status: 'todo',
      updated_at: new Date(),
    } as any)
    .where(eq(taskSemanticPackets.id, Number(packetRow.id)))
    .execute();

  try {
    const redis = getRedis();
    const payload = JSON.stringify({
      queue_id: String(insert),
      task_id: String(taskId),
      packet_id: String(packetRow.id),
      lane: 'semantic_packet',
    });
    await redis.rpush('agent:pickup:queue', payload);
    await redis.publish('agent:pickup:notify', payload);
  } catch (err) {
    console.warn('Redis enqueue failed, will remain in Postgres pickup queue', err);
  }

  await traceTaskPacketLifecycle(taskId, 'enqueue:done', { queueId: insert });
  await cacheTaskSemanticPacketRecord(taskId, {
    taskId,
    packetId: String(packetRow.id),
    queueId: insert ? String(insert) : null,
    qdrantPointId: normalizeText(packetRow.qdrant_point_id),
    workspaceId: normalizeText(packetRow.workspace_id ?? task.workspace_id ?? task.workspaceId) || getWorkspaceId(task),
    featureId: normalizeText(packetRow.feature_id ?? task.feature_id) || null,
    sourceRef: normalizeText(packetRow.source_ref ?? getTaskSourceRef(task)),
    summary: normalizeText(packetRow.summary_llm ?? packetRow.summary_model ?? ''),
    nextAction: normalizeText(packetRow.next_action ?? ''),
    confidence: Number(packetRow.confidence ?? 0),
    status: normalizeText(packetRow.status) as TaskSemanticPacketBundle['status'],
    relatedFeatureIds: readJsonArray(packetRow.related_feature_ids),
    relatedTaskIds: readJsonArray(packetRow.related_task_ids),
    relatedFilePaths: readJsonArray(packetRow.related_file_paths),
    clusterId: normalizeText(packetRow.cluster_id) || null,
    centroidId: normalizeText(packetRow.centroid_id) || null,
    parentCentroidId: normalizeText(packetRow.parent_centroid_id) || null,
    agentPickupReady: true,
    cachedAt: new Date().toISOString(),
  });
  return { queueId: String(insert), packetId: String(packetRow.id), reused: false };
}

export async function runTaskSemanticPacketLifecycle(taskId: number) {
  const packet = await createTaskSemanticPacket(taskId);
  const attachments = await attachRelevantFilesFromQdrant(taskId, packet.packetId);
  const queue = await enqueueAgentPickup(taskId, packet.packetId);

  const cached = await getCachedTaskSemanticPacketRecord(taskId);
  return {
    ...packet,
    ...attachments,
    ...queue,
    cached,
  };
}

export async function claimNextAgentPickupTask(lane = 'semantic_packet'): Promise<TaskSemanticPacketBundle | null> {
  const laneExists = await queueLaneColumnExists();
  const rows = await db.transaction(async (tx) => {
    const laneFilter = laneExists ? sql`AND q.lane = ${lane}` : sql``;
    const claimed = await tx.execute(sql`
      WITH candidate AS (
        SELECT q.id
        FROM agent_pickup_queue q
        JOIN task_semantic_packets p ON p.id::text = q.packet_id
        WHERE q.status = 'queued'
          AND q.available_at <= NOW()
          ${laneFilter}
          AND p.deleted = false
          AND p.agent_pickup_ready = true
        ORDER BY COALESCE(NULLIF(p.confidence::text, '')::numeric, 0::numeric) DESC, p.updated_at ASC, q.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE agent_pickup_queue q
      SET status = 'processing',
          picked_up_at = NOW(),
          updated_at = NOW()
      FROM candidate
      WHERE q.id = candidate.id
      RETURNING q.id, q.task_id, q.packet_id, q.status, ${laneExists ? sql`q.lane` : sql`NULL::text`} as lane, q.attempts, q.max_attempts, q.available_at, q.picked_up_at, q.completed_at, q.error
    `);

    type QueueRow = {
      id: string;
      task_id: string;
      packet_id: string | null;
      status: string;
      lane: string | null;
      attempts: number;
      max_attempts: number;
      available_at: string;
      picked_up_at: string | null;
      completed_at: string | null;
      error: string | null;
    };

    const queue = pgRows<QueueRow>(claimed)[0];
    if (!queue?.packet_id) return [];

    await tx
      .update(taskSemanticPackets)
      .set({ status: 'doing', updated_at: new Date() } as any)
      .where(eq(taskSemanticPackets.id, Number(queue.packet_id)))
      .execute();

    return [queue];
  });

  const queue = rows[0];
  if (!queue?.packet_id) return null;

  const packet = await db
    .select()
    .from(taskSemanticPackets)
    .where(eq(taskSemanticPackets.id, Number(queue.packet_id)))
    .limit(1)
    .then((result) => result[0] ?? null);
  if (!packet) return null;

  const task = await loadTaskRow(Number(queue.task_id));
  const files = (await fileLinksTableExists())
    ? await db
        .select()
        .from(taskFileLinks)
        .where(eq(taskFileLinks.workspace_task_id, Number(queue.task_id)))
        .then((result) =>
          result.map((row) => row.file_path).filter((value): value is string => Boolean(value))
        )
    : [];

  return {
    queueId: queue.id,
    taskId: Number(queue.task_id),
    packetId: String(packet.id),
    qdrantPointId: normalizeText(packet.qdrant_point_id),
    workspaceId: normalizeText(packet.workspace_id ?? task?.workspace_id ?? task?.workspaceId) || null,
    featureId: normalizeText(packet.feature_id ?? task?.feature_id) || null,
    summary: normalizeText(packet.summary_llm ?? packet.summary_model ?? ''),
    nextAction: normalizeText(packet.next_action ?? ''),
    confidence: Number(packet.confidence ?? 0),
    status: normalizeText(packet.status) as TaskSemanticPacketBundle['status'],
    relatedFeatureIds: readJsonArray(packet.related_feature_ids),
    relatedTaskIds: readJsonArray(packet.related_task_ids),
    relatedFilePaths: mergeUnique(readJsonArray(packet.related_file_paths), files),
    clusterId: normalizeText(packet.cluster_id) || null,
    centroidId: normalizeText(packet.centroid_id) || null,
    packetRow: packet as Record<string, unknown>,
    taskRow: task as Record<string, unknown> | undefined,
  };
}

export async function hydrateAgentPickupTask(queueId: string): Promise<TaskSemanticPacketBundle | null> {
  const queue = await db
    .select()
    .from(agentPickupQueue)
    .where(eq(agentPickupQueue.id, Number(queueId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!queue?.packet_id) return null;

  const packet = await db
    .select()
    .from(taskSemanticPackets)
    .where(eq(taskSemanticPackets.id, Number(queue.packet_id)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!packet) return null;

  const task = await loadTaskRow(Number(queue.task_id));
  const files = (await fileLinksTableExists())
    ? await db
        .select()
        .from(taskFileLinks)
        .where(eq(taskFileLinks.workspace_task_id, Number(queue.task_id)))
        .then((result) =>
          result.map((row) => row.file_path).filter((value): value is string => Boolean(value))
        )
    : [];

  return {
    queueId: String(queue.id),
    taskId: Number(queue.task_id),
    packetId: String(packet.id),
    qdrantPointId: normalizeText(packet.qdrant_point_id),
    workspaceId: normalizeText(packet.workspace_id ?? task?.workspace_id ?? task?.workspaceId) || null,
    featureId: normalizeText(packet.feature_id ?? task?.feature_id) || null,
    summary: normalizeText(packet.summary_llm ?? packet.summary_model ?? ''),
    nextAction: normalizeText(packet.next_action ?? ''),
    confidence: Number(packet.confidence ?? 0),
    status: normalizeText(packet.status) as TaskSemanticPacketBundle['status'],
    relatedFeatureIds: readJsonArray(packet.related_feature_ids),
    relatedTaskIds: readJsonArray(packet.related_task_ids),
    relatedFilePaths: mergeUnique(readJsonArray(packet.related_file_paths), files),
    clusterId: normalizeText(packet.cluster_id) || null,
    centroidId: normalizeText(packet.centroid_id) || null,
    packetRow: packet as Record<string, unknown>,
    taskRow: task as Record<string, unknown> | undefined,
  };
}

export async function markAgentPickupTaskComplete(queueId: string, packetId: string) {
  await db
    .update(agentPickupQueue)
    .set({ status: 'completed', completed_at: new Date(), updated_at: new Date() })
    .where(eq(agentPickupQueue.id, Number(queueId)))
    .execute();

  await updatePacketRow(packetId, { status: 'done', agent_pickup_ready: false });
}

export async function markAgentPickupTaskFailed(queueId: string, packetId: string, error: string) {
  const updated = await db
    .update(agentPickupQueue)
    .set({
      attempts: sql`${agentPickupQueue.attempts} + 1`,
      error,
      status: sql`CASE WHEN ${agentPickupQueue.attempts} + 1 >= ${agentPickupQueue.max_attempts} THEN 'failed' ELSE 'queued' END`,
      available_at: sql`now() + interval '30 seconds'`,
      updated_at: new Date(),
    })
    .where(eq(agentPickupQueue.id, Number(queueId)))
    .returning({ status: agentPickupQueue.status })
    .then((rows) => rows[0] ?? null);

  const nextStatus = normalizeText(updated?.status) === 'failed' ? 'blocked' : 'todo';
  await updatePacketRow(packetId, {
    status: nextStatus,
    agent_pickup_ready: nextStatus !== 'blocked',
  });
}

export default {
  createTaskSemanticPacket,
  attachRelevantFilesFromQdrant,
  enqueueAgentPickup,
  runTaskSemanticPacketLifecycle,
  claimNextAgentPickupTask,
  hydrateAgentPickupTask,
  markAgentPickupTaskComplete,
  markAgentPickupTaskFailed,
  traceTaskPacketLifecycle,
  getCachedTaskSemanticPacketRecord,
};
