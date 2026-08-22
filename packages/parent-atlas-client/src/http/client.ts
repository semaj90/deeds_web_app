/**
 * HTTP/REST Client for Parent Atlas Retrieval Service
 *
 * Implements RetrievalFacade over HTTP transport.
 * Browser and Node.js compatible.
 *
 * Does NOT implement retrieval logic; only transport.
 * All logic lives in @deeds/parent-atlas-runtime on the server.
 */

import type { RetrievalFacade, RetrievalRequest, RetrievalResult } from '@deeds/parent-atlas-core';
import { HttpTransportError } from '../errors.js';

export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
}

export type HttpError = HttpTransportError;

/**
 * HTTP client for Parent Atlas RetrievalFacade
 */
export class HttpRetrievalClient implements RetrievalFacade {
  private config: HttpClientConfig;
  private requestIdCounter = 0;

  constructor(config: HttpClientConfig) {
    this.config = {
      timeout: 60_000,
      retryAttempts: 2,
      ...config
    };
  }

  /**
   * Execute retrieval via HTTP POST
   *
   * Endpoint: POST /v1/retrieval/search
   * Request: RetrievalRequest (JSON)
   * Response: RetrievalResult (JSON)
   */
  async search(request: RetrievalRequest): Promise<RetrievalResult> {
    const id = ++this.requestIdCounter;
    const maxAttempts = this.config.retryAttempts ?? 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.config.baseUrl}/v1/retrieval/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': `${id}-${attempt}`
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.config.timeout ?? 60_000)
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => 'unknown error');
          const error = new HttpTransportError(
            `RetrievalFacade search failed: HTTP ${response.status}`,
            response.status,
            detail
          );

          if (error.retryable && attempt < maxAttempts) {
            await this.backoff(attempt);
            continue;
          }

          throw error;
        }

        const result = (await response.json()) as RetrievalResult;
        return result;
      } catch (error) {
        if (error instanceof HttpTransportError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new HttpTransportError(`RetrievalFacade search timeout after ${this.config.timeout}ms`, 408);
        }

        if (attempt < maxAttempts) {
          await this.backoff(attempt);
          continue;
        }

        throw new HttpTransportError(
          `RetrievalFacade search failed: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          error
        );
      }
    }

    throw new HttpTransportError(`RetrievalFacade search exhausted ${maxAttempts} retry attempts`);
  }

  /**
   * Health check
   *
   * Endpoint: GET /v1/health
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5_000)
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async backoff(attempt: number): Promise<void> {
    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

/**
 * Factory function
 */
export function createHttpClient(config: HttpClientConfig): HttpRetrievalClient {
  return new HttpRetrievalClient(config);
}

