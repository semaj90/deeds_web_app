/**
 * POST /api/ai/hermes-run
 *
 * Hermes agent orchestrator endpoint (Mastra planner + MCP tools + Gemma4 fallback).
 * Replaces the archived Hermes agent with Mastra/paperclip orchestration.
 *
 * Request:
 *   {
 *     "query": "what handles authentication?",
 *     "intent": "analyze|search|plan|rank|auto",
 *     "fileContext": "optional file path",
 *     "caseId": "optional case UUID"
 *   }
 *
 * Response:
 *   {
 *     "decision": { "selectedTools": [...], "reasoning": "..." },
 *     "executionPath": "mastra|gemma4-fallback|gemma4-primary",
 *     "synthesis": "aggregated result"
 *   }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { refuseVerifiedContextV1, type VerifiedContextServiceV1 } from '$lib/server/atlas/execution/verified-context-service-v1.js';

const requestSchema = z.object({
  query: z.string().min(1).max(4000),
  intent: z.enum(['analyze', 'search', 'plan', 'summarize', 'rank', 'auto']).optional(),
  fileContext: z.string().optional(),
  caseId: z.string().uuid().optional(),
  sessionId: z.string().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }

  try {
    const body = await request.json();
    const { query } = requestSchema.parse(body);
    const requestId = globalThis.crypto.randomUUID();
    const verifiedContextService = (locals as typeof locals & { verifiedContextService?: VerifiedContextServiceV1 }).verifiedContextService;
    const context = verifiedContextService
      ? await verifiedContextService.execute(locals.user.id, { requestId, query, topK: 5 })
      : refuseVerifiedContextV1(requestId, 'VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED', 'SERVICE_CONFIGURATION');

    if (context.status === 'REFUSED') {
      return json({
        status: 'refused',
        query,
        requestId: context.requestId,
        refusalCode: context.refusalCode,
        firstFailingBoundary: context.firstFailingBoundary,
        receipt: context.receipt,
        canonicalAuthority: false,
        writesPerformed: false,
      }, { status: 409 });
    }

    const packetHydrationRefusal = refuseVerifiedContextV1(
      requestId,
      'VERIFIED_CONTEXT_PACKET_HYDRATOR_NOT_CONFIGURED',
      'PACKET_HYDRATION',
      {
        contextPacketRef: context.contextPacketRef,
        contextPacketDigest: context.contextPacketDigest,
        contextManifestChecksum: context.contextManifestChecksum,
        promptPlanChecksum: context.promptPlanChecksum,
      },
    );
    return json({
      status: 'refused',
      query,
      requestId: packetHydrationRefusal.requestId,
      refusalCode: packetHydrationRefusal.refusalCode,
      firstFailingBoundary: packetHydrationRefusal.firstFailingBoundary,
      receipt: packetHydrationRefusal.receipt,
      canonicalAuthority: false,
      writesPerformed: false,
    }, { status: 409 });

  } catch (err) {
    const message = err instanceof z.ZodError ? 'Invalid request' : err instanceof Error ? err.message : 'Internal error';
    return error(err instanceof z.ZodError ? 400 : 500, message);
  }
};

/**
 * GET /api/ai/hermes-run/health
 *
 * Health check for Hermes orchestrator.
 */
export const GET: RequestHandler = async ({ url }) => {
  const mastraEnabled = process.env.MASTRA_ENABLED === 'true';
  const gemma4Url = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090/v1';

  // Probe Gemma4 health
  let gemma4Health = false;
  try {
    const res = await fetch(`${gemma4Url}/models`, { signal: AbortSignal.timeout(2000) });
    gemma4Health = res.ok;
  } catch {
    // Gemma4 unreachable
  }

  return json({
    status: gemma4Health ? 'ok' : 'degraded',
    mastraEnabled,
    gemma4Reachable: gemma4Health,
    orchestrator: 'hermes-mastra-gemma4',
  });
};
