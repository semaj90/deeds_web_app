import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { hyperragPacketRpc } from '$lib/server/retrieval/hyperrag-packet-rpc.js';

const requestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  limit: z.number().int().min(1).max(25).default(10),
  includeGraph: z.boolean().optional(),
  useFts: z.boolean().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') }, { status: 400 });
  }

  try {
    const result = await hyperragPacketRpc(parsed.data);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
};
