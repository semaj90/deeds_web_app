// @vitest-environment node
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { comfyui } from '$lib/server/comfyui/comfyui-client.js';

/**
 * GET /api/comfyui/health
 *
 * Probes the configured ComfyUI base URL. Always returns 200 — degraded
 * shape (`{ ok: false, reachable: false, error }`) when ComfyUI is down
 * so clients can destructure the same keys on success and failure.
 *
 * Auth: requires a session (locals.user). Public health checks would let
 * an unauth caller fingerprint our internal services.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ ok: false, reachable: false, baseUrl: '', error: 'Unauthorized' }, { status: 401 });
  }
  const result = await comfyui.healthCheck();
  return json(result);
};