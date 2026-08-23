/**
 * POST /api/agent-control/error-fixing-graph
 *
 * Invokes the LangGraph error-fixing workflow with three-layer Gemma4 orchestration.
 *
 * Request body:
 * {
 *   "errorText": "TypeError: Cannot read property 'x' of undefined",
 *   "targetFiles": ["src/lib/auth.ts", "src/lib/session.ts"]
 * }
 *
 * Response:
 * {
 *   "runId": "uuid",
 *   "traceId": "uuid",
 *   "hmmState": "COMPLETE" | "BLOCKED",
 *   "classifiedError": { ... },
 *   "evidence": [ ... ],
 *   "recommendations": [ ... ],
 *   "validationResults": [ ... ],
 *   "executionResult": { ... }
 * }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { invokeErrorFixingGraph, type ErrorFixingGraphState } from '$lib/server/agent-control/error-fixing-graph.js';
import { z } from 'zod';

const RequestSchema = z.object({
  errorText: z.string().min(1, 'Error text required'),
  targetFiles: z.array(z.string()).min(1, 'At least one target file required').default([])
});

type Request = z.infer<typeof RequestSchema>;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    // Validate request
    const parsed = RequestSchema.parse(body);

    // Invoke the graph
    const result = await invokeErrorFixingGraph({
      errorText: parsed.errorText,
      targetFiles: parsed.targetFiles,
      candidatePacketKeys: [],
      evidence: [],
      recommendations: [],
      validationResults: [],
      retryCount: 0,
      maxRetries: 2
    } as Partial<ErrorFixingGraphState>);

    return json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    console.error('[error-fixing-graph] Failed:', message);

    return json(
      {
        error: 'Error fixing workflow failed',
        message,
        hmmState: 'BLOCKED'
      },
      { status: 500 }
    );
  }
};
