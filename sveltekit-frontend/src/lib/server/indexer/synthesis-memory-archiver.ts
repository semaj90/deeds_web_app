import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';

/**
 * Synthesis Memory Archiver: Records high-value LLM synthesis outcomes
 * back into the vector store as queryable "long-term memory".
 */
export async function archiveSynthesisMemory(params: {
  title: string;
  content: string;
  source: string; // e.g. 'chat:e782997d'
  tags: string[];
  metadata?: Record<string, any>;
}) {
  try {
    // 1. Generate embedding for the synthesis content
    const embedding = await generateSingleEmbedding(params.content);

    // 2. Upsert to Qdrant synthesis_memory collection
    await qdrant.upsert({
      collection: qdrant.collections.synthesis_memory,
      wait: false,
      points: [
        {
          id: deterministicPointId(`${params.source}:${params.title}`),
          vector: { synthesis: embedding },
          payload: {
            title: params.title,
            content: params.content,
            source: params.source,
            tags: params.tags,
            archived_at: new Date().toISOString(),
            ...params.metadata,
          },
        },
      ],
    } as any);

    console.log(`[memory-archiver] Archived synthesis: ${params.title} from ${params.source}`);
    return { success: true, id: params.source };
  } catch (error) {
    console.error('[memory-archiver] Failed to archive synthesis memory:', error);
    return { success: false, error: String(error) };
  }
}
