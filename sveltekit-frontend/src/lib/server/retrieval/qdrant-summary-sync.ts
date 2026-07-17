import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';

export const CANONICAL_CODEBASE_QDRANT_COLLECTIONS = [
  'codebase_chunks_384_hybrid',
  'codebase_chunks_384',
] as const;

export interface QdrantSummarySyncInput {
  packetKey: string;
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

    const envCollection = process.env.CODEBASE_QDRANT_COLLECTION?.trim();
    if (envCollection && names.includes(envCollection)) {
      return envCollection;
    }
  } catch (error) {
    console.warn('[qdrant-sync] collection resolution failed:', (error as Error).message);
  }

  return process.env.CODEBASE_QDRANT_COLLECTION?.trim() || CANONICAL_CODEBASE_QDRANT_COLLECTIONS[0];
}

export async function syncSummaryPayloadToQdrant(
  input: QdrantSummarySyncInput,
): Promise<QdrantSummarySyncResult> {
  const qdrant = getQdrantManager();
  const collection = input.collection?.trim() || (await resolveCanonicalCodebaseCollection());
  const pointIds = new Set<string | number>();

  if (input.qdrantPointId) {
    pointIds.add(input.qdrantPointId);
  } else {
    try {
      const scrollResponse = await qdrant.client.scroll(collection, {
        limit: 50,
        with_payload: false,
        with_vector: false,
        filter: {
          must: [
            {
              key: 'packet_key',
              match: { value: input.packetKey },
            },
          ],
        },
      });

      for (const point of normalizeQdrantPoints(scrollResponse)) {
        pointIds.add(point.id);
      }
    } catch (error) {
      console.warn(
        `[qdrant-sync] packet lookup failed for ${input.packetKey}:`,
        (error as Error).message,
      );
    }
  }

  const ids = [...pointIds];
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

  let updatedPoints = 0;
  for (const pointId of ids) {
    await (qdrant.client as any).setPayload(collection, {
      points: [pointId],
      payload,
    });
    updatedPoints += 1;
  }

  return {
    collection,
    matchedPoints: ids.length,
    updatedPoints,
    pointIds: ids,
  };
}
