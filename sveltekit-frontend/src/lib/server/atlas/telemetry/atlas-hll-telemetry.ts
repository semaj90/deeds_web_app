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

const HLL_KIND_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

/** Cap on combined member characters per PFADD, so CLI-backed adapters stay under the ~8 KB shell limit. */
export const DEFAULT_HLL_PFADD_CHUNK_CHARS = 6000;

/** UTC day window id (YYYY-MM-DD) for per-day registers. */
export function buildDailyHllWindowId(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Register key for one entity kind, in the same `atlas:hll:<namespace>:<window>:<kind>` scheme as
 * buildHllRegisterKeys. One register per kind: never count different entity kinds in one register.
 */
export function buildHllEntityKey(namespace: string, windowId: string, kind: string): string {
  if (!HLL_KIND_PATTERN.test(kind)) {
    throw new Error(`HLL entity kind must match ${HLL_KIND_PATTERN}: ${JSON.stringify(kind)}`);
  }
  return `atlas:hll:${namespace}:${windowId}:${kind}`;
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
   * Records identifiers into one register per entity kind (for producers whose kinds differ from the
   * five fixed telemetry registers). Members are de-duplicated, empty strings dropped, and PFADD is
   * chunked by combined character length. Adapter results are coerced to numbers because CLI-backed
   * adapters may return nothing.
   */
  async recordEntityBatch(
    namespace: string,
    windowId: string,
    batch: Record<string, string[]>,
    options: { maxChunkChars?: number } = {}
  ): Promise<{ added: number; keys: Record<string, string> }> {
    const maxChars = options.maxChunkChars ?? DEFAULT_HLL_PFADD_CHUNK_CHARS;
    const keys: Record<string, string> = {};
    let added = 0;

    for (const [kind, members] of Object.entries(batch)) {
      const key = buildHllEntityKey(namespace, windowId, kind);
      keys[kind] = key;
      const unique = [...new Set(members.filter((member) => member.length > 0))];

      let chunk: string[] = [];
      let chunkChars = 0;
      const flush = async () => {
        if (chunk.length === 0) return;
        const result = await this.client.pfadd(key, ...chunk);
        added += Number.isFinite(result) ? Number(result) : 0;
        chunk = [];
        chunkChars = 0;
      };
      for (const member of unique) {
        if (chunk.length > 0 && chunkChars + member.length > maxChars) await flush();
        chunk.push(member);
        chunkChars += member.length;
      }
      await flush();
    }

    return { added, keys };
  }

  /** Approximate distinct count per entity kind. */
  async queryEntityEstimates(
    namespace: string,
    windowId: string,
    kinds: string[]
  ): Promise<Record<string, number>> {
    const entries = await Promise.all(
      kinds.map(async (kind) => [kind, await this.client.pfcount(buildHllEntityKey(namespace, windowId, kind))] as const)
    );
    return Object.fromEntries(entries);
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
