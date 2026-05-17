import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { switchVlmMode, getVlmState, VlmMode } from '$lib/server/inference/vlm-lifecycle.js';

const VALID_MODES = new Set<string>(Object.values(VlmMode).filter(m => m !== VlmMode.SWITCHING));

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mode = (body as Record<string, unknown>)?.mode;
  if (typeof mode !== 'string' || !VALID_MODES.has(mode)) {
    return json(
      { error: `Invalid mode. Must be one of: ${[...VALID_MODES].join(', ')}` },
      { status: 400 }
    );
  }

  const result = await switchVlmMode(mode as VlmMode);
  if (!result.success) {
    return json({ error: result.error ?? 'Mode switch failed' }, { status: 409 });
  }

  const newState = await getVlmState();
  return json({ mode: newState });
};
