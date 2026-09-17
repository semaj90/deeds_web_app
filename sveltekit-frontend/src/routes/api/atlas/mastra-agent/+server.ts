/**
 * Mastra + Atlas Agent Endpoint.
 *
 * The real Mastra runtime is not installed/wired in this deployment. Keep the
 * route explicit and fail closed; simulated evidence is permitted only in
 * tests, never from a production HTTP endpoint.
 * TODO PA STAGE 13: wire the real model/tool runtime and receipt chain.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const RequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  workspaceId: z.string().min(1),
  packetKey: z.string().min(1),
  workspaceRevision: z.string().min(1),
  packetRevision: z.string().min(1),
  contextLimit: z.number().int().min(512).max(16384).default(4096),
  maxSteps: z.number().int().min(1).max(20).default(10),
}).strict();

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: 'Unauthorized', writesPerformed: false }, { status: 401 });
  }

  try {
    RequestSchema.parse(await request.json());
  } catch {
    return json({ success: false, error: 'INVALID_REQUEST', writesPerformed: false }, { status: 400 });
  }

  return json({
    success: false,
    error: 'MASTRA_RUNTIME_UNAVAILABLE',
    message: 'The Mastra agent runtime and canonical receipt chain are not wired for this deployment.',
    evidence: [],
    canonicalAuthority: false,
    writesPerformed: false,
  }, { status: 501 });
};
