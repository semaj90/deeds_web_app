import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { upsertScenario, findScenarioBySourceRefAndHash, getScenarioById } from '$lib/server/ai/scenario-cache';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    // Expecting Scenario shape: source_ref, content_hash, name, description, metadata, embedding
    if (!body?.source_ref || !body?.content_hash) {
      return json({ error: 'missing source_ref or content_hash' }, { status: 400 });
    }
    const row = await upsertScenario(body);
    return json({ ok: true, row });
  } catch (err) {
    return json({ error: String(err) }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url }) => {
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
