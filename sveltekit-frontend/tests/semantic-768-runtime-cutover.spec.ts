// @vitest-environment node
/**
 * SEMANTIC_768_RUNTIME_CUTOVER — patch-boundary tests.
 *
 * Scope: embedding-contract-768.ts, lane-registry.ts, unified-orchestrator.ts,
 * soft-routing-orchestrator.ts, retrieval/dual-lane route. Storage/cache/GPU-buffer
 * changes are a separate, later commit and are NOT covered here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SEMANTIC_REPRESENTATION_ID,
  SEMANTIC_DIMENSION,
  CANONICAL_QDRANT_COLLECTION,
  TOPOLOGY_REPRESENTATIONS,
  assertSemantic768,
  resolveSemanticLane,
} from '../src/lib/server/embedding/embedding-contract-768';
import {
  getActiveSemanticVectorLane,
  getVectorLane,
} from '../src/lib/server/vector/lane-registry';
import { SoftRoutingOrchestrator } from '../src/lib/server/retrieval/soft-routing-orchestrator';
import { gpuRerank, gpuRerankQdrantResults } from '../src/lib/server/retrieval/gpu-reranker';
import { createCuvsSidecarClient } from '../src/lib/server/atlas/retrieval/cuvs-sidecar-client';
import { assertValidRepresentationLineage } from '../src/lib/server/topology/feature-tracking-layer';

describe('embedding-contract-768: canonical constants', () => {
  it('locks the representation id, dimension, and collection', () => {
    expect(SEMANTIC_REPRESENTATION_ID).toBe('semantic_768');
    expect(SEMANTIC_DIMENSION).toBe(768);
    expect(CANONICAL_QDRANT_COLLECTION).toBe('codebase_chunks_768');
  });

  it('exposes latent_128/latent_64 as topology projections, not embedding APIs', () => {
    expect(TOPOLOGY_REPRESENTATIONS).toEqual({ latent_128: 128, latent_64: 64 });
  });
});

describe('assertSemantic768', () => {
  it('accepts a 768-length vector', () => {
    expect(() => assertSemantic768(new Array(768).fill(0))).not.toThrow();
  });

  it('rejects a 384-length vector', () => {
    expect(() => assertSemantic768(new Array(384).fill(0))).toThrow(/SEMANTIC_768_DIMENSION_MISMATCH/);
  });

  it('rejects a 512-length vector (retired MRL experiment lane)', () => {
    expect(() => assertSemantic768(new Array(512).fill(0))).toThrow(/SEMANTIC_768_DIMENSION_MISMATCH/);
  });

  it('rejects latent_64/latent_128 dimensions being passed off as semantic vectors', () => {
    expect(() => assertSemantic768(new Array(64).fill(0))).toThrow(/SEMANTIC_768_DIMENSION_MISMATCH/);
    expect(() => assertSemantic768(new Array(128).fill(0))).toThrow(/SEMANTIC_768_DIMENSION_MISMATCH/);
  });

  it('accepts a Float32Array of length 768', () => {
    expect(() => assertSemantic768(new Float32Array(768))).not.toThrow();
  });
});

describe('resolveSemanticLane: fail-closed lane resolution', () => {
  it('resolves to semantic_768/768 with no input', () => {
    expect(resolveSemanticLane()).toEqual({ representationId: 'semantic_768', dimension: 768 });
  });

  it('resolves to semantic_768/768 when explicitly requested', () => {
    expect(resolveSemanticLane({ representationId: 'semantic_768', dimension: 768 })).toEqual({
      representationId: 'semantic_768',
      dimension: 768,
    });
  });

  it('throws UNSUPPORTED_SEMANTIC_LANE for a 384 dimension request', () => {
    expect(() => resolveSemanticLane({ dimension: 384 })).toThrow(/UNSUPPORTED_SEMANTIC_LANE/);
  });

  it('throws UNSUPPORTED_SEMANTIC_LANE for a legacy representationId', () => {
    expect(() => resolveSemanticLane({ representationId: 'semantic_384' })).toThrow(
      /UNSUPPORTED_SEMANTIC_LANE/,
    );
  });

  it('never silently normalizes a mismatched request back onto the accepted lane', () => {
    // representationId says semantic_768 but dimension says 384 — must fail, not "fix itself"
    expect(() => resolveSemanticLane({ representationId: 'semantic_768', dimension: 384 })).toThrow(
      /UNSUPPORTED_SEMANTIC_LANE/,
    );
  });
});

describe('vector lane registry: semantic vs topology dimension separation', () => {
  it('getActiveSemanticVectorLane returns the 768-dim source lane', () => {
    const lane = getActiveSemanticVectorLane();
    expect(lane.dimension).toBe(768);
    expect(lane.kind).toBe('semantic');
    expect(lane.status).toBe('active');
    expect(lane.collection).toBe('codebase_chunks_768');
  });

  it('the legacy 384 lane remains present but blocked (historical lineage, not deleted)', () => {
    const lane = getVectorLane('retrieval384');
    expect(lane.status).toBe('blocked');
    expect(lane.dimension).toBe(384);
  });

  it('topology lanes (128/64) are distinct from the active semantic lane', () => {
    const topo128 = getVectorLane('topology128');
    const latent64 = getVectorLane('latent64');
    expect(topo128.kind).toBe('topology');
    expect(topo128.dimension).toBe(128);
    expect(latent64.kind).toBe('routing');
    expect(latent64.dimension).toBe(64);
  });
});

describe('SoftRoutingOrchestrator: fail-closed on non-768 query embeddings', () => {
  it('rejects a 384-dim query_embedding before any lane executes', async () => {
    const orchestrator = new SoftRoutingOrchestrator();
    await expect(
      orchestrator.route({
        query_embedding: new Array(384).fill(0),
        query_text: 'test',
        top_k: 5,
      }),
    ).rejects.toThrow(/SEMANTIC_768_DIMENSION_MISMATCH/);
  });

  it('does not reject a well-formed 768-dim query_embedding at the assertion stage', async () => {
    const orchestrator = new SoftRoutingOrchestrator();
    // Downstream lanes may still fail (no live Qdrant/Postgres in this test env) —
    // we only assert the dimension guard itself does not fire.
    try {
      await orchestrator.route({
        query_embedding: new Array(768).fill(0),
        query_text: 'test',
        top_k: 5,
      });
    } catch (err) {
      expect(String(err)).not.toMatch(/SEMANTIC_768_DIMENSION_MISMATCH/);
    }
  });
});

describe('gpu-reranker: fail-closed on non-768 query vectors', () => {
  it('rejects a 384-dim query vector in gpuRerank', async () => {
    const docs = Array.from({ length: 25 }, (_, i) => ({
      documentId: `doc-${i}`,
      content: 'x',
      similarity: 0.5,
      embedding: new Array(384).fill(0.1),
    }));
    await expect(gpuRerank(new Array(384).fill(0.1), docs)).rejects.toThrow(
      /SEMANTIC_768_DIMENSION_MISMATCH/,
    );
  });

  it('rejects a 384-dim query vector in gpuRerankQdrantResults', async () => {
    const results = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      score: 0.5,
      vector: new Array(384).fill(0.1),
    }));
    await expect(gpuRerankQdrantResults(new Array(384).fill(0.1), results)).rejects.toThrow(
      /SEMANTIC_768_DIMENSION_MISMATCH/,
    );
  });

  it('allows the empty-vector passthrough case (no vector, not a wrong-dimension vector)', async () => {
    const docs = [{ documentId: 'a', content: 'x', similarity: 0.9 }];
    const result = await gpuRerank([], docs);
    expect(result.source).toBe('passthrough');
  });
});

describe('cuVS sidecar client: operation-typed semantic vs topology ANN', () => {
  it('rejects a semantic_ann request whose vector length does not match its declared dimension', async () => {
    const client = createCuvsSidecarClient('http://127.0.0.1:1'); // unreachable, irrelevant — validated before fetch
    await expect(
      client.search({
        operation: 'semantic_ann',
        index: 'content768',
        dimension: 768,
        vector: new Array(384).fill(0),
        topK: 10,
      }),
    ).rejects.toThrow(/CUVS_DIMENSION_MISMATCH/);
  });

  it('rejects a topology_ann request whose vector length does not match its declared dimension', async () => {
    const client = createCuvsSidecarClient('http://127.0.0.1:1');
    await expect(
      client.search({
        operation: 'topology_ann',
        index: 'latent64',
        dimension: 64,
        vector: new Array(768).fill(0),
        topK: 10,
      }),
    ).rejects.toThrow(/CUVS_DIMENSION_MISMATCH/);
  });
});

describe('feature-tracking-layer: topology rows never claim latent vectors are semantic embeddings', () => {
  it('accepts an untagged (all-null) packet — pipeline has not tagged it yet', () => {
    expect(() =>
      assertValidRepresentationLineage({
        source_representation_id: null,
        source_dimension: null,
        projection_representation_id: null,
        projection_dimension: null,
      }),
    ).not.toThrow();
  });

  it('accepts a correctly-tagged semantic_768 source', () => {
    expect(() =>
      assertValidRepresentationLineage({
        source_representation_id: 'semantic_768',
        source_dimension: 768,
        projection_representation_id: null,
        projection_dimension: null,
      }),
    ).not.toThrow();
  });

  it('accepts a correctly-tagged latent_64 projection', () => {
    expect(() =>
      assertValidRepresentationLineage({
        source_representation_id: null,
        source_dimension: null,
        projection_representation_id: 'latent_64',
        projection_dimension: 64,
      }),
    ).not.toThrow();
  });

  it('rejects a semantic_768 tag carrying a 384 dimension', () => {
    expect(() =>
      assertValidRepresentationLineage({
        source_representation_id: 'semantic_768',
        source_dimension: 384,
        projection_representation_id: null,
        projection_dimension: null,
      }),
    ).toThrow(/REPRESENTATION_LINEAGE_MISMATCH/);
  });

  it('rejects a latent_64 projection tag carrying dimension 768 (latent mislabeled as semantic)', () => {
    expect(() =>
      assertValidRepresentationLineage({
        source_representation_id: null,
        source_dimension: null,
        projection_representation_id: 'latent_64',
        projection_dimension: 768,
      }),
    ).toThrow(/REPRESENTATION_LINEAGE_MISMATCH/);
  });

  it('rejects an unknown projection_representation_id', () => {
    expect(() =>
      assertValidRepresentationLineage({
        source_representation_id: null,
        source_dimension: null,
        projection_representation_id: 'latent_384',
        projection_dimension: 384,
      }),
    ).toThrow(/REPRESENTATION_LINEAGE_MISMATCH/);
  });
});

describe('unified-orchestrator.ts: no reachable 384 normalization path (static source check)', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../src/lib/server/retrieval/unified-orchestrator.ts'),
    'utf-8',
  );

  it('does not query the blocked codebase_chunks_384_hybrid collection', () => {
    expect(source).not.toContain('codebase_chunks_384_hybrid');
  });

  it('does not request the dense_384 embedding lane', () => {
    expect(source).not.toContain("'dense_384'");
  });

  it('routes semantic lane resolution through the shared resolveSemanticLane contract', () => {
    expect(source).toContain('resolveSemanticLane');
    expect(source).toContain('assertSemantic768');
  });
});

describe('retrieval/dual-lane route: no 384 truncation of the source embedding', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../src/routes/api/retrieval/dual-lane/+server.ts'),
    'utf-8',
  );

  it('does not slice the embedding down to 384 dimensions', () => {
    expect(source).not.toMatch(/slice\(0,\s*384\)/);
  });

  it('validates the embedding through assertSemantic768 before querying Qdrant', () => {
    expect(source).toContain('assertSemantic768');
  });
});
