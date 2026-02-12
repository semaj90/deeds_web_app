import { OllamaService } from '$lib/services/ollamaService';
import { qdrantService } from './qdrant-service';
import type { ChunkRecord, ProcessingStatus } from '$lib/types/pipeline-v2';
import crypto from 'crypto';

/**
 * Pipeline Orchestrator (V2) - Server Side
 *
 * Orchestrates the document ingestion pipeline:
 * 1. Chunking (Semantic/Fixed)
 * 2. Embedding (Batch)
 * 3. Indexing (Qdrant + Postgres)
 */
export class PipelineOrchestrator {
  private ollama: OllamaService;
  // Default V2 Embedding Model
  private embeddingModel = 'embeddinggemma:latest';

  constructor() {
    this.ollama = new OllamaService();
  }

  /**
   * Run the full ingestion pipeline for a document
   */
  async processDocument(
    docId: string,
    text: string,
    metadata: { case_id: string; source: string; filename?: string; tags?: string[] },
    onProgress?: (status: ProcessingStatus) => void
  ): Promise<{ success: boolean; chunkCount: number }> {

    try {
      // 1. Chunking
      onProgress?.({ stage: 'chunking', progress: 0, message: 'Starting chunking...' });
      const rawChunks = this.semanticChunking(text);
      onProgress?.({ stage: 'chunking', progress: 100, message: `Created ${rawChunks.length} chunks` });

      // 2. Embedding
      onProgress?.({ stage: 'embedding', progress: 0, message: 'Generating embeddings...' });
      const chunkRecords: ChunkRecord[] = [];
      const embeddings: number[][] = [];

      // Process in batches to avoid timeouts
      const BATCH_SIZE = 5;
      for (let i = 0; i < rawChunks.length; i += BATCH_SIZE) {
        const batch = rawChunks.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (chunkContent, batchIdx) => {
          const globalIdx = i + batchIdx;

          // Generate deterministic ID
          const sha256 = crypto.createHash('sha256').update(chunkContent).digest('hex');
          const chunkId = this.hashToUuid(sha256);

          // Get Embedding
          const vec = await this.ollama.generateEmbedding(chunkContent, { model: this.embeddingModel });
          if (!vec) throw new Error(`Failed to embed chunk ${globalIdx}`);

          chunkRecords.push({
             chunk_id: chunkId,
             doc_id: docId,
             content: chunkContent,
             sha256: sha256,
             tags: metadata.tags || [],
             priority: 1,
             version: 1,
             source: metadata.source as any,
             created_at: new Date().toISOString(),
             range_start: 0,
             range_end: 0
          });
          embeddings.push(vec);
        }));

        const progress = Math.round(((i + BATCH_SIZE) / rawChunks.length) * 100);
        onProgress?.({ stage: 'embedding', progress, message: `Embedded ${Math.min(i + BATCH_SIZE, rawChunks.length)}/${rawChunks.length} chunks` });
      }

      // 3. Indexing (Qdrant)
      onProgress?.({ stage: 'upserting', progress: 0, message: 'Upserting to Vector DB...' });
      const success = await qdrantService.upsertChunks(chunkRecords, embeddings);

      if (!success) throw new Error('Qdrant upsert failed');
      onProgress?.({ stage: 'complete', progress: 100, message: 'Pipeline complete' });

      return { success: true, chunkCount: chunkRecords.length };

    } catch (error) {
       console.error('[Pipeline] Error:', error);
       onProgress?.({ stage: 'error', progress: 0, message: String(error) });
       return { success: false, chunkCount: 0 };
    }
  }

  /**
   * Simple Semantic Chunking (Split by paragraphs, consolidate small ones)
   */
  private semanticChunking(text: string, maxTokens = 512): string[] {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const p of paragraphs) {
      if ((currentChunk.length + p.length) > maxTokens * 4) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = p;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + p;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks.filter(c => c.length > 0);
  }

  /**
   * Convert SHA-256 hex string to UUID-like format (8-4-4-4-12)
   */
  private hashToUuid(hash: string): string {
    const h = hash.padEnd(32, '0');
    return `${h.substring(0,8)}-${h.substring(8,12)}-${h.substring(12,16)}-${h.substring(16,20)}-${h.substring(20,32)}`;
  }
}

export const pipelineOrchestrator = new PipelineOrchestrator();
