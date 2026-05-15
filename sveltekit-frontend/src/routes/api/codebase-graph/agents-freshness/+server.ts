/**
 * GET /api/codebase-graph/agents-freshness?path=<filePath>
 *
 * Returns LLMS.md freshness for a given file path:
 *   - resolvedKey      Redis key the walk-up resolved to (or 'llms:root' fallback)
 *   - resolvedDir      directory the resolver landed on (after walking up)
 *   - ttlSeconds       seconds remaining on the resolved key (-1 = no TTL, -2 = missing)
 *   - lengthChars      size of the cached markdown
 *   - fallbackToRoot   true when the resolution fell through to repo-root LLMS.md
 *
 * Used by the fast-ast detail panel to surface "LLMS.md cache fresh / stale"
 * info next to selected files in GraphifyViewer (architecture review item 5).
 *
 * GET (no path) → returns global stats: total llms:dir:* keys + llms:root presence
 *                 so the panel can render a top-level "NES-arch ready" badge.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';

interface FreshnessResult {
  resolvedKey:    string;
  resolvedDir:    string;
  requestedPath:  string;
  ttlSeconds:     number | null;
  lengthChars:    number;
  fallbackToRoot: boolean;
  walk:           Array<{ key: string; exists: boolean }>;
}

interface GlobalStats {
  totalDirKeys:   number;
  rootPresent:    boolean;
  rootTtlSeconds: number | null;
  rootLengthChars: number;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const redis = getRedis();
  const path  = url.searchParams.get('path');

  // Global stats mode — no path param
  if (!path) {
    try {
      const dirKeys      = await redis.keys('llms:dir:*');
      const rootRaw      = await redis.get('llms:root');
      const rootTtl      = rootRaw ? await redis.ttl('llms:root') : null;
      const stats: GlobalStats = {
        totalDirKeys:    dirKeys.length,
        rootPresent:     rootRaw !== null,
        rootTtlSeconds:  rootTtl,
        rootLengthChars: rootRaw?.length ?? 0,
      };
      return json({ stats });
    } catch (e) {
      // Degraded shape per CLAUDE.md contract: same keys, empty defaults
      return json({
        stats: {
          totalDirKeys: 0, rootPresent: false, rootTtlSeconds: null, rootLengthChars: 0,
        } as GlobalStats,
      });
    }
  }

  // Per-path resolution — replicates getAgentsMdQuickHit walk-up logic
  try {
    let dir = path.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '');
    if (/\.[a-z]{1,5}$/i.test(dir)) dir = dir.split('/').slice(0, -1).join('/');

    const walk: FreshnessResult['walk'] = [];
    let resolvedKey  = 'llms:root';
    let resolvedDir  = '';
    let resolved     = false;

    while (dir && dir !== '.' && dir !== '/') {
      const key    = `llms:dir:${dir}`;
      const exists = (await redis.exists(key)) === 1;
      walk.push({ key, exists });
      if (exists && !resolved) {
        resolvedKey = key;
        resolvedDir = dir;
        resolved    = true;
        break;
      }
      const parent = dir.split('/').slice(0, -1).join('/');
      if (parent === dir) break;
      dir = parent;
    }

    const ttl    = await redis.ttl(resolvedKey).catch(() => -2);
    const md     = await redis.get(resolvedKey).catch(() => null);

    const result: FreshnessResult = {
      resolvedKey,
      resolvedDir,
      requestedPath:  path,
      ttlSeconds:     ttl >= 0 ? ttl : (ttl === -1 ? null : null),
      lengthChars:    md?.length ?? 0,
      fallbackToRoot: !resolved,
      walk,
    };
    return json(result);
  } catch (e) {
    return json({
      resolvedKey:    'llms:root',
      resolvedDir:    '',
      requestedPath:  path,
      ttlSeconds:     null,
      lengthChars:    0,
      fallbackToRoot: true,
      walk:           [] as FreshnessResult['walk'],
    } satisfies FreshnessResult);
  }
};
