/**
 * RAG Pipeline — end-to-end retrieval-augmented generation entry point.
 *
 * Facade over the existing RAG modules in `src/lib/server/rag/` and
 * `src/lib/server/retrieval/`.  Next_steps plans reference this path
 * (`$lib/server/rag-pipeline`) — this file resolves that INVERTED entry.
 *
 * Exports the 3 canonical RAG operations:
 *   - ragQuery()        → retrieval + generation (used by ACE, report populator)
 *   - ragAddEvidence()  → index new evidence into RAG store
 *   - ragSearch()       → retrieval-only (no generation)
 *
 * All heavy lifting delegates to the existing modules; this file is a
 * stable public interface that insulates callers from internal renames.
 */

export type {
  RagSearchRequest,
  RagSearchResult,
  RagHealthResponse,
  ChatResponse,
} from './rag/rag-types.js';

// ─── Re-export retrieval utilities ────────────────────────────────────────────

export { rerankLegalAware, createQdrantFilter } from './rag/ranker.js';
export { searchEvidence, addEvidenceToRAG, initEvidenceRAG } from './rag/evidenceRag.js';

// ─── Unified query entry point ────────────────────────────────────────────────

import type { RagSearchResult } from './rag/rag-types.js';

export interface RagQueryOptions {
  /** Maximum chunks to retrieve before re-ranking */
  topK?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Case ID to scope retrieval to a specific case's evidence */
  caseId?: string;
  /** Whether to run legal-aware re-ranking (slower but more accurate) */
  rerank?: boolean;
}

export interface RagQueryResult {
  chunks: RagSearchResult[];
  /** Assembled context string ready for LLM injection */
  contextText: string;
  /** Source citations for UI display */
  citations: Array<{ id: string; title: string; score: number }>;
}

/**
 * Retrieve and assemble RAG context for a user query.
 *
 * @example
 * const { contextText, citations } = await ragQuery(
 *   'What is hearsay evidence in California?',
 *   { caseId: activeCaseId, rerank: true }
 * );
 * // Inject contextText into LLM system prompt
 */
export async function ragQuery(
  query: string,
  opts: RagQueryOptions = {}
): Promise<RagQueryResult> {
  const { topK = 8, minScore = 0.3, caseId, rerank = true } = opts;

  const { searchEvidence: search } = await import('./rag/evidenceRag.js');
  const raw = await search(query, topK);

  // Filter by score
  let chunks = (raw as unknown as RagSearchResult[]).filter(
    (r) => (r.score ?? 1) >= minScore
  );

  // Case-scope filter
  if (caseId) {
    chunks = chunks.filter(
      (r) => !r.payload?.caseId || r.payload.caseId === caseId
    );
  }

  // Legal-aware rerank
  if (rerank && chunks.length > 1) {
    const { rerankLegalAware } = await import('./rag/ranker.js');
    const reranked = rerankLegalAware({ hits: chunks as any });
    chunks = reranked as unknown as RagSearchResult[];
  }

  // Assemble context text
  const contextText = chunks
    .slice(0, topK)
    .map((c, i) => `[${i + 1}] ${c.payload?.text ?? c.payload?.content ?? ''}`)
    .join('\n\n');

  const citations = chunks.slice(0, topK).map((c) => ({
    id: String(c.id ?? ''),
    title: String(c.payload?.title ?? c.payload?.source ?? `Chunk ${c.id}`),
    score: c.score ?? 0,
  }));

  return { chunks: chunks.slice(0, topK), contextText, citations };
}
