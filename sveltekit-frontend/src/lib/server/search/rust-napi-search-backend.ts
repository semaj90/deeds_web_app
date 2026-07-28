/**
 * Rust N-API Search Backend — ANN candidate generation via native module
 *
 * Loads a frozen slot manifest and delegates vector search to the Rust N-API module.
 * Returns normalized candidates with packet_key resolved from slot manifest.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  SearchBackend,
  SearchBackendCandidate,
  SearchBackendHealth,
  SearchBackendRequest,
  SearchBackendResult,
  SearchFilter,
} from './search-backend.js';
import {
  type RustSlotManifest,
  type RustSlotManifestRow,
  RustSlotManifestSchema,
  validateRustSlotManifest,
} from './rust-slot-manifest.js';

// Import native module (will fail gracefully if not compiled)
let nativeModule: any = null;
try {
  // eslint-disable-next-line global-require,@typescript-eslint/no-var-requires
  nativeModule = require('../../gpu/turbovec-napi/index.js');
} catch {
  // Native module not available; backend will report unhealthy
}

export class RustNapiSearchBackend implements SearchBackend {
  readonly kind = 'rust_napi' as const;

  private readonly bySlot: Map<number, RustSlotManifestRow>;
  private readonly manifest: RustSlotManifest;

  constructor(manifestPath: string) {
    const absolutePath = path.resolve(manifestPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Rust slot manifest not found: ${absolutePath}`);
    }

    const rawManifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    const manifest = RustSlotManifestSchema.parse(rawManifest);

    const validation = validateRustSlotManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Rust slot manifest validation failed:\n${validation.errors.join('\n')}`);
    }

    this.manifest = manifest;
    this.bySlot = new Map();

    for (const row of manifest.rows) {
      this.bySlot.set(row.slot, row);
    }
  }

  async health(): Promise<SearchBackendHealth> {
    if (!nativeModule) {
      return {
        healthy: false,
        indexVersion: null,
        details: { error: 'Native module not loaded' },
      };
    }

    return {
      healthy: true,
      indexVersion: this.manifest.indexVersion,
      details: {
        vectorCount: this.bySlot.size,
        manifestRows: this.bySlot.size,
        dimensions: this.manifest.dimensions,
        vectorName: this.manifest.vectorName,
        schemaVersion: this.manifest.schemaVersion,
      },
    };
  }

  async search(request: SearchBackendRequest): Promise<SearchBackendResult> {
    const started = performance.now();
    const warnings: string[] = [];

    // Validate request dimensions
    if (!nativeModule) {
      return {
        backend: this.kind,
        vectorName: request.vectorName,
        candidates: [],
        durationMs: performance.now() - started,
        visitedCount: null,
        indexVersion: null,
        warnings: ['Native module not loaded; no candidates returned'],
      };
    }

    if (request.queryVector.length !== this.manifest.dimensions) {
      return {
        backend: this.kind,
        vectorName: request.vectorName,
        candidates: [],
        durationMs: performance.now() - started,
        visitedCount: null,
        indexVersion: this.manifest.indexVersion,
        warnings: [
          `Dimension mismatch: expected ${this.manifest.dimensions}, got ${request.queryVector.length}`,
        ],
      };
    }

    // Build allowed slots from filter
    const allowedSlots = this.buildAllowedSlots(request.filter);

    // Call native ANN search
    let nativeResult: any;
    try {
      nativeResult = nativeModule.searchAnn({
        vector: request.queryVector,
        topK: request.limit * (request.candidateMultiplier ?? 1),
        vectorName: request.vectorName,
        allowedSlots,
        efSearch: 64, // HNSW search parameter
        probes: 0, // Reserved for PQ/IVF
      });
    } catch (err) {
      warnings.push(`Native search failed: ${err instanceof Error ? err.message : String(err)}`);
      return {
        backend: this.kind,
        vectorName: request.vectorName,
        candidates: [],
        durationMs: performance.now() - started,
        visitedCount: null,
        indexVersion: this.manifest.indexVersion,
        warnings,
      };
    }

    // Resolve candidates from native results
    const candidates: SearchBackendCandidate[] = [];
    for (const hit of nativeResult.hits) {
      const identity = this.bySlot.get(hit.slot);
      if (!identity) {
        warnings.push(`Missing slot manifest row for slot ${hit.slot}`);
        continue;
      }

      candidates.push({
        candidateId: `rust:${hit.slot}`,
        packetKey: identity.packetKey,
        featureId: identity.featureId,
        treeNodeId: identity.treeNodeId,
        sourceRef: identity.sourceRef,
        contentHash: identity.contentHash,
        workspaceRevision: identity.workspaceRevision,
        rawScore: hit.score,
        distance: hit.distance ?? null,
        backend: this.kind,
        vectorName: request.vectorName,
        payload: request.includePayload
          ? {
              slot: hit.slot,
              artifactKind: identity.artifactKind,
              domainIds: identity.domainIds,
              embeddingModelVersion: identity.embeddingModelVersion,
            }
          : undefined,
      });
    }

    // Sort by score descending, limit to requested count
    candidates.sort((a, b) => b.rawScore - a.rawScore);
    candidates.splice(request.limit);

    return {
      backend: this.kind,
      vectorName: request.vectorName,
      candidates,
      durationMs: performance.now() - started,
      visitedCount: nativeResult.visitedCount ?? null,
      indexVersion: nativeResult.indexVersion ?? this.manifest.indexVersion,
      embeddingModelVersion:
        candidates[0]?.payload?.embeddingModelVersion ??
        (this.manifest.rows[0]?.embeddingModelVersion || null),
      warnings,
    };
  }

  async close(): Promise<void> {
    // Native module has no explicit cleanup in current implementation
  }

  private buildAllowedSlots(filter: SearchFilter | undefined): Uint32Array | undefined {
    if (!filter) {
      return undefined;
    }

    const slots: number[] = [];

    for (const row of this.bySlot.values()) {
      // Filter by workspace revision
      if (filter.workspaceRevision && row.workspaceRevision !== filter.workspaceRevision) {
        continue;
      }

      // Filter by packet keys (allowlist)
      if (filter.packetKeys && filter.packetKeys.length > 0) {
        if (!filter.packetKeys.includes(row.packetKey)) {
          continue;
        }
      }

      // Filter by feature IDs (allowlist)
      if (filter.featureIds && filter.featureIds.length > 0) {
        if (!row.featureId || !filter.featureIds.includes(row.featureId)) {
          continue;
        }
      }

      // Filter by source ref prefixes
      if (filter.sourceRefPrefixes && filter.sourceRefPrefixes.length > 0) {
        if (!filter.sourceRefPrefixes.some((prefix) => row.sourceRef.startsWith(prefix))) {
          continue;
        }
      }

      // Filter by artifact kinds (allowlist)
      if (filter.artifactKinds && filter.artifactKinds.length > 0) {
        if (!filter.artifactKinds.includes(row.artifactKind)) {
          continue;
        }
      }

      // Filter by domain IDs
      if (filter.domainIds && filter.domainIds.length > 0) {
        const rowDomains = row.domainIds.split(',').map((d) => d.trim());
        if (!filter.domainIds.some((domain) => rowDomains.includes(domain))) {
          continue;
        }
      }

      slots.push(row.slot);
    }

    return slots.length > 0 ? Uint32Array.from(slots) : undefined;
  }
}
