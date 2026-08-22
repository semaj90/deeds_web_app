/**
 * A2A (Agent-to-Agent) Client for Parent Atlas Task Delegation
 *
 * A2A is for TASK DELEGATION, not low-level retrieval operations.
 *
 * Use A2A for:
 * - Long-running multihop investigations
 * - Task state tracking
 * - Streaming progress and artifacts
 *
 * Use RetrievalFacade (REST/gRPC) for:
 * - Single search requests
 * - Rapid prototyping
 * - Synchronous operations
 *
 * A2A supplements RetrievalFacade; it does not replace it.
 */

import type { RetrievalFacade, RetrievalRequest, RetrievalResult } from '@deeds/parent-atlas-core';
import { A2aTransportError } from '../errors.js';

export interface A2aAgentConfig {
  agentUrl: string;
  timeout?: number;
}

export interface A2aTaskResult {
  status: 'completed' | 'failed' | 'cancelled';
  artifacts?: Array<{
    name: string;
    parts: Array<{
      kind: string;
      data?: unknown;
    }>;
  }>;
  error?: string;
}

/**
 * A2A client for delegating Parent Atlas tasks to a remote agent
 *
 * Maps A2A tasks to Parent Atlas RetrievalFacade operations.
 *
 * Placeholder implementation (TODO: full A2A protocol wiring)
 */
export class A2aRetrievalAgent implements RetrievalFacade {
  private config: A2aAgentConfig;

  constructor(config: A2aAgentConfig) {
    this.config = {
      timeout: 120_000,
      ...config
    };
  }

  /**
   * Delegate a search task to the remote agent
   *
   * For small, synchronous searches, use RetrievalFacade directly.
   * For complex, multihop investigations, use this A2A delegation path.
   */
  async search(request: RetrievalRequest): Promise<RetrievalResult> {
    // TODO: Implement A2A task submission
    // 1. Send task message to agent
    // 2. Poll task status
    // 3. Stream artifacts as they become available
    // 4. Return final RetrievalResult

    throw new A2aTransportError('A2A delegation not yet implemented');
  }

  async health(): Promise<boolean> {
    // TODO: Implement A2A health check
    return false;
  }

  /**
   * Submit a long-running task and stream results
   *
   * Returns an async iterator of task artifacts.
   */
  async *streamTask(
    request: RetrievalRequest,
    options?: { signal?: AbortSignal }
  ): AsyncIterable<A2aTaskResult> {
    // TODO: Implement streaming task submission
    throw new A2aTransportError('A2A streaming not yet implemented');
  }
}

/**
 * Factory function
 */
export function createA2aAgent(config: A2aAgentConfig): A2aRetrievalAgent {
  return new A2aRetrievalAgent(config);
}

export type { A2aTransportError } from '../errors.js';
