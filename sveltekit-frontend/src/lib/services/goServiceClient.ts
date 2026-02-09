/**
 * Go Service Client
 * Interface for communicating with backend Go microservices
 * Phase 72 - Task 2
 */

import { fetch } from 'node-fetch'; // Assuming this is available in the environment

// Types
export interface RAGResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  filters?: Record<string, unknown>;
}

export interface GoServiceConfig {
  baseUrl: string;
  timeout: number;
}

export class GoServiceClient {
  private config: GoServiceConfig;

  constructor(config?: Partial<GoServiceConfig>) {
    this.config = {
      baseUrl: config?.baseUrl ?? 'http://localhost:8080',
      timeout: config?.timeout ?? 30000,
    };
  }

  /**
   * Helper for making HTTP requests
   */
  private async request<T>(
    endpoint: string,
    method: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: this.config.timeout,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      console.error(`Request failed to ${url}:`, error);
      throw error;
    }
  }

  /**
   * Perform semantic search via RAG service
   */
  async semanticSearch(
    query: string,
    userId: string,
    options?: SearchOptions
  ): Promise<RAGResponse> {
    return this.request<RAGResponse>('/api/rag/search', 'POST', {
      query,
      userId,
      ...options,
    });
  }

  /**
   * Upload document to ingestion service
   */
  async uploadDocument(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<RAGResponse> {
    return this.request<RAGResponse>('/api/ingest/upload', 'POST', {
      content,
      metadata,
    });
  }

  /**
   * Submit feedback on search results
   */
  async submitFeedback(
    queryId: string,
    rating: number,
    comment?: string
  ): Promise<RAGResponse> {
    return this.request<RAGResponse>('/api/feedback/submit', 'POST', {
      queryId,
      rating,
      comment,
    });
  }

  /**
   * Get formatting suggestions
   */
  async getFormattingSuggestions(content: string): Promise<RAGResponse> {
    return this.request<RAGResponse>('/api/format/suggestions', 'POST', {
      content,
    });
  }

  /**
   * Apply formatting patch
   */
  async applyFormattingPatch(
    content: string,
    patch: unknown
  ): Promise<RAGResponse> {
    return this.request<RAGResponse>('/api/format/apply', 'POST', {
      content,
      patch,
    });
  }
}

/**
 * Singleton instance
 */
let goClientInstance: GoServiceClient | null = null;

export function getGoClient(config?: Partial<GoServiceConfig>): GoServiceClient {
  if (!goClientInstance) {
    goClientInstance = new GoServiceClient(config);
  }
  return goClientInstance;
}
