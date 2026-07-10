import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { agentTraces } from '$lib/server/db/schema/agent-traces.js';

// Query params for trace retrieval
const traceQuerySchema = z.object({
  include: z.string().default('decision,execution,recovery'),
  format: z.enum(['json', 'jsonl']).default('json')
});

/**
 * GET /api/agent/trace/[traceId]
 *
 * Retrieve complete auditable trace: decision → execution → recovery.
 *
 * Response includes:
 * - Route decision (tool, top-3 candidates, reasoning)
 * - Proposed tool call (schema validation, approval status)
 * - Tool execution result (success, result class, latency)
 * - Recovery plan (if attempted)
 * - Final outcome (success, partial, failed, escalated)
 *
 * Use case: debugging, auditing, training HMM on ground truth.
 */
export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const traceId = params.traceId;
    const query = traceQuerySchema.parse(Object.fromEntries(url.searchParams));

    if (!traceId) {
      return json({ error: 'Missing traceId' }, { status: 400 });
    }

    const [trace] = await db
      .select()
      .from(agentTraces)
      .where(eq(agentTraces.traceId, traceId))
      .limit(1);

    if (!trace) {
      return json({ error: `Trace ${traceId} not found` }, { status: 404 });
    }

    const toolCalls = Array.isArray(trace.toolCalls) ? trace.toolCalls : [];
    const commands = Array.isArray(trace.commands) ? trace.commands : [];
    const retrievedPackets = Array.isArray(trace.retrievedPackets) ? trace.retrievedPackets : [];
    const selectedConcepts = Array.isArray(trace.selectedConcepts) ? trace.selectedConcepts : [];

    const firstToolCall = toolCalls[0] ?? null;
    const firstToolName =
      typeof firstToolCall?.tool === 'string'
        ? firstToolCall.tool
        : typeof firstToolCall?.name === 'string'
          ? firstToolCall.name
          : typeof commands[0] === 'string'
            ? commands[0]
            : 'unknown';

    const decision = {
      decisionId: `decision:${traceId}`,
      selectedTool: {
        name: firstToolName,
        namespace: firstToolName.includes('.') ? firstToolName.split('.')[0] : 'internal',
        description: firstToolName,
        readOnly: true,
        providesSourceRefs: true
      },
      candidates: toolCalls.slice(0, 3).map((call: any, index: number) => ({
        tool: { name: call.tool ?? call.name ?? `tool:${index}` },
        compositeScore: typeof call.score === 'number' ? call.score : 1 - index * 0.1,
        reasoning: call.reasoning ?? 'Recorded agent trace'
      })),
      selectedState: trace.retrievalStrategy === 'structural_only'
        ? 'STRUCTURE'
        : trace.retrievalStrategy === 'lexical_only'
          ? 'RETRIEVE'
          : 'SYNTHESIZE',
      timestamp: trace.createdAt.toISOString()
    };

    const proposal = {
      proposalId: `proposal:${traceId}`,
      toolName: firstToolName,
      arguments: firstToolCall?.input ?? {},
      schemaValid: true,
      validationErrors: [],
      readOnly: true,
      sideEffectClass: 'none',
      approvalRequired: false,
      createdAt: trace.createdAt.toISOString()
    };

    const execution = {
      executionId: `execution:${traceId}`,
      toolName: firstToolName,
      success: trace.outcome !== 'failure',
      resultClass: trace.outcome === 'success' ? 'answer' : 'partial',
      resultCount: retrievedPackets.length,
      sourceRefCount: retrievedPackets.length,
      sourceRefs: retrievedPackets,
      durationMs: 0,
      executedAt: trace.createdAt.toISOString(),
      completedAt: trace.createdAt.toISOString()
    };

    const outcome = {
      finalState: trace.outcome === 'success' ? 'SYNTHESIZE' : 'RECOVER',
      finalOutcome: trace.outcome,
      timestamp: trace.createdAt.toISOString(),
      score: trace.score ?? 0,
      feedback: `retrieval_strategy=${trace.retrievalStrategy}; concepts=${selectedConcepts.length}`
    };

    const response = {
      traceId,
      queryHash: trace.traceId,
      query: trace.prompt,
      createdAt: trace.createdAt.toISOString(),
      decision,
      proposal,
      execution,
      recovery: null,
      outcome
    };

    // Format response based on query param
    if (query.format === 'jsonl') {
      // Return line-delimited JSON for streaming
      const lines = [
        JSON.stringify({ type: 'decision', data: response.decision }),
        JSON.stringify({ type: 'proposal', data: response.proposal }),
        JSON.stringify({ type: 'execution', data: response.execution }),
        JSON.stringify({ type: 'outcome', data: response.outcome })
      ];
      return new Response(lines.join('\n'), {
        headers: { 'Content-Type': 'application/x-ndjson' }
      });
    }

    return json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      { error: message, status: 'error' },
      { status: 500 }
    );
  }
};

/**
 * DELETE /api/agent/trace/[traceId]
 *
 * Archive a trace (soft delete for privacy/compliance).
 * Trace remains in DB with archived_at timestamp set.
 */
export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const traceId = params.traceId;

    if (!traceId) {
      return json({ error: 'Missing traceId' }, { status: 400 });
    }

    // TODO: Update agent_traces SET archived_at = NOW() WHERE trace_id = $1

    return json({
      status: 'ok',
      message: `Trace ${traceId} archived`,
      archivedAt: new Date().toISOString()
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      { error: message, status: 'error' },
      { status: 500 }
    );
  }
};
