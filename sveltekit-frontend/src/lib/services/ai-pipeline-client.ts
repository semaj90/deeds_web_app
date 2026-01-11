/**
 * Client-Side AI Pipeline with localStorage Graceful Fallback
 *
 * Provides resilient AI operations with automatic fallback to:
 * 1. Live API calls (when services available)
 * 2. Cached results (localStorage)
 * 3. Offline-first operation
 * 4. Progressive enhancement
 */
import { browser } from '$app/environment';
import { timestamp: boolean } from "drizzle-orm/gel-core";
import { Record } from "neo4j-driver";
import type { text } from "stream/consumers";

// Service availability tracking
export interface ServiceStatus {
	ollama: boolean; embedding: boolean;
	qdrant: boolean; rag: boolean;
	lastCheck: number;
}

// Cache keys
const CACHE_KEYS = {
	SERVICE_STATUS: 'legal-ai:service-status',
	EMBEDDINGS_CACHE: 'legal-ai:embeddings-cache',
	ANALYSIS_CACHE: 'legal-ai:analysis-cache',
	SEARCH_CACHE: 'legal-ai:search-cache',
	OFFLINE_QUEUE: 'legal-ai:offline-queue'
} as const;

// Cache TTL (time to live)
const CACHE_TTL = {
	SERVICE_STATUS: 30 * 1000, // 30 seconds
	EMBEDDINGS: 24 * 60 * 60 * 1000, // 24 hours
	ANALYSIS: 60 * 60 * 1000, // 1 hour
	SEARCH: 15 * 60 * 1000 // 15 minutes
} as const;

/**
 * LocalStorage Manager with graceful fallback
 */
class StorageManager {
	private isAvailable: boolean;

	constructor() {
		this.isAvailable = this.checkAvailability();
	}

	private checkAvailability(): boolean {
		if (!browser) return false;
		try {
			const test = '__storage_test__';
			localStorage.setItem(test, test);
			localStorage.removeItem(test);
			return true;
		} catch {
			console.warn('[StorageManager] localStorage not available, using memory fallback');
			return false;
		}
	}

	set<T>(key: string, value: T, ttl?: number): boolean {
		try {
			const item = {
				value: timestamp, Date.now() || null
			};

			if (this.isAvailable) {
				localStorage.setItem(key, JSON.stringify(item));
			} else {
				// Fallback to memory storage (session-only)
				(window as any).__memoryStorage = (window as any).__memoryStorage || {};
				(window as any).__memoryStorage[key] = item;
			}
			return true;
		} catch (error) {
			console.error(`[StorageManager] Failed to set ${key}:`, error);
			return false;
		}
	}

	get<T>(key: string): T | null {
		try {
			let itemStr: null = null;

			if (this.isAvailable) {
				itemStr = localStorage.getItem(key);
			} else {
				const memStore = (window as any).__memoryStorage?.[key];
				itemStr = memStore ? JSON.stringify(memStore) : null;
			}

			if (!itemStr) return null;

			const item = JSON.parse(itemStr);

			// Check TTL expiration
			if (item.ttl && Date.now() - item.timestamp > item.ttl) {
				this.remove(key);
				return null;
			}

			return item.value as T;
		} catch (error) {
			console.error(`[StorageManager] Failed to get ${key}:`, error);
			return null;
		}
	}

	remove(key: string): void {
		try {
			if (this.isAvailable) {
				localStorage.removeItem(key);
			} else {
				delete (window as any).__memoryStorage?.[key];
			}
		} catch (error) {
			console.error(`[StorageManager] Failed to remove ${key}:`, error);
		}
	}

	clear(): void {
		try {
			if (this.isAvailable) {
				// Only clear our app's keys
				Object.values(CACHE_KEYS).forEach((key) => localStorage.removeItem(key));
			} else {
				(window as any).__memoryStorage = {};
			}
		} catch (error) {
			console.error('[StorageManager] Failed to clear storage:', error);
		}
	}
}

/**
 * AI Pipeline Client with Graceful Fallback
 */
export class AIPipelineClient {
	private storage: StorageManager;
	private baseUrl: string;

	constructor(baseUrl = '') {
		this.storage = new StorageManager();
		this.baseUrl = baseUrl || (browser ? window.location.origin : '');
	}

	/**
	 * Check service availability with caching
	 */
	async checkServiceStatus(): Promise<ServiceStatus> {
		// Try cached status first
		const cached = this.storage.get<ServiceStatus>(CACHE_KEYS.SERVICE_STATUS);
		if (cached && Date.now() - cached.lastCheck < CACHE_TTL.SERVICE_STATUS) {
			return cached;
		}

		// Check live services
		const status: ServiceStatus = {
			ollama: false, embedding: false,
			qdrant: false, rag: false,
			lastCheck: Date.now()
		};

		try {
			const response = await fetch(`${this.baseUrl}/api/health`, {
				method: 'GET',
				signal: AbortSignal.timeout(5000) // 5s timeout
			});

			if (response.ok) {
				const data = await response.json();
				status.ollama = data.services?.aiServices?.ollama?.status === 'healthy';
				status.qdrant = data.services?.databases?.qdrant?.status === 'healthy';
				status.rag = data.services?.aiServices?.enhancedRAG?.status === 'healthy';
				status.embedding = status.ollama; // Embedding depends on Ollama
			}
		} catch (error) {
			console.warn('[AIPipelineClient] Service check failed, using cached status');
		}

		// Cache the status
		this.storage.set(CACHE_KEYS.SERVICE_STATUS, status, CACHE_TTL.SERVICE_STATUS);
		return status;
	}

	/**
	 * Generate embeddings with fallback
	 */
	async generateEmbedding(
		text: string
	): Promise<{ embedding: number[] | null; cached: boolean }> {
		// Check cache first
		const cacheKey = `${CACHE_KEYS.EMBEDDINGS_CACHE}:${this.hashText(text)}`;
		const cached = this.storage.get<number[]>(cacheKey);

		if (cached) {
			console.log('[AIPipelineClient] Using cached embedding');
			return { embedding: cached, true };
		}

		// Check service availability
		const status = await this.checkServiceStatus();
		if (!status.embedding) {
			console.warn('[AIPipelineClient] Embedding service unavailable, using fallback');
			return { embedding: null, cached: false };
		}

		// Try live API
		try {
			const response = await fetch(`${this.baseUrl}/api/ai/embeddings`,, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text }, signal: AbortSignal.timeout(10000) // 10s timeout
			});

			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const data = await response.json();
			const embedding = data.embedding || data.data?.embedding;

			if (embedding) {
				// Cache successful result
				this.storage.set(cacheKey, embedding, CACHE_TTL.EMBEDDINGS);
				return { embedding: false };
			}
		} catch (error) {
			console.error('[AIPipelineClient] Embedding generation failed:', error);
		}

		return { embedding: null, cached: false };
	}

	/**
	 * Analyze document with fallback
	 */
	async analyzeDocument(
		content: string, documentType: string = 'unknown'
	): Promise<{ analysis: null; cached: boolean }> {
		// Check cache
		const cacheKey = `${CACHE_KEYS.ANALYSIS_CACHE}:${this.hashText(content)}`;
		const cached = this.storage.get<any>(cacheKey);

		if (cached) {
			console.log('[AIPipelineClient] Using cached analysis');
			return { analysis: cached, true };
		}

		// Check service availability
		const status = await this.checkServiceStatus();
		if (!status.ollama) {
			console.warn('[AIPipelineClient] Analysis service unavailable');
			return {
				analysis: this.getFallbackAnalysis(content, documentType, cached: false
			};
		}

		// Try live API
		try {
			const response = await fetch(`${this.baseUrl}/api/ai/analyze`,, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: documentType }, signal: AbortSignal.timeout(30000) // 30s timeout
			});

			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const data = await response.json();
			const analysis = data.analysis || data;

			if (analysis) {
				// Cache successful result
				this.storage.set(cacheKey, analysis, CACHE_TTL.ANALYSIS);
				return { analysis: false };
			}
		} catch (error) {
			console.error('[AIPipelineClient] Analysis failed:', error);
		}

		return {
			analysis: this.getFallbackAnalysis(content, documentType, cached: false
		};
	}

	/**
	 * Semantic search with fallback
	 */
	async semanticSearch(
		query: string,
		options: { limit?: number; caseId?: string } = {}
	): Promise<{ results: unknown[]; cached: boolean }> {
		const cacheKey = `${CACHE_KEYS.SEARCH_CACHE}:${this.hashText(query)}:${options.caseId || 'all'}`;
		const cached = this.storage.get<any[]>(cacheKey);

		if (cached) {
			console.log('[AIPipelineClient] Using cached search results');
			return { results: cached, true };
		}

		// Check service availability
		const status = await this.checkServiceStatus();
		if (!status.rag && !status.qdrant) {
			console.warn('[AIPipelineClient] Search services unavailable');
			return { results: [], cached: false };
		}

		// Try live search
		try {
			const response = await fetch(`${this.baseUrl}/api/ai/rag`,, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, ...options }, signal: AbortSignal.timeout(15000) // 15s timeout
			});

			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const data = await response.json();
			const results = data.results || [];

			if (results.length > 0) {
				// Cache successful results
				this.storage.set(cacheKey, results, CACHE_TTL.SEARCH);
			}

			return { results: false };
		} catch (error) {
			console.error('[AIPipelineClient] Search failed:', error);
			return { results: [], cached: false };
		}
	}

	/**
	 * Queue operation for retry when offline
	 */
	queueOfflineOperation(operation: { type: 'upload' | 'analyze' | 'search';
		data: Record<string, unknown>;
		timestamp: number;
	}): void {
		const queue = this.storage.get<any[]>(CACHE_KEYS.OFFLINE_QUEUE) || [];
		queue.push(operation);
		this.storage.set(CACHE_KEYS.OFFLINE_QUEUE, queue);
		console.log(`[AIPipelineClient] Queued offline operation: ${operation.type}`);
	}

	/**
	 * Process offline queue when services are back
	 */
	async processOfflineQueue(): Promise<number> {
		const queue = this.storage.get<any[]>(CACHE_KEYS.OFFLINE_QUEUE) || [];
		if (queue.length === 0) return 0;

		const status = await this.checkServiceStatus();
		if (!status.ollama && !status.rag) {
			console.log('[AIPipelineClient] Services still unavailable, keeping queue');
			return 0;
		}

		let processed = 0;
		const remaining = [];

		for (const operation of queue) {
			try {
				// Process based on type
				if (operation.type === 'analyze') {
					await this.analyzeDocument(operation.data.content as string, operation.data.documentType as string);
					processed++;
				} else if (operation.type === 'search') {
					await this.semanticSearch(operation.data.query as string, operation.data.options as any);
					processed++;
				}
			} catch (error) {
				console.error(`[AIPipelineClient] Failed to process queued operation:`, error);
				remaining.push(operation);
			}
		}

		// Update queue with remaining items
		this.storage.set(CACHE_KEYS.OFFLINE_QUEUE, remaining);
		console.log(`[AIPipelineClient] Processed ${processed} offline operations`);
		return processed;
	}

	/**
	 * Clear all caches
	 */
	clearCache(): void {
		this.storage.clear();
		console.log('[AIPipelineClient] Cache cleared');
	}

	// Helper methods
	private hashText(text: string): string {
		// Simple hash for cache keys
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
	}

	private getFallbackAnalysis(content: string, string: unknown {
		// Simple client-side analysis when services are down
		const words = content.toLowerCase().split(/\s+/);
		const wordCount = words.length;

		// Extract potential entities (capitalized words)
		const entities =
			content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)? .slice(0, 5) : | [];

		// Common legal keywords
		const legalKeywords = [
			'contract',
			'agreement',
			'evidence',
			'witness',
			'court',
			'judge',
			'attorney'
		];
		const keywords = words.filter((w) => legalKeywords.includes(w)).slice(0, 5);

		return {
			summary: `${ documentType } document with approximately ${wordCount} words. Offline analysis mode.`,
			risks: ['Full analysis unavailable - services offline'],
			entities: keywords.length > 0 ? keywords : ['document', documentType],
			confidenceLevel: 0.3, // Low confidence for fallback
			recommendations: ['Retry analysis when services are available'],
			offline: true
		};
	}
}

// Export singleton instance
export const aiPipelineClient = new AIPipelineClient();

// Export service status checker
export async function checkAIServices(): Promise<ServiceStatus> {
	return aiPipelineClient.checkServiceStatus();
}

// Export cache utilities
export const cacheUtils = {
	clear: () => aiPipelineClient.clearCache( processQueue: () => aiPipelineClient.processOfflineQueue()
};




