/**
 * Policy Task Router — Separate Logic by Task Type
 *
 * Routes packets to specialized handlers based on policy classification:
 * - error-fixing: P1 agentic error fixing (inference + validation)
 * - semantic-diff: P8 semantic difference analysis (clustering + diff)
 * - qdrant-mirror: P3 Qdrant payload normalization (schema sync)
 * - summary-generation: P6 summary backfill (LLM synthesis)
 * - karpathy-authority: P4 graph authority blend (GPU scoring)
 *
 * Each task type has specialized GPU/inference requirements.
 */

export type PolicyTaskType =
  | 'error-fixing'
  | 'semantic-diff'
  | 'qdrant-mirror'
  | 'summary-generation'
  | 'karpathy-authority'
  | 'unknown';

export interface PolicyTask {
  taskType: PolicyTaskType;
  workload: 'cpu' | 'gpu' | 'llm';
  priority: number; // 0 = highest
  estimatedTokens?: number;
  gpuOps?: string[];
  requiresEmbedding?: boolean;
  requiresLLM?: boolean;
}

export interface TaskRoute {
  taskType: PolicyTaskType;
  handler: string;
  workload: 'cpu' | 'gpu' | 'llm';
  batchSize: number;
  timeout: number;
  gpu_ops?: string[];
  fallback?: string;
}

/**
 * Classify packet into policy task type based on metadata
 */
export function classifyPacketTask(packet: any): PolicyTask {
  const { feature_id, directory_path, som_cluster, summary, metadata } = packet;

  // P1: Error fixing — has error patterns, missing summary
  if (
    feature_id?.includes('error') ||
    metadata?.error_pattern ||
    metadata?.inference_error
  ) {
    return {
      taskType: 'error-fixing',
      workload: 'llm',
      priority: 0,
      estimatedTokens: 800,
      requiresEmbedding: true,
      requiresLLM: true
    };
  }

  // P8: Semantic diff — comparing similar packets, needs clustering
  if (metadata?.requires_semantic_diff || som_cluster !== undefined) {
    return {
      taskType: 'semantic-diff',
      workload: 'gpu',
      priority: 2,
      gpuOps: ['cosine_similarity', 'clustering'],
      requiresEmbedding: true
    };
  }

  // P3: Qdrant mirror — payload normalization, schema alignment
  if (metadata?.qdrant_sync_needed || !summary) {
    return {
      taskType: 'qdrant-mirror',
      workload: 'cpu',
      priority: 3,
      requiresEmbedding: true
    };
  }

  // P6: Summary generation — missing or stale summaries
  if (!summary && packet.embedding) {
    return {
      taskType: 'summary-generation',
      workload: 'llm',
      priority: 1,
      estimatedTokens: 512,
      requiresLLM: true
    };
  }

  // P4: Karpathy authority blend — GPU-scored prioritization
  if (metadata?.requires_authority_scoring) {
    return {
      taskType: 'karpathy-authority',
      workload: 'gpu',
      priority: 4,
      gpuOps: [
        'pagerank_gpu',
        'attention_score_gpu',
        'cosine_similarity'
      ],
      requiresEmbedding: true
    };
  }

  return {
    taskType: 'unknown',
    workload: 'cpu',
    priority: 99
  };
}

/**
 * Router lookup: task type → execution handler
 */
export const TASK_ROUTES: Record<PolicyTaskType, TaskRoute> = {
  'error-fixing': {
    taskType: 'error-fixing',
    handler: 'scripts/atlas/error-fixing-pipeline.mjs',
    workload: 'llm',
    batchSize: 32,
    timeout: 120000, // 2 min (LLM inference)
    gpu_ops: [],
    fallback: 'scripts/atlas/error-fixing-cpu-fallback.mjs'
  },
  'semantic-diff': {
    taskType: 'semantic-diff',
    handler: 'scripts/atlas/semantic-diff-analyzer.mjs',
    workload: 'gpu',
    batchSize: 256,
    timeout: 60000, // 1 min (GPU cosine)
    gpu_ops: ['cosine_similarity', 'clustering'],
    fallback: 'scripts/atlas/semantic-diff-cpu.mjs'
  },
  'qdrant-mirror': {
    taskType: 'qdrant-mirror',
    handler: 'scripts/atlas/qdrant-payload-normalizer.mjs',
    workload: 'cpu',
    batchSize: 512,
    timeout: 30000, // 30s (CPU schema work)
    fallback: undefined
  },
  'summary-generation': {
    taskType: 'summary-generation',
    handler: 'scripts/atlas/summary-generation-pipeline.mjs',
    workload: 'llm',
    batchSize: 16,
    timeout: 180000, // 3 min (LLM generation)
    gpu_ops: [],
    fallback: 'scripts/atlas/summary-generation-fallback.mjs'
  },
  'karpathy-authority': {
    taskType: 'karpathy-authority',
    handler: 'scripts/atlas/karpathy-authority-blend.mjs',
    workload: 'gpu',
    batchSize: 512,
    timeout: 120000, // 2 min (GPU PageRank + attention)
    gpu_ops: ['pagerank_gpu', 'attention_score_gpu', 'cosine_similarity'],
    fallback: 'scripts/atlas/karpathy-cpu-fallback.mjs'
  },
  unknown: {
    taskType: 'unknown',
    handler: 'scripts/atlas/unknown-task-handler.mjs',
    workload: 'cpu',
    batchSize: 128,
    timeout: 30000,
    fallback: undefined
  }
};

/**
 * Get execution route for task type
 */
export function getTaskRoute(taskType: PolicyTaskType): TaskRoute {
  return TASK_ROUTES[taskType] || TASK_ROUTES.unknown;
}

/**
 * Batch packets by task type and priority
 */
export function groupPacketsByTask(packets: any[]): Map<PolicyTaskType, any[][]> {
  const groups = new Map<PolicyTaskType, any[]>();

  for (const packet of packets) {
    const task = classifyPacketTask(packet);
    if (!groups.has(task.taskType)) {
      groups.set(task.taskType, []);
    }
    groups.get(task.taskType)!.push(packet);
  }

  // Sort by priority and batch
  const batched = new Map<PolicyTaskType, any[][]>();

  for (const [taskType, taskPackets] of groups) {
    const route = getTaskRoute(taskType);
    const sorted = taskPackets.sort(
      (a, b) =>
        classifyPacketTask(a).priority - classifyPacketTask(b).priority
    );

    const batches: any[][] = [];
    for (let i = 0; i < sorted.length; i += route.batchSize) {
      batches.push(sorted.slice(i, i + route.batchSize));
    }
    batched.set(taskType, batches);
  }

  return batched;
}

export default {
  classifyPacketTask,
  getTaskRoute,
  groupPacketsByTask,
  TASK_ROUTES
};
