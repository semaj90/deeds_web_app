import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { switchVlmMode, getVlmState, VlmMode } from '$lib/server/inference/vlm-lifecycle.js';
import { z } from 'zod';

const SWITCHABLE_VLM_MODES = [VlmMode.OFF, VlmMode.TEXT, VlmMode.VISION, VlmMode.GPU_WORK] as const;
const SwitchModeRequestSchema = z
  .object({
    mode: z.enum(SWITCHABLE_VLM_MODES),
  })
  .strict();

const VALID_MODES = new Set<string>(SWITCHABLE_VLM_MODES);

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

  const parsedBody = SwitchModeRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return json(
      { error: `Invalid mode. Must be one of: ${[...VALID_MODES].join(', ')}` },
      { status: 400 }
    );
  }

  const result = await switchVlmMode(parsedBody.data.mode);
  if (!result.success) {
    return json({ error: result.error ?? 'Mode switch failed' }, { status: 409 });
  }

  const newState = await getVlmState();
  return json({ mode: newState });
};
