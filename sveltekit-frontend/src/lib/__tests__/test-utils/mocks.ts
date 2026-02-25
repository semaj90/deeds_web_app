/**
 * 🧪 Test Mocks - Comprehensive Mock Infrastructure
 *
 * Provides in-memory implementations of all external services:
 * - Qdrant (vector database)
 * - Redis (cache)
 * - Ollama (LLM)
 * - PostgreSQL (database)
 * - MinIO (object storage)
 *
 * Usage:
 *   import { mockQdrant, mockRedis, mockOllama } from '$lib/test-utils/mocks';
 *
 *   beforeEach(() => {
 *     mockQdrant.reset();
 *     mockRedis.reset();
 *   });
 */

import { vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface MockQdrantPoint {
	id: string | number;
	vector: number[];
	payload: Record<string, any>;
}

export interface MockRedisEntry {
	value: string;
	expiresAt?: number;
}

export interface MockMinIOObject {
	bucket: string;
	key: string;
	data: Buffer | string;
	contentType?: string;
	metadata?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════
// Mock Qdrant Client
// ═══════════════════════════════════════════════════════════════════════

class MockQdrantClient {
	private collections: Map<string, MockQdrantPoint[]> = new Map();
	private collectionConfigs: Map<string, { vectorSize: number }> = new Map();

	/**
	 * Create or recreate a collection
	 */
	async createCollection(collectionName: string, config: {
	vectors: { size: number } }): Promise<void> {
		this.collections.set(collectionName, []);
		this.collectionConfigs.set(collectionName, { vectorSize: config.vectors.size });
	}

	/**
	 * Check if collection exists
	 */
	async collectionExists(collectionName: string): Promise<boolean> {
		return this.collections.has(collectionName);
	}

	/**
	 * Upsert points into collection
	 */
	async upsert(collectionName: string, options: {
	points: MockQdrantPoint[] }): Promise<void> {
		if (!this.collections.has(collectionName)) {
			throw new Error(`Collection ${collectionName} does not exist`);
		}

		const collection = this.collections.get(collectionName)!;

		for (const point of options.points) {
			// Remove existing point with same ID
			const existingIndex = collection.findIndex(p => p.id === point.id);
			if (existingIndex >= 0) {
				collection.splice(existingIndex, 1);
			}
			// Add new point
			collection.push(point);
		}
	}

	/**
	 * Search for similar vectors
	 */
	async search(collectionName: string, options: {
	vector: number[];
		limit: number;
		filter?: Record<string, any>;
		scoreThreshold?: number;
	}): Promise<Array<{
	id: string | number, score: number;
	payload: Record<string, any> }>> {
		if (!this.collections.has(collectionName)) {
			return [];
		}

		const collection = this.collections.get(collectionName)!;
		const { vector, limit, filter, scoreThreshold = 0 } = options;

		// Calculate cosine similarity for each point
		const results = collection
      .map(point => ({
        id: point.id,
        score: this.cosineSimilarity(vector, point.vector),
        payload: point.payload
			}))
			.filter(result => {
				// Apply score threshold
				if (result.score < scoreThreshold) return false;

				// Apply filters
				if (filter) {
					for (const [key, value] of Object.entries(filter)) {
						if (result.payload[key] !== value) return false;
					}
				}

				return true;
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);

		return results;
	}

	/**
	 * Get points by IDs
	 */
	async retrieve(collectionName: string, options: {
	ids: (string | number)[] }): Promise<MockQdrantPoint[]> {
		if (!this.collections.has(collectionName)) {
			return [];
		}

		const collection = this.collections.get(collectionName)!;
		return collection.filter(point => options.ids.includes(point.id));
	}

	/**
	 * Delete points by IDs
	 */
	async delete(collectionName: string, options: {
	points: (string | number)[] }): Promise<void> {
		if (!this.collections.has(collectionName)) {
			return;
		}

		const collection = this.collections.get(collectionName)!;
		const idsToDelete = new Set(options.points);

		this.collections.set(
			collectionName,
      collection.filter(point => !idsToDelete.has(point.id))
		);
	}

	/**
	 * Get collection info
	 */
	async getCollection(collectionName: string): Promise<{
	pointsCount: number; vectorSize: number } | null> {
		if (!this.collections.has(collectionName)) {
			return null;
		}

		const collection = this.collections.get(collectionName)!;
		const config = this.collectionConfigs.get(collectionName)!;

		return {
      pointsCount: collection.length,
      vectorSize: config.vectorSize
		};
	}

	/**
	 * Reset all collections
	 */
	reset(): void {
		this.collections.clear();
		this.collectionConfigs.clear();
	}

	/**
	 * Helper: Calculate cosine similarity
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Mock Redis Client
// ═══════════════════════════════════════════════════════════════════════

class MockRedisClient {
	private store: Map<string, MockRedisEntry> = new Map();

	/**
	 * Get value by key
	 */
 async get(key: string): Promise<string | null> {
		const entry = this.store.get(key);

		if (!entry) return null;

		// Check expiration
		if (entry?.expiresAt && Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}

		return entry.value;
	}

	/**
	 * Set value with optional TTL
	 */
 async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
		const entry: MockRedisEntry = { value };

		if (options?.EX) {
			entry.expiresAt = Date.now() + (options.EX * 1000);
		}

		this.store.set(key, entry);
	}

	/**
	 * Delete key
	 */
	async del(key: string): Promise<number> {
		const existed = this.store.has(key);
		this.store.delete(key);
		return existed ? 1 : 0;
	}

	/**
	 * Check if key exists
	 */
	async exists(key: string): Promise<number> {
		const entry = this.store.get(key);

		if (!entry) return 0;

		// Check expiration
		if (entry?.expiresAt && Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return 0;
		}

		return 1;
	}

	/**
	 * Set expiration on key
	 */
 async expire(key: string, seconds: number): Promise<number> {
		const entry = this.store.get(key);

		if (!entry) return 0;

		entry.expiresAt = Date.now() + (seconds * 1000);
		return 1;
	}

	/**
	 * Get keys matching pattern
	 */
	async keys(pattern: string): Promise<string[]> {
		const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
		return Array.from(this.store.keys()).filter(key => regex.test(key));
	}

	/**
	 * Increment value
	 */
	async incr(key: string): Promise<number> {
		const current = await this.get(key);
		const value = current ? parseInt(current, 10) + 1 : 1;
		await this.set(key, value.toString());
		return value;
	}

	/**
	 * Reset all data
	 */
	reset(): void {
		this.store.clear();
	}

	/**
	 * Get all keys (for testing)
	 */
	getAllKeys(): string[] {
		return Array.from(this.store.keys());
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Mock Ollama Client
// ═══════════════════════════════════════════════════════════════════════

class MockOllamaClient {
	private embeddingDimension = 384;
	private responses: Map<string, string> = new Map();

	/**
	 * Generate embeddings
	 */
	async embeddings(options: {
	model: string, prompt: string }): Promise<{
	embedding: number[] }> {
		// Generate deterministic fake embedding based on prompt
		const seed = this.hashString(options.prompt);
		const embedding = Array.from({ length: this.embeddingDimension },
	(_, i) => {
			return Math.sin(seed + i) * 0.5 + 0.5; // Normalize to [0, 1]
		});

		return { embedding };
	}

	/**
	 * Generate text
	 */
	async generate(options: {
	model: string;
		prompt: string;
		stream?: boolean;
	}): Promise<{
	response: string }> {
		// Check if we have a pre-configured response
    const response = this.responses.get(options.prompt) || `Mock response for: ${options.prompt.substring(0, 50)}...`;

		return { response };
	}

	/**
	 * Set a mock response for a specific prompt
	 */
  setResponse(prompt: string, response: string): void {
		this.responses.set(prompt, response);
	}

	/**
	 * Reset all mock data
	 */
	reset(): void {
		this.responses.clear();
	}

	/**
	 * Helper: Hash string to number
	 */
	private hashString(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Mock PostgreSQL Client
// ═══════════════════════════════════════════════════════════════════════

class MockPostgreSQLClient {
	private tables: Map<string, any[]> = new Map();

	/**
	 * Execute SQL query
	 */
	async query(sql: string, params?: any[]): Promise<{
	rows: any[], rowCount: number }> {
		// Simple mock - just return empty results
		// In real tests, you'd parse SQL and return appropriate data
		const rows: any[] = [];

		// Handle SELECT queries
		if (sql.trim().toUpperCase().startsWith('SELECT')) {
			// Extract table name (very basic parsing)
			const tableMatch = sql.match(/FROM\s+(\w+)/i);
			if (tableMatch) {
				const tableName = tableMatch[1];
				const tableData = this.tables.get(tableName) || [];
				rows.push(...tableData);
			}
		}

    return { rows, rowCount: rows.length };
	}

	/**
	 * Seed table with data
	 */
 seedTable(tableName: string, data: any[]): void {
		this.tables.set(tableName, data);
	}

	/**
	 * Reset all tables
	 */
	reset(): void {
		this.tables.clear();
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Mock MinIO Client
// ═══════════════════════════════════════════════════════════════════════

class MockMinIOClient {
	private objects: Map<string, MockMinIOObject> = new Map();

	/**
	 * Upload object
	 */
	async putObject(
		bucket: string,
    key: string,
		data: Buffer | string,
		metadata?: Record<string, string>
	): Promise<void> {
		const objectKey = `${ bucket }/${ key }`;
		this.objects.set(objectKey, {
			bucket,
			key,
			data,
			contentType: metadata?.['Content-Type'],
			metadata
		});
	}

	/**
	 * Get object
	 */
 async getObject(bucket: string, key: string): Promise<Buffer | string | null> {
		const objectKey = `${ bucket }/${ key }`;
		const object = this.objects.get(objectKey);
		return object ? object.data : null;
	}

	/**
	 * Check if object exists
	 */
 async statObject(bucket: string, key: string): Promise<{
	size: number } | null> {
		const objectKey = `${ bucket }/${ key }`;
		const object = this.objects.get(objectKey);

		if (!object) return null;

    const size = typeof object.data === 'string'
			? Buffer.byteLength(object.data)
			: object.data.length;

		return { size };
	}

	/**
	 * List objects in bucket
	 */
	async listObjects(bucket: string, prefix?: string): Promise<Array<{
	name: string, size: number }>> {
		const results: Array<{
	name: string, size: number }> = [];

		for (const [objectKey, object] of this.objects.entries()) {
			if (object.bucket !== bucket) continue;
			if (prefix && !object.key.startsWith(prefix)) continue;

      const size = typeof object.data === 'string'
				? Buffer.byteLength(object.data)
				: object.data.length;

			results.push({ name: object.key, size });
		}

		return results;
	}

	/**
	 * Delete object
	 */
 async removeObject(bucket: string, key: string): Promise<void> {
		const objectKey = `${ bucket }/${key}`;
		this.objects.delete(objectKey);
	}

	/**
	 * Reset all objects
	 */
	reset(): void {
		this.objects.clear();
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Export Mock Instances
// ═══════════════════════════════════════════════════════════════════════

export const mockQdrant = new MockQdrantClient();
export const mockRedis = new MockRedisClient();
export const mockOllama = new MockOllamaClient();
export const mockPostgreSQL = new MockPostgreSQLClient();
export const mockMinIO = new MockMinIOClient();

/**
 * Reset all mocks
 */
export function resetAllMocks(): void {
	mockQdrant.reset();
	mockRedis.reset();
	mockOllama.reset();
	mockPostgreSQL.reset();
	mockMinIO.reset();
  mockFetch.reset();
}

// ═══════════════════════════════════════════════════════════════════════
// Mock Fetch for HTTP Endpoints
// ═══════════════════════════════════════════════════════════════════════

export interface MockFetchResponse {
	url: string;
	status: number;
	data: any;
}

class MockFetchClient {
	private responses: Map<string, MockFetchResponse> = new Map();
	private defaultResponse: MockFetchResponse = {
		url: '',
		status: 200,
		data: {
	success: true }
	};

	/**
	 * Set mock response for URL pattern
	 */
 setResponse(urlPattern: string, response: Partial<MockFetchResponse>): void {
		this.responses.set(urlPattern, {
      url: urlPattern,
      status: response?.status ?? 200,
      data: response?.data || {}
		});
	}

	/**
	 * Get mock fetch function
	 */
	getMockFetch(): typeof fetch {
		return vi.fn(async (url: string | URL, options?: RequestInit) => {
			const urlString = url.toString();

			// Special handling for Qdrant search endpoint
			if (urlString.includes('/collections/') && urlString.includes('/points/search')) {
				try {
					// Extract collection name from URL
					const collectionMatch = urlString.match(/\/collections\/([^/]+)\/points\/search/);
					const collectionName = collectionMatch ? collectionMatch[1] : 'codemod_memories';

          // Parse request body to get search vector and limit
          const body = options?.body ? JSON.parse(options.body as string) : {};
          const vector = body?.vector || [];
          const limit = body?.limit ?? 5;
          const scoreThreshold = body?.score_threshold ?? 0;

          // Query mockQdrant with correct options object
          const results = await mockQdrant.search(collectionName, {
            vector,
            limit,
            scoreThreshold,
          });

					return new Response(JSON.stringify({
						result: results.map(r => ({
							id: r.id, score: r.score, payload: r.payload
						}))
					}), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					});
				} catch (error) {
					return new Response(JSON.stringify({
						result: []
					}), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					});
				}
			}

			// Find matching response for other endpoints
			let response = this.defaultResponse;
			for (const [pattern, mockResponse] of this.responses.entries()) {
				if (urlString.includes(pattern)) {
					response = mockResponse;
					break;
				}
			}

			return new Response(JSON.stringify(response.data), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' }
			});
		}) as any;
	}

	/**
	 * Reset all responses
	 */
	reset(): void {
		this.responses.clear();
	}
}

export const mockFetch = new MockFetchClient();




