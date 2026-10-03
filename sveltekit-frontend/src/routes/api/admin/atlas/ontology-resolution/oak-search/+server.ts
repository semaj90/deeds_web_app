import { json } from '@sveltejs/kit';
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

interface OakSearchRequestBody {
  query?: string;
  limit?: number;
}

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  try {
    const body = (await event.request.json()) as OakSearchRequestBody;
    if (!body.query?.trim()) {
      return json({ ok: false, error: 'query is required' }, { status: 400 });
    }
    const limit = Number.isFinite(body.limit) ? Math.min(Math.max(1, Number(body.limit)), 100) : 20;

    const res = await fetch(`${oakSidecarBaseUrl()}/oak/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: body.query.trim(), limit }),
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
