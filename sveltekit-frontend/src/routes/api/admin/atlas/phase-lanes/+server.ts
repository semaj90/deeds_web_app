import { json, type RequestHandler } from '@sveltejs/kit';
import { getParentAtlasPhaseLaneSnapshot } from '../../../../../lib/server/atlas/phase-lane-registry.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  return json(getParentAtlasPhaseLaneSnapshot());
};
