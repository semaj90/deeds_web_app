/**
 * Go Retrieval Coordinator — Low-latency parallel retrieval
 *
 * Responsible for:
 * 1. Parallel queries to Qdrant/Postgres/Neo4j/Redis
 * 2. RRF fusion with 7 lanes
 * 3. Top-100 candidates → GPU reranker
 * 4. Top-20 → Gemma4 answer synthesis
 *
 * Go service is the orchestrator, SvelteKit coordinates the overall flow
 */

interface RetrievalRequest {
  query: string;
  query_embedding: number[]; // 384-dim from EmbeddingGemma
  top_k: number; // Default: 100 for RRF, 20 for Gemma4
  file_id?: string; // Optional filtering
  feature_id?: string; // Optional filtering
}

interface RetrievalCandidate {
  packet_key: string;
  repository_id: string;
  directory_id: string;
  file_id: string;
  module_id: string;
  symbol_id: string;
  feature_id: string;
  chunk_id: string;

  source_ref: string;
  packet_type: string;

  // RRF scores from 7 lanes
  postgres_trigram_score: number; // BM25
  concept_overlap_score: number; // Concept matching
  qdrant_vector_score: number; // Dense vector (content_embedding)
  turbovec_score: number; // 4-bit quantized prefilter
  neo4j_graph_score: number; // Graph traversal
  som_topology_score: number; // SOM cluster matching
  community_authority_score: number; // Neo4j Louvain community

  combined_rrf_score: number; // Final RRF blend

  // For GPU reranking
  content_embedding: number[]; // 384-dim
  summary_embedding: number[]; // 384-dim
  title_embedding: number[]; // 384-dim
  signature_embedding: number[]; // 384-dim
  feature_embedding?: number[]; // Optional
}

interface GemmaAnswer {
  answer: string;
  sources: string[]; // packet_keys of top-20 candidates
  confidence: number;
  execution_time_ms: number;
}

/**
 * Call Go Retrieval Service via gRPC
 * Parallel: Qdrant + Postgres + Neo4j + Redis
 * Returns: Top 100 candidates with RRF scores
 */
export async function goRetrievalParallel(
  grpcUrl: string,
  request: RetrievalRequest
): Promise<RetrievalCandidate[]> {
  try {
    const response = await fetch(`${grpcUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: request.query,
        query_embedding: request.query_embedding,
        top_k: request.top_k,
        filters: {
          file_id: request.file_id,
          feature_id: request.feature_id
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Go service ${response.status}: ${await response.text()}`);
    }

    const { candidates } = await response.json();
    return candidates as RetrievalCandidate[];
  } catch (err) {
    console.error(`Go retrieval failed: ${err.message}`);
    throw err;
  }
}

/**
 * GPU Reranker — Accelerate top-100 → top-20
 * Uses TensorRT for inference speed
 *
 * Computes:
 * - Cosine similarity (query embedding vs content_embedding)
 * - Cross-encoder score (query vs title + summary)
 * - Multi-vector blend (content + summary + signature)
 */
export async function gpuReranker(
  candidates: RetrievalCandidate[],
  query_embedding: number[],
  tensorrtUrl: string
): Promise<RetrievalCandidate[]> {
  if (candidates.length === 0) return [];
  if (candidates.length <= 20) return candidates; // Already small enough

  try {
    // Batch reranking via TensorRT
    const response = await fetch(`${tensorrtUrl}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_embedding,
        candidates: candidates.map(c => ({
          packet_key: c.packet_key,
          content_embedding: c.content_embedding,
          summary_embedding: c.summary_embedding,
          title_embedding: c.title_embedding,
          signature_embedding: c.signature_embedding
        }))
      })
    });

    if (!response.ok) {
      console.warn(`GPU reranker failed, using RRF order: ${response.status}`);
      return candidates.slice(0, 20);
    }

    const { ranked } = await response.json();
    return ranked.map((score, idx) => ({
      ...candidates[idx],
      combined_rrf_score: score
    })).sort((a, b) => b.combined_rrf_score - a.combined_rrf_score);
  } catch (err) {
    console.warn(`GPU reranker error, falling back to RRF order: ${err.message}`);
    return candidates.slice(0, 20);
  }
}

/**
 * Gemma4 Answer Synthesis — Final LLM pass
 * Input: Top-20 candidates (from GPU reranker)
 * Output: Structured answer with sources
 *
 * GPU is for inference only, not ranking logic
 */
export async function gemma4AnswerSynthesis(
  candidates: RetrievalCandidate[],
  query: string,
  llmUrl: string = 'http://localhost:8090'
): Promise<GemmaAnswer> {
  if (candidates.length === 0) {
    return {
      answer: 'No results found.',
      sources: [],
      confidence: 0,
      execution_time_ms: 0
    };
  }

  // Build context from top-20
  const context = candidates
    .slice(0, 20)
    .map(
      (c, i) =>
        `[${i + 1}] ${c.source_ref} (${c.packet_type})\n${c.source_ref || 'N/A'}`
    )
    .join('\n\n');

  const startTime = Date.now();

  try {
    const response = await fetch(`${llmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs',
        messages: [
          {
            role: 'system',
            content:
              'You are a legal AI assistant. Synthesize answers from provided context. Be concise and cite sources.'
          },
          {
            role: 'user',
            content: `Query: ${query}\n\nContext:\n${context}\n\nAnswer:`
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Gemma4 ${response.status}: ${await response.text()}`);
    }

    const { choices } = await response.json();
    const answer = choices[0]?.message?.content || '';

    return {
      answer,
      sources: candidates
        .slice(0, 20)
        .map(c => c.packet_key),
      confidence: 0.8,
      execution_time_ms: Date.now() - startTime
    };
  } catch (err) {
    console.error(`Gemma4 failed: ${err.message}`);
    return {
      answer: `Error synthesizing answer: ${err.message}`,
      sources: candidates
        .slice(0, 5)
        .map(c => c.packet_key),
      confidence: 0,
      execution_time_ms: Date.now() - startTime
    };
  }
}

/**
 * End-to-End Retrieval Pipeline
 * 1. Query embedding (EmbeddingGemma)
 * 2. Go service parallel retrieval (top 100, RRF)
 * 3. GPU reranker (top 100 → top 20)
 * 4. Gemma4 synthesis (answer generation)
 */
export async function endToEndRetrieval(
  query: string,
  queryEmbedding: number[],
  goServiceUrl: string = 'http://localhost:8100',
  tensorrtUrl: string = 'http://localhost:8765',
  gemma4Url: string = 'http://localhost:8090'
): Promise<{
  answer: GemmaAnswer;
  candidates: RetrievalCandidate[];
  timing: {
    go_retrieval_ms: number;
    gpu_rerank_ms: number;
    gemma4_ms: number;
    total_ms: number;
  };
}> {
  const startTotal = Date.now();

  // 1. Go retrieval (RRF, top 100)
  const startGo = Date.now();
  const candidates = await goRetrievalParallel(goServiceUrl, {
    query,
    query_embedding: queryEmbedding,
    top_k: 100
  });
  const goTime = Date.now() - startGo;

  // 2. GPU reranker (top 100 → 20)
  const startRerank = Date.now();
  const reranked = await gpuReranker(candidates, queryEmbedding, tensorrtUrl);
  const rerankTime = Date.now() - startRerank;

  // 3. Gemma4 synthesis
  const startGemma = Date.now();
  const answer = await gemma4AnswerSynthesis(reranked, query, gemma4Url);
  const gemmaTime = Date.now() - startGemma;

  return {
    answer,
    candidates: reranked,
    timing: {
      go_retrieval_ms: goTime,
      gpu_rerank_ms: rerankTime,
      gemma4_ms: gemmaTime,
      total_ms: Date.now() - startTotal
    }
  };
}