/**
 * Kanban Error-Fixing Agent — LangGraph Integration
 *
 * Wires WorkstationOrchestrator with LangGraph state machine for error-fixing Kanban tasks.
 *
 * Flow:
 * 1. Load error-fixing packets from WorkstationOrchestrator
 * 2. Classify by policy task type (error-fixing, semantic-diff, etc.)
 * 3. Create Kanban tasks for each packet
 * 4. Score via policy model
 * 5. Route to Gemma4 for error analysis & fixing
 * 6. Update Kanban task status + evidence
 * 7. Emit NATS event for downstream processing
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import type { Packet } from '../packet-reader.js';
import { WorkstationOrchestrator } from '../workstation-orchestrator.js';
import { classifyPacketTask, type PolicyTask } from '../policy-task-router.js';

/**
 * Kanban Error-Fixing State
 */
export const ErrorFixingState = Annotation.Root({
  // Input
  trace_id: Annotation({ value: (x: string, y: string) => y ?? x }),
  packets: Annotation({ value: (x?: Packet[], y?: Packet[]) => y ?? x }),

  // Processing
  classified_tasks: Annotation({
    value: (x?: Map<string, PolicyTask>, y?: Map<string, PolicyTask>) => y ?? x
  }),
  kanban_tasks: Annotation({
    value: (x?: KanbanErrorFixingTask[], y?: KanbanErrorFixingTask[]) => y ?? x
  }),

  // Scoring
  policy_scores: Annotation({
    value: (x?: Map<string, number>, y?: Map<string, number>) => y ?? x
  }),

  // LLM synthesis
  fixes: Annotation({
    value: (x?: ErrorFixSuggestion[], y?: ErrorFixSuggestion[]) => y ?? x
  }),

  // Status
  completed_count: Annotation({ value: (x: number, y: number) => Math.max(x ?? 0, y ?? 0) }),
  failed_count: Annotation({ value: (x: number, y: number) => Math.max(x ?? 0, y ?? 0) }),
  error: Annotation({ value: (x?: string, y?: string) => y ?? x }),
});

export type ErrorFixingStateType = typeof ErrorFixingState.State;

/**
 * Kanban task for error fixing
 */
export interface KanbanErrorFixingTask {
  task_id: string;
  packet_key: string;
  feature_id: string;
  feature_label: string;
  source_refs: string[];
  lane: 'todo' | 'in_progress' | 'done';
  status: 'pending' | 'active' | 'completed' | 'failed';
  policy_score?: number;
  error_pattern?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Error fix suggestion from Gemma4
 */
export interface ErrorFixSuggestion {
  packet_key: string;
  error_type: string;
  error_location: string;
  suggested_fix: string;
  confidence: number;
  implementation_steps: string[];
  tests_needed: string[];
  validation_command?: string;
}

/**
 * Node 1: Load packets from WorkstationOrchestrator
 */
async function loadErrorFixingPackets(
  state: ErrorFixingStateType
): Promise<Partial<ErrorFixingStateType>> {
  const orchestrator = new WorkstationOrchestrator({
    limit: 1000,
    filters: {
      // Error fixing packets have 'error' in feature_id or error_pattern metadata
    }
  });

  try {
    const packets = await orchestrator.loadPackets();

    // Filter to error-fixing only
    const errorFixingPackets = packets.filter((p) => {
      const task = classifyPacketTask(p);
      return task.taskType === 'error-fixing';
    });

    console.log(
      `✅ Loaded ${errorFixingPackets.length} error-fixing packets for trace ${state.trace_id}`
    );

    await orchestrator.close();

    return {
      packets: errorFixingPackets
    };
  } catch (err) {
    console.error('Failed to load packets:', err);
    return {
      error: `Failed to load packets: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/**
 * Node 2: Classify packets by policy task type
 */
async function classifyErrorFixingTasks(
  state: ErrorFixingStateType
): Promise<Partial<ErrorFixingStateType>> {
  if (!state.packets || state.packets.length === 0) {
    return { error: 'No packets to classify' };
  }

  const classified = new Map<string, PolicyTask>();

  for (const packet of state.packets) {
    const task = classifyPacketTask(packet);
    classified.set(packet.packet_key, task);
  }

  console.log(`✅ Classified ${classified.size} error-fixing tasks`);

  return {
    classified_tasks: classified
  };
}

/**
 * Node 3: Create Kanban tasks
 */
async function createKanbanTasks(
  state: ErrorFixingStateType
): Promise<Partial<ErrorFixingStateType>> {
  if (!state.packets || !state.classified_tasks) {
    return { error: 'Missing packets or classifications' };
  }

  const kanbanTasks: KanbanErrorFixingTask[] = [];

  for (const packet of state.packets) {
    const task = state.classified_tasks.get(packet.packet_key);
    if (!task) continue;

    const now = new Date();
    const kanbanTask: KanbanErrorFixingTask = {
      task_id: `error-fix-${packet.packet_key}-${Date.now()}`,
      packet_key: packet.packet_key,
      feature_id: packet.feature_id,
      feature_label: packet.feature_label,
      source_refs: [packet.source_ref],
      lane: 'todo',
      status: 'pending',
      created_at: now,
      updated_at: now
    };

    kanbanTasks.push(kanbanTask);
  }

  console.log(`✅ Created ${kanbanTasks.length} Kanban error-fixing tasks`);

  return {
    kanban_tasks: kanbanTasks
  };
}

/**
 * Node 4: Score with policy model
 */
async function scoreWithPolicyModel(
  state: ErrorFixingStateType
): Promise<Partial<ErrorFixingStateType>> {
  if (!state.packets) {
    return { error: 'No packets to score' };
  }

  const orchestrator = new WorkstationOrchestrator({
    policyModelUrl: 'http://127.0.0.1:8788/policy/score'
  });

  try {
    const scores = await orchestrator.scoreWithPolicyModel(state.packets);

    console.log(`✅ Scored ${scores.size} packets with policy model`);

    await orchestrator.close();

    return {
      policy_scores: scores
    };
  } catch (err) {
    console.warn('Policy model scoring failed, using fallback:', err);

    // Fallback: assign scores based on priority
    const fallbackScores = new Map<string, number>();
    for (const packet of state.packets) {
      const task = classifyPacketTask(packet);
      fallbackScores.set(packet.packet_key, 1.0 - task.priority * 0.1);
    }

    return {
      policy_scores: fallbackScores
    };
  }
}

/**
 * Node 5: Analyze errors and generate fixes (Gemma4 synthesis)
 */
async function synthesizeErrorFixes(
  state: ErrorFixingStateType
): Promise<Partial<ErrorFixingStateType>> {
  if (!state.packets || !state.policy_scores) {
    return { error: 'Missing packets or scores' };
  }

  const fixes: ErrorFixSuggestion[] = [];

  // Sort by score
  const sorted = Array.from(state.packets).sort((a, b) => {
    const scoreA = state.policy_scores?.get(a.packet_key) ?? 0;
    const scoreB = state.policy_scores?.get(b.packet_key) ?? 0;
    return scoreB - scoreA;
  });

  // Placeholder: In production, call Gemma4 API for synthesis
  for (const packet of sorted.slice(0, 10)) {
    // Top 10 only
    const fix: ErrorFixSuggestion = {
      packet_key: packet.packet_key,
      error_type: 'type_mismatch',
      error_location: `${packet.source_ref}:1`,
      suggested_fix: 'Add type annotation to resolve TypeScript error',
      confidence: state.policy_scores?.get(packet.packet_key) ?? 0.5,
      implementation_steps: [
        'Review error message in TypeScript',
        'Identify missing or incorrect type',
        'Apply fix',
        'Verify compilation'
      ],
      tests_needed: ['TypeScript compilation', 'Unit tests', 'Integration tests'],
      validation_command: 'npm run type-check'
    };

    fixes.push(fix);
  }

  console.log(`✅ Generated ${fixes.length} error fix suggestions`);

  return {
    fixes
  };
}

/**
 * Node 6: Update Kanban task status
 */
async function updateKanbanStatus(
  state: ErrorFixingStateType
): Promise<Partial<ErrorFixingStateType>> {
  if (!state.kanban_tasks || !state.fixes) {
    return { error: 'Missing Kanban tasks or fixes' };
  }

  const updated: KanbanErrorFixingTask[] = [];

  for (const kanbanTask of state.kanban_tasks) {
    const fix = state.fixes.find((f) => f.packet_key === kanbanTask.packet_key);

    if (fix) {
      // Update task with fix information
      const updatedTask: KanbanErrorFixingTask = {
        ...kanbanTask,
        lane: 'in_progress',
        status: 'active',
        error_pattern: fix.error_type,
        updated_at: new Date()
      };

      updated.push(updatedTask);
    } else {
      // No fix available
      const skippedTask: KanbanErrorFixingTask = {
        ...kanbanTask,
        status: 'failed',
        updated_at: new Date()
      };

      updated.push(skippedTask);
    }
  }

  const completedCount = updated.filter((t) => t.lane === 'in_progress').length;
  const failedCount = updated.filter((t) => t.status === 'failed').length;

  console.log(
    `✅ Updated Kanban tasks: ${completedCount} in-progress, ${failedCount} failed`
  );

  return {
    kanban_tasks: updated,
    completed_count: completedCount,
    failed_count: failedCount
  };
}

/**
 * Build the error-fixing state graph
 */
export function buildErrorFixingGraph() {
  // Keep node registration chained so LangGraph retains the typed node-name
  // union for the subsequent edge declarations.
  return new StateGraph(ErrorFixingState)
    .addNode('load_packets', loadErrorFixingPackets)
    .addNode('classify_tasks', classifyErrorFixingTasks)
    .addNode('create_kanban', createKanbanTasks)
    .addNode('score_policy', scoreWithPolicyModel)
    .addNode('synthesize_fixes', synthesizeErrorFixes)
    .addNode('update_kanban', updateKanbanStatus)
    .addEdge(START, 'load_packets')
    .addEdge('load_packets', 'classify_tasks')
    .addEdge('classify_tasks', 'create_kanban')
    .addEdge('create_kanban', 'score_policy')
    .addEdge('score_policy', 'synthesize_fixes')
    .addEdge('synthesize_fixes', 'update_kanban')
    .addEdge('update_kanban', END)
    .compile();
}

export default {
  buildErrorFixingGraph,
  ErrorFixingState,
  loadErrorFixingPackets,
  classifyErrorFixingTasks,
  createKanbanTasks,
  scoreWithPolicyModel,
  synthesizeErrorFixes,
  updateKanbanStatus
};
