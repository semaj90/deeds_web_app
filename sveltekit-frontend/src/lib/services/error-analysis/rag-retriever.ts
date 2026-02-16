/**
 * RAG Context Retriever Service
 * Retrieves relevant code patterns from knowledge base using Qdrant
 * Property 2: RAG Context Relevance - patterns must be ranked by similarity
 *
 * Structured logging for Neo4j graph analysis + CouchDB mirrorhouse:
 * - pattern_query: logs query→Qdrant with embedding dims
 * - pattern_match: logs each result with similarity weight (graph edge)
 * - pattern_store: logs new pattern creation (graph node)
 */

import { BaseService } from './base-service.js';
import { EmbeddingService } from './embedding-service.js';
import type { Error, Pattern, ServiceConfig } from './types.js';

export interface IRAGRetriever {
	queryPatterns(error: Error, topK?: number): Promise<Pattern[]>;
	rankByRelevance(patterns: Pattern[]): Promise<Pattern[]>;
	formatContext(patterns: Pattern[]): Promise<string>;
	storePattern(pattern: Pattern): Promise<void>;
}

export class RAGRetriever extends BaseService implements IRAGRetriever {
	private embeddingService: EmbeddingService;
	private readonly COLLECTION_NAME = 'error_patterns';

	constructor(config: ServiceConfig) {
		super(config);
		this.embeddingService = new EmbeddingService(config);
	}

	/**
	 * Retrieve patterns by query string (convenience method used by pipeline)
	 */
	async retrievePatterns(query: string, topK: number = 5): Promise<Pattern[]> {
		if (!query || typeof query !== 'string') {
			throw new Error('Invalid input, query must be a non-empty string');
		}

		this.log('info', `Retrieving patterns for query: ${query.substring(0, 100)}`);

		try {
			const embedding = await this.embeddingService.generateEmbedding(query);

			// [graph:pattern_query] Neo4j node: (:Query {text, dims, topK})
			this.log('info', '[graph:pattern_query]', {
				query: query.substring(0, 200),
				embeddingDims: embedding?.length ?? 0,
				topK,
				collection: this.COLLECTION_NAME,
			});

			const response = await this.retry(async () => {
				const res = await fetch(
					`${this.config.qdrantUrl}/collections/${this.COLLECTION_NAME}/points/search`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							vector: embedding,
							limit: topK,
							with_payload: true,
						}),
					}
				);

				if (!res.ok) {
					throw new Error(`Qdrant query failed, ${res.status} ${res.statusText}`);
				}

				return res.json();
			});

			const patterns: Pattern[] = (response?.result || []).map((item: any) => ({
				id: item.id,
				filePath: item.payload?.filePath ?? '',
				lineNumber: item.payload?.lineNumber ?? 0,
				code: item.payload?.code ?? '',
				errorType: item.payload?.errorType ?? '',
				similarity: item?.score ?? 0,
				embedding: item.vector,
			}));

			// [graph:pattern_match] Neo4j edges: (:Query)-[:SIMILAR_TO {weight}]->(:Pattern)
			for (const pattern of patterns) {
				this.log('info', '[graph:pattern_match]', {
					patternId: pattern.id,
					errorType: pattern.errorType,
					filePath: pattern.filePath,
					lineNumber: pattern.lineNumber,
					similarity: pattern.similarity,
				});
			}

			this.log('info', `Found ${patterns.length} patterns with similarity scores`);
			return patterns;
		} catch (error) {
			this.log('error', 'Pattern query failed', error);
			throw error;
		}
	}

	/**
	 * Query Qdrant for similar patterns
	 * Property 2: RAG Context Relevance - returns patterns ranked by similarity
	 */
	async queryPatterns(error: Error, topK: number = 5): Promise<Pattern[]> {
		this.validateInput(error, 'error');
		if (topK < 1) {
			throw new Error('topK must be at least 1');
		}

		this.log('info', `Querying patterns for error: ${error.message}`);

		return this.retrievePatterns(error.message, topK);
	}

	/**
	 * Rank patterns by relevance (similarity score)
	 */
	async rankByRelevance(patterns: Pattern[]): Promise<Pattern[]> {
		this.validateInput(patterns, 'patterns');
		this.log('info', `Ranking ${patterns.length} patterns by relevance`);

		try {
			const ranked = patterns.sort((a: any, b: any) => b.similarity - a.similarity);
			this.log('info', 'Patterns ranked successfully');
			return ranked;
		} catch (error) {
			this.log('error', 'Pattern ranking failed', error);
			throw error;
		}
	}

	/**
	 * Format patterns as context for LLM
	 */
	async formatContext(patterns: Pattern[]): Promise<string> {
		this.validateInput(patterns, 'patterns');
		this.log('info', `Formatting context for ${patterns.length} patterns`);

		try {
			if (patterns.length === 0) {
				return '';
			}

			const contextLines: string[] = ['## Similar Error Patterns\n'];

			patterns.forEach((pattern, idx) => {
				contextLines.push(
					`### Pattern ${idx + 1} (Similarity: ${(pattern.similarity * 100).toFixed(1)}%)`
				);
				contextLines.push(`**File:** \`${pattern.filePath}:${pattern.lineNumber}\``);
				contextLines.push(`**Error Type:** ${pattern.errorType}`);
				contextLines.push(`\`\`\`\n${pattern.code}\n\`\`\``);
				contextLines.push('');
			});

			const context = contextLines.join('\n');
			this.log('info', `Formatted context: ${context.length} characters`);
			this.log('info', `Context text for parsing:\n${context.substring(0, 500)}`);
			return context;
		} catch (error) {
			this.log('error', 'Context formatting failed', error);
			throw error;
		}
	}

	/**
	 * Store a pattern in Qdrant
	 */
	async storePattern(pattern: Pattern): Promise<void> {
		this.validateInput(pattern, 'pattern');
		this.log('info', `Storing pattern: ${pattern.id}`);

		try {
			let embedding = pattern.embedding;
			if (!embedding) {
				embedding = await this.embeddingService.generateEmbedding(pattern.code);
			}

			await this.retry(async () => {
				const res = await fetch(
					`${this.config.qdrantUrl}/collections/${this.COLLECTION_NAME}/points`,
					{
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							points: [
								{
									id: pattern.id,
									vector: embedding,
									payload: {
										filePath: pattern.filePath,
										lineNumber: pattern.lineNumber,
										code: pattern.code,
										errorType: pattern.errorType,
									},
								},
							],
						}),
					}
				);

				if (!res.ok) {
					throw new Error(`Qdrant store failed, ${res.status} ${res.statusText}`);
				}

				return res.json();
			});

			// [graph:pattern_store] Neo4j node: (:Pattern {id, errorType, filePath})
			this.log('info', '[graph:pattern_store]', {
				patternId: pattern.id,
				filePath: pattern.filePath,
				lineNumber: pattern.lineNumber,
				errorType: pattern.errorType,
				codeLength: pattern.code?.length ?? 0,
				similarity: pattern.similarity,
			});

			this.log('info', `Pattern stored successfully: ${pattern.id}`);
		} catch (error) {
			this.log('error', 'Pattern storage failed', error);
			throw error;
		}
	}
}