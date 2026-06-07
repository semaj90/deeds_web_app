import { json } from '@sveltejs/kit';
import { ingestObservations } from '$lib/server/memory/claude-mem-ingest.js';

import { z } from 'zod';

const observationSchema = z.object({
  source_refs: z.array(z.string()).optional(),
  sourceRefs: z.array(z.string()).optional(),
  refs: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  source_ref: z.string().optional(),
  
  tags: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  observation_tags: z.array(z.string()).optional(),
  
  tool_calls: z.array(z.string()).optional(),
  toolCalls: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  calls: z.array(z.string()).optional(),
  
  summary: z.string().optional(),
  content: z.string().optional(),
  message: z.string().optional(),
  observation: z.string().optional(),
  note: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  
  ide: z.string().optional(),
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
  session: z.string().optional(),
  conversation_id: z.string().optional(),
  
  observation_id: z.string().optional(),
  observationId: z.string().optional(),
  id: z.string().optional(),
  event_id: z.string().optional(),
  
  project_path: z.string().optional(),
  projectPath: z.string().optional(),
  cwd: z.string().optional(),
  workspace_path: z.string().optional(),
  repo_path: z.string().optional(),
}).passthrough();

const importBodySchema = z.union([
  observationSchema,
  z.array(observationSchema)
]);

export const POST = async ({ request, locals}) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const result = importBodySchema.safeParse(body);
    if (!result.success) {
      return json({ ok: false, error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
    }
    const items = Array.isArray(result.data) ? result.data : [result.data];
    const ingestResult = await ingestObservations(items, { collection: 'agent_memory_observations' });
    return json({ ok: true, result: ingestResult });
  } catch (e: any) {
    console.error('[api/memory/claude-mem/import] error', e?.message ?? e);
    return json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
};

// Public: returns schema/usage info only, no data read.
export const GET = async () => {
  return json({ ok: true, info: 'POST JSON or JSONL to import Claude-mem observations' });
};
