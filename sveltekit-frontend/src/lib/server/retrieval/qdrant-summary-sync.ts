import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import { QDRANT_SOURCE_COLLECTION } from '$lib/server/vector/retrieval-semantics.js';

export const CANONICAL_CODEBASE_QDRANT_COLLECTIONS = [
  'codebase_chunks_768_v2',
  QDRANT_SOURCE_COLLECTION,
] as const;

export interface QdrantSummarySyncInput {
  packetKey: string;
  sourceRevision: string;
  contentHash: string;
  payload: Record<string, unknown>;
  qdrantPointId?: string | null;
  collection?: string | null;
}

export interface QdrantSummarySyncResult {
  collection: string;
  matchedPoints: number;
  updatedPoints: number;
  pointIds: Array<string | number>;
}

function normalizeQdrantPoints(response: unknown): Array<{ id: string | number }> {
  if (Array.isArray(response)) {
    return response as Array<{ id: string | number }>;
  }

  if (!response || typeof response !== 'object') {
    return [];
  }

  const maybePoints = (response as { points?: unknown; result?: unknown }).points;
  if (Array.isArray(maybePoints)) {
    return maybePoints as Array<{ id: string | number }>;
  }

  const maybeResult = (response as { result?: { points?: unknown } }).result;
  if (maybeResult && Array.isArray(maybeResult.points)) {
    return maybeResult.points as Array<{ id: string | number }>;
  }

  return [];
}

async function resolveCanonicalCodebaseCollection(): Promise<string> {
  const qdrant = getQdrantManager();

  try {
    const collections = await qdrant.getCollections();
    const names = (collections.collections ?? [])
      .map((entry) => entry.name)
      .filter((name): name is string => Boolean(name));

    for (const preferred of CANONICAL_CODEBASE_QDRANT_COLLECTIONS) {
      if (names.includes(preferred)) {
        return preferred;
      }
    }

    const envCollection = process.env.QDRANT_CODEBASE_COLLECTION?.trim() || process.env.CODEBASE_QDRANT_COLLECTION?.trim();
    if (envCollection && names.includes(envCollection)) {
      return envCollection;
    }
  } catch (error) {
    console.warn('[qdrant-sync] collection resolution failed:', (error as Error).message);
  }

  return process.env.QDRANT_CODEBASE_COLLECTION?.trim()
    || process.env.CODEBASE_QDRANT_COLLECTION?.trim()
    || CANONICAL_CODEBASE_QDRANT_COLLECTIONS[0];
}

export async function syncSummaryPayloadToQdrant(
  input: QdrantSummarySyncInput,
): Promise<QdrantSummarySyncResult> {
  if (
    !/^sha256:[a-f0-9]{64}$/i.test(input.sourceRevision)
    || !/^sha256:[a-f0-9]{64}$/i.test(input.contentHash)
  ) {
    throw new Error('Qdrant summary sync requires source revision and content hash');
  }

  const qdrant = getQdrantManager();
  const collection = input.collection?.trim() || (await resolveCanonicalCodebaseCollection());

  const revisionFilter = {
    must: [
      { key: 'packet_key', match: { value: input.packetKey } },
      { key: 'source_revision', match: { value: input.sourceRevision } },
      { key: 'content_hash', match: { value: input.contentHash } },
    ],
    ...(input.qdrantPointId ? { has_id: [input.qdrantPointId] } : {}),
  };
  let pointIds: Array<string | number>;
  try {
    const scrollResponse = await qdrant.client.scroll(collection, {
      limit: 50,
      with_payload: false,
      with_vector: false,
      filter: revisionFilter,
    });
    pointIds = normalizeQdrantPoints(scrollResponse).map((point) => point.id);
  } catch (error) {
    console.warn(
      `[qdrant-sync] revision-qualified packet lookup failed for ${input.packetKey}:`,
      (error as Error).message,
    );
    pointIds = [];
  }

  const ids = pointIds;
  if (ids.length === 0) {
    return {
      collection,
      matchedPoints: 0,
      updatedPoints: 0,
      pointIds: [],
    };
  }

  const payload = {
    ...input.payload,
    packet_key: input.packetKey,
    qdrant_synced_at: new Date().toISOString(),
  };

  await qdrant.client.setPayload(collection, {
    filter: revisionFilter,
    payload,
  });

  return {
    collection,
    matchedPoints: ids.length,
    updatedPoints: ids.length,
    pointIds: ids,
  };
}
