import { z } from 'zod';

const SNAPSHOT_SCHEMA = 'atlas.kanban-task-dag-snapshot.v1';
const RESULT_SCHEMA = 'atlas.kanban-dag-prefill-algorithm-recommendation.v1';
const FEATURE_ID_PATTERN = /^(openspec:[a-z0-9][a-z0-9-]*|nextsteps:[a-z0-9_.-]+)$/;
const SNAPSHOT_HASH_PATTERN = /^[a-f0-9]{64}$/;

const taskSchema = z.object({
  taskId: z.string().min(1).max(200),
  featureLabel: z.string().min(1).max(500),
  lane: z.enum(['todo', 'in_progress', 'done']),
  status: z.enum(['pending', 'active', 'completed', 'failed']),
  priority: z.number().int().min(0).max(100),
  sourceRefs: z.array(z.string().max(2048)).max(64),
}).strict();

const dependencySchema = z.object({
  parentTaskId: z.string().min(1).max(200),
  childTaskId: z.string().min(1).max(200),
}).strict();

const snapshotBaseSchema = {
  schema: z.literal(SNAPSHOT_SCHEMA),
  featureId: z.string().regex(FEATURE_ID_PATTERN),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
};

const kanbanDagSnapshotSchema = z.discriminatedUnion('status', [
  z.object({
    ...snapshotBaseSchema,
    status: z.literal('READY'),
    snapshotAt: z.string().datetime(),
    snapshotHash: z.string().regex(SNAPSHOT_HASH_PATTERN),
    tasks: z.array(taskSchema).min(1).max(128),
    dependencies: z.array(dependencySchema).max(512),
    sourceAuthority: z.literal('KANBAN_TASKS_POSTGRES_READ_ONLY_SNAPSHOT'),
  }).strict(),
  z.object({
    ...snapshotBaseSchema,
    status: z.literal('EMPTY'),
    tasks: z.array(taskSchema).max(128),
    dependencies: z.array(dependencySchema).max(512),
  }).strict(),
  z.object({
    ...snapshotBaseSchema,
    status: z.literal('BLOCKED'),
    reasonCode: z.string().min(1).max(100),
    limit: z.number().int().nonnegative().optional(),
    observedAtLeast: z.number().int().nonnegative().optional(),
    externalPrerequisiteCount: z.number().int().nonnegative().optional(),
  }).strict(),
]);

function blocked(reasonCode, featureId = null, snapshotHash = null) {
  return {
    schema: RESULT_SCHEMA,
    status: 'BLOCKED',
    reasonCode,
    featureId,
    sourceSnapshotHash: snapshotHash,
    canonicalAuthority: false,
    writesPerformed: false
  };
}

export function selectKanbanDagPrefillAlgorithm(snapshot, { maxPrefillTasks = 16 } = {}) {
  const parsedSnapshot = kanbanDagSnapshotSchema.safeParse(snapshot);
  if (!parsedSnapshot.success) return blocked('SNAPSHOT_CONTRACT_INVALID');
  snapshot = parsedSnapshot.data;
  const { featureId, snapshotHash } = snapshot;
  if (snapshot.status !== 'READY') {
    return blocked(snapshot.status === 'BLOCKED' ? snapshot.reasonCode : 'SNAPSHOT_EMPTY_COHORT', featureId);
  }
  if (!Number.isInteger(maxPrefillTasks) || maxPrefillTasks < 1 || maxPrefillTasks > 32) {
    return blocked('PREFILL_LIMIT_INVALID', featureId, snapshotHash);
  }
  const taskById = new Map();
  for (const task of snapshot.tasks) {
    if (taskById.has(task.taskId)) {
      return blocked('TASK_ROW_INVALID_OR_DUPLICATE', featureId, snapshotHash);
    }
    taskById.set(task.taskId, task);
  }

  const childrenByParent = new Map([...taskById.keys()].map((taskId) => [taskId, []]));
  const parentsByChild = new Map([...taskById.keys()].map((taskId) => [taskId, []]));
  const seenEdges = new Set();
  for (const edge of snapshot.dependencies) {
    const parentTaskId = edge?.parentTaskId;
    const childTaskId = edge?.childTaskId;
    const edgeKey = `${parentTaskId}\0${childTaskId}`;
    if (!taskById.has(parentTaskId) || !taskById.has(childTaskId) || parentTaskId === childTaskId ||
        seenEdges.has(edgeKey)) {
      return blocked('DEPENDENCY_EDGE_INVALID_OR_OUT_OF_COHORT', featureId, snapshotHash);
    }
    seenEdges.add(edgeKey);
    childrenByParent.get(parentTaskId).push(childTaskId);
    parentsByChild.get(childTaskId).push(parentTaskId);
  }

  const indegree = new Map([...parentsByChild].map(([taskId, parents]) => [taskId, parents.length]));
  let frontier = [...taskById.keys()].filter((taskId) => indegree.get(taskId) === 0).sort();
  const topologicalLayers = [];
  const topologicalOrder = [];
  while (frontier.length > 0) {
    const layer = frontier;
    topologicalLayers.push(layer);
    topologicalOrder.push(...layer);
    const next = [];
    for (const parentTaskId of layer) {
      for (const childTaskId of childrenByParent.get(parentTaskId)) {
        const remaining = indegree.get(childTaskId) - 1;
        indegree.set(childTaskId, remaining);
        if (remaining === 0) next.push(childTaskId);
      }
    }
    frontier = next.sort();
  }

  if (topologicalOrder.length !== taskById.size) {
    return blocked('DEPENDENCY_CYCLE', featureId, snapshotHash);
  }

  const completed = new Set([...taskById.values()]
    .filter((task) => task.lane === 'done' && task.status === 'completed')
    .map((task) => task.taskId));
  const frontierIndex = new Map();
  topologicalLayers.forEach((layer, index) => layer.forEach((taskId) => frontierIndex.set(taskId, index)));
  const readyTasks = [...taskById.values()]
    .filter((task) => task.lane === 'todo' && task.status === 'pending' &&
      parentsByChild.get(task.taskId).every((parentTaskId) => completed.has(parentTaskId)))
    .sort((left, right) => frontierIndex.get(left.taskId) - frontierIndex.get(right.taskId) ||
      (left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0));

  const maxFrontierWidth = Math.max(...topologicalLayers.map((layer) => layer.length));
  const algorithm = seenEdges.size === 0
    ? 'STABLE_READY_SET'
    : maxFrontierWidth > 1
      ? 'KAHN_TOPOLOGICAL_READY_FRONTIERS'
      : 'KAHN_STABLE_TOPOLOGICAL_ORDER';
  const rationale = seenEdges.size === 0
    ? 'The cohort has no prerequisite edges; use stable task-ID order because priority-direction semantics are not established.'
    : maxFrontierWidth > 1
      ? 'The acyclic cohort has parallel ready layers; Kahn frontiers preserve prerequisites and expose independent tasks without asserting concurrent execution.'
      : 'The cohort is a narrow dependency chain; stable Kahn ordering preserves prerequisite order deterministically.';

  return {
    schema: RESULT_SCHEMA,
    status: 'PROPOSED',
    featureId,
    sourceSnapshotHash: snapshotHash,
    sourceSnapshotAt: snapshot.snapshotAt ?? null,
    algorithm,
    selectionMethod: 'DETERMINISTIC_GRAPH_STRUCTURE',
    priorityFieldUsed: false,
    sourceDataClassification: 'UNTRUSTED_TASKBOARD_CONTENT',
    rationale,
    graphProfile: {
      taskCount: taskById.size,
      dependencyCount: seenEdges.size,
      layerCount: topologicalLayers.length,
      maxFrontierWidth,
      parallelExecutionAuthorized: false
    },
    topologicalLayers,
    topologicalOrder,
    readyTaskIds: readyTasks.slice(0, maxPrefillTasks).map((task) => task.taskId),
    readyCandidates: readyTasks.slice(0, maxPrefillTasks).map((task) => ({
      taskId: task.taskId,
      featureLabel: task.featureLabel,
      featureLabelTrusted: false,
      lane: task.lane,
      status: task.status,
      priority: task.priority,
      sourceRefs: task.sourceRefs,
      sourceRefsValidated: false
    })),
    omittedReadyTaskCount: Math.max(0, readyTasks.length - maxPrefillTasks),
    excludedAlternatives: [
      { algorithm: 'A_STAR', reason: 'No single start/goal pair or validated edge-cost heuristic is supplied.' },
      { algorithm: 'PAGERANK_OR_SPECTRAL_CLUSTERING', reason: 'These do not enforce Kanban prerequisite order and no qualified graph features are supplied.' },
      { algorithm: 'LEARNED_MLP_OR_HMM_RANKER', reason: 'No admitted task-label evaluation set is supplied to this tool.' }
    ],
    admission: 'PROPOSAL_ONLY',
    canonicalAuthority: false,
    writesPerformed: false
  };
}

export { SNAPSHOT_SCHEMA as KANBAN_DAG_SNAPSHOT_SCHEMA_V1 };
