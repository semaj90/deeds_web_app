import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-utils.js';
import { ENV } from '$lib/server/env.server.js';

/**
 * Read-only proxy to the live real-oaklib FastAPI kernel
 * (python/atlas_oak_kernel.py, :8095/oak/search), owned by
 * openspec/changes/parent-atlas-ontology-kernel/. Kept as its own route
 * (not folded into ../+server.ts's POST) so it stays visibly distinct from
 * this change's own atlas_domain_ontology resolver -- two separate systems,
 * see this change's tasks.md section 7.
 */

function oakSidecarBaseUrl(): string {
  return ENV.MINIFORGE_SIDECAR_URL || ENV.LANGEXTRACT_URL || 'http://127.0.0.1:8095';
}

const oakSearchBodySchema = z.object({
  query: z.string().trim().min(1).max(1024),
  limit: z.number().int().min(1).max(100).optional(),
});

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  try {
    const raw = await event.request.json().catch(() => null);
    const parsed = oakSearchBodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ ok: false, error: 'query is required' }, { status: 400 });
    }
    const body = parsed.data;
    const limit = body.limit ?? 20;
    const res = await fetch(`${oakSidecarBaseUrl()}/oak/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: body.query, limit }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json({ ok: false, error: `OAK kernel returned ${res.status}: ${detail}`.slice(0, 500) }, { status: 502 });
    }

    const result = await res.json();
    return json({ ok: true, result });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
};
