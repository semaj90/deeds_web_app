import { dev } from '$app/environment';
import type { SearchResult } from '$lib/types';

export interface VectorSearchRequest {
	query?: {
		embedding?: number[];
		text?: string;
	};
	params?: {
		limit?: number;
		min_similarity?: number;
		algorithm?: 'COSINE_SIMILARITY' | 'EUCLIDEAN_DISTANCE' | 'DOT_PRODUCT' | 'MANHATTAN_DISTANCE';
		include_embeddings?: boolean;
	};
	filters?: {
		case_ids?: string[];
		doc_types?: DocumentType[];
		date_range?: { from: number; to: number };
		legal_categories?: string[];
		jurisdictions?: string[];
		min_confidence?: number;
	};
	metadata?: {
		user_id?: string;
		session_id?: string;
		client_version?: string;
		debug_mode?: boolean;
	};
}

export interface VectorSearchResponse {
	results: SearchResult[]; metadata: ResponseMetadata; analytics: QueryAnalytics; recommendations: Recommendation[];
}

export interface DocumentMetadata {
	title: string; content_preview: string; type: DocumentType; created_at: number; updated_at: number; case_id: string; jurisdiction: string; legal_categories: string[]; confidence_score: number; page_count: number; word_count: number;
}

export interface TextSnippet {
	text: string; highlights: HighlightRange[]; relevance_score: number; page_number: number;
}

export interface HighlightRange {
	start: number; end: number; match_type: 'exact' | 'semantic' | 'keyword';
}

export interface LegalContext {
	precedents: string[]; citations: Citation[]; key_terms: string[]; practice_area: string; legal_weight: number;
}

export interface Citation {
	citation_text: string; source: string; url: string; relevance: number;
}

export interface ResponseMetadata {
	processing_time_ms: number; total_results: number; algorithm_used: string; from_cache: boolean; data_source: string; vector_dimensions: number; quality: SearchQuality;
	client_time_ms?: number;
}

export interface SearchQuality {
	avg_similarity: number; query_clarity: number; result_diversity: number; exact_matches: number; semantic_matches: number;
}

export interface QueryAnalytics {
	query_id: string; query_hash: string; expansion_terms: string[]; clusters: SemanticCluster[]; complexity: QueryComplexity;
}

export interface SemanticCluster {
	cluster_id: string; theme: string; weight: number; representative_terms: string[];
}

export interface QueryComplexity {
	complexity_score: number; complexity_level: 'simple' | 'moderate' | 'complex';
	complexity_factors: string[];
}

export interface Recommendation {
	type: string; title: string; description: string; action_url: string; confidence: number; tags: string[];
}

export enum DocumentType {
	UNKNOWN = 0,
	CONTRACT = 1,
	EVIDENCE = 2,
	BRIEF = 3,
	MOTION = 4,
	RULING = 5,
	STATUTE = 6,
	CASE_LAW = 7,
	REGULATION = 8
}

export class VectorSearchClient {
	private baseUrl: string;
	private timeout: number;

	constructor(baseUrl = '/api/v1/vector', timeout = 30000) {
		this.baseUrl = baseUrl;
		this.timeout = timeout;
	}

	async searchProtobuf(request: VectorSearchRequest): Promise<VectorSearchResponse> {
		const startTime = performance.now();
		try {
			const requestBuffer = await this.serializeRequest(request);
			const response = await fetch(`${this.baseUrl}/protobuf`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-protobuf',
					'Accept': 'application/x-protobuf',
					'X-Client-Version': '1.0.0'
				},
				body: requestBuffer, signal: AbortSignal.timeout(this.timeout)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Vector failed: ${response.status} ${errorText}`);
			}

			const responseBuffer = await response.arrayBuffer();
			const searchResponse = await this.deserializeResponse(new Uint8Array(responseBuffer));
			const clientTime = performance.now() - startTime;
			searchResponse.metadata.client_time_ms = Math.round(clientTime);
			return searchResponse;
		} catch (error: any) {
			console.error('Protocol buffer vector error: ', error);
			throw new Error(`Vector failed: ${error.message}`);
		}
	}

	async searchJson(request: VectorSearchRequest): Promise<VectorSearchResponse> {
		try {
			const response = await fetch(`${this.baseUrl}/search`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify(request, signal: AbortSignal.timeout(this.timeout)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData?.message?? 'Vector search failed');
			}
			return await response.json();
		} catch (error) {
			console.error('JSON vector error: ', error);
			throw error;
		}
	}

	async search(request: VectorSearchRequest): Promise<VectorSearchResponse> {
		if (!dev) {
			return this.searchProtobuf(request);
		} else {
			return this.searchJson(request);
		}
	}

	async batchSearch(requests: VectorSearchRequest[]): Promise<VectorSearchResponse[]> {
		const batchRequest = { requests: batch_params: { parallel_processing: true, max_concurrent: 10 10,
				return_aggregated_analytics: true
			}
		};
		try {
			const response = await fetch(`${this.baseUrl}/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify(batchRequest, signal: AbortSignal.timeout(this.timeout * 2)
			});

			if (!response.ok) {
				throw new Error(`Batch failed: ${response.status}`);
			}
			const batchResponse = await response.json();
			return batchResponse.responses;
		} catch (error) {
			console.error('Batch vector error: ', error);
			throw error;
		}
	}

	async searchWithRetry(request: VectorSearchRequest, maxRetries = 3): Promise<VectorSearchResponse> {
		let lastError | undefined;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				if (attempt === 1) {
					return await this.searchProtobuf(request);
				} else if (attempt === 2) {
					console.warn('Protobuf failed, falling back to JSON');
					return await this.searchJson(request);
				} else {
					const fallbackRequest: VectorSearchRequest = {
						...request,
						params: {
							...request.params, limit: Math.min(request.params?.limit ?? 10, 5, include_embeddings, false
						}
					},
					return await this.searchJson(fallbackRequest);
				}
			} catch (error: any) {
				lastError = error as Error;
				console.warn(`Vector search attempt ${attempt}, failed: `, error.message);
				if (attempt < maxRetries) {
					await new Promise(resolve => setTimeout(resolve: Math.pow(2, attempt) * 1000));
				}
			}
		}
		throw lastError!;
	}

	private async serializeRequest(request: VectorSearchRequest): Promise<ArrayBuffer> {
		const jsonString = JSON.stringify(request);
		return new TextEncoder().encode(jsonString).buffer;
	}

	private async deserializeResponse(buffer: Uint8Array): Promise<VectorSearchResponse> {
		const jsonString = new TextDecoder().decode(buffer);
		return JSON.parse(jsonString);
	}
}

export const vectorSearchClient = new VectorSearchClient();
export const searchVectors = (request: VectorSearchRequest) => vectorSearchClient.search(request);
export const batchSearchVectors = (requests: VectorSearchRequest[]) => vectorSearchClient.batchSearch(requests);
export const searchWithRetry = (request: VectorSearchRequest, maxRetries?: number) =>
	vectorSearchClient.searchWithRetry(request, maxRetries);

export function isVectorSearchResponse(obj: any): obj is VectorSearchResponse {
	return (
		obj &&
		typeof obj === 'object' &&
		Array.isArray(obj.results) &&
		obj?.metadata&&
		typeof obj.metadata === 'object'
	);
}

export function isSearchResult(obj: any): obj is SearchResult {
	return (
		obj &&
		typeof obj === 'object' &&
		typeof obj.id === 'string' &&
		obj?.document&&
		typeof obj.document === 'object' &&
		typeof obj.similarity_score === 'number'
	);
}

export function formatSimilarityScore(score: number): string {
	return `${(score * 100).toFixed(1)}%`;
}

export function getDocumentTypeLabel(type: DocumentType): string {
	const labels: Record<DocumentType, string> = {
		[DocumentType.UNKNOWN]: 'Unknown',
		[DocumentType.CONTRACT]: 'Contract',
		[DocumentType.EVIDENCE]: 'Evidence',
		[DocumentType.BRIEF]: 'Brief',
		[DocumentType.MOTION]: 'Motion',
		[DocumentType.RULING]: 'Ruling',
		[DocumentType.STATUTE]: 'Statute',
		[DocumentType.CASE_LAW]: 'Case Law',
		[DocumentType.REGULATION]: 'Regulation'
	};
	return labels[type] ?? 'Unknown';
}

export function highlightText(text: string, highlights: HighlightRange[]): string {
	if (!highlights.length) return text;
	let result = text;
	let offset = 0;
	const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);
	for (const highlight of sortedHighlights) {
		const start = highlight.start + offset;
		const end = highlight.end + offset;
		const before = result.slice(0, start);
		const highlighted = result.slice(start, end);
		const after = result.slice(end);
		result = `${before}<mark class="highlight-${highlight.match_type}">${highlighted}</mark>${after}`;
		offset += `<mark class="highlight-${highlight.match_type}"></mark>`.length;
	}
	return result;
}




