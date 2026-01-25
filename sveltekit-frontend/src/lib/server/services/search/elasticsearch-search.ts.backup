/**
 * Elasticsearch Search Service
 * Keyword search using BM25 ranking
 */

import { Client } from '@elastic/elasticsearch';

export interface KeywordSearchResult {
	id: string;
	title: string;
	chunk: string;
	score: number;
	metadata?: Record<string, unknown>;
}

export class ElasticsearchSearch {
	private client: Client;
	private indexName: string = 'legal_documents';

	constructor(node: string) {
		this.client = new Client({ node });
	}

	/**
	 * Initialize index with mappings
	 */
	async initialize(): Promise<void> {
		try {
			const exists = await this.client.indices.exists({ index: this.indexName });
			if (!exists) {
				await this.client.indices.create({
					index: this.indexName,
					body: {
						settings: {
							number_of_shards: 1,
							number_of_replicas: 0,
							analysis: {
								analyzer: {
									legal_analyzer: {
										type: 'standard',
										stopwords: '_english_'
									}
								}
							}
						},
						mappings: {
							properties: {
								document_id: { type: 'keyword' },
								title: { type: 'text', analyzer: 'legal_analyzer' },
								chunk: { type: 'text', analyzer: 'legal_analyzer' },
								metadata: { type: 'object', enabled: false },
								created_at: { type: 'date' }
							}
						}
					}
				});

				console.log('Elasticsearch index created');
			}
		} catch (error) {
			console.error('Error initializing Elasticsearch:', error);
			throw error;
		}
	}

	/**
	 * Index document chunks
	 */
	async indexChunks(
		documentId: string,
		title: string,
		chunks: Array<{
			text: string;
			metadata?: Record<string, unknown>;
		}>
	): Promise<number> {
		try {
			let indexed = 0;

			for (const chunk of chunks) {
				try {
					await this.client.index({
						index: this.indexName,
						body: {
							document_id: documentId,
							title: title,
							chunk: chunk.text,
							metadata: chunk.metadata || {},
							created_at: new Date().toISOString()
						}
					});
					indexed++;
				} catch (error) {
					console.error(`Error indexing chunk for ${documentId}:`, error);
				}
			}

			// Refresh index
			await this.client.indices.refresh({ index: this.indexName });

			return indexed;
		} catch (error) {
			console.error('Error indexing chunks:', error);
			throw error;
		}
	}

	/**
	 * Keyword search using BM25
	 */
	async search(query: string, limit: number = 50): Promise<KeywordSearchResult[]> {
		try {
			const result = await this.client.search({
				index: this.indexName,
				body: {
					query: {
						multi_match: {
							query: query,
							fields: ['title^2', 'chunk'],
							type: 'best_fields',
							operator: 'or'
						}
					},
					size: limit,
					_source: ['document_id', 'title', 'chunk', 'metadata']
				}
			});

			return result.hits.hits.map((hit: any) => ({
				id: hit._source.document_id,
				title: hit._source.title,
				chunk: hit._source.chunk,
				score: hit._score || 0,
				metadata: hit._source.metadata
			}));
		} catch (error) {
			console.error('Elasticsearch search failed:', error);
			return [];
		}
	}
}

