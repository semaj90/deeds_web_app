import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const path = decodeURIComponent(params.id);
  const result: Record<string, any> = { path };

  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    // Karpathy blend score
    const blendRaw = await redis.hget('gpu:karpathy:scores', path).catch(() => null);
    if (blendRaw) {
      try { result.karpathy = JSON.parse(blendRaw); } catch { /* ignore */ }
    }

    // 64-dim encoded vector
    const encodedRaw = await redis.hget('gpu:karpathy:encoded', path).catch(() => null);
    if (encodedRaw) result.encoded64 = encodedRaw.split(',').map(Number).slice(0, 8); // preview first 8 dims

    // ACE feature card (any matching feature key)
    const featureKey = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    const featureCard = await redis.get(`ace:feature:${featureKey}`).catch(() => null);
    if (featureCard) {
      try { result.featureCard = JSON.parse(featureCard); } catch { /* ignore */ }
    }
  } catch { /* Redis offline */ }

  // Qdrant chunks for this path
  try {
    const { ENV } = await import('$lib/server/env.server.js');
    const r = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'path', match: { value: path } }] },
        limit: 5,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const data = await r.json() as any;
      result.chunks = (data.result?.points ?? []).map((p: any) => ({
        id: p.id,
        text: String(p.payload?.content ?? p.payload?.text ?? '').slice(0, 200),
        tags: p.payload?.tags ?? [],
        coords4d: p.payload?.coords_4d,
        score: p.payload?.karpathy_blend,
      }));
    }
  } catch { /* Qdrant offline */ }

  return json(result);
};
