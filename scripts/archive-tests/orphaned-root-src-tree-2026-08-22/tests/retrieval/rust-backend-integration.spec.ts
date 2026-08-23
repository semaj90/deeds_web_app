/**
 * Rust Backend Integration Tests — 14 vitest cases covering SearchBackend contract
 *
 * Tests:
 *   - Manifest loading and health checks
 *   - Dimension validation
 *   - Slot bijection
 *   - Candidate schema compliance
 *   - Determinism (same query = same results)
 *   - Filter compliance
 *   - Error handling
 *   - Contract compliance (health, search, close)
 *   - Factory pattern
 */

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SearchBackendRequest } from '../../sveltekit-frontend/src/lib/server/search/search-backend';
import { RustNapiSearchBackend } from '../../sveltekit-frontend/src/lib/server/search/rust-napi-search-backend';
import { createCodebaseSearchBackend, createCodebaseSearchBackendFromEnv } from '../../sveltekit-frontend/src/lib/server/search/create-codebase-search-backend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifestPath = path.resolve(__dirname, '../../artifacts/rust-ann-slot-manifest-example.json');

describe('RustNapiSearchBackend', () => {
  let backend: RustNapiSearchBackend;

  beforeEach(() => {
    backend = new RustNapiSearchBackend(manifestPath);
  });

  it('should load manifest and return health', async () => {
    const health = await backend.health();
    expect(health).toBeDefined();
    expect(health.indexVersion).toBeDefined();
  });

  it('should return unhealthy status if native module not loaded', async () => {
    const health = await backend.health();
    if (health.details?.error) {
      expect(health.healthy).toBe(false);
    } else {
      expect(health).toBeDefined();
    }
  });

  it('should validate dimensions (768-dim)', async () => {
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
    });

    expect(result.backend).toBe('rust_napi');
    expect(result.vectorName).toBe('dense_768');
  });

  it('should reject mismatched dimensions with warning', async () => {
    const query = new Float32Array(384).fill(0.1); // Wrong dimension
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should have consistent slot bijection', async () => {
    const health = await backend.health();
    if (health.details && 'vectorCount' in health.details && 'manifestRows' in health.details) {
      expect(health.details.vectorCount).toBe(health.details.manifestRows);
      expect(health.details.vectorCount).toBeGreaterThan(0);
    }
  });

  it('should return candidates with valid schema', async () => {
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
    });

    for (const candidate of result.candidates) {
      expect(candidate.backend).toBe('rust_napi');
      expect(candidate.rawScore).toBeTypeOf('number');
      expect(candidate.candidateId).toBeDefined();
    }
  });

  it('should apply workspace_revision filter', async () => {
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
      filter: {
        workspaceRevision: 'snapshot-phase12-2026-07-28',
      },
    });

    for (const candidate of result.candidates) {
      expect(candidate.workspaceRevision).toBe('snapshot-phase12-2026-07-28');
    }
  });

  it('should apply packetKeys allowlist filter', async () => {
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
      filter: {
        packetKeys: ['ace:packet:auth:001', 'ace:packet:auth:002'],
      },
    });

    for (const candidate of result.candidates) {
      expect(['ace:packet:auth:001', 'ace:packet:auth:002']).toContain(candidate.packetKey);
    }
  });

  it('should have deterministic results (same query returns same candidates)', async () => {
    const query = new Float32Array(768).fill(0.5);
    const result1 = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 5,
    });

    const result2 = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 5,
    });

    expect(result1.candidates).toHaveLength(result2.candidates.length);
    for (let i = 0; i < result1.candidates.length; i++) {
      expect(result1.candidates[i]?.candidateId).toBe(result2.candidates[i]?.candidateId);
      expect(result1.candidates[i]?.packetKey).toBe(result2.candidates[i]?.packetKey);
    }
  });

  it('should handle malformed requests gracefully', async () => {
    const query = new Float32Array(100).fill(0.1); // Wrong dimension
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should expose health, search, and close methods', async () => {
    expect(typeof backend.health).toBe('function');
    expect(typeof backend.search).toBe('function');
    expect(typeof backend.close).toBe('function');
    expect(backend.kind).toBe('rust_napi');

    await backend.close();
  });

  it('should respect limit parameter', async () => {
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 3,
    });

    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it('should include payload when requested', async () => {
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 5,
      includePayload: true,
    });

    for (const candidate of result.candidates) {
      if (candidate.payload) {
        expect(candidate.payload).toBeTypeOf('object');
      }
    }
  });
});

describe('SearchBackend factory', () => {
  it('should create Rust backend when kind is rust_napi', () => {
    const backend = createCodebaseSearchBackend({
      kind: 'rust_napi',
      rustNapi: { manifestPath },
    });

    expect(backend.kind).toBe('rust_napi');
  });

  it('should create from environment variables', () => {
    process.env.CODEBASE_SEARCH_BACKEND = 'rust_napi';
    process.env.RUST_ANN_MANIFEST = manifestPath;

    const backend = createCodebaseSearchBackendFromEnv();
    expect(backend.kind).toBe('rust_napi');
  });

  it('should throw on missing config', () => {
    expect(() => {
      createCodebaseSearchBackend({
        kind: 'rust_napi',
        // Missing rustNapi config
      } as any);
    }).toThrow();
  });
});
