import { describe, expect, it } from 'vitest';

import type { ArtifactAddressV1 } from './artifact-work-item-v1.js';
import {
  isReferenceOnlyVectorEnvelope,
  materializeVectorArtifactQueueEnvelope,
  resolveVectorArtifactQueueEnvelope,
  vectorEnvelopeByteLength,
} from './vector-artifact-transport-v1.js';

const address: ArtifactAddressV1 = {
  schema: 'atlas.artifact-address.v1',
  artifactId: 'sha256:artifact-1234567890',
  artifactHash: 'a'.repeat(64),
  schemaId: 'atlas.legacy-vector-index-input.v1',
  checksum: 'b'.repeat(64),
  revisionSetHash: 'c'.repeat(64),
  revisions: { transport: 'artifact-ref-v1', producer: 'test-v1' },
  locator: {
    storage: 'POSTGRES',
    table: 'workflow_artifacts',
    primaryKey: 'sha256:artifact-1234567890',
  },
};

describe('vector artifact transport v1', () => {
  it('materializes the vector but keeps the queue envelope reference-only', async () => {
    const seen: number[][] = [];
    const envelope = await materializeVectorArtifactQueueEnvelope(
      {
        documentId: 'doc-1',
        embedding: [0.25, -0.5, 0.75],
        collection: 'legal_documents',
        metadata: { language: 'en' },
      },
      {
        producerRevision: 'test-v1',
        materialize: async (opts) => {
          seen.push(opts.embedding);
          return address;
        },
      },
    );

    expect(seen).toEqual([[0.25, -0.5, 0.75]]);
    expect(envelope.documentId).toBe('doc-1');
    expect(envelope.artifactRef).toEqual(address);
    expect(isReferenceOnlyVectorEnvelope(envelope)).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain('embedding');
    expect(vectorEnvelopeByteLength(envelope)).toBeLessThan(2048);
  });

  it('resolves the artifact only at the consumer boundary', async () => {
    const envelope = await materializeVectorArtifactQueueEnvelope(
      {
        documentId: 'doc-2',
        embedding: [1, 2, 3],
        collection: 'evidence_items',
        metadata: { evidenceKind: 'document' },
      },
      { producerRevision: 'test-v1', materialize: async () => address },
    );

    const payload = await resolveVectorArtifactQueueEnvelope(envelope, {
      read: async () => ({
        documentId: 'doc-2',
        embedding: [1, 2, 3],
        collection: 'evidence_items',
        metadata: { evidenceKind: 'document' },
      }),
    });

    expect(payload.embedding).toEqual([1, 2, 3]);
  });

  it('fails closed when envelope identity disagrees with the artifact', async () => {
    const envelope = await materializeVectorArtifactQueueEnvelope(
      {
        documentId: 'doc-3',
        embedding: [1],
        collection: 'legal_documents',
        metadata: {},
      },
      { producerRevision: 'test-v1', materialize: async () => address },
    );

    await expect(
      resolveVectorArtifactQueueEnvelope(envelope, {
        read: async () => ({
          documentId: 'different-doc',
          embedding: [1],
          collection: 'legal_documents',
          metadata: {},
        }),
      }),
    ).rejects.toThrow('document identity mismatch');
  });
});
