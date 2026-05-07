import { createHash } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';

const MAX_PATHS = 12;
const PREFIX = 'code:graph:file:';

interface GraphFileEntry {
  rel: string;
  zone: string;
  directFanIn: number;
  directFanOut: number;
  isRoute?: boolean;
  isTest?: boolean;
  upstreamNodeCount?: number | null;
  downstreamNodeCount?: number | null;
  topCallers?: string[];
}

function fileKey(rel: string): string {
  return PREFIX + createHash('sha1').update(rel).digest('hex').slice(0, 12);
}

/**
 * Looks up Phase A deep-import-graph data for a set of file paths and returns
 * a compact "Import Graph Context" section for ACE context assembly.
 *
 * Keys are written by `graphify-deep-imports.mjs --redis` (TTL 24h).
 * Returns '' when Redis is down or no graph data is available.
 */
export async function fetchDeepImportGraphExpansion(filePaths: string[]): Promise<string> {
  const unique = [...new Set(filePaths.filter(Boolean))].slice(0, MAX_PATHS);
  if (!unique.length) return '';

  let redis;
  try {
    redis = getRedis();
    const values = await redis.mget(...unique.map(fileKey));
    const entries: GraphFileEntry[] = values
      .map((v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } })
      .filter(Boolean) as GraphFileEntry[];

    if (!entries.length) return '';

    const sorted = entries.sort((a, b) => b.directFanIn - a.directFanIn);
    const lines = sorted.map((e) => {
      const callersStr = e.topCallers
        ?.slice(0, 3)
        .map((c) => c.split('/').pop())
        .join(', ');
      return (
        `• ${e.rel} [${e.zone}, fanIn=${e.directFanIn}, fanOut=${e.directFanOut}]` +
        (e.upstreamNodeCount != null ? ` up=${e.upstreamNodeCount}` : '') +
        (e.downstreamNodeCount != null ? ` dn=${e.downstreamNodeCount}` : '') +
        (callersStr ? ` ← ${callersStr}` : '')
      );
    });

    return `\n## Import Graph Context (Phase A)\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}
