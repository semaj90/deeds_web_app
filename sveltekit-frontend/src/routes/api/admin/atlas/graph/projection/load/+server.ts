import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAtlasRapidsPageRankClient } from '$lib/server/atlas/graph/atlas-rapids-pagerank-client.js';
import { requireAdmin } from '$lib/server/auth-utils.js';

const projectionLoadRequestSchema = z.object({
  artifactDir: z.string().min(1),
  graphRevision: z.string().min(1),
  projectionRevision: z.string().optional(),
  replaceResident: z.boolean().optional(),
  apply: z.boolean().default(false),
}).strict();

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  const { request } = event;
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = projectionLoadRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ ok: false, error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;
    if (!body.apply) {
      return json({ ok: false, error: 'Projection load requires apply=true' }, { status: 409 });
    }

    const client = createAtlasRapidsPageRankClient();
    const receipt = await client.loadProjection({
      artifactDir: body.artifactDir.trim(),
      expectedGraphRevision: body.graphRevision.trim(),
      expectedProjectionRevision: body.projectionRevision?.trim() || undefined,
      replaceResident: body.replaceResident ?? false,
    });

    return json({ ok: true, receipt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 400 });
  }
};
