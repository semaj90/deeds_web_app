/**
 * Search Backend Factory — Select ANN backend by environment
 *
 * Creates the appropriate backend (Qdrant, TurboVec, or Rust N-API) based on configuration.
 * All backends conform to the SearchBackend interface.
 */

import type { SearchBackend } from './search-backend.js';
import type { SearchBackendKind } from './search-backend.js';
import { RustNapiSearchBackend } from './rust-napi-search-backend.js';

// Stub implementations for Qdrant and TurboVec (to be wired from existing code)
class QdrantSearchBackend implements SearchBackend {
  readonly kind = 'qdrant' as const;
  constructor(_config: { url: string; collection: string }) {}
  async health() {
    return { healthy: false, indexVersion: null, details: { status: 'not_implemented' } };
  }
  async search() {
    return {
      backend: this.kind,
      vectorName: 'dense_768' as const,
      candidates: [],
      durationMs: 0,
      visitedCount: null,
      indexVersion: null,
      warnings: ['Qdrant backend not yet implemented'],
    };
  }
  async close() {}
}

class TurboVecSearchBackend implements SearchBackend {
  readonly kind = 'turbovec' as const;
  constructor(_config: { baseUrl: string }) {}
  async health() {
    return { healthy: false, indexVersion: null, details: { status: 'not_implemented' } };
  }
  async search() {
    return {
      backend: this.kind,
      vectorName: 'dense_768' as const,
      candidates: [],
      durationMs: 0,
      visitedCount: null,
      indexVersion: null,
      warnings: ['TurboVec backend not yet implemented'],
    };
  }
  async close() {}
}

export interface SearchBackendConfig {
  kind: SearchBackendKind;
  qdrant?: { url: string; collection: string };
  turbovec?: { baseUrl: string };
  rustNapi?: { manifestPath: string };
}

export function createCodebaseSearchBackend(config: SearchBackendConfig): SearchBackend {
  switch (config.kind) {
    case 'qdrant': {
      if (!config.qdrant) {
        throw new Error('Missing Qdrant backend configuration');
      }
      return new QdrantSearchBackend(config.qdrant);
    }

    case 'turbovec': {
      if (!config.turbovec) {
        throw new Error('Missing TurboVec backend configuration');
      }
      return new TurboVecSearchBackend(config.turbovec);
    }

    case 'rust_napi': {
      if (!config.rustNapi) {
        throw new Error('Missing Rust N-API backend configuration');
      }
      return new RustNapiSearchBackend(config.rustNapi.manifestPath);
    }

    default: {
      const exhaustive: never = config.kind;
      throw new Error(`Unsupported search backend: ${exhaustive}`);
    }
  }
}

/**
 * Create backend from environment variables
 */
export function createCodebaseSearchBackendFromEnv(): SearchBackend {
  const backendKind = (process.env.CODEBASE_SEARCH_BACKEND || 'qdrant') as SearchBackendKind;

  return createCodebaseSearchBackend({
    kind: backendKind,
    rustNapi:
      backendKind === 'rust_napi'
        ? {
            manifestPath: process.env.RUST_ANN_MANIFEST || 'artifacts/rust-ann-slot-manifest.json',
          }
        : undefined,
    qdrant:
      backendKind === 'qdrant'
        ? {
            url: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
            collection: process.env.QDRANT_COLLECTION || 'codebase_chunks_768',
          }
        : undefined,
    turbovec:
      backendKind === 'turbovec'
        ? {
            baseUrl: process.env.TURBOVEC_URL || 'http://127.0.0.1:8791',
          }
        : undefined,
  });
}
