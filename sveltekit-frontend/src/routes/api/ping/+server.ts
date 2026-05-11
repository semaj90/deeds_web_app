import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  return json({
    status: 'ok',
    message: 'pong',
    timestamp: new Date().toISOString(),
  });
};


