export { searchCodeLexical, searchCodeHybridPg }         from './postgres-fts.js';
export { searchQdrantCode }                              from './qdrant-search.js';
export { fetchAuthorityScores, expandNeighbours }        from './neo4j-rerank.js';
export { rerankCandidates }                              from './gpu-rerank.js';
export { buildRetrievalTrace, SCORE_WEIGHTS }            from './retrieval-explainer.js';
export { hybridSearch, chooseRetrievalMode }             from './hybrid-search.js';
export { mlaFusionRerank, getProjectionMatrix,
         getLatentKV, setLatentKV, getMlaStats,
         DEFAULT_MLA_WEIGHTS, MLA_RANK, MLA_DIM }       from './mla-kv-compress.js';
export type { MlaCandidate, MlaRerankResult,
              MlaFusionWeights, MlaFusionOpts }          from './mla-kv-compress.js';
export type { HybridSearchResult, HybridSearchOutput, HybridSearchOptions } from './hybrid-search.js';
export type { FTSResult, FTSOptions }                    from './postgres-fts.js';
export type { RetrievalTrace }                           from './retrieval-explainer.js';
