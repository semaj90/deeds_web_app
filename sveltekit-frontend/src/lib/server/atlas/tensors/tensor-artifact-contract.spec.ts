import { describe, expect, it } from 'vitest';
import {
  assertSemanticCentroidRoutingManifest,
  assertSemanticSnapshotManifest,
  type SemanticCentroidRoutingManifest,
  type SemanticSnapshotManifest,
} from './tensor-artifact-contract.js';

const validSnapshot: SemanticSnapshotManifest = {
  schemaVersion: 'atlas.semantic-snapshot.v1',
  snapshotId: 'snapshot:semantic_768:r1',
  workspaceRevision: 'workspace:r1',
  sourceRevision: 'source:r1',
  representationId: 'semantic_768',
  representationRevision: 'semantic_768:v1',
  ordinalMapRevision: 'ordinal:r1',
  dimension: 768,
  dtype: 'float32',
  vectorCount: 2,
  identityDigest: 'sha256:identities',
  vectorDigest: 'sha256:vectors',
  artifactPath: 'semantic_768_r1.arrow',
  artifactFormat: 'arrow-ipc',
  producer: 'parent-atlas.snapshot-builder',
  producerRevision: 'builder:r1',
  createdAt: '2026-08-14T00:00:00.000Z',
};

const validRouting: SemanticCentroidRoutingManifest = {
  schemaVersion: 'atlas.semantic-centroid-routing.v1',
  routingId: 'routing:semantic_768:r1:k64',
  snapshotId: validSnapshot.snapshotId,
  workspaceRevision: validSnapshot.workspaceRevision,
  representationRevision: validSnapshot.representationRevision,
  ordinalMapRevision: validSnapshot.ordinalMapRevision,
  routingRevision: 'routing:r1',
  algorithm: 'kmeans',
  k: 64,
  dimension: 768,
  vectorCount: validSnapshot.vectorCount,
  centroidCount: 64,
  seed: 'seed:atlas:r1',
  assignmentDigest: 'sha256:assignments',
  centroidDigest: 'sha256:centroids',
  producer: 'parent-atlas.kmeans-router',
  producerRevision: 'router:r1',
  createdAt: validSnapshot.createdAt,
};

describe('SemanticSnapshotManifest', () => {
  it('accepts revisioned float32 semantic_768 metadata', () => {
    expect(() => assertSemanticSnapshotManifest(validSnapshot)).not.toThrow();
  });

  it('rejects representation or dimension drift', () => {
    expect(() => assertSemanticSnapshotManifest({ ...validSnapshot, representationId: 'jina_code_768' as 'semantic_768' })).toThrow(
      'semantic snapshot representation mismatch',
    );
    expect(() => assertSemanticSnapshotManifest({ ...validSnapshot, dimension: 64 as 768 })).toThrow(
      'semantic snapshot representation mismatch',
    );
  });

  it('requires ordinal-map lineage and digests', () => {
    expect(() => assertSemanticSnapshotManifest({ ...validSnapshot, ordinalMapRevision: '' })).toThrow(
      'semantic snapshot revision required',
    );
    expect(() => assertSemanticSnapshotManifest({ ...validSnapshot, vectorDigest: '' })).toThrow(
      'semantic snapshot provenance required',
    );
  });
});

describe('SemanticCentroidRoutingManifest', () => {
  it('accepts revisioned KMeans routing metadata derived from semantic_768', () => {
    expect(() => assertSemanticCentroidRoutingManifest(validRouting)).not.toThrow();
  });

  it('rejects centroid count or representation drift', () => {
    expect(() => assertSemanticCentroidRoutingManifest({ ...validRouting, centroidCount: 63 })).toThrow(
      'centroid count must equal k',
    );
    expect(() => assertSemanticCentroidRoutingManifest({ ...validRouting, dimension: 64 as 768 })).toThrow(
      'centroid routing representation mismatch',
    );
  });

  it('requires revisioned provenance and bounded routing configuration', () => {
    expect(() => assertSemanticCentroidRoutingManifest({ ...validRouting, routingRevision: '' })).toThrow(
      'centroid routing lineage required',
    );
    expect(() => assertSemanticCentroidRoutingManifest({ ...validRouting, k: 32 as 64 })).toThrow(
      'unsupported centroid routing configuration',
    );
  });
});
