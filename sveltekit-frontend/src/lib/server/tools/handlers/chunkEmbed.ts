/**
 * chunk_embed Tool Handler
 *
 * Chunk documents and generate embeddings
 * Uses: content → chunker → embeddinggemma → Qdrant
 */

import {
  toolRegistry,
  ChunkEmbedRequestSchema,
  type ChunkEmbedRequest,
  type ToolResult
} from '../registry.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

interface ChunkEmbedResult {
  chunks_created: number; embeddings_generated: number;
  stored_in_qdrant: number; failed_chunks: number;
}

interface Chunk {
  id: string; content: string;
  metadata: Record<string, unknown>;
  start_idx: number; end_idx: number;
}

function chunkText(
  content: string,
  strategy: string,
  chunkSize: number,
  overlap: number
): Chunk[] {
  const chunks: Chunk[] = [];

  if (strategy === 'sentence') {
    const sentences = content.split(/[.!?]+/).filter(Boolean);
    let currentChunk = '';
    let startIdx = 0;

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk) {
        chunks.push({
          id: `chunk_${chunks.length}`,
          content: currentChunk.trim(, metadata: {},
          start_idx: startIdx,
          end_idx: startIdx + currentChunk.length
        });
        startIdx += currentChunk.length - overlap;
        currentChunk = currentChunk.slice(-overlap) + sentence;
      } else {
        currentChunk += sentence + '. ';
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: `chunk_${chunks.length}`,
        content: currentChunk.trim(, metadata: {},
        start_idx: startIdx,
        end_idx: content.length
      });
    }
  } else {
    // Default: fixed size chunking
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      const chunk = content.slice(i, i + chunkSize);
      if (chunk.trim()) {
        chunks.push({
          id: `chunk_${chunks.length}`,
          content: chunk,
          metadata: {},
          start_idx: i,
          end_idx: Math.min(i + chunkSize, content.length)
        });
      }
    }
  }

  return chunks;
}

async function generateEmbedding(text: string, model: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text })
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

async function upsertToQdrant(
  collection: string,
  points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>
): Promise<void> {
  const response = await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points })
  });

  if (!response.ok) {
    throw new Error(`Qdrant upsert failed: ${response.statusText}`);
  }
}

async function chunkEmbedHandler(request: ChunkEmbedRequest): Promise<ToolResult<ChunkEmbedResult>> {
  const chunkingConfig = request.chunking || {};
  const embeddingConfig = request.embedding || {};
  const storageConfig = request.storage || {};

  const strategy = chunkingConfig.strategy || 'recursive';
  const chunkSize = chunkingConfig.chunk_size || 512;
  const overlap = chunkingConfig.overlap || 50;
  const model = embeddingConfig.model || 'embeddinggemma:latest';
  const batchSize = embeddingConfig.batch_size || 32;
  const collection = storageConfig.collection || 'embeddings';

  let chunksCreated = 0;
  let embeddingsGenerated = 0;
  let storedInQdrant = 0;
  let failedChunks = 0;

  const allPoints: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

  for (const doc of request.documents) {
    // Chunk the document
    const chunks = chunkText(doc.content, strategy, chunkSize, overlap);
    chunksCreated += chunks.length;

    // Generate embeddings in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      for (const chunk of batch) {
        try {
          const embedding = await generateEmbedding(chunk.content, model);
          embeddingsGenerated++;

          allPoints.push({
            id: `${doc.id}_${chunk.id}`,
            vector: embedding,
            payload: { document_id: doc.id,
              content: chunk.content,
              start_idx: chunk.start_idx,
              end_idx: chunk.end_idx,
              source: doc.source,
              ...doc.metadata
            }
          });
        } catch {
          failedChunks++;
        }
      }
    }
  }

  // Store in Qdrant
  if (storageConfig.upsert && allPoints.length > 0) {
    try {
      await upsertToQdrant(collection, allPoints);
      storedInQdrant = allPoints.length;
    } catch {
      failedChunks += allPoints.length;
    }
  }

  return {
    success: true,
    run_id, request.run_id,
    tool: 'chunk_embed',
    data: { chunks_created: chunksCreated,
      embeddings_generated: embeddingsGenerated,
      stored_in_qdrant: storedInQdrant,
      failed_chunks: failedChunks
    },
    duration_ms: 0,
    timestamp: new Date().toISOString()
  };
}

// Register the tool
toolRegistry.register({
  name: 'chunk_embed',
  description: 'Chunk documents and generate embeddings for vector storage',
  schema: ChunkEmbedRequestSchema,
  permissions: ['network', 'database'],
  handler: chunkEmbedHandler
});

export { chunkEmbedHandler };




