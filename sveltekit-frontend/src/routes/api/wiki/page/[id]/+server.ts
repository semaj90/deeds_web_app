import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { explainWikiPage } from '$lib/server/kb/wiki-logic.js';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return json({ error: 'Missing ID' }, { status: 400 });
  }

  try {
    const page = await explainWikiPage(id);
    if (!page) {
      return json({ success: false, error: 'Page not found' }, { status: 404 });
    }
    return json({ success: true, page });
  } catch (err: any) {
    console.error('[Wiki API] Page error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
