/**
 * Qdrant Multi-Vector Schema — Purpose-built vectors for different retrieval tasks
 *
 * Named vectors (all 384-dim from EmbeddingGemma):
 *   content_embedding → Semantic search (code/text content)
 *   summary_embedding → Concept-level retrieval (summaries)
 *   title_embedding → Feature/module lookup (titles, names)
 *   signature_embedding → Function/API similarity (signatures)
 *   feature_embedding → Feature recommendation (optional)
 *   latent64 → Clustering/topology only (NOT for retrieval)
 *
 * Payload (same ID hierarchy across all stores):
 *   repository_id, directory_id, file_id, module_id, symbol_id
 *   feature_id, packet_key, chunk_id
 *   source_ref, packet_type
 *   + multi-vector metadata
 */

interface QdrantPoint {
  id: string | number;
  vectors: {
    content_embedding: {
      data: number[];
      size: 384;
    };
    summary_embedding: {
      data: number[];
      size: 384;
    };
    title_embedding: {
      data: number[];
      size: 384;
    };
    signature_embedding: {
      data: number[];
      size: 384;
    };
    feature_embedding?: {
      data: number[];
      size: 384;
    };
    latent64?: {
      data: number[];
      size: 64;
    };
  };
  payload: {
    // ID Hierarchy (stored in all mirrors)
    repository_id: string;
    directory_id: string;
    file_id: string;
    module_id: string;
    symbol_id: string;
    feature_id: string;
    packet_key: string;
    chunk_id: string;

    // Metadata
    source_ref: string;
    packet_type: 'file' | 'module' | 'function' | 'class' | 'route';

    // Multi-vector labels
    vector_types: string[];
  };
}

interface SearchRequest {
  query_embedding: number[]; // 384-dim
  using: 'content_embedding' | 'summary_embedding' | 'title_embedding' | 'signature_embedding' | 'feature_embedding';
  top_k: number;
  filter?: {
    packet_type?: string;
    feature_id?: string;
    file_id?: string;
  };
}

interface HybridSearchRequest {
  query_embedding: number[]; // 384-dim
  // Multiple vectors for different purposes
  searches: Array<{
    using: string;
    weight: number;
  }>;
  top_k: number;
}

/**
 * Create Qdrant collection with multi-vector support
 * Call once during setup
 */
export async function createMultiVectorCollection(
  qdrantUrl: string,
  collectionName: string = 'codebase_chunks_768'
): Promise<void> {
  const createRes = await fetch(`${qdrantUrl}/collections/${collectionName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        // Each named vector is 384-dim
        content_embedding: {
          size: 384,
          distance: 'Cosine'
        },
        summary_embedding: {
          size: 384,
          distance: 'Cosine'
        },
        title_embedding: {
          size: 384,
          distance: 'Cosine'
        },
        signature_embedding: {
          size: 384,
          distance: 'Cosine'
        },
        feature_embedding: {
          size: 384,
          distance: 'Cosine'
        },
        latent64: {
          size: 64,
          distance: 'Cosine'
          // NOTE: latent64 is for clustering/SOM only, NOT retrieval
        }
      },
      optimizers_config: {
        default_optimizer_config: {
          type: 'default'
        }
      },
      hnsw_config: {
        m: 16,
        ef_construction: 200,
        ef_runtime: 200
      }
    })
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create collection: ${await createRes.text()}`);
  }

  // Create indexes on named vectors
  for (const vectorName of [
    'content_embedding',
    'summary_embedding',
    'title_embedding',
    'signature_embedding'
  ]) {
    const indexRes = await fetch(`${qdrantUrl}/collections/${collectionName}/index`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: [vectorName],
        hnsw_config: {
          m: 16,
          ef_construction: 200
        }
      })
    });

    if (!indexRes.ok) {
      console.warn(`Index creation skipped for ${vectorName}: ${indexRes.status}`);
    }
  }
}

/**
 * Single-vector search (content_embedding is most common)
 */
export async function searchByContentEmbedding(
  qdrantUrl: string,
  collectionName: string,
  queryEmbedding: number[],
  topK: number = 20,
  filter?: Record<string, unknown>
): Promise<QdrantPoint[]> {
  const searchRes = await fetch(
    `${qdrantUrl}/collections/${collectionName}/points/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: {
          name: 'content_embedding',
          vector: queryEmbedding
        },
        limit: topK,
        filter
      })
    }
  );

  if (!searchRes.ok) {
    throw new Error(`Search failed: ${await searchRes.text()}`);
  }

  const { result } = await searchRes.json();
  return result;
}

/**
 * Multi-vector hybrid search
 * Example: 60% content_embedding + 40% summary_embedding
 */
export async function hybridSearch(
  qdrantUrl: string,
  collectionName: string,
  queryEmbedding: number[],
  weights: {
    content?: number; // 0-1
    summary?: number;
    title?: number;
    signature?: number;
    feature?: number;
  } = { content: 0.6, summary: 0.4 },
  topK: number = 20,
  filter?: Record<string, unknown>
): Promise<QdrantPoint[]> {
  // Normalize weights to sum to 1
  const total =
    (weights.content || 0) +
    (weights.summary || 0) +
    (weights.title || 0) +
    (weights.signature || 0) +
    (weights.feature || 0);

  const normalized = {
    content: weights.content ? weights.content / total : 0,
    summary: weights.summary ? weights.summary / total : 0,
    title: weights.title ? weights.title / total : 0,
    signature: weights.signature ? weights.signature / total : 0,
    feature: weights.feature ? weights.feature / total : 0
  };

  // Execute searches in parallel
  const searches = [];

  if (normalized.content > 0) {
    searches.push(
      searchByContentEmbedding(qdrantUrl, collectionName, queryEmbedding, topK * 3, filter)
    );
  }
  if (normalized.summary > 0) {
    searches.push(
      searchByEmbedding(
        qdrantUrl,
        collectionName,
        'summary_embedding',
        queryEmbedding,
        topK * 3,
        filter
      )
    );
  }
  if (normalized.signature > 0) {
    searches.push(
      searchByEmbedding(
        qdrantUrl,
        collectionName,
        'signature_embedding',
        queryEmbedding,
        topK * 3,
        filter
      )
    );
  }

  const results = await Promise.all(searches);

  // RRF fusion of multiple vector results
  const scoreMap: Map<string, number> = new Map();
  const pointMap: Map<string, QdrantPoint> = new Map();

  results.forEach((result, idx) => {
    const vectorType = ['content', 'summary', 'signature'][idx];
    const weight = normalized[vectorType as keyof typeof normalized];

    result.forEach((point, rank) => {
      const key = String(point.id);
      const rrfScore = weight / (rank + 60); // Reciprocal rank fusion
      scoreMap.set(key, (scoreMap.get(key) || 0) + rrfScore);
      pointMap.set(key, point);
    });
  });

  // Sort by RRF score and return top-K
  const sorted = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([key]) => pointMap.get(key)!);

  return sorted;
}

/**
 * Generic search by named vector
 */
async function searchByEmbedding(
  qdrantUrl: string,
  collectionName: string,
  vectorName: string,
  queryEmbedding: number[],
  topK: number,
  filter?: Record<string, unknown>
): Promise<QdrantPoint[]> {
  const searchRes = await fetch(
    `${qdrantUrl}/collections/${collectionName}/points/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: {
          name: vectorName,
          vector: queryEmbedding
        },
        limit: topK,
        filter
      })
    }
  );

  if (!searchRes.ok) {
    throw new Error(`Search (${vectorName}) failed: ${await searchRes.text()}`);
  }

  const { result } = await searchRes.json();
  return result;
}

/**
 * Update multi-vector for existing point (e.g., from embeddings pipeline)
 */
export async function updateMultiVectors(
  qdrantUrl: string,
  collectionName: string,
  pointId: string,
  vectors: {
    content_embedding?: number[];
    summary_embedding?: number[];
    title_embedding?: number[];
    signature_embedding?: number[];
    feature_embedding?: number[];
    latent64?: number[];
  }
): Promise<void> {
  const updateRes = await fetch(
    `${qdrantUrl}/collections/${collectionName}/points/${pointId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: Object.entries(vectors)
          .filter(([, v]) => v !== undefined)
          .reduce((acc, [k, v]) => {
            acc[k] = { data: v };
            return acc;
          }, {} as Record<string, { data: number[] }>)
      })
    }
  );

  if (!updateRes.ok) {
    throw new Error(`Update failed: ${await updateRes.text()}`);
  }
}