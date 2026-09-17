/**
 * Atlas Runtime Retrieval Endpoint
 *
 * The route is transport only. FSM transitions and receipt admission belong to
 * executeAtlasRetrieval; this endpoint must not maintain a second workflow.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
  executeAtlasRetrieval,
} from '$lib/server/atlas/atlas-mastra-workflow.js';
import { RuntimeToolReceiptV1Schema } from '$lib/server/atlas/atlas-runtime-context.js';

const RequestSchema = z.object({
  query: z.string().min(1).max(1000),
  workspaceId: z.string().min(1),
  packetKey: z.string().min(1),
  workspaceRevision: z.string().min(1),
  packetRevision: z.string().min(1),
  tokenBudget: z.number().int().min(512).max(32768).default(8192),
  maxIterations: z.number().int().min(1).max(20).default(10),
  priorToolReceipt: RuntimeToolReceiptV1Schema.nullable().optional(),
}).strict();

function blockedResponse(reason: string) {
  return {
    packets: [],
    summary: '',
    finalState: 'RECOVER' as const,
    confidence: 0,
    blockedReason: reason,
    metadata: {
      writesPerformed: false as const,
      canonicalAuthority: false as const,
    },
  };
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json(blockedResponse('UNAUTHORIZED'), { status: 401 });
  }

  try {
    const input = RequestSchema.parse(await request.json());
    const result = await executeAtlasRetrieval(input);

    return json({
      packets: result.packets,
      summary: result.summary,
      finalState: result.finalState,
      confidence: result.confidence,
      ...(result.blockedReason ? { blockedReason: result.blockedReason } : {}),
      metadata: {
        writesPerformed: false,
        canonicalAuthority: false,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ATLAS_RETRIEVAL_BLOCKED';
    return json(blockedResponse(reason), { status: 409 });
  }
};
