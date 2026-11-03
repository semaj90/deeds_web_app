import { createHash, randomUUID } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';

const TTL_SECONDS = 60;
const LOCK_SECONDS = 35;
const PROMPT_REVISION = 'investigator-intel-prompt-v1';

export type CacheableIntel = {
  success: true;
  summary: string;
  recommendations: unknown[];
  didYouMean: string[];
  predictiveSignals: string[];
  evidenceUsed: number;
  provenance: {
    source: 'MODEL' | 'CACHE' | 'FALLBACK';
    generatedAt: string;
    graphRevision: string | null;
    caseEvidenceRevision: string | null;
  };
};

function cacheKey(params: {
  userId: string;
  caseId: string | null;
  query: string;
  modelRevision: string;
  caseEvidenceRevision?: string | null;
  graphRevision?: string | null;
}) {
  // User scope prevents cross-account cache sharing. Revisions are part of
  // the digest even when null; current evidence revision is not yet available,
  // so short TTL bounds its possible staleness.
  const normalizedQuery = params.query.trim().replace(/\s+/g, ' ');
  const digest = createHash('sha256').update(JSON.stringify({
    userId: params.userId,
    caseId: params.caseId,
    query: normalizedQuery,
    modelRevision: params.modelRevision,
    promptRevision: PROMPT_REVISION,
    caseEvidenceRevision: params.caseEvidenceRevision ?? null,
    graphRevision: params.graphRevision ?? null
  })).digest('hex');
  return `inv:intel:v1:${digest}`;
}

function parseCached(raw: string | null): CacheableIntel | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.success !== true ||
        parsed?.provenance?.source !== 'MODEL' ||
        !Array.isArray(parsed.recommendations) ||
        !Array.isArray(parsed.predictiveSignals)) return null;
    return parsed as CacheableIntel;
  } catch {
    return null;
  }
}

/** Shared Valkey cache; canonical evidence stays in Postgres. */
export async function getOrComputeInvestigatorIntel(
  params: {
    userId: string;
    caseId: string | null;
    query: string;
    modelRevision: string;
    caseEvidenceRevision?: string | null;
    graphRevision?: string | null;
  },
  compute: () => Promise<CacheableIntel>
): Promise<CacheableIntel> {
  const key = cacheKey(params);
  let client: ReturnType<typeof getRedis> | null = null;
  try {
    client = getRedis();
    const initial = parseCached(await client.get(key));
    if (initial) return { ...initial, provenance: { ...initial.provenance, source: 'CACHE' } };
  } catch {
    client = null; // Valkey outage must not prevent uncached, authorized retrieval
  }

  let lockOwned = false;
  const lockKey = `${key}:lock`;
  const lockToken = randomUUID();
  if (client) {
    try {
      lockOwned = (await client.set(lockKey, lockToken, 'EX', LOCK_SECONDS, 'NX')) === 'OK';
      if (!lockOwned) {
        // Bounded multi-container wait; a missing cache after this time returns
        // an explicit transient failure instead of stampeding the local model.
        for (let i = 0; i < 24; i++) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          const cached = parseCached(await client.get(key));
          if (cached) return { ...cached, provenance: { ...cached.provenance, source: 'CACHE' } };
        }
        throw new Error('INTEL_REQUEST_IN_PROGRESS');
      }
    } catch (error) {
      if ((error as Error).message === 'INTEL_REQUEST_IN_PROGRESS') throw error;
      client = null;
    }
  }

  try {
    const generated = await compute();
    // No fallback or unvalidated response is cached.
    if (client && generated.success && generated.provenance.source === 'MODEL') {
      try { await client.set(key, JSON.stringify(generated), 'EX', TTL_SECONDS); } catch { /* best effort */ }
    }
    return generated;
  } finally {
    if (client && lockOwned) {
      try {
        await client.eval(
          'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
          1, lockKey, lockToken
        );
      } catch { /* expires independently */ }
    }
  }
}
