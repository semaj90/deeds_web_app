// @vitest-environment node
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { comfyui } from '$lib/server/comfyui/comfyui-client.js';

/**
 * POST /api/comfyui/render
 *
 * Submits a `workflow_api.json` payload (operator-exported from ComfyUI
 * Desktop "Save (API Format)") to the ComfyUI HTTP API and returns the
 * `prompt_id`. This is the HTTP-bridge phase — no GLB processing, no DB
 * writes, no queue publishing. A later phase wires this behind a
 * `comfyui.render` RabbitMQ producer so the API stays sub-second.
 *
 * Success:   200 { ok: true, prompt_id, status: 'queued' }
 * Bad input: 400 throw error()
 * ComfyUI down / non-2xx: 200 { ok: false, prompt_id: null, error }
 */

const schema = z.object({
  workflow:  z.record(z.string(), z.unknown()).refine(o => Object.keys(o).length > 0, {
    message: 'workflow must be a non-empty object exported from ComfyUI "Save (API Format)"',
  }),
  client_id: z.string().min(1).max(128).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  let body: unknown;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.message);

  const result = await comfyui.submitPrompt(parsed.data.workflow, parsed.data.client_id);
  if (!result.ok) {
    return json({
      ok:        false,
      prompt_id: null,
      error:     result.error ?? 'Unknown ComfyUI submission error',
    });
  }
  return json({
    ok:        true,
    prompt_id: result.prompt_id,
    status:    'queued',
  });
};
