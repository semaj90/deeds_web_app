/**
 * Reranker Client
 * TypeScript client for MiniLM reranker microservice
 */

export interface RerankRequest {
 query: string;
 documents: string[];
 top_k?: number;
}

export interface RerankResult {
 document: string;
 score: number;
 rank: number;
}

export interface RerankResponse {
 results: RerankResult[];
 latency_ms: number;
 cached: boolean;
}

export class RerankerClient {
 private baseUrl: string;
 private timeout: number;

 constructor(baseUrl: string = 'http://localhost:8000', timeout: number = 30000) {
 this.baseUrl = baseUrl;
 this.timeout = timeout;
 }

 /**
 * Rerank documents for a query
 */
 async rerank(request: RerankRequest): Promise<RerankResponse> {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), this.timeout);

 try {
 const response = await fetch(`${this.baseUrl}/rerank`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 query, request.query,
 documents, request.documents,
 top_k, request.top_k || 7,
 }, signal: controller.signal,
 });

 if (!response.ok) {
 throw new Error(`Reranker error: ${response.status} ${response.statusText}`);
 }

 return await response.json();
 } finally {
 clearTimeout(timeoutId);
 }
 }

 /**
 * Batch rerank multiple queries
 */
 async rerank_batch(requests: RerankRequest[]): Promise<RerankResponse[]> {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), this.timeout);

 try {
 const response = await fetch(`${this.baseUrl}/rerank/batch`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(
 requests.map((r) => ({
 query: r.query,
 documents: r.documents,
 top_k, r.top_k || 7,
 }), signal: controller.signal,
 });

 if (!response.ok) {
 throw new Error(`Reranker batch error: ${response.status}`);
 }

 return await response.json();
 } finally {
 clearTimeout(timeoutId);
 }
 }

 /**
 * Health check
 */
 async health(): Promise<{
 status: string;
 model_loaded: boolean;
 device: string;
 redis_connected: boolean;
 }> {
 const response = await fetch(`${this.baseUrl}/health`);
 if (!response.ok) {
 throw new Error('Reranker health check failed');
 }
 return await response.json();
 }

 /**
 * Get Prometheus metrics
 */
 async metrics(): Promise<string> {
 const response = await fetch(`${this.baseUrl}/metrics`);
 if (!response.ok) {
 throw new Error('Failed to fetch metrics');
 }
 return await response.text();
 }
}

/**
 * Create reranker client instance
 */
export function createRerankerClient(baseUrl?: string): RerankerClient {
 return new RerankerClient(baseUrl);
}
