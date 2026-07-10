import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { classifyToolResult, nextLegalState, attemptRecovery, finalizeTrace } from '$lib/server/router/viterbi-router';
import type { RouteTrace, ToolResult } from '$lib/server/router/router-types';
import { v4 as uuid } from 'uuid';

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
 * 2. Simulate or execute tool (dry-run or real)
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

    // 2. Simulate tool execution or call real MCP tool
    // For Phase 1 (deterministic router), we use mock results
    const mockResult: ToolResult = {
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

    // In dry-run mode, stop here
    if (validated.dry_run) {
      return json({
        status: 'dry_run',
        result: mockResult,
        nextState: classifyToolResult(mockResult)
      });
    }

    // 3. Classify result
    const nextState = classifyToolResult(mockResult);

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

      // Create mock trace for recovery attempt
      const mockTrace: RouteTrace = {
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
        executionId: mockResult.executionId,
        resultClass: mockResult.resultClass,
        resultCount: mockResult.resultCount,
        sourceRefCount: mockResult.sourceRefCount,
        sourceRefs: mockResult.sourceRefs,
        durationMs: mockResult.durationMs,
        recoveryAttempted: false,
        finalState: nextState,
        finalOutcome: mockResult.success ? 'success' : 'failed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const recoveryTrace = await attemptRecovery(mockTrace, recoveryTools);
      if (recoveryTrace.recoveryTool) {
        recoveryPlan = {
          recoveryState: recoveryTrace.recoveryState,
          recoveryTool: recoveryTrace.recoveryTool,
          reason: `Recovery needed: result class is '${mockResult.resultClass}'`
        };
      }
    }

    // 5. Finalize trace (in real implementation, write to proposed_tool_calls + tool_call_events)
    // For Phase 1, just return the classification

    // 6. Return response
    return json({
      status: 'ok',
      executionId: mockResult.executionId,
      result: mockResult,
      nextState,
      recoveryPlan,
      timing: {
        executedAt: new Date().toISOString(),
        durationMs: mockResult.durationMs
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

  // TODO: Query proposed_tool_calls + tool_call_events by executionId
  return json({
    executionId,
    status: 'not_found',
    error: 'Execution record not found'
  }, { status: 404 });
};
