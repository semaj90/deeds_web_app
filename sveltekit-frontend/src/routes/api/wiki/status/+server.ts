import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getWikiStatus } from '$lib/server/kb/wiki-logic.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const status = await getWikiStatus();
    return json({ success: true, status });
  } catch (err: any) {
    console.error('[Wiki API] Status error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
