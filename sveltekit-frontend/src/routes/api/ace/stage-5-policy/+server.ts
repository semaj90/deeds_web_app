/**
 * POST /api/ace/stage-5-policy
 * 
 * Stage 5 of ACE pipeline: Policy action selection
 * Input: /api/opencode response (packets, tools, replayTrace)
 * Output: PolicyDecision + next action routing
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';

const requestSchema = z.object({
  query: z.string().min(1),
  packets: z.array(z.any()).optional(),
  cache: z.any().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }

  try {
    const body = await request.json();
    const { query, packets, cache } = requestSchema.parse(body);
    const startMs = performance.now();

    // Policy decision logic (simplified)
    // In production, this calls selectMutationAction from mutation-gate.ts
    const packetCount = packets?.length || 0;
    const cacheHit = cache?.rpcHit || false;

    // Decision heuristics
    let action = 'ask_gemma4';
    let confidence = 0.5;
    let reasoning = 'Insufficient context for deterministic action';

    if (packetCount >= 3 && cacheHit) {
      action = 'repair_file';
      confidence = 0.92;
      reasoning = 'High-confidence context available, proceeding with direct repair';
    } else if (packetCount >= 1) {
      action = 'call_tool';
      confidence = 0.78;
      reasoning = 'Moderate context, using tool to gather additional information';
    } else if (packetCount === 0) {
      action = 'expand_graph';
      confidence = 0.65;
      reasoning = 'No direct context, expanding Neo4j graph for broader understanding';
    }

    const actionRouting: Record<string, string> = {
      repair_file: 'repair_executor',
      call_tool: 'tool_executor',
      run_tests: 'test_executor',
      rerank: 'retrieval_reranker',
      expand_graph: 'graph_expander',
      ask_gemma4: 'gemma4_reasoner',
      rollback: 'rollback_handler',
    };

    return json({
      decision: {
        action,
        confidence,
        logits: [0.2, 0.3, 0.1, 0.15, 0.15, confidence, 0.1],
        reasoning,
        latencyMs: performance.now() - startMs,
        modelVersion: 'v1.0',
      },
      nextAction: action,
      nextNode: actionRouting[action] || 'gemma4_reasoner',
      telemetry: {
        packetCount,
        cacheHit,
        userID: locals.user.id,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return error(400, 'Invalid request');
    }
    console.error('[stage-5-policy]', err);
    return error(500, 'Internal error');
  }
};
