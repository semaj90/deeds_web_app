import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { resolveRuntimeConfig } from '$lib/server/ai/inference-configs.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) {
    return json(
      {
        error: 'Unauthorized',
        runtimeProfile: null,
        runtimeAvailable: false,
        turboQuantEnabled: false,
        rotorQuantKv: false,
        modelPath: null,
        llamaServerPath: null,
        runtimeNotes: null,
        ollamaStatus: 'unauthorized',
        ollamaUrl: ENV.OLLAMA_BASE_URL ?? null,
        ldrUrl: ENV.LDR_BASE_URL ?? null,
      },
      { status: 401 }
    );
  }

  const runtime = resolveRuntimeConfig();
  let ollamaStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';

  if (ENV.OLLAMA_BASE_URL) {
    try {
      const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      ollamaStatus = res.ok ? 'connected' : 'error';
    } catch {
      ollamaStatus = 'error';
    }
  }

  return json({
    runtimeProfile: runtime.profile,
    runtimeAvailable: runtime.runtimeAvailable,
    turboQuantEnabled: runtime.turboQuant,
    rotorQuantKv: runtime.rotorQuantKv,
    modelPath: runtime.modelPath ?? null,
    llamaServerPath: runtime.llamaServerPath ?? null,
    runtimeNotes: runtime.notes,
    ollamaStatus,
    ollamaUrl: ENV.OLLAMA_BASE_URL ?? null,
    ldrUrl: ENV.LDR_BASE_URL ?? null,
  });
};
