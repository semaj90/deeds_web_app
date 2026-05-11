import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { clientKey, TTL } from '$lib/server/cache-keys.js';
import { setCache, getFromMemoryCache } from '$lib/server/cache.js';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 5000))]).catch(
    () => fallback
  );

/**
 * Reports sub-route load. Previously re-fetched the case independently; now
 * reads it from `await parent()` (layout already loaded the full row).
 * Reports query (sorted desc by createdAt, capped at 20) stays here.
 */
export const load: PageServerLoad = async ({ locals, params, parent }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  const caseId = params.id;
  const userId = locals.user.id;

  // Client view cache check
  const vKey = clientKey.view(userId, caseId, 'reports');
  const memHit = getFromMemoryCache(vKey);
  if (memHit.found && memHit.value) return memHit.value as any;
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const hit = await getRedis().get(vKey);
    if (hit) {
      const p = JSON.parse(hit);
      if (p) return p;
    }
  } catch {
    /* miss */
  }

  // caseData from layout via parent(); reports fetched here
  const [{ caseData }, reportRows] = await Promise.all([
    parent(),
    safe(
      db
        .select()
        .from(reports)
        .where(eq(reports.caseId, caseId))
        .orderBy(desc(reports.createdAt))
        .limit(20),
      []
    ),
  ]);

  const result = {
    user: locals.user,
    caseData: caseData || null,
    reports: reportRows || [],
  };

  setCache(vKey, result, TTL.CLIENT_VIEW * 1000).catch(() => {});
  return result;
};
