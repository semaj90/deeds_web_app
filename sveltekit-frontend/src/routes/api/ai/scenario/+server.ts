import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { upsertScenario, findScenarioBySourceRefAndHash, getScenarioById } from '$lib/server/ai/scenario-cache';

import { z } from 'zod';

const scenarioUpsertSchema = z.object({
  source_ref: z.string(),
  content_hash: z.string(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  metadata: z.record(z.string(), z.any()).nullish(),
  embedding: z.array(z.number()).nullish(),
});

export const POST: RequestHandler = async ({ request, locals}) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const result = scenarioUpsertSchema.safeParse(body);
    if (!result.success) {
      return json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
    }
    const row = await upsertScenario(result.data);
    return json({ ok: true, row });
  } catch (err) {
    return json({ error: String(err) }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url, locals}) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id = url.searchParams.get('id');
    if (id) {
      const row = await getScenarioById(id);
      return json({ ok: true, row });
    }
    const source_ref = url.searchParams.get('source_ref');
    const content_hash = url.searchParams.get('content_hash');
    if (source_ref && content_hash) {
      const row = await findScenarioBySourceRefAndHash(source_ref, content_hash);
      return json({ ok: true, row });
    }
    return json({ error: 'missing query parameters' }, { status: 400 });
  } catch (err) {
    return json({ error: String(err) }, { status: 500 });
  }
};
