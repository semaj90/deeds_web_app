import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import {
  QDRANT_SEMANTIC_COLLECTION,
  ATLAS_QDRANT_FILTER_FIELDS_V1,
} from './qdrant-semantic-projection.js';

export interface QdrantSemanticIndexEnsureReceiptV1 {
  schema: 'atlas.qdrant-semantic-index-ensure-receipt.v1';
  collection: typeof QDRANT_SEMANTIC_COLLECTION;
  requestedFields: readonly string[];
  ensured: string[];
  failed: Array<{ field: string; error: string }>;
  collectionMemory: {
    vectorsOnDisk: boolean | null;
    hnswOnDisk: boolean | null;
    payloadOnDisk: boolean | null;
  };
}

const INTEGER_FIELDS = new Set(['representation_revision', 'native_model_dimension', 'kmeans_cluster_id']);

/**
 * Idempotently ensure exact-match payload indexes used by the graph/semantic
 * projection. This does not recreate the collection and does not change vector
 * placement; memory-tier migration stays an explicit, separately receipted step.
 */
export async function ensureQdrantSemanticPayloadIndexesV1(): Promise<QdrantSemanticIndexEnsureReceiptV1> {
  const client = getQdrantClient();
  const info = (await client.getCollection(QDRANT_SEMANTIC_COLLECTION)) as any;
  const ensured: string[] = [];
  const failed: Array<{ field: string; error: string }> = [];

  for (const field of ATLAS_QDRANT_FILTER_FIELDS_V1) {
    try {
      await client.createPayloadIndex(QDRANT_SEMANTIC_COLLECTION, {
        field_name: field,
        field_schema: INTEGER_FIELDS.has(field) ? 'integer' : 'keyword',
        wait: true,
      } as any);
      ensured.push(field);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already|exists|same schema/i.test(message)) ensured.push(field);
      else failed.push({ field, error: message });
    }
  }

  const params = info?.config?.params ?? info?.result?.config?.params ?? {};
  const hnsw = info?.config?.hnsw_config ?? info?.result?.config?.hnsw_config ?? {};
  // codebase_chunks_512 is an unnamed single-vector collection, so params.vectors
  // itself is the vector config rather than params.vectors.content.
  const vectorConfig = params?.vectors ?? {};

  return {
    schema: 'atlas.qdrant-semantic-index-ensure-receipt.v1',
    collection: QDRANT_SEMANTIC_COLLECTION,
    requestedFields: ATLAS_QDRANT_FILTER_FIELDS_V1,
    ensured,
    failed,
    collectionMemory: {
      vectorsOnDisk: typeof vectorConfig?.on_disk === 'boolean' ? vectorConfig.on_disk : null,
      hnswOnDisk: typeof hnsw?.on_disk === 'boolean' ? hnsw.on_disk : null,
      payloadOnDisk: typeof params?.on_disk_payload === 'boolean' ? params.on_disk_payload : null,
    },
  };
}
