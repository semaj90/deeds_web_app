import { json, type RequestHandler } from '@sveltejs/kit';
import { getAtlasRuntimeRegistrySnapshot } from '../../../../../lib/server/atlas/runtime-registry.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  return json(getAtlasRuntimeRegistrySnapshot());
};
