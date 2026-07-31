// @ts-nocheck
/**
 * LangGraph Orchestrator: Multi-Step Agent Loop Controller
 *
 * Wires LangGraph state machine into trace-mcp-server for:
 * - Multi-step reasoning with tool calls
 * - State persistence across tool invocations
 * - Max loop iterations (prevent infinite loops)
 * - Action routing (tool_call → tool_exec → state_update → next_step)
 *
 * Architecture:
 *   Gemma4 Agent
 *       ↓
 *   LangGraphOrchestrator.runAgentLoop()
 *       ├─ Step 1: Invoke agent with current state
 *       ├─ Step 2: Agent returns action (tool_call, respond, error)
 *       ├─ Step 3: Route action (execute tool OR return response)
 *       ├─ Step 4: Update state with result
 *       └─ Step 5: Loop until action='respond' or max_iterations
 *
 * Integration with dispatcher:
 *   Tool execution → DispatcherMiddleware.wrap()
 *                 → invokes actual tool handler
 *                 → returns result + state updates
 *   State persistence → PostgreSQL agent_loop_runs table
 */

import { z } from 'zod';
import { Pool } from 'pg';
import { DispatcherState, HeadroomConfig } from './langgraph-bridge.js';

/**
 * Agent action: what the model wants to do next
 */
export const AgentActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool_call'),
    tool_name: z.string(),
    tool_input: z.record(z.unknown()),
    reasoning: z.string().optional(),
  }),
  z.object({
    type: z.literal('respond'),
    response: z.string(),
    confidence: z.number().min(0).max(1).default(0.5),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
  }),
]);

export type AgentAction = z.infer<typeof AgentActionSchema>;

/**
 * Agent step result (what happened after an action)
 */
export const AgentStepResultSchema = z.object({
  step_number: z.number().int().positive(),
  action: AgentActionSchema,
  result: z.unknown().optional(),
  state_before: z.record(z.unknown()),
  state_after: z.record(z.unknown()),
  execution_time_ms: z.number().int().positive(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type AgentStepResult = z.infer<typeof AgentStepResultSchema>;

/**
 * Complete agent loop run
 */
export const AgentLoopRunSchema = z.object({
  session_id: z.string().uuid(),
  user_prompt: z.string(),
  initial_state: z.record(z.unknown()),
  final_state: z.record(z.unknown()),
  steps: z.array(AgentStepResultSchema),
  final_response: z.string().optional(),
  total_time_ms: z.number().int().nonnegative(),
  success: z.boolean(),
  exit_reason: z.enum(['responded', 'max_iterations', 'error', 'timeout']),
});

export type AgentLoopRun = z.infer<typeof AgentLoopRunSchema>;

/**
 * Configuration for agent loop orchestration
 */
export const AgentLoopConfigSchema = z.object({
  maxIterations: z.number().int().positive().default(10),
  timeoutMs: z.number().int().positive().default(300_000), // 5 minutes
  includeReasoning: z.boolean().default(true),
  persistToDb: z.boolean().default(true),
  headroomConfig: z.record(z.unknown()).optional(),
});

export type AgentLoopConfig = z.infer<typeof AgentLoopConfigSchema>;

/**
 * LangGraph Orchestrator: manages multi-step agent loops
 */
export class LangGraphOrchestrator {
  private pool: Pool | null;
  private config: AgentLoopConfig;
  private toolRegistry: Map<string, (input: Record<string, unknown>) => Promise<unknown>> = new Map();

  constructor(
    config?: Partial<AgentLoopConfig>,
    pool?: Pool
  ) {
    this.config = AgentLoopConfigSchema.parse(config || {});
    this.pool = pool || null;
  }

  /**
   * Register a tool that can be invoked by the agent
   */
  registerTool(
    name: string,
    handler: (input: Record<string, unknown>) => Promise<unknown>
  ): void {
    this.toolRegistry.set(name, handler);
  }

  /**
   * Run a multi-step agent loop
   *
   * @param userPrompt - The user's initial request
   * @param agentInvoker - Async function that invokes the LLM and returns an AgentAction
   * @param sessionId - Session ID for audit trail
   * @returns The final agent loop run result
   */
  async runAgentLoop(
    userPrompt: string,
    agentInvoker: (state: DispatcherState) => Promise<AgentAction>,
    sessionId: string
  ): Promise<AgentLoopRun> {
    const startTime = Date.now();
    const steps: AgentStepResult[] = [];
    let currentState: DispatcherState = {
      action: 'step',
      current_input: { user_prompt: userPrompt },
      history: [],
      trace: { start_time: new Date().toISOString(), session_id: sessionId },
    };

    let stepNumber = 0;
    let exitReason: 'responded' | 'max_iterations' | 'error' | 'timeout' = 'responded';
    let finalResponse: string | undefined;
    let loopError: string | undefined;

    try {
      while (stepNumber < this.config.maxIterations) {
        // Check timeout
        if (Date.now() - startTime > this.config.timeoutMs) {
          exitReason = 'timeout';
          break;
        }

        stepNumber++;
        const stepStartTime = Date.now();
        const stateBefore = { ...currentState };

        try {
          // Step 1: Invoke agent
          const action = await agentInvoker(currentState);

          // Step 2: Route action
          let result: unknown;
          let stepSuccess = true;

          if (action.type === 'tool_call') {
            // Execute tool
            const toolHandler = this.toolRegistry.get(action.tool_name);
            if (!toolHandler) {
              result = { error: `Tool not found: ${action.tool_name}` };
              stepSuccess = false;
            } else {
              try {
                result = await toolHandler(action.tool_input);
              } catch (err) {
                result = { error: err instanceof Error ? err.message : String(err) };
                stepSuccess = false;
              }
            }
          } else if (action.type === 'respond') {
            // Agent is done
            result = action.response;
            finalResponse = action.response;
            exitReason = 'responded';
          } else if (action.type === 'error') {
            result = { error: action.error };
            stepSuccess = false;
            loopError = action.error;
          }

          // Step 3: Update state
          const stateAfter: DispatcherState = {
            ...currentState,
            current_tool: action.type === 'tool_call' ? action.tool_name : undefined,
            current_input: action.type === 'tool_call' ? action.tool_input : { response: finalResponse },
            action: action.type === 'respond' ? 'complete' : 'tool_call',
          };

          // Update history
          if (!stateAfter.history) stateAfter.history = [];
          stateAfter.history.push({
            step: stepNumber,
            action: action.type,
            tool_name: action.type === 'tool_call' ? action.tool_name : undefined,
            result_size: typeof result === 'string' ? result.length : JSON.stringify(result).length,
            timestamp: new Date().toISOString(),
          });

          currentState = stateAfter;

          // Record step
          const stepResult: AgentStepResult = {
            step_number: stepNumber,
            action,
            result,
            state_before: stateBefore,
            state_after: stateAfter,
            execution_time_ms: Date.now() - stepStartTime,
            success: stepSuccess,
          };

          steps.push(stepResult);

          // Exit if agent responded
          if (action.type === 'respond') {
            break;
          }
        } catch (stepErr) {
          loopError = stepErr instanceof Error ? stepErr.message : String(stepErr);
          steps.push({
            step_number: stepNumber,
            action: { type: 'error', error: loopError },
            state_before: stateBefore,
            state_after: currentState,
            execution_time_ms: Date.now() - stepStartTime,
            success: false,
            error: loopError,
          });
          exitReason = 'error';
          break;
        }
      }

      if (stepNumber >= this.config.maxIterations) {
        exitReason = 'max_iterations';
      }
    } catch (err) {
      loopError = err instanceof Error ? err.message : String(err);
      exitReason = 'error';
    }

    const totalTime = Date.now() - startTime;
    const run: AgentLoopRun = {
      session_id: sessionId,
      user_prompt: userPrompt,
      initial_state: currentState,
      final_state: currentState,
      steps,
      final_response: finalResponse,
      total_time_ms: totalTime,
      success: exitReason === 'responded' && !loopError,
      exit_reason: exitReason,
    };

    // Persist to database
    if (this.config.persistToDb) {
      await this.persistLoopRun(run).catch((err) => {
        console.warn('[LangGraphOrchestrator] Failed to persist loop run:', err);
      });
    }

    return run;
  }

  /**
   * Persist agent loop run to database
   */
  private async persistLoopRun(run: AgentLoopRun): Promise<void> {
    if (!this.pool) {
      console.warn('[LangGraphOrchestrator] No database pool configured, skipping persistence');
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_loop_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id VARCHAR(255) NOT NULL,
          user_prompt TEXT NOT NULL,
          final_response TEXT,
          total_time_ms INT NOT NULL,
          steps_count INT NOT NULL,
          exit_reason VARCHAR(50) NOT NULL,
          success BOOLEAN NOT NULL,
          run_json JSONB NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),

          CONSTRAINT session_not_empty CHECK (session_id <> '')
        );

        CREATE INDEX IF NOT EXISTS idx_agent_loop_runs_session
          ON agent_loop_runs (session_id, created_at DESC);
      `);

      await client.query(
        `INSERT INTO agent_loop_runs
          (session_id, user_prompt, final_response, total_time_ms, steps_count, exit_reason, success, run_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          run.session_id,
          run.user_prompt,
          run.final_response || null,
          run.total_time_ms,
          run.steps.length,
          run.exit_reason,
          run.success,
          JSON.stringify(run),
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get loop run history for a session
   */
  async getLoopRunHistory(sessionId: string, limit = 10): Promise<AgentLoopRun[]> {
    if (!this.pool) return [];

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT run_json FROM agent_loop_runs
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [sessionId, limit]
      );

      return result.rows.map((row) => JSON.parse(row.run_json));
    } finally {
      client.release();
    }
  }

  /**
   * Ensure database schema exists
   */
  async ensureSchema(): Promise<void> {
    if (!this.pool) {
      console.warn('[LangGraphOrchestrator] No database pool configured, skipping schema creation');
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_loop_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id VARCHAR(255) NOT NULL,
          user_prompt TEXT NOT NULL,
          final_response TEXT,
          total_time_ms INT NOT NULL,
          steps_count INT NOT NULL,
          exit_reason VARCHAR(50) NOT NULL,
          success BOOLEAN NOT NULL,
          run_json JSONB NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),

          CONSTRAINT session_not_empty CHECK (session_id <> '')
        );

        CREATE INDEX IF NOT EXISTS idx_agent_loop_runs_session
          ON agent_loop_runs (session_id, created_at DESC);
      `);
    } finally {
      client.release();
    }
  }
}
