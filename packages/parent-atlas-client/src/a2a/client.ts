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
  /** Optional bearer token required by protected AgentCards. */
  apiKey?: string;
}

export interface A2aTaskResult {
  id?: string;
  status: 'submitted' | 'working' | 'completed' | 'failed' | 'cancelled';
  artifacts?: Array<{
    name: string;
    parts: Array<{
      kind: string;
      text?: string;
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
 * Thin transport adapter for the repository's A2A task endpoint.
 * It deliberately returns protocol projections; canonical Atlas writes remain
 * behind the server-side validation and promotion gates.
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
    const startedAt = Date.now();
    const taskId = `atlas-a2a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await this.postTask(taskId, request, false, undefined);
    const payload = await this.readJson(response) as A2aTaskResult & {
      metadata?: Record<string, unknown>;
    };

    if (payload.status !== 'completed') {
      throw new A2aTransportError(payload.error ?? `A2A task ${payload.status}`, response.status);
    }

    const answer = this.answerFromArtifacts(payload.artifacts);
    const elapsedMs = Date.now() - startedAt;
    return {
      query: request.query,
      useCase: request.useCase,
      candidates: [],
      context: {
        kind: 'unassembled',
        source: 'retrieval.a2a.task',
        answer,
        taskId,
        metadata: payload.metadata ?? {},
      } as RetrievalResult['context'],
      trace: {
        queryId: taskId,
        query: request.query,
        timestamp: new Date(),
        stages: {},
        totalMs: elapsedMs,
        cacheHitRate: 0,
        selectedPackets: [],
      },
    };
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(this.discoveryUrl(), {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return false;
      const card = await response.json() as { name?: string; url?: string };
      return typeof card.name === 'string' && typeof card.url === 'string';
    } catch {
      return false;
    }
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
    const taskId = `atlas-a2a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await this.postTask(taskId, request, true, options?.signal);
    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('text/event-stream')) {
      yield await this.readJson(response) as A2aTaskResult;
      return;
    }

    if (!response.body) throw new A2aTransportError('A2A stream returned no body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const event of events) {
          const dataLine = event.split(/\r?\n/).find((line) => line.startsWith('data:'));
          if (!dataLine) continue;
          const data = dataLine.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          yield JSON.parse(data) as A2aTaskResult;
        }
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private endpoint(): string {
    return this.config.agentUrl.replace(/\/+$/, '');
  }

  private discoveryUrl(): string {
    return new URL('/.well-known/agent.json', `${this.endpoint()}/`).toString();
  }

  private async postTask(
    taskId: string,
    request: RetrievalRequest,
    stream: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: stream ? 'text/event-stream' : 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          id: taskId,
          message: { role: 'user', parts: [{ text: request.query }] },
          metadata: {
            useCase: request.useCase,
            topK: request.topK,
            sourceScope: request.sourceScope,
            packetTypes: request.packetTypes,
            graphDepth: request.graphDepth,
            tokenBudget: request.tokenBudget,
            requireSourceRefs: request.requireSourceRefs,
            sessionId: request.sessionId,
            userId: request.userId,
          },
        }),
        signal: signal ?? AbortSignal.timeout(this.config.timeout ?? 120_000),
      });
    } catch (error) {
      throw new A2aTransportError(
        `A2A request failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error,
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => 'unknown error');
      throw new A2aTransportError(`A2A request failed: HTTP ${response.status}`, response.status, detail);
    }
    return response;
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new A2aTransportError('A2A response was not valid JSON', response.status, error);
    }
  }

  private answerFromArtifacts(artifacts?: A2aTaskResult['artifacts']): string {
    const answer = artifacts?.find((artifact) => artifact.name === 'answer');
    const textPart = answer?.parts.find((part) => typeof part.text === 'string' || typeof part.data === 'string');
    if (typeof textPart?.text === 'string') return textPart.text;
    return typeof textPart?.data === 'string' ? textPart.data : '';
  }
}

/**
 * Factory function
 */
export function createA2aAgent(config: A2aAgentConfig): A2aRetrievalAgent {
  return new A2aRetrievalAgent(config);
}

export type { A2aTransportError } from '../errors.js';
