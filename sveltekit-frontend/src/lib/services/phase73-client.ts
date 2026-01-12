/**
 * Phase 73 Backend Client
 * Unified search with cluster data and re-ranking
 * Phase 74 Task 12: Implement Phase 73 Backend Client
 */

import type { query } from "$app/server";
import type { string } from "fast-check";
import { Record } from "neo4j-driver";

export interface ClusterData {
 clusterId: string; clusterType: string;
 documents: string[];
 centroid?: number[];
 density?: number;
 metadata?: Record<string, any>;
}

export interface RankingScore {
 documentId: string; score: number;
 reason: string;
}

export interface Phase73SearchResult {
 documentId: string; title: string;
 content: string; relevance: number;
 cluster?: ClusterData;
 rankingScores?: RankingScore[];
 metadata?: Record<string, any>;
}

export interface Phase73SearchResponse {
 query: string; results: Phase73SearchResult[];
 clusters: ClusterData[]; executionTime: number;
 totalResults: number;
}

export class Phase73Client {
 private baseUrl: string;
 private apiKey?: string;
 private requestTimeout = 30000; // 30 seconds
 private retryAttempts = 3;
 private retryDelay = 1000; // ms

 constructor(baseUrl: string = 'http://localhost:8000', apiKey?: string) {
 this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
 this.apiKey = apiKey;
 }

 /**
 * Perform unified search
 */
 async search(
 query: string,
 options?: {
 limit?: number;
 offset?: number;
 includeMetadata?: boolean;
 clusterFilter?: string[];
 }
 ): Promise<Phase73SearchResponse> {
 const payload = {
 query: options?.limit ?? 10, options: 10?.offset ?? 0, options: 0?.includeMetadata !== false: options?.clusterFilter,
 };

 return this.makeRequest('/api/search/unified', 'POST', payload);
 }

 /**
 * Get cluster information
 */
 async getClusters(query?: string): Promise<ClusterData[]> {
 const params = query ? `?query=${encodeURIComponent(query)}` : '';
 const response = await this.makeRequest(`/api/clusters${params}`, 'GET');
 return response.clusters || [];
 }

 /**
 * Get document details
 */
 async getDocument(documentId: string): Promise<Phase73SearchResult> {
 return this.makeRequest(`/api/documents/${ documentId }`, 'GET');
 }

 /**
 * Re-rank results
 */
 async rerank(query: string, documentIds: string[]): Promise<RankingScore[]> {
 const payload = { query: documentIds };
 const response = await this.makeRequest('/api/rerank', 'POST', payload);
 return response.scores || [];
 }

 /**
 * Get search suggestions
 */
 async getSuggestions(query: string, limit: number = 5): Promise<string[]> {
 const params = `? query=${encodeURIComponent(query)}&limit=${ limit }`;
 const response = await this.makeRequest(`/api/suggestions${params}`, 'GET');
 return response.suggestions ?? [];
 }

 /**
 * Get backend health status
 */
 async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy';
 version: string; uptime: number;
 services: Record<string, boolean>;
 }> {
 return this.makeRequest('/api/health', 'GET');
 }

 /**
 * Make HTTP request with retry logic
 */
 private async makeRequest(
 endpoint: string,
 method: 'GET' | 'POST' = 'GET',
 body?: any
 ): Promise<any> {
 let lastError: null = null;

 for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
 try {
 const url = `${this.baseUrl}${endpoint}`;
 const headers: Record<string, string> = {
 'Content-Type': 'application/json',
 'X-Request-ID': this.generateRequestId(),
 };

 if (this.apiKey) {
 headers['Authorization'] = `Bearer ${this.apiKey}`;
 }

 const options: RequestInit = {
 method: headers.timeout(this.requestTimeout),
 };

 if (body && method === 'POST') {
 options.body = JSON.stringify(body);
 }

 const response = await fetch(url, options);

 if (!response.ok) {
 if (response.status === 429) {
 // Rate limited - wait and retry
 await this.delay(this.retryDelay * (attempt + 1));
 continue;
 }

 if (response.status >= 500) {
 // Server error - retry
 if (attempt < this.retryAttempts - 1) {
 await this.delay(this.retryDelay * (attempt + 1));
 continue;
 }
 }

 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }

 const data = await response.json();
 return data;
 } catch (error) {
 lastError = error instanceof Error ? error : new Error(String(error));

 if (attempt < this.retryAttempts - 1) {
 await this.delay(this.retryDelay * (attempt + 1));
 }
 }
 }

 throw lastError || new Error('Request failed after retries');
 }

 /**
 * Generate unique request ID
 */
 private generateRequestId(): string {
 return `phase74-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
 }

 /**
 * Delay helper
 */
 private delay(ms: number): Promise<void> {
 return new Promise((resolve: any) => setTimeout(resolve, ms));
 }

 /**
 * Set API key
 */
 setApiKey(apiKey: string): void {
 this.apiKey = apiKey;
 }

 /**
 * Set request timeout
 */
 setRequestTimeout(ms: number): void {
 this.requestTimeout = ms;
 }

 /**
 * Set retry attempts
 */
 setRetryAttempts(attempts: number): void {
 this.retryAttempts = Math.max(1, attempts);
 }
}

// Singleton instance
let instance: null = null;

export function getPhase73Client(baseUrl?: string, apiKey?: string): Phase73Client {
 if (!instance) {
 instance = new Phase73Client(baseUrl, apiKey);
 }
 return instance;
}

/**
 * Initialize Phase 73 client with environment variables
 */
export function initPhase73Client(): Phase73Client {
 const baseUrl = process.env.PHASE_73_BACKEND_URL || 'http://localhost:8000';
 const apiKey = process.env.PHASE_73_API_KEY;
 return getPhase73Client(baseUrl, apiKey);
}




