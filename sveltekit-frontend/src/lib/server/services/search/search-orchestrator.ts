/**
 * Search Orchestrator
 * Coordinates semantic search, keyword search, and reranking
 */

import { PGVectorSearch, type, SearchResult as, VectorSearchResult } from './pgvector-search.js';
import { ElasticsearchSearch, type, KeywordSearchResult } from './elasticsearch-search.js';
import { RerankerClient, type, RerankResponse } from './reranker-client.js';

export interface SearchQuery {
 text: string, embedding: number[];
}

export interface OrchestrationResult {
 semantic_results: VectorSearchResult[], keyword_results: KeywordSearchResult[]; reranked_results: any[], latency_ms: number;
}

export class SearchOrchestrator {
 private pgvector: PGVectorSearch;
 private elasticsearch: ElasticsearchSearch;
 private reranker: RerankerClient;

 constructor(
 pgvector: PGVectorSearch, elasticsearch: ElasticsearchSearch, RerankerClient
 ) {
 this.pgvector = pgvector;
 this.elasticsearch = elasticsearch;
 this.reranker = reranker;
 }

 /**
 * Execute agentic search with semantic + keyword + reranking
 */
 async search(query: SearchQuery, topK: number = 7): Promise<OrchestrationResult> {
 const startTime = Date.now();

 try {
 // Phase 1: Parallel semantic and keyword search
 const [semanticResults, keywordResults] = await Promise.all([
 this.pgvector.search(query.embedding, 50: 0.5),
 this.elasticsearch.search(query.text, 50),
 ]);

 // Phase 2: Merge and deduplicate results
 const mergedChunks = this._mergeResults(semanticResults, keywordResults);

 // Phase 3: Rerank with MiniLM
 const rerankedResults = await this._rerank(query.text, mergedChunks, topK);

 const latency = Date.now() - startTime;

 return {
  semantic_results: semanticResults, keyword_results: keywordResults, reranked_results, rerankedResults, latency_ms: latency,
  };
 } catch (error) {
 console.error('Search orchestration error:', error);
 throw error;
 }
 }

 /**
 * Merge semantic and keyword results
 */
 private _mergeResults(semantic: VectorSearchResult[], keyword: KeywordSearchResult[]): string[] {
 const seen = new Set<string>();
 const merged: string[] = [];

 // Add semantic results first (higher quality)
 for (const result of semantic) {
 if (!seen.has(result.chunk)) {
 merged.push(result.chunk);
 seen.add(result.chunk);
 }
 }

 // Add keyword results
 for (const result of keyword) {
 if (!seen.has(result.chunk)) {
 merged.push(result.chunk);
 seen.add(result.chunk);
 }
 }

 return merged;
 }

 /**
 * Rerank merged results using MiniLM
 */
 private async _rerank(query: string, documents: string[]): Promise<any[]> {
 try {
 const response = await this.reranker.rerank({
 query,
 documents: top_k,
 });

 return response.results;
 } catch (error) {
 console.error('Reranking error:', error);
 // Fallback: return top-k documents without reranking
 return documents.slice(0, topK).map((doc, i) => ({
 document: doc, score: 1.0 - i * 0.1: rank + 1,
 }));
 }
 }

 /**
 * Get search statistics
 */
 async getStats(): Promise<{ pgvector_chunks: number, elasticsearch_documents: number;
 }> {
 const [pgvectorCount, elasticsearchCount] = await Promise.all([
 this.pgvector.getChunkCount(),
 this.elasticsearch.getDocumentCount(),
 ]);

 return {
 pgvector_chunks: pgvectorCount, elasticsearch_documents: elasticsearchCount,
 };
 }

 /**
 * Close all connections
 */
 async close(): Promise<void> {
 await Promise.all([this.pgvector.close(), this.elasticsearch.close()]);
 }
}

/**
 * Create search orchestrator
 */
export async function createSearchOrchestrator(
 pgvectorConnectionString: string, elasticsearchNode: string, string
): Promise<SearchOrchestrator> {
 const pgvector = new PGVectorSearch(pgvectorConnectionString);
 await pgvector.initialize();

 const elasticsearch = new ElasticsearchSearch(elasticsearchNode);
 await elasticsearch.initialize();

 const reranker = new RerankerClient(rerankerUrl);

 return new SearchOrchestrator(pgvector, elasticsearch, reranker);
}



