import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { traverseGraphV1 } from '$lib/server/atlas/graph/graph-traversal.js';
import type { GraphTraverseRequestV1 } from '$lib/server/atlas/graph/graph-runtime-contracts.js';
import { requireAdmin } from '$lib/server/auth-utils.js';

const graphTraverseRequestSchema = z.object({
  schema: z.literal('atlas.graph-traverse-request.v1').optional(),
  snapshotId: z.string().min(1),
  seedNodeKeys: z.array(z.string()).min(1),
  maxHops: z.number().int().min(1).optional(),
  maxNodes: z.number().int().min(1).optional(),
  direction: z.enum(['outbound', 'inbound', 'both']).optional(),
  edgeTypes: z.array(z.string()).optional()
});

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  const { request } = event;
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = graphTraverseRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ ok: false, error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data as GraphTraverseRequestV1;
    const result = await traverseGraphV1(body);
    return json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 400 });
  }
};
