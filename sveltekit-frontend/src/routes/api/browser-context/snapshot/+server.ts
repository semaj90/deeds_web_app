// @vitest-environment node
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import {
  sanitizeBrowserContext,
  emptyContext,
} from '$lib/server/admin/browser-context-sanitizer.js';
import type { SanitizedBrowserContext } from '$lib/types/browser-context.js';
import { BROWSER_CONTEXT_CAPS } from '$lib/types/browser-context.js';

/**
 * POST /api/browser-context/snapshot
 *   Body: BrowserContextSnapshot (Zod-validated by the sanitizer).
 *   Behavior: sanitize, store latest snapshot per user (Redis if available,
 *             fallback to a tiny in-process Map for dev).
 *   Returns:  { ok, stats } where stats lists what was dropped/redacted.
 *
 * GET /api/browser-context/snapshot
 *   Returns the latest sanitized snapshot for the calling user, or a
 *   degraded empty snapshot if none exists. Same top-level keys either way
 *   per CLAUDE.md "Degraded Response Contract".
 *
 * Auth: requires session. Without a user, anonymous storage would let any
 * client clobber another's context.
 */

const REDIS_KEY = (userId: string) => `browser-context:snapshot:${userId}`;

/** Process-wide fallback when Redis is unavailable (dev / smoke). NOT for prod. */
const inProcessStore = new Map<string, SanitizedBrowserContext>();

async function tryRedis<T>(fn: (r: import('ioredis').default) => Promise<T>): Promise<T | null> {
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    r.on('error', () => {});
    try {
      await r.connect();
      return await fn(r);
    } finally {
      await r.quit().catch(() => {});
    }
  } catch {
    return null;
  }
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  let body: unknown;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const { context, stats, rejected_reason } = sanitizeBrowserContext(body);
  if (rejected_reason) {
    // Schema-rejected payload — still return 200 with stats so the extension
    // can show "snapshot dropped" without a 4xx noise burst.
    return json({ ok: false, stats, rejected_reason });
  }

  const userId = locals.user.id ?? 'anonymous';
  const stored = await tryRedis(async r => {
    await r.setex(
      REDIS_KEY(userId),
      BROWSER_CONTEXT_CAPS.REDIS_TTL_SECONDS,
      JSON.stringify(context),
    );
    return true;
  });
  if (!stored) inProcessStore.set(userId, context);

  return json({ ok: true, stats, storage: stored ? 'redis' : 'memory' });
};

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const userId = locals.user.id ?? 'anonymous';
  const fromRedis = await tryRedis(async r => {
    const raw = await r.get(REDIS_KEY(userId));
    return raw ? (JSON.parse(raw) as SanitizedBrowserContext) : null;
  });
  const snapshot = fromRedis ?? inProcessStore.get(userId);
  if (snapshot) return json({ ok: true, snapshot, source: fromRedis ? 'redis' : 'memory' });

  // Degraded: same top-level keys as success.
  return json({
    ok: true,
    snapshot: {
      ...emptyContext(),
      sanitized: {
        tabs_dropped: 0, snippets_dropped: 0, history_hits_dropped: 0,
        urls_redacted: 0, snippet_redactions: 0, forbidden_schemes_seen: 0,
      },
      trust:       'untrusted_user_visible',
      received_at: new Date(0).toISOString(),
    },
    source: 'empty',
  });
};

export const DELETE: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const userId = locals.user.id ?? 'anonymous';
  await tryRedis(async r => { await r.del(REDIS_KEY(userId)); return true; });
  inProcessStore.delete(userId);
  return json({ ok: true });
};
