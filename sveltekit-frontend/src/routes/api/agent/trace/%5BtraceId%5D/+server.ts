import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

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

    // TODO: Query agent_traces by traceId
    // JOIN with proposed_tool_calls (proposal_id → decision flow)
    // JOIN with tool_call_events (execution flow)
    // JOIN with outcome_ledger (result classification + recovery)

    // Mock response showing the three-table structure
    const mockTrace = {
      traceId,
      queryHash: 'abc123',
      query: 'Find legal precedent for X',
      createdAt: new Date().toISOString(),

      decision: {
        decisionId: 'dec123',
        selectedTool: {
          name: 'kb.trace_search',
          namespace: 'kb',
          description: 'Search knowledge base',
          readOnly: true,
          providesSourceRefs: true
        },
        candidates: [
          {
            tool: { name: 'kb.trace_search' },
            compositeScore: 0.847,
            reasoning: 'High semantic match + source refs available'
          },
          {
            tool: { name: 'topology.search_near' },
            compositeScore: 0.721,
            reasoning: 'Moderate topology alignment'
          },
          {
            tool: { name: 'graph.expand_neighborhood' },
            compositeScore: 0.614,
            reasoning: 'Lower transition fit + higher timeout risk'
          }
        ],
        selectedState: 'RETRIEVE',
        timestamp: new Date().toISOString()
      },

      proposal: {
        proposalId: 'prop123',
        toolName: 'kb.trace_search',
        arguments: { query: 'legal precedent X' },
        schemaValid: true,
        validationErrors: [],
        readOnly: true,
        sideEffectClass: 'none',
        approvalRequired: false,
        createdAt: new Date().toISOString()
      },

      execution: {
        executionId: 'exec123',
        toolName: 'kb.trace_search',
        success: true,
        resultClass: 'candidates',
        resultCount: 5,
        sourceRefCount: 5,
        sourceRefs: [
          'kb:precedent:001',
          'kb:precedent:002',
          'kb:precedent:003',
          'kb:precedent:004',
          'kb:precedent:005'
        ],
        durationMs: 1247,
        executedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      },

      recovery: null, // No recovery needed if success

      outcome: {
        finalState: 'SYNTHESIZE',
        finalOutcome: 'success',
        timestamp: new Date().toISOString(),
        score: 0.95,
        feedback: 'Excellent retrieval quality'
      }
    };

    // Format response based on query param
    if (query.format === 'jsonl') {
      // Return line-delimited JSON for streaming
      const lines = [
        JSON.stringify({ type: 'decision', data: mockTrace.decision }),
        JSON.stringify({ type: 'proposal', data: mockTrace.proposal }),
        JSON.stringify({ type: 'execution', data: mockTrace.execution }),
        JSON.stringify({ type: 'outcome', data: mockTrace.outcome })
      ];
      return new Response(lines.join('\n'), {
        headers: { 'Content-Type': 'application/x-ndjson' }
      });
    }

    return json(mockTrace);
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
