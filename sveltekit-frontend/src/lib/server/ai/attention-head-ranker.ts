import { embedTexts } from '$lib/server/embedding/embed.js';
import { LibTorchReranker } from '$lib/server/ai/libtorch-reranker.js';
import type {
  RankExplain,
  RetrievalCacheLayer,
} from '$lib/server/types/retrieval.js';

export interface AttentionRankedChunk {
  chunk_id: string;
  rank: number;
  summary?: string;
  tags?: string[];
  cacheLayer?: RetrievalCacheLayer | null;
  weights: {
    attention_weight: number;
    cosine_weight: number;
    bm25_weight: number;
    topology_weight: number;
    authority_weight: number;
    langextract_weight: number;
    llm_synthesis_weight: number;
  };
}

type RankerChunkInput = {
  id?: string;
  sourceId?: string;
  documentId?: string;
  source?: string;
  content: string;
  summary?: string;
  tags?: string[];
  cacheLayer?: RetrievalCacheLayer | null;
  score?: number;
  rerankScore?: number;
  authorityScore?: number | null;
  somCluster?: number | null;
  explain?: RankExplain;
};

const MAX_ATTENTION_CANDIDATES = 8;
const EMBEDDING_DIM = 768;

/**
 * Compute attention-style weights for top retrieved chunks relative to the
 * current query, using GPU-accelerated scoring when available.
 */
export async function attentionHeadRanker(
  query: string,
  chunks: RankerChunkInput[]
): Promise<AttentionRankedChunk[]> {
  if (!chunks.length) return [];

  const candidates = chunks
    .slice(0, MAX_ATTENTION_CANDIDATES)
    .map((chunk, index) => ({
      chunk_id:
        chunk.id ??
        chunk.sourceId ??
        chunk.documentId ??
        chunk.source ??
        `chunk-${index + 1}`,
      content: String(chunk.content ?? '').trim(),
      summary: chunk.summary,
      tags: chunk.tags,
      cacheLayer: chunk.cacheLayer ?? null,
      cosine_weight: chunk.rerankScore ?? chunk.score ?? 0,
      bm25_weight: chunk.explain?.sharedTags ?? 0,
      topology_weight:
        chunk.somCluster != null
          ? 0.1 + Math.max(0, Math.min(0.2, 0.2 - index * 0.02))
          : 0,
      authority_weight: chunk.authorityScore ?? chunk.explain?.pageRank ?? 0,
      langextract_weight: chunk.explain?.legalWeight ?? 0,
    }))
    .filter((chunk) => chunk.content.length > 0);
  if (!candidates.length) return [];

  const texts = candidates.map((chunk) => chunk.content);
  const queryText = String(query ?? '').trim();
  if (!queryText) return [];

  const embeddings = await embedTexts([...texts, queryText]);
  if (embeddings.length !== candidates.length + 1) {
    throw new Error('attentionHeadRanker: unexpected embedding result length');
  }

  const queryEmbedding = embeddings[embeddings.length - 1];
  if (queryEmbedding.length !== EMBEDDING_DIM) {
    throw new Error('attentionHeadRanker: unexpected query embedding dimension');
  }

  const candidateEmbeddings = embeddings.slice(0, embeddings.length - 1);
  const candidatesBuffer = new Float32Array(candidateEmbeddings.length * EMBEDDING_DIM);
  for (let i = 0; i < candidateEmbeddings.length; i++) {
    const embedding = candidateEmbeddings[i];
    if (embedding.length !== EMBEDDING_DIM) {
      throw new Error('attentionHeadRanker: unexpected candidate embedding dimension');
    }
    candidatesBuffer.set(embedding, i * EMBEDDING_DIM);
  }

  const queryBuffer = new Float32Array(queryEmbedding);
  const scores = await LibTorchReranker.rerank(
    queryBuffer,
    candidatesBuffer,
    candidateEmbeddings.length,
    EMBEDDING_DIM
  );

  return Array.from(scores)
    .map((score, index) => {
      const candidate = candidates[index];
      const attention_weight = Math.max(0, score);
      const cosine_weight = Math.max(0, candidate.cosine_weight);
      const bm25_weight = Math.max(0, candidate.bm25_weight);
      const topology_weight = Math.max(0, candidate.topology_weight);
      const authority_weight = Math.max(0, candidate.authority_weight);
      const langextract_weight = Math.max(0, candidate.langextract_weight);
      const llm_synthesis_weight =
        0.35 * cosine_weight +
        0.2 * bm25_weight +
        0.2 * topology_weight +
        0.15 * authority_weight +
        0.1 * langextract_weight +
        0.2 * attention_weight;

      return {
        chunk_id: candidate.chunk_id,
        rank: index + 1,
        summary: candidate.summary,
        tags: candidate.tags,
        cacheLayer: candidate.cacheLayer,
        weights: {
          attention_weight,
          cosine_weight,
          bm25_weight,
          topology_weight,
          authority_weight,
          langextract_weight,
          llm_synthesis_weight,
        },
      };
    })
    .sort((a, b) => b.weights.llm_synthesis_weight - a.weights.llm_synthesis_weight)
    .map((chunk, index) => ({
      ...chunk,
      rank: index + 1,
    }));
}
