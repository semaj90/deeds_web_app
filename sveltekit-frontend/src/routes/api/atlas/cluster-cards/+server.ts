import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tracedQuery } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';
import {
  buildClusterCardQueryHash,
  buildClusterCardTrace,
  clusterCardRequestSchema,
  clusterCardResponseSchema,
  makeClusterCardCacheKey,
  mapLegacyClusterCardRow,
  normalizeClusterCardRequest,
  type CanonicalClusterCard,
  type ClusterCardRequest,
} from '$lib/server/retrieval/cluster-card-contract.js';

type LegacyClusterCardRow = {
  id: string;
  centroid_dim: number | null;
  card: Record<string, unknown> | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

type LegacyAtlasDocRow = {
  source_ref: string | null;
  feature_id: string | null;
  packet_key: string | null;
  cluster_id: string | null;
  centroid_id: string | null;
};

const CACHE_TTL_SECONDS = 300;

function requireUser(locals: App.Locals): void {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }
}

function parseLegacyCard(card: unknown): Record<string, unknown> | null {
  if (card && typeof card === 'object' && !Array.isArray(card)) {
    return card as Record<string, unknown>;
  }

  if (typeof card === 'string') {
    try {
      const parsed = JSON.parse(card);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

async function readCachedCards(cacheKey: string): Promise<{
  cards: CanonicalClusterCard[] | null;
  ttlSeconds: number | null;
  status: 'hit' | 'miss' | 'unavailable' | 'invalid';
}> {
  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (!cached) {
      return { cards: null, ttlSeconds: null, status: 'miss' };
    }

    const parsed = JSON.parse(cached);
    const cards = clusterCardResponseSchema.shape.clusterCards.parse(parsed);
    const ttl = await redis.ttl(cacheKey);
    return {
      cards,
      ttlSeconds: ttl >= 0 ? ttl : null,
      status: 'hit',
    };
  } catch {
    return { cards: null, ttlSeconds: null, status: 'invalid' };
  }
}

async function writeCachedCards(cacheKey: string, cards: CanonicalClusterCard[]): Promise<'write' | 'unavailable'> {
  try {
    const redis = getRedis();
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(cards));
    return 'write';
  } catch {
    return 'unavailable';
  }
}

async function fetchLegacyAtlasDocs(request: ClusterCardRequest): Promise<LegacyAtlasDocRow[]> {
  const filters: string[] = [];
  const params: unknown[] = [];

  if (request.sourceRef) {
    params.push(`%${request.sourceRef}%`);
    filters.push(`source_ref ILIKE $${params.length}`);
  }

  if (request.featureId) {
    params.push(request.featureId);
    filters.push(`feature_id = $${params.length}`);
  }

  if (request.clusterId !== undefined) {
    params.push(String(request.clusterId));
    filters.push(`cluster_id = $${params.length}`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(request.limit * 10);

  const query = `
    SELECT source_ref, feature_id, packet_key, cluster_id, centroid_id
    FROM parent_atlas_documents
    ${whereClause}
    LIMIT $${params.length}
  `;

  const result = await tracedQuery<{ rows: LegacyAtlasDocRow[] }>(
    'atlas.cluster_cards.parent_atlas_documents.lookup',
    query,
    params
  );
  return result.rows ?? [];
}

async function fetchLegacyClusterRows(
  request: ClusterCardRequest,
  docs: LegacyAtlasDocRow[]
): Promise<LegacyClusterCardRow[]> {
  const clusterIds = Array.from(
    new Set(
      docs
        .map((doc) => doc.cluster_id ?? '')
        .filter((value) => value.length > 0)
    )
  );

  if (request.clusterId !== undefined && !clusterIds.includes(String(request.clusterId))) {
    clusterIds.push(String(request.clusterId));
  }

  const filters: string[] = [];
  const params: unknown[] = [];

  if (clusterIds.length > 0) {
    params.push(clusterIds);
    filters.push(`id = ANY($${params.length})`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(Math.max(request.limit * 4, request.limit));

  const query = `
    SELECT id, centroid_dim, card, created_at, updated_at
    FROM cluster_cards
    ${whereClause}
    ORDER BY id
    LIMIT $${params.length}
  `;

  const result = await tracedQuery<{ rows: Record<string, unknown>[] }>(
    'atlas.cluster_cards.cluster_cards.lookup',
    query,
    params
  );
  return (result.rows ?? []).map((row) => ({
    id: String(row.id ?? ''),
    centroid_dim: typeof row.centroid_dim === 'number' ? row.centroid_dim : Number(row.centroid_dim ?? 0),
    card: parseLegacyCard(row.card),
    created_at: row.created_at as string | Date | null | undefined,
    updated_at: row.updated_at as string | Date | null | undefined,
  }));
}

async function loadClusterCards(request: ClusterCardRequest): Promise<{
  cards: CanonicalClusterCard[];
  warnings: string[];
}> {
  const warnings = ['LEGACY_CLUSTER_CARDS_SCHEMA'];
  const docs = await fetchLegacyAtlasDocs(request);
  const rows = await fetchLegacyClusterRows(request, docs);

  if (request.collection) {
    warnings.push('COLLECTION_FILTER_UNVERIFIED');
  }

  if (!request.featureId) {
    warnings.push('MISSING_FEATURE_ID');
  }

  const cards = rows
    .map((row) => mapLegacyClusterCardRow(row, docs))
    .filter((card) => {
      if (request.sourceRef && !card.sourceRefs.some((ref) => ref.includes(request.sourceRef!))) {
        return false;
      }
      if (request.featureId && !card.featureIds.includes(request.featureId)) {
        return false;
      }
      if (request.clusterId !== undefined && card.clusterId !== String(request.clusterId)) {
        return false;
      }
      return true;
    })
    .slice(0, request.limit);

  return { cards, warnings };
}

async function handleQuery(request: ClusterCardRequest) {
  const normalized = normalizeClusterCardRequest(request);
  const queryHash = buildClusterCardQueryHash(normalized);
  const cacheKey = makeClusterCardCacheKey(queryHash);
  const trace = buildClusterCardTrace(normalized.aliasId);

  const cached = await readCachedCards(cacheKey);
  if (cached.cards) {
    return clusterCardResponseSchema.parse({
      clusterCards: cached.cards,
      queryHash,
      totalCount: cached.cards.length,
      cache: {
        hit: true,
        key: cacheKey,
        ttlSeconds: cached.ttlSeconds,
        status: cached.status,
      },
      trace,
      warnings: [],
    });
  }

  const { cards, warnings } = await loadClusterCards(normalized);
  const cacheStatus = await writeCachedCards(cacheKey, cards);

  return clusterCardResponseSchema.parse({
    clusterCards: cards,
    queryHash,
    totalCount: cards.length,
    cache: {
      hit: false,
      key: cacheKey,
      ttlSeconds: cacheStatus === 'write' ? CACHE_TTL_SECONDS : null,
      status: cacheStatus,
    },
    trace,
    warnings,
  });
}

export const POST: RequestHandler = async ({ request, locals }) => {
  requireUser(locals);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const parsed = clusterCardRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, 'Invalid request');
  }

  return json(await handleQuery(parsed.data));
};

export const GET: RequestHandler = async ({ url, locals }) => {
  requireUser(locals);

  const parsed = clusterCardRequestSchema.safeParse({
    sourceRef: url.searchParams.get('sourceRef') ?? undefined,
    featureId: url.searchParams.get('featureId') ?? undefined,
    clusterId: url.searchParams.get('clusterId') ? Number(url.searchParams.get('clusterId')) : undefined,
    collection: url.searchParams.get('collection') ?? undefined,
    limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 20,
    aliasId: url.searchParams.get('aliasId') ?? undefined,
  });

  if (!parsed.success) {
    throw error(400, 'Invalid request');
  }

  return json(await handleQuery(parsed.data));
};

export const __test = {
  CACHE_TTL_SECONDS,
  buildClusterCardQueryHash,
  buildClusterCardTrace,
  makeClusterCardCacheKey,
  parseLegacyCard,
};
