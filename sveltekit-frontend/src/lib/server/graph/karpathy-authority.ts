import { getRedis } from '$lib/server/redis.js';

export type AuthorityResult = { score: number; source: string; graphHash?: string };

/**
 * Compute a pack-level authority score from Karpathy Redis scores.
 * - ctx may be an ACEContext-like object; we extract file paths from common fields.
 * - Returns a conservative aggregate in [0,1].
 */
export async function getAuthorityForContext(ctx: any): Promise<AuthorityResult> {
  try {
    const redis = getRedis();
    if (!redis) return { score: 0, source: 'gpu' };

    const filePaths = new Set<string>();
    // common places where file paths live
    if (Array.isArray(ctx?.codebaseContext)) {
      for (const c of ctx.codebaseContext) if (c?.filePath) filePaths.add(c.filePath);
    }
    if (Array.isArray(ctx?.chunks)) {
      for (const c of ctx.chunks) if (c?.filePath) filePaths.add(c.filePath);
    }
    if (Array.isArray(ctx?.top_chunks)) {
      for (const c of ctx.top_chunks) if (c?.filePath) filePaths.add(c.filePath);
    }
    if (Array.isArray(ctx?.chunkIds)) {
      for (const id of ctx.chunkIds) if (typeof id === 'string' && id.startsWith('file:')) {
        const m = id.match(/^file:(.+?)(?::[^:]+)?$/);
        if (m) filePaths.add(m[1]);
      }
    }

    const unique = Array.from(filePaths).slice(0, 64);
    if (unique.length === 0) {
      // Fallback: when packs don't include file paths (e.g. smoke packs),
      // compute a conservative aggregate across available Karpathy scores.
      try {
        const all = await redis.hvals('gpu:karpathy:scores').catch(() => []);
        let asum = 0;
        let acount = 0;
        for (const item of all ?? []) {
          if (!item) continue;
          try {
            const p = JSON.parse(item as string);
            const a = p?.authority ?? p?.pr ?? p?.blend ?? null;
            const n = Number(a);
            if (Number.isFinite(n)) {
              const norm = n > 1 ? Math.min(1, n / 100) : Math.max(0, n);
              asum += norm;
              acount++;
            }
          } catch {
            const n = Number(item);
            if (Number.isFinite(n)) {
              const norm = n > 1 ? Math.min(1, n / 100) : Math.max(0, n);
              asum += norm;
              acount++;
            }
          }
        }
        if (acount > 0) return { score: asum / acount, source: 'gpu' };
      } catch {
        // ignore fallback errors
      }
      return { score: 0, source: 'gpu' };
    }

    const raw = await redis.hmget('gpu:karpathy:scores', ...unique).catch(() => []);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < unique.length; i++) {
      const val = raw?.[i];
      if (!val) continue;
      try {
        const parsed = JSON.parse(val as string);
        const a = parsed?.authority ?? parsed?.pr ?? parsed?.blend ?? null;
        const n = Number(a);
        if (Number.isFinite(n)) {
          // assume stored values are 0..1 or 0..100; normalize heuristically
          const norm = n > 1 ? Math.min(1, n / 100) : Math.max(0, n);
          sum += norm;
          count++;
        }
      } catch {
        const n = Number(val);
        if (Number.isFinite(n)) {
          const norm = n > 1 ? Math.min(1, n / 100) : Math.max(0, n);
          sum += norm;
          count++;
        }
      }
    }

    if (count === 0) return { score: 0, source: 'gpu' };
    return { score: sum / count, source: 'gpu' };
  } catch {
    return { score: 0, source: 'gpu' };
  }
}

export default { getAuthorityForContext };
