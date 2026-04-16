import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getLawCitationDetail } from '$lib/server/legal/law-citations';
import { isValidCitation } from '$lib/server/validation.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(24),
});

export const GET: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.user?.id) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const citation = decodeURIComponent(params.citation);
  if (!isValidCitation(citation))
    return json({ error: 'Invalid citation format' }, { status: 400 });
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const limit = parsed.success ? parsed.data.limit : 24;

  try {
    const detail = await getLawCitationDetail(citation, limit);
    if (!detail) {
      return json({ error: 'Citation not found' }, { status: 404 });
    }

    return json(detail, { headers: cacheControl.long });
  } catch (error) {
    console.error('[api/library/citations/[citation]] detail failed:', error);
    return json(
      {
        citationKey: citation,
        citationLabel: citation,
        documentCount: 0,
        nodeCount: 0,
        chunkCount: 0,
        documents: [],
        nodes: [],
        chunks: [],
      },
      { headers: cacheControl.long }
    );
  }
};