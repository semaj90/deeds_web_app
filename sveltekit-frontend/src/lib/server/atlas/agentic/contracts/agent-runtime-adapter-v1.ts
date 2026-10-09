import type { TaskEpisodeIdentityV1 } from './learning-outcome-v1.js';

/**
 * AgentRuntimeAdapterV1: interface only. A real adapter (OpenCode, Codex, Mastra) would spawn or attach to a
 * runtime and is NOT provided here; starting a process needs the governed approved-mutation-plan gate.
 * `taskId` is supplied by the caller and is never minted or replaced by an adapter. A runtime session id maps to
 * `agentSessionId` / `externalExecutionRef`, never to `taskId`.
 */
export type AgentRuntimeKindV1 = 'OPENCODE' | 'CODEX' | 'CLAUDE_CODE' | 'MASTRA' | 'OTHER' | 'FAKE';

export interface AgentRunInputV1 {
  taskId: string;
  workflowRunId: string;
  executionId: string;
  repairAttemptId: string;
  retryOf?: string | null;
  objective: string;
  workspaceRevision?: string;
  approvedMutationPlanId?: string;
  runtimeOptions?: Record<string, unknown>;
}

export interface AgentRunHandleV1 {
  runtime: AgentRuntimeKindV1;
  taskId: string;
  executionId: string;
  repairAttemptId: string;
  externalExecutionRef: string;
  sessionId?: string;
  runId?: string;
  episode: TaskEpisodeIdentityV1;
}

export interface AgentRuntimeEventV1 {
  sequence: number;
  kind: 'STARTED' | 'MESSAGE' | 'TOOL_CALL' | 'TOOL_RESULT' | 'MUTATION_PROPOSED' | 'VALIDATION' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  payload: unknown;
}

export interface AgentRuntimeAdapter {
  readonly runtime: AgentRuntimeKindV1;
  start(input: AgentRunInputV1): Promise<AgentRunHandleV1>;
  continue(handle: AgentRunHandleV1, input: string): Promise<void>;
  cancel(handle: AgentRunHandleV1): Promise<void>;
  events(handle: AgentRunHandleV1): AsyncIterable<AgentRuntimeEventV1>;
}

/** Deterministic in-memory adapter for tests. Spawns nothing, touches no datastore. */
export class FakeAgentRuntimeAdapter implements AgentRuntimeAdapter {
  readonly runtime = 'FAKE' as const;
  private readonly log = new Map<string, AgentRuntimeEventV1[]>();
  private sessions = 0;

  async start(input: AgentRunInputV1): Promise<AgentRunHandleV1> {
    this.sessions += 1;
    const sessionId = `fake-session-${this.sessions}`;
    this.log.set(input.executionId, [{ sequence: 0, kind: 'STARTED', payload: { objective: input.objective } }]);
    return {
      runtime: 'FAKE',
      taskId: input.taskId,
      executionId: input.executionId,
      repairAttemptId: input.repairAttemptId,
      externalExecutionRef: sessionId,
      sessionId,
      runId: input.executionId,
      episode: {
        agentRuntime: 'FAKE',
        workflowRunId: input.workflowRunId,
        agentSessionId: sessionId,
        agentRunId: input.executionId,
        externalExecutionRef: sessionId,
        validatorReceiptId: null,
      },
    };
  }

  async continue(handle: AgentRunHandleV1, input: string): Promise<void> {
    this.push(handle, 'MESSAGE', { text: input });
  }

  async cancel(handle: AgentRunHandleV1): Promise<void> {
    this.push(handle, 'CANCELLED', {});
  }

  async *events(handle: AgentRunHandleV1): AsyncIterable<AgentRuntimeEventV1> {
    for (const e of this.list(handle)) yield e;
  }

  private list(handle: AgentRunHandleV1): AgentRuntimeEventV1[] {
    const list = this.log.get(handle.executionId);
    if (!list) throw new Error('AGENT_RUN_NOT_STARTED');
    return list;
  }

  private push(handle: AgentRunHandleV1, kind: AgentRuntimeEventV1['kind'], payload: unknown): void {
    const list = this.list(handle);
    list.push({ sequence: list.length, kind, payload });
  }
}
