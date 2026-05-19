/**
 * Canonical retrieval result type shared across all knowledge sources.
 *
 * Every retrieval subsystem (RAG, graph expansion, codebase, KB, web,
 * SOM tiles, reranker) normalizes its output to UnifiedRetrievalResult
 * before passing to ACE assembly or synthesis.
 *
 * Normalizer functions at the bottom of this file convert from each
 * upstream shape:
 *   fromQdrantPoint()    — raw Qdrant REST scroll/search hits
 *   fromContextDoc()     — graph-informed-retrieval + authority-chain
 *   fromRankedChunk()    — codebase-context Fuse.js + Qdrant recall
 *   fromRerankResult()   — cross-encoder-reranker output
 *   fromACEChunk()       — ace/ assembler chunks (for round-trip)
 *   fromWebResult()      — web-search / wikipedia-search hits
 *
 * Pipeline target order (per architecture review):
 *   retrieve → graph expand → DAG order → rerank → ACE assemble → synthesize
 *
 * After each stage, the result type stays UnifiedRetrievalResult.
 * Stage-specific metadata is carried in the `explain` field and optional
 * stage fields (rerankScore, graphDistance, authorityScore, etc.).
 */

// ── Discriminators ─────────────────────────────────────────────────────────

/** What kind of document this chunk came from */
export type RetrievalKind =
  | 'legal_doc'       // court opinions, statutes, legal documents
  | 'kb_doc'          // knowledge base web/PDF crawl
  | 'evidence'        // uploaded case evidence
  | 'code_chunk'      // source file chunk (AST-split)
  | 'graph_neighbor'  // arrived via graph expansion (not direct vector search)
  | 'som_tile'        // SOM tile summary (not a document chunk)
  | 'web_result'      // live web search result
  | 'citation'        // extracted citation
  | 'statute';        // statute / legal authority

/** Which index or service produced this result */
export type RetrievalSourceSystem =
  | 'qdrant'
  | 'pgvector'
  | 'neo4j'
  | 'redis'
  | 'bifrost'   // Bifrost L2 semantic cache
  | 'web'
  | 'manual';   // injected by caller (e.g. pinned context)

/** Cache level that served this result (null = live / not cached) */
export type RetrievalCacheLayer = 'L0' | 'L1' | 'L2' | 'L3' | null;

// ── Score explanation ──────────────────────────────────────────────────────

/**
 * Breakdown of how the final score was computed.
 * All fields optional — populate only the ones that apply.
 */
export interface RankExplain {
  /** Raw embedding cosine similarity */
  cosine?: number;
  /** Gemma4 cross-encoder pointwise score */
  rerank?: number;
  /** Shared-tag bonus (legal RAG) */
  sharedTags?: number;
  /** Same-jurisdiction match */
  sameJurisdiction?: boolean;
  /** PageRank / authority weight from Neo4j */
  pageRank?: number;
  /** Graph hop distance from seed (0 = direct hit) */
  graphDistance?: number;
  /** Composite legal weight (finalScore breakdown) */
  legalWeight?: number;
  /** Whether this came from DAG-ordered batch */
  dagOrdered?: boolean;
  /** QLoRA quality boost applied */
  qloraBoost?: boolean;
}

// ── The canonical shape ────────────────────────────────────────────────────

export interface UnifiedRetrievalResult {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** Qdrant point ID, pgvector row ID, graph node ID, or generated UUID */
  id: string;
  /** What kind of content this is */
  kind: RetrievalKind;
  /** Which index / service produced this */
  source: RetrievalSourceSystem;

  // ── Content ───────────────────────────────────────────────────────────────
  /** Full text of the chunk (may be truncated to MAX_CHARS in ACE assembly) */
  content: string;
  /** LLM-generated summary (optional; populated in ACE stage) */
  summary?: string;

  // ── Identity (upstream) ───────────────────────────────────────────────────
  /** Original document / file identifier before chunking */
  sourceId?: string;
  /** File path (code chunks, evidence, legal docs) */
  filePath?: string;
  /** Chunk index within the source document */
  chunkIndex?: number;

  // ── Scores ────────────────────────────────────────────────────────────────
  /** Primary relevance score 0–1 (cosine similarity or BM42 / RRF) */
  score: number;
  /** Gemma4 cross-encoder score 0–1 (set after reranking stage) */
  rerankScore?: number;
  /** Legal-weighted composite (set by RAG finalScore logic) */
  finalScore?: number;

  // ── Graph enrichment ──────────────────────────────────────────────────────
  /** Graph hops from the seed document (0 = direct hit) */
  graphDistance?: number | null;
  /** PageRank / citation authority score from Neo4j */
  authorityScore?: number | null;
  /** GPU cluster assignment from the graph / clustering lane */
  gpuCluster?: number | null;
  /** SOM cluster assignment from GPU K-Means */
  somCluster?: number | null;

  // ── Facets ────────────────────────────────────────────────────────────────
  tags: string[];
  /** Jurisdiction string for legal docs */
  jurisdiction?: string;
  /** Qdrant collection this came from */
  collection?: string;

  // ── Pipeline provenance ───────────────────────────────────────────────────
  /** Score breakdown for debugging / explainability */
  explain?: RankExplain;
  /** Which cache level served this result (null = live inference) */
  cacheLayer?: RetrievalCacheLayer;
  /** Position in the retrieval list before any reranking */
  originalRank?: number;
  /** Final position after all scoring and filtering */
  rank?: number;

  // ── Agents enrichment ─────────────────────────────────────────────────────
  /** Directory summary from AgentsDirectoryCard */
  dirSummary?: string;
  /** Features implemented in this directory */
  featureKeys?: string[];
  /** Audit status (SHIPPED, PARTIAL, SPEC_ONLY) */
  auditStatus?: string;
  /** Activity score from graph degree */
  activityScore?: number | null;

  // ── Arbitrary upstream payload ────────────────────────────────────────────
  /**
   * Raw Qdrant payload or other upstream key/value metadata.
   * Avoid reading this in pipeline code; prefer the typed fields above.
   * Only use for debugging or passing through to ACE metadata.
   */
  metadata?: Record<string, unknown>;
}

// ── Normalizers ────────────────────────────────────────────────────────────

/**
 * From a raw Qdrant REST search/scroll point.
 * Works for any collection — set `kind` and `collection` per call site.
 */
export function fromQdrantPoint(
  pt: { id: string | number; score?: number; payload?: Record<string, unknown> },
  opts: {
    kind: RetrievalKind;
    collection: string;
    originalRank?: number;
  }
): UnifiedRetrievalResult {
  const p = pt.payload ?? {};
  return {
    id: String(pt.id),
    kind: opts.kind,
    source: 'qdrant',
    collection: opts.collection,
    content: String(p['content'] ?? p['text'] ?? p['chunk_text'] ?? ''),
    summary: typeof p['summary'] === 'string' ? p['summary'] : undefined,
    sourceId:
      typeof (p['document_id'] ?? p['source_id'] ?? p['file_path']) === 'string'
        ? String(p['document_id'] ?? p['source_id'] ?? p['file_path'])
        : undefined,
    filePath: typeof p['file_path'] === 'string' ? p['file_path'] : undefined,
    chunkIndex: typeof p['chunk_index'] === 'number' ? p['chunk_index'] : undefined,
    score: pt.score ?? 0,
    tags: Array.isArray(p['tags'])
      ? (p['tags'] as string[])
      : typeof p['tags'] === 'string'
        ? [p['tags'] as string]
        : [],
    jurisdiction: typeof p['jurisdiction'] === 'string' ? p['jurisdiction'] : undefined,
    gpuCluster:
      typeof p['gpu_cluster'] === 'number'
        ? p['gpu_cluster']
        : typeof p['neo4j_gpuCluster'] === 'number'
          ? p['neo4j_gpuCluster']
          : null,
    somCluster:
      typeof p['som_cluster'] === 'number'
        ? p['som_cluster']
        : typeof p['neo4j_gpuCluster'] === 'number'
          ? p['neo4j_gpuCluster']
          : null,
    originalRank: opts.originalRank,

    // Agents enrichment
    dirSummary: typeof p['dir_summary'] === 'string' ? p['dir_summary'] : undefined,
    featureKeys: Array.isArray(p['feature_keys']) ? (p['feature_keys'] as string[]) : undefined,
    auditStatus: typeof p['audit_status'] === 'string' ? p['audit_status'] : undefined,
    activityScore:
      typeof p['agents_activity_score'] === 'number' ? p['agents_activity_score'] : null,

    metadata: p,
  };
}

/**
 * From graph-informed-retrieval.ts / authority-chain.ts ContextDoc.
 * These arrive via Neo4j expansion — set graphDistance accordingly.
 */
export function fromContextDoc(
  doc: {
    content: string;
    similarity: number;
    documentId: string;
    sourceId?: string;
    model?: string;
  },
  opts: {
    kind?: RetrievalKind;
    graphDistance?: number;
    originalRank?: number;
  } = {}
): UnifiedRetrievalResult {
  return {
    id: doc.documentId,
    kind: opts.kind ?? 'graph_neighbor',
    source: 'neo4j',
    content: doc.content,
    sourceId: doc.sourceId ?? doc.documentId,
    score: doc.similarity,
    graphDistance: opts.graphDistance ?? null,
    tags: [],
    originalRank: opts.originalRank,
    metadata: { model: doc.model },
  };
}

/**
 * From codebase-context.ts RankedChunk (Fuse.js recall + Qdrant dual-vector).
 */
export function fromRankedChunk(
  chunk: {
    path: string;
    relativePath: string;
    symbol: string;
    kind: string;
    content: string;
    signature: string;
    httpMethod?: string;
    routeId?: string;
    tags: string[];
    score: number;
    lineStart: number;
    lineEnd: number;
    // Optional neo4j / GPU enrichment fields (populated after enrich-qdrant runs)
    gpuCluster?: number | null;
    pageRankScore?: number | null;
    routeType?: string | null;
    hasAuthGuard?: boolean | null;
  },
  opts: { originalRank?: number } = {}
): UnifiedRetrievalResult {
  return {
    id: chunk.path,
    kind: 'code_chunk',
    source: 'qdrant',
    content: chunk.content,
    sourceId: chunk.relativePath,
    filePath: chunk.path,
    score: chunk.score,
    tags: chunk.tags,
    originalRank: opts.originalRank,
    // Surface GPU graph enrichment into canonical typed fields
    gpuCluster: chunk.gpuCluster ?? null,
    somCluster: chunk.gpuCluster ?? null,
    authorityScore: chunk.pageRankScore ?? null,
    metadata: {
      symbol: chunk.symbol,
      chunkKind: chunk.kind,
      signature: chunk.signature,
      httpMethod: chunk.httpMethod,
      routeId: chunk.routeId,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      routeType: chunk.routeType ?? null,
      hasAuthGuard: chunk.hasAuthGuard ?? null,
    },
  };
}

/**
 * From cross-encoder-reranker.ts RerankResult.
 * Preserves the full upstream doc while adding rerankScore + originalRank.
 * The `doc` must already be a UnifiedRetrievalResult (use other normalizers first).
 */
export function fromRerankResult<T extends { documentId: string; content: string; retrievalScore: number }>(
  result: { doc: T; rerankScore: number; cached: boolean; listCached?: boolean; originalRank: number },
  baseResult?: UnifiedRetrievalResult
): UnifiedRetrievalResult {
  const base = baseResult ?? {
    id:      result.doc.documentId,
    kind:    'legal_doc' as RetrievalKind,
    source:  'qdrant' as RetrievalSourceSystem,
    content: result.doc.content,
    score:   result.doc.retrievalScore,
    tags:    [],
    metadata: { ...(result.doc as Record<string, unknown>) },
  };
  return {
    ...base,
    rerankScore:  result.rerankScore,
    originalRank: result.originalRank,
    cacheLayer:   result.listCached ? 'L0' : result.cached ? 'L1' : null,
    explain: {
      ...base.explain,
      cosine: result.doc.retrievalScore,
      rerank: result.rerankScore,
    },
  };
}

/**
 * From ACEContextChunk (ace/assembler output).
 * Used when ACE chunks need to be passed downstream in unified form.
 */
export function fromACEChunk(chunk: {
  id: string;
  score: number;
  source: 'qdrant' | 'neo4j' | 'redis' | 'bifrost' | 'manual';
  file_path?: string;
  content: string;
  summary?: string;
  tags: string[];
  som_cluster?: number | null;
  graph_distance?: number | null;
  authority_score?: number | null;
}): UnifiedRetrievalResult {
  return {
    id:            chunk.id,
    kind:          chunk.file_path ? 'code_chunk' : 'legal_doc',
    source:        chunk.source,
    content:       chunk.content,
    summary:       chunk.summary,
    filePath:      chunk.file_path,
    score:         chunk.score,
    somCluster:    chunk.som_cluster ?? null,
    graphDistance: chunk.graph_distance ?? null,
    authorityScore: chunk.authority_score ?? null,
    tags:          chunk.tags,
  };
}

/**
 * From web-search.ts / wikipedia-search.ts WebSearchResult.
 */
export function fromWebResult(result: {
  title?: string;
  url: string;
  snippet: string;
  source?: string;
}, opts: { score?: number; originalRank?: number } = {}): UnifiedRetrievalResult {
  return {
    id:           result.url,
    kind:         'web_result',
    source:       'web',
    content:      result.snippet,
    sourceId:     result.url,
    score:        opts.score ?? 0,
    tags:         [],
    originalRank: opts.originalRank,
    metadata: {
      title:  result.title,
      url:    result.url,
      source: result.source,
    },
  };
}

// ── Pipeline helpers ────────────────────────────────────────────────────────

/**
 * Sort by the best available score: rerankScore > finalScore > score.
 * Mutates the array in place and returns it.
 */
export function sortByBestScore(results: UnifiedRetrievalResult[]): UnifiedRetrievalResult[] {
  results.sort((a, b) => {
    const sa = a.rerankScore ?? a.finalScore ?? a.score;
    const sb = b.rerankScore ?? b.finalScore ?? b.score;
    return sb - sa;
  });
  return results;
}

/**
 * Deduplicate by sourceId (or id), keeping the highest-scored copy.
 * Run AFTER sorting.
 */
export function deduplicateBySourceId(results: UnifiedRetrievalResult[]): UnifiedRetrievalResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.sourceId ?? r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Assign final `rank` field (1-indexed) after sorting + dedup.
 * Mutates results in place.
 */
export function assignRanks(results: UnifiedRetrievalResult[]): UnifiedRetrievalResult[] {
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}

/**
 * Convert UnifiedRetrievalResult back to ACEContextChunk for ACE assembler.
 */
export function toACEChunk(r: UnifiedRetrievalResult): import('./ace.js').ACEContextChunk {
  return {
    id:              r.id,
    score:           r.rerankScore ?? r.finalScore ?? r.score,
    source:          (r.source === 'qdrant' || r.source === 'neo4j' || r.source === 'redis' || r.source === 'bifrost' || r.source === 'manual')
                       ? r.source
                       : 'manual',
    file_path:       r.filePath,
    content:         r.content,
    summary:         r.summary,
    tags:            r.tags,
    som_cluster:     r.somCluster ?? null,
    graph_distance:  r.graphDistance ?? null,
    authority_score: r.authorityScore ?? null,
  };
}
