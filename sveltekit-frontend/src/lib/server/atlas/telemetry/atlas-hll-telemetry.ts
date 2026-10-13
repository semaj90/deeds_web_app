/**
 * atlas-hll-telemetry.ts
 *
 * High-performance HyperLogLog (HLL) telemetry aggregator and cardinality estimator
 * for BitFrost / Valkey (Redis).
 *
 * Implements bounded O(1) space tracking (~12 KB per register, ~0.81% error) across:
 *   - workflowHllKey
 *   - symbolHllKey
 *   - sessionHllKey
 *   - errorHllKey
 *   - sourceHllKey
 *
 * Supports fast in-memory mocking for testing, direct Valkey/Redis driver operations,
 * and protobuf-aligned serialization descriptors for gRPC transport.
 */

export interface HllRegisterKeys {
  workflowHllKey: string;
  symbolHllKey: string;
  sessionHllKey: string;
  errorHllKey: string;
  sourceHllKey: string;
}

export interface HllCardinalityEstimates {
  workflows: number;
  symbols: number;
  sessions: number;
  errors: number;
  sources: number;
}

export interface HllRedisAdapter {
  pfadd(key: string, ...elements: string[]): Promise<number>;
  pfcount(...keys: string[]): Promise<number>;
}

export function buildHllRegisterKeys(namespace: string, windowId: string): HllRegisterKeys {
  const prefix = `atlas:hll:${namespace}:${windowId}`;
  return {
    workflowHllKey: `${prefix}:workflows`,
    symbolHllKey: `${prefix}:symbols`,
    sessionHllKey: `${prefix}:sessions`,
    errorHllKey: `${prefix}:errors`,
    sourceHllKey: `${prefix}:sources`,
  };
}

export class AtlasHllTelemetryClient {
  private client: HllRedisAdapter;

  constructor(client: HllRedisAdapter) {
    this.client = client;
  }

  /**
   * Records a batch of unique identifiers into their respective HyperLogLog registers.
   */
  async recordTelemetryBatch(
    keys: HllRegisterKeys,
    batch: {
      workflows?: string[];
      symbols?: string[];
      sessions?: string[];
      errors?: string[];
      sources?: string[];
    }
  ): Promise<{ added: number }> {
    let addedCount = 0;

    if (batch.workflows && batch.workflows.length > 0) {
      addedCount += await this.client.pfadd(keys.workflowHllKey, ...batch.workflows);
    }
    if (batch.symbols && batch.symbols.length > 0) {
      addedCount += await this.client.pfadd(keys.symbolHllKey, ...batch.symbols);
    }
    if (batch.sessions && batch.sessions.length > 0) {
      addedCount += await this.client.pfadd(keys.sessionHllKey, ...batch.sessions);
    }
    if (batch.errors && batch.errors.length > 0) {
      addedCount += await this.client.pfadd(keys.errorHllKey, ...batch.errors);
    }
    if (batch.sources && batch.sources.length > 0) {
      addedCount += await this.client.pfadd(keys.sourceHllKey, ...batch.sources);
    }

    return { added: addedCount };
  }

  /**
   * Queries approximate distinct counts across all telemetry registers.
   */
  async queryEstimates(keys: HllRegisterKeys): Promise<HllCardinalityEstimates> {
    const [workflows, symbols, sessions, errors, sources] = await Promise.all([
      this.client.pfcount(keys.workflowHllKey),
      this.client.pfcount(keys.symbolHllKey),
      this.client.pfcount(keys.sessionHllKey),
      this.client.pfcount(keys.errorHllKey),
      this.client.pfcount(keys.sourceHllKey),
    ]);

    return {
      workflows,
      symbols,
      sessions,
      errors,
      sources,
    };
  }

  /**
   * Formats cardinality estimates into a compact protobuf-aligned JSON structure.
   */
  formatProtobufEnvelope(
    keys: HllRegisterKeys,
    estimates: HllCardinalityEstimates,
    metadata?: { producerId: string; revision: string }
  ) {
    return {
      schema: 'atlas.telemetry.hll.v1',
      timestamp: new Date().toISOString(),
      producerId: metadata?.producerId ?? 'atlas-hll-client',
      revision: metadata?.revision ?? 'v1',
      keys,
      estimates,
      standardErrorPct: 0.81,
      registerBytes: 12288, // 12 KB max per HyperLogLog register
    };
  }
}
