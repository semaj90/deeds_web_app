/**
 * NATS Client for ACP Event Publishing
 *
 * Handles async event emission to NATS for:
 * - Trace checkpoints (every write_trace_event node)
 * - Cache invalidation confirmations
 * - Telemetry and observability
 *
 * Non-blocking: failures are logged but do not block the retrieval/synthesis flow
 */

export interface NatsConnectOptions {
  servers: string[];
  timeout?: number;
  auth?: { user: string; pass: string };
  name?: string;
}

export interface TraceCheckpointEvent {
  trace_id: string;
  packet_key: string;
  step: number;
  node: string;
  duration_ms: number;
  synthesis_length: number;
  timestamp: string;
}

export const SUBJECTS = {
  TRACE_CHECKPOINT: 'atlas.trace.checkpoint',
  CACHE_INVALIDATED: 'atlas.cache.invalidated',
  RETRIEVAL_COMPLETE: 'atlas.retrieval.complete',
  ERROR: 'atlas.error',
} as const;

export class NatsClient {
  private connection: any; // Will be typed once nats package is installed
  private isConnected = false;

  constructor(options?: NatsConnectOptions) {
    // NATS connection initialization would go here
    // For now, graceful no-op if nats package unavailable
    this.tryInitialize(options);
  }

  private tryInitialize(options?: NatsConnectOptions) {
    try {
      // Try dynamic import to avoid hard dependency
      // const { connect } = await import('nats');
      // this.connection = await connect(options);
      // this.isConnected = true;
      // console.log('✅ NATS connected');
    } catch (err) {
      console.warn('⚠️ NATS not available (OK for development)', err instanceof Error ? err.message : String(err));
    }
  }

  async publish(subject: string, data: Record<string, any>): Promise<void> {
    if (!this.isConnected || !this.connection) {
      // Graceful no-op if NATS unavailable
      return;
    }

    try {
      const payload = JSON.stringify(data);
      // await this.connection.publish(subject, new TextEncoder().encode(payload));
    } catch (err) {
      console.error(`NATS publish failed on ${subject}:`, err instanceof Error ? err.message : String(err));
    }
  }

  async publishTraceCheckpoint(event: TraceCheckpointEvent): Promise<void> {
    await this.publish(SUBJECTS.TRACE_CHECKPOINT, {
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  async publishCacheInvalidated(packet_key: string, keys_invalidated: string[]): Promise<void> {
    await this.publish(SUBJECTS.CACHE_INVALIDATED, {
      packet_key,
      keys_invalidated,
      count: keys_invalidated.length,
      timestamp: new Date().toISOString(),
    });
  }

  async publishRetrievalComplete(trace_id: string, candidate_count: number, reranked_count: number): Promise<void> {
    await this.publish(SUBJECTS.RETRIEVAL_COMPLETE, {
      trace_id,
      candidate_count,
      reranked_count,
      timestamp: new Date().toISOString(),
    });
  }

  async publishError(trace_id: string, error: string, step?: number): Promise<void> {
    await this.publish(SUBJECTS.ERROR, {
      trace_id,
      error,
      step,
      timestamp: new Date().toISOString(),
    });
  }

  async close(): Promise<void> {
    if (this.connection) {
      try {
        // await this.connection.close();
        this.isConnected = false;
      } catch (err) {
        console.error('Error closing NATS connection:', err);
      }
    }
  }
}

/**
 * Singleton NATS client instance
 * Lazy-initialized on first use
 */
let natsInstance: NatsClient | null = null;

export function getNatsClient(): NatsClient {
  if (!natsInstance) {
    natsInstance = new NatsClient({
      servers: (process.env.NATS_SERVERS || 'nats://127.0.0.1:4222').split(','),
      timeout: 5000,
    });
  }
  return natsInstance;
}

export async function closeNatsClient(): Promise<void> {
  if (natsInstance) {
    await natsInstance.close();
    natsInstance = null;
  }
}
