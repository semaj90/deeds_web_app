import type { FeatureMap, FeatureCompileResult } from './feature-map.types.js';

export interface FeatureMapStoreWrites {
  postgresJsonb: {
    table: 'enhanced_graph_mappings';
    row: Record<string, unknown>;
  };
  redisHotKeys: Array<{ key: string; value: string; ttlSeconds: number }>;
  qdrantFeatureSummaryPoint: {
    collection: string;
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  };
  neo4jJsonl: {
    nodes: string[];
    edges: string[];
  };
  couchdbSnapshot: {
    id: string;
    doc: Record<string, unknown>;
  };
}

function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Uint8Array || ArrayBuffer.isView(value)) return Array.from(value as ArrayLike<number>);
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/pointer|native|handle|ptr/i.test(key)) continue;
      const sanitized = toJsonSafe(entry);
      if (typeof sanitized === 'function' || typeof sanitized === 'symbol' || typeof sanitized === 'bigint') continue;
      out[key] = sanitized;
    }
    return out;
  }
  return String(value);
}

function featureVectorFromGlyph(map: FeatureMap): number[] {
  return Array.from(map.glyph.glyph, (n) => (n ?? 0) / 255);
}

export function buildFeatureMapStoreWrites(result: FeatureCompileResult): FeatureMapStoreWrites {
  const map = result.featureMap;
  const safeMap = toJsonSafe(map) as Record<string, unknown>;
  const featureId = map.featureId;
  const vector = featureVectorFromGlyph(map);
  const redisPayload = JSON.stringify({
    featureId,
    featureName: map.featureName,
    tokenEstimate: map.tokenEstimate,
    pathCount: map.sourcePaths.length,
    graphTripleCount: map.graphTriples.length,
    memoryStick: map.memoryStick,
  });

  const postgresJsonb = {
    table: 'enhanced_graph_mappings' as const,
    row: {
      id: featureId,
      kind: 'cluster',
      label: map.featureName,
      path: map.sourcePaths[0] ?? null,
      summary: map.description,
      edges: map.graphEdges.map((edge) => ({
        relation: edge.relation,
        targets: [edge.to],
        confidence: edge.confidence,
        source: edge.source,
      })),
      scores: {
        attentionScore: map.glyph.bits.flags,
        grpoReward: map.memoryStick.rewardSignals[0]?.value ?? 0,
      },
      vectors: {
        encoded64: vector.slice(0, 64),
      },
      metadata: {
        ...safeMap,
        graphTriples: map.graphTriples,
        sourcePaths: map.sourcePaths,
        aceContextPacketDraft: toJsonSafe(map.aceContextPacketDraft),
      },
    },
  };

  return {
    postgresJsonb,
    redisHotKeys: [
      { key: `feature-map:${featureId}`, value: redisPayload, ttlSeconds: 3600 },
      { key: `feature-map:${featureId}:glyph`, value: map.glyph.svg, ttlSeconds: 3600 },
      { key: `feature-map:${featureId}:memory-stick`, value: JSON.stringify(map.memoryStick), ttlSeconds: 3600 },
    ],
    qdrantFeatureSummaryPoint: {
      collection: 'feature_map_summaries',
      id: featureId,
      vector,
      payload: {
        featureId,
        featureName: map.featureName,
        description: map.description,
        pathGroups: map.pathGroups,
        graphTripleCount: map.graphTriples.length,
        tokenEstimate: map.tokenEstimate,
        glyphBits: map.glyph.bits,
      },
    },
    neo4jJsonl: {
      nodes: [
        JSON.stringify({ id: featureId, label: map.featureName, kind: 'feature', tokenEstimate: map.tokenEstimate }),
        ...map.sourcePaths.map((path) => JSON.stringify({ id: path, label: path, kind: 'source-path' })),
      ],
      edges: map.graphTriples.map((triple) => JSON.stringify({ from: triple[0], relation: triple[1], to: triple[2] })),
    },
    couchdbSnapshot: {
      id: featureId,
      doc: {
        featureId,
        featureName: map.featureName,
        featureSlug: map.featureSlug,
        description: map.description,
        sourcePaths: map.sourcePaths,
        pathGroups: map.pathGroups,
        graphTriples: map.graphTriples,
        glyph: {
          bits: map.glyph.bits,
          grid: Array.from(map.glyph.glyph),
          debugText: map.glyph.debugText,
        },
        memoryStick: map.memoryStick,
        tokenEstimate: map.tokenEstimate,
      },
    },
  };
}
