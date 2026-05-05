/**
 * GET /api/v1/models — OpenAI-compatible model list.
 *
 * Returns the model IDs that the OpenAI-compat facade accepts. Used by
 * OpenWebUI's "Connections" page to populate its model dropdown.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { ADVERTISED_MODELS } from '$lib/server/ai/openai-facade.js';
import type { OpenAIModelListResponse } from '$lib/server/ai/openai-types.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const created = Math.floor(Date.now() / 1000);
  const body: OpenAIModelListResponse = {
    object: 'list',
    data: ADVERTISED_MODELS.map((m) => ({
      id:       m.id,
      object:   'model' as const,
      created,
      owned_by: m.owned_by,
    })),
  };
  return json(body);
};
