import { json } from '@sveltejs/kit';
import * as claude from '$lib/server/memory/claude-mem';

export async function GET({ locals }) {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const status = await claude.getStatus();
    return json({ ok: true, status });
  } catch (err) {
    return json({ ok: false, error: String(err) }, { status: 500 });
  }
}
