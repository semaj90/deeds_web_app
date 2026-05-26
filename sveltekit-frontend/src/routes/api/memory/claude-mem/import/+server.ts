import { json } from '@sveltejs/kit';
import { ingestObservations } from '$lib/server/memory/claude-mem-ingest.js';

export const POST = async ({ request }) => {
  const body = await request.json();
  const items = Array.isArray(body) ? body : [body];
  try {
    const result = await ingestObservations(items, { collection: 'agent_memory_observations' });
    return json({ ok: true, result });
  } catch (e) {
    console.error('[api/memory/claude-mem/import] error', e?.message ?? e);
    return json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
};

export const GET = async () => {
  return json({ ok: true, info: 'POST JSON or JSONL to import Claude-mem observations' });
};
