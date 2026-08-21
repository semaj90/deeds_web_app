import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAtlasRapidsPageRankClient } from '$lib/server/atlas/graph/atlas-rapids-pagerank-client.js';
import { requireAdmin } from '$lib/server/auth-utils.js';

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  const { request } = event;
  try {
    const body = await request.json() as {
      artifactDir?: string;
      graphRevision?: string;
      projectionRevision?: string;
      replaceResident?: boolean;
    };
    if (!body.artifactDir?.trim()) {
      return json({ ok: false, error: 'artifactDir is required' }, { status: 400 });
    }
    if (!body.graphRevision?.trim()) {
      return json({ ok: false, error: 'graphRevision is required' }, { status: 400 });
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
