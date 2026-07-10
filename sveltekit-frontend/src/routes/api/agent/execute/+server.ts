import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { classifyToolResult, nextLegalState, attemptRecovery, finalizeTrace } from '$lib/server/router/viterbi-router';
import type { RouteTrace, ToolResult } from '$lib/server/router/router-types';
import { v4 as uuid } from 'uuid';
import { sql } from 'drizzle-orm';

// Incoming execution request (from /api/agent/route response)
const executeRequestSchema = z.object({
  traceId: z.string().uuid(),
  selectedTool: z.object({
    name: z.string(),
    namespace: z.string()
  }),
  arguments: z.record(z.unknown()).default({}),
  dry_run: z.boolean().default(false)
});

type ExecuteRequest = z.infer<typeof executeRequestSchema>;

// Tool execution result (simulated or real)
const toolResultSchema = z.object({
  toolName: z.string(),
  executionId: z.string().default(() => uuid()),
  success: z.boolean(),
  resultClass: z.enum([
    'answer',
    'candidates',
    'partial',
    'empty',
    'validation_error',
    'transport_error',
    'tool_error',
    'timeout'
  ]),
  resultCount: z.number().default(0),
  sourceRefCount: z.number().default(0),
  sourceRefs: z.array(z.string()).optional(),
  summary: z.string().optional(),
  fullResult: z.unknown().optional(),
  schemaError: z.boolean().optional(),
  transportError: z.boolean().optional(),
  timeout: z.boolean().optional(),
  toolError: z.string().optional(),
  durationMs: z.number().default(0),
  requiresProvenance: z.boolean().default(false)
});

/**
 * POST /api/agent/execute
 *
 * Execute selected tool and classify result for state transition.
 *
 * Flow:
 * 1. Parse execution request (traceId, tool, arguments)
 * 2. Simulate or execute tool (dry-run or real MCP dispatch)
 * 3. Classify result (8 classes → next state)
 * 4. Attempt recovery if needed (one-time, then escalate)
 * 5. Finalize trace with execution result
 * 6. Return next state + recovery plan
 *
 * Hard rules:
 * - Result classification is deterministic (no ambiguity)
 * - Recovery is bounded to one attempt
 * - Escalate on failure (no infinite loop)
 * - Every execution is auditable (all three tables written)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // 1. Parse request
    const body = await request.json() as ExecuteRequest;
    const validated = executeRequestSchema.parse(body);

    // 2. Execute real MCP tool or dry-run mock
    let toolResult: ToolResult;

    if (validated.dry_run) {
      // Dry-run mode: use mock results without side effects
      toolResult = {
        toolName: validated.selectedTool.name,
        executionId: uuid(),
        success: true,
        resultClass: 'candidates',
        resultCount: 3,
        sourceRefCount: 3,
        sourceRefs: [
          `${validated.selectedTool.namespace}:result:1`,
          `${validated.selectedTool.namespace}:result:2`,
          `${validated.selectedTool.namespace}:result:3`
        ],
        summary: `Tool ${validated.selectedTool.name} returned 3 candidates`,
        durationMs: Math.random() * 2000 + 100, // 100-2100ms
        requiresProvenance: validated.selectedTool.namespace === 'kb'
      };
    } else {
      // Real execution: dispatch to MCP tool controller
      const { dispatchToolCall } = await import('$lib/server/ai/gemma4-tool-controller.js');

      try {
        const t0 = Date.now();
        const { result: mcpResult, fromServer } = await dispatchToolCall(
          validated.selectedTool.name,
          validated.arguments
        );
        const durationMs = Date.now() - t0;

        // Extract source refs from MCP result
        const sourceRefs: string[] = [];
        if (Array.isArray(mcpResult.data)) {
          sourceRefs.push(
            ...mcpResult.data
              .filter((item: any) => item?.source_ref)
              .map((item: any) => String(item.source_ref))
          );
        }

        toolResult = {
          toolName: validated.selectedTool.name,
          executionId: uuid(),
          success: mcpResult.success,
          resultClass: mcpResult.success ? 'candidates' : 'tool_error',
          resultCount: Array.isArray(mcpResult.data) ? mcpResult.data.length : 0,
          sourceRefCount: sourceRefs.length,
          sourceRefs: sourceRefs.length > 0 ? sourceRefs : undefined,
          summary: mcpResult.success
            ? `Tool ${validated.selectedTool.name} returned ${sourceRefs.length} results with source refs`
            : `Tool error: ${mcpResult.error}`,
          durationMs,
          requiresProvenance: validated.selectedTool.namespace === 'kb',
          toolError: !mcpResult.success ? mcpResult.error : undefined,
          fullResult: mcpResult.data
        };
      } catch (toolError) {
        const message = toolError instanceof Error ? toolError.message : String(toolError);
        toolResult = {
          toolName: validated.selectedTool.name,
          executionId: uuid(),
          success: false,
          resultClass: 'transport_error',
          resultCount: 0,
          sourceRefCount: 0,
          summary: `Transport error: ${message}`,
          durationMs: 0,
          requiresProvenance: false,
          transportError: true,
          toolError: message
        };
      }
    }

    // 3. Classify result
    const nextState = classifyToolResult(toolResult);

    // In dry-run mode, stop here after classification
    if (validated.dry_run) {
      return json({
        status: 'dry_run',
        result: toolResult,
        nextState
      });
    }

    // 4. Attempt recovery if not synthesizing
    let recoveryPlan = null;
    if (nextState !== 'SYNTHESIZE' && nextState !== 'DONE') {
      // Mock available tools for recovery
      const recoveryTools = new Map([
        [
          'kb.trace_search',
          {
            name: 'kb.trace_search',
            namespace: 'kb',
            description: 'Search knowledge base',
            readOnly: true,
            providesSourceRefs: true,
            requiresServices: ['postgres', 'qdrant'],
            resultClass: 'candidates' as const,
            timeout: 5000,
            maxRetries: 2
          }
        ]
      ]);

      // Create trace for recovery attempt
      const traceForRecovery: RouteTrace = {
        traceId: validated.traceId,
        queryHash: '',
        query: '',
        decisionId: '',
        selectedState: nextState,
        selectedToolName: validated.selectedTool.name,
        candidateTools: [validated.selectedTool.name],
        proposalId: '',
        proposedArguments: validated.arguments,
        schemaValid: true,
        approvalRequired: false,
        executed: true,
        executionId: toolResult.executionId,
        resultClass: toolResult.resultClass,
        resultCount: toolResult.resultCount,
        sourceRefCount: toolResult.sourceRefCount,
        sourceRefs: toolResult.sourceRefs,
        durationMs: toolResult.durationMs,
        recoveryAttempted: false,
        finalState: nextState,
        finalOutcome: toolResult.success ? 'success' : 'failed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const recoveryTrace = await attemptRecovery(traceForRecovery, recoveryTools);
      if (recoveryTrace.recoveryTool) {
        recoveryPlan = {
          recoveryState: recoveryTrace.recoveryState,
          recoveryTool: recoveryTrace.recoveryTool,
          reason: `Recovery needed: result class is '${toolResult.resultClass}'`
        };
      }
    }

    // 5. Finalize trace (in Phase 2A.2, write to proposed_tool_calls + tool_call_events + outcome_ledger)
    try {
      const { db } = await import('$lib/server/db/client.js');
      const decisionId = `decision:${validated.traceId}:${Date.now()}`;
      const now = new Date();

      // Write tool_call_events (execution record)
      await db.execute(sql`
        INSERT INTO tool_call_events (
          trace_id, execution_id, tool_name, tool_namespace, arguments,
          status, start_time, end_time, duration_ms, result_class, result_count,
          source_ref_count, source_refs, error_message, from_server,
          event_json, created_at
        ) VALUES (
          ${validated.traceId},
          ${toolResult.executionId},
          ${validated.selectedTool.name},
          ${validated.selectedTool.namespace},
          ${JSON.stringify(validated.arguments)}::jsonb,
          'completed',
          ${now},
          ${now},
          ${toolResult.durationMs},
          ${toolResult.resultClass},
          ${toolResult.resultCount},
          ${toolResult.sourceRefCount},
          ${toolResult.sourceRefs || []}::text[],
          ${toolResult.toolError || null},
          false,
          ${JSON.stringify({
            summary: toolResult.summary,
            success: toolResult.success,
            resultClass: toolResult.resultClass
          })}::jsonb,
          ${now}
        )
      `);

      // Write outcome_ledger (state transition record)
      await db.execute(sql`
        INSERT INTO outcome_ledger (
          trace_id, previous_state, next_state, tool_name, execution_id,
          result_class, recovery_attempted, final_state, final_outcome,
          total_duration_ms, created_at
        ) VALUES (
          ${validated.traceId},
          'RETRIEVE',
          ${nextState},
          ${validated.selectedTool.name},
          ${toolResult.executionId},
          ${toolResult.resultClass},
          ${recoveryPlan !== null},
          ${nextState},
          ${toolResult.success ? 'success' : 'failed'},
          ${toolResult.durationMs},
          ${now}
        )
      `);

      // Write proposed_tool_calls (decision record)
      await db.execute(sql`
        INSERT INTO proposed_tool_calls (
          trace_id, decision_id, query, previous_state, selected_tool_name,
          selected_tool_namespace, candidate_tools, confidence_score,
          created_at
        ) VALUES (
          ${validated.traceId},
          ${decisionId},
          '',
          'RETRIEVE',
          ${validated.selectedTool.name},
          ${validated.selectedTool.namespace},
          ${[validated.selectedTool.name]}::text[],
          1.0,
          ${now}
        )
      `).catch(() => {
        // Silently ignore if INSERT fails (duplicate decision_id from concurrent requests)
      });
    } catch (dbError) {
      // Log error but don't fail the request — telemetry is best-effort
      console.error('[/api/agent/execute] Telemetry persistence error:', dbError);
    }

    // 6. Return response
    return json({
      status: 'ok',
      executionId: toolResult.executionId,
      result: toolResult,
      nextState,
      recoveryPlan,
      timing: {
        executedAt: new Date().toISOString(),
        durationMs: toolResult.durationMs
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const statusCode = message.includes('validation') ? 400 : 500;
    return json(
      { error: message, status: 'error' },
      { status: statusCode }
    );
  }
};

/**
 * GET /api/agent/execute/[executionId]
 *
 * Retrieve execution result by ID (for polling, not websocket).
 */
export const GET: RequestHandler = async ({ url }) => {
  const executionId = url.searchParams.get('executionId');

  if (!executionId) {
    return json({ error: 'Missing executionId parameter' }, { status: 400 });
  }

  try {
    const { db } = await import('$lib/server/db/client.js');

    const eventRows = await db.execute(sql`
      SELECT
        trace_id,
        execution_id,
        tool_name,
        tool_namespace,
        arguments,
        status,
        start_time,
        end_time,
        duration_ms,
        result_class,
        result_count,
        source_ref_count,
        source_refs,
        error_message,
        from_server,
        event_json,
        created_at
      FROM tool_call_events
      WHERE execution_id = ${executionId}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const event = (eventRows as any)?.rows?.[0] ?? null;

    if (!event) {
      return json({
        executionId,
        status: 'not_found',
        error: 'Execution record not found'
      }, { status: 404 });
    }

    const traceId = String(event.trace_id);

    const proposalRows = await db.execute(sql`
      SELECT
        trace_id,
        decision_id,
        query,
        previous_state,
        selected_tool_name,
        selected_tool_namespace,
        candidate_tools,
        confidence_score,
        created_at
      FROM proposed_tool_calls
      WHERE trace_id = ${traceId}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const outcomeRows = await db.execute(sql`
      SELECT
        trace_id,
        previous_state,
        next_state,
        tool_name,
        execution_id,
        result_class,
        recovery_attempted,
        final_state,
        final_outcome,
        total_duration_ms,
        created_at
      FROM outcome_ledger
      WHERE execution_id = ${executionId}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const proposal = (proposalRows as any)?.rows?.[0] ?? null;
    const outcome = (outcomeRows as any)?.rows?.[0] ?? null;

    return json({
      executionId,
      status: 'ok',
      traceId,
      proposal,
      event,
      outcome,
      review: {
        nextState: outcome?.next_state ?? null,
        resultClass: event.result_class ?? null,
        recoveryAttempted: Boolean(outcome?.recovery_attempted),
        sourceRefs: Array.isArray(event.source_refs) ? event.source_refs : [],
        paired: Boolean(proposal && event && outcome)
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      { executionId, error: message, status: 'error' },
      { status: 500 }
    );
  }
};
