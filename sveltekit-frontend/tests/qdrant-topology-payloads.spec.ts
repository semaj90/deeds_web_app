// @vitest-environment node
/**
 * qdrant-topology-payloads.spec.ts
 *
 * Tests the payload-building logic in scripts/patch-qdrant-topology-payloads.mjs.
 * Inline helpers mirror the script so we can test without I/O.
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers that mirror patch-qdrant-topology-payloads.mjs ─────────────

interface TopoRow {
  stable_key: string;
  topo_byte: number | null;
  topo_hex: string | null;
  topo_class: string | null;
  manifold4_x: number | null;
  manifold4_y: number | null;
  manifold4_z: number | null;
  manifold4_w: number | null;
  graph_authority_score: number | null;
}

interface ClusterRow {
  qdrant_id: string | number;
  gpu_cluster: number | null;
  som_cluster: number | null;
  som_bmu_row: number | null;
  som_bmu_col: number | null;
}

function buildTopoPayload(r: TopoRow) {
  return {
    topo_byte:           r.topo_byte,
    topo_hex:            r.topo_hex,
    topo_class:          r.topo_class,
    manifold4:           [r.manifold4_x, r.manifold4_y, r.manifold4_z, r.manifold4_w],
    graphAuthorityScore: r.graph_authority_score,
  };
}

function buildClusterPayload(r: ClusterRow) {
  return {
    som_cluster: r.som_cluster,
    gpu_cluster: r.gpu_cluster,
    som_bmu_row: r.som_bmu_row,
    som_bmu_col: r.som_bmu_col,
  };
}

function mergePayloads(
  topoPayload: ReturnType<typeof buildTopoPayload> | null,
  clusterPayload: ReturnType<typeof buildClusterPayload> | null,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(topoPayload ?? {}), ...(clusterPayload ?? {}) };

  // Derive glyph_cluster from topo_class + som_cluster (deterministic label)
  const topoClass  = merged.topo_class  ?? null;
  const somCluster = merged.som_cluster ?? null;
  if (topoClass !== null || somCluster !== null) {
    merged.glyph_cluster = `${topoClass ?? 'unknown'}:${somCluster ?? 'na'}`;
  }

  // Strip nulls
  for (const k of Object.keys(merged)) {
    if (merged[k] === null || merged[k] === undefined) delete merged[k];
  }
  return merged;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildTopoPayload', () => {
  it('maps all topo fields from cache row', () => {
    const row: TopoRow = {
      stable_key: 'src/lib/server/ai/llm.ts',
      topo_byte: 42, topo_hex: '2a', topo_class: 'ai',
      manifold4_x: 0.1, manifold4_y: 0.2, manifold4_z: 0.3, manifold4_w: 0.4,
      graph_authority_score: 0.75,
    };
    const p = buildTopoPayload(row);
    expect(p.topo_byte).toBe(42);
    expect(p.topo_hex).toBe('2a');
    expect(p.topo_class).toBe('ai');
    expect(p.manifold4).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(p.graphAuthorityScore).toBe(0.75);
  });
});

describe('buildClusterPayload', () => {
  it('maps som_cluster and gpu_cluster from codebase_chunk_index row', () => {
    const row: ClusterRow = { qdrant_id: '123', gpu_cluster: 5, som_cluster: 12, som_bmu_row: 3, som_bmu_col: 7 };
    const p = buildClusterPayload(row);
    expect(p.som_cluster).toBe(12);
    expect(p.gpu_cluster).toBe(5);
    expect(p.som_bmu_row).toBe(3);
    expect(p.som_bmu_col).toBe(7);
  });

  it('handles null cluster_id gracefully', () => {
    const row: ClusterRow = { qdrant_id: '456', gpu_cluster: null, som_cluster: null, som_bmu_row: null, som_bmu_col: null };
    const p = buildClusterPayload(row);
    expect(p.som_cluster).toBeNull();
    expect(p.gpu_cluster).toBeNull();
  });
});

describe('mergePayloads — glyph_cluster derivation', () => {
  it('derives glyph_cluster from topo_class + som_cluster', () => {
    const topo    = buildTopoPayload({ stable_key: 'f', topo_byte: 1, topo_hex: '01', topo_class: 'gpu', manifold4_x: 0, manifold4_y: 0, manifold4_z: 0, manifold4_w: 0, graph_authority_score: null });
    const cluster = buildClusterPayload({ qdrant_id: '1', gpu_cluster: 3, som_cluster: 7, som_bmu_row: 1, som_bmu_col: 2 });
    const merged  = mergePayloads(topo, cluster);
    expect(merged.glyph_cluster).toBe('gpu:7');
  });

  it('falls back to "unknown" topo_class when missing', () => {
    const topo    = buildTopoPayload({ stable_key: 'f', topo_byte: null, topo_hex: null, topo_class: null, manifold4_x: null, manifold4_y: null, manifold4_z: null, manifold4_w: null, graph_authority_score: null });
    const cluster = buildClusterPayload({ qdrant_id: '2', gpu_cluster: null, som_cluster: 5, som_bmu_row: null, som_bmu_col: null });
    const merged  = mergePayloads(topo, cluster);
    expect(merged.glyph_cluster).toBe('unknown:5');
  });

  it('falls back to "na" som_cluster when missing', () => {
    const topo = buildTopoPayload({ stable_key: 'f', topo_byte: 0, topo_hex: '00', topo_class: 'ace', manifold4_x: null, manifold4_y: null, manifold4_z: null, manifold4_w: null, graph_authority_score: null });
    const merged = mergePayloads(topo, null);
    expect(merged.glyph_cluster).toBe('ace:na');
  });

  it('does not set glyph_cluster if both topo_class and som_cluster are absent', () => {
    const topo = buildTopoPayload({ stable_key: 'f', topo_byte: null, topo_hex: null, topo_class: null, manifold4_x: null, manifold4_y: null, manifold4_z: null, manifold4_w: null, graph_authority_score: null });
    const merged = mergePayloads(topo, null);
    expect(merged.glyph_cluster).toBeUndefined();
  });

  it('glyph_cluster is deterministic for same inputs', () => {
    const topo    = buildTopoPayload({ stable_key: 'f', topo_byte: 5, topo_hex: '05', topo_class: 'retrieval', manifold4_x: 0, manifold4_y: 0, manifold4_z: 0, manifold4_w: 0, graph_authority_score: 0.5 });
    const cluster = buildClusterPayload({ qdrant_id: '9', gpu_cluster: 2, som_cluster: 3, som_bmu_row: 0, som_bmu_col: 1 });
    const m1 = mergePayloads(topo, cluster);
    const m2 = mergePayloads(topo, cluster);
    expect(m1.glyph_cluster).toBe(m2.glyph_cluster);
    expect(m1.glyph_cluster).toBe('retrieval:3');
  });

  it('preserves existing topo fields in merged payload', () => {
    const topo    = buildTopoPayload({ stable_key: 'f', topo_byte: 10, topo_hex: '0a', topo_class: 'db', manifold4_x: 0.1, manifold4_y: 0.2, manifold4_z: 0.3, manifold4_w: 0.4, graph_authority_score: 0.9 });
    const cluster = buildClusterPayload({ qdrant_id: '7', gpu_cluster: 1, som_cluster: 4, som_bmu_row: 2, som_bmu_col: 3 });
    const merged  = mergePayloads(topo, cluster);
    expect(merged.topo_byte).toBe(10);
    expect(merged.topo_hex).toBe('0a');
    expect(merged.topo_class).toBe('db');
    expect(merged.manifold4).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(merged.graphAuthorityScore).toBe(0.9);
    expect(merged.som_cluster).toBe(4);
    expect(merged.gpu_cluster).toBe(1);
  });
});

describe('mergePayloads — null stripping', () => {
  it('strips null values so existing Qdrant payload is not overwritten with null', () => {
    const topo    = buildTopoPayload({ stable_key: 'f', topo_byte: null, topo_hex: null, topo_class: null, manifold4_x: null, manifold4_y: null, manifold4_z: null, manifold4_w: null, graph_authority_score: null });
    const cluster = buildClusterPayload({ qdrant_id: '8', gpu_cluster: null, som_cluster: null, som_bmu_row: null, som_bmu_col: null });
    const merged  = mergePayloads(topo, cluster);
    for (const v of Object.values(merged)) {
      expect(v).not.toBeNull();
    }
  });
});

describe('mergePayloads — dry-run contract', () => {
  it('mergePayloads is pure (no Qdrant side effects)', () => {
    // The merge function performs no I/O — safe to call in dry-run mode.
    const topo = buildTopoPayload({ stable_key: 'f', topo_byte: 1, topo_hex: '01', topo_class: 'mcp', manifold4_x: 0, manifold4_y: 0, manifold4_z: 0, manifold4_w: 0, graph_authority_score: null });
    expect(() => mergePayloads(topo, null)).not.toThrow();
  });

  it('result contains som_cluster and glyph_cluster when cluster row is present', () => {
    const topo    = buildTopoPayload({ stable_key: 'f', topo_byte: 3, topo_hex: '03', topo_class: 'mcp', manifold4_x: 0, manifold4_y: 0, manifold4_z: 0, manifold4_w: 0, graph_authority_score: null });
    const cluster = buildClusterPayload({ qdrant_id: '10', gpu_cluster: 1, som_cluster: 8, som_bmu_row: 0, som_bmu_col: 0 });
    const merged  = mergePayloads(topo, cluster);
    expect('som_cluster' in merged).toBe(true);
    expect('glyph_cluster' in merged).toBe(true);
  });
});
