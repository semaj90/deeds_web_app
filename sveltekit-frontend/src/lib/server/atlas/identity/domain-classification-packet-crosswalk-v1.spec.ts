import { describe, expect, it, vi } from 'vitest';
import type { DomainClassificationV1 } from '../contracts/okf-cross-domain-v1.js';
import {
  resolveDomainClassificationPacketCrosswalkV1,
  type DomainClassificationPacketRowV1,
} from './domain-classification-packet-crosswalk-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;

function proposal(overrides: Partial<DomainClassificationV1> = {}): DomainClassificationV1 {
  return {
    schemaVersion: 'atlas.okf.domain-classification.v1',
    classificationId: 'classification:1',
    subjectRef: 'symbol:stable-1',
    subjectKind: 'symbol',
    domainId: 'retrieval',
    taxonomyRevision: 'taxonomy:v1',
    confidence: 0.9,
    evidenceRefs: ['repo:src/search.ts'],
    sourceRevision,
    producerId: 'domain-taxonomy:rules',
    producerRevision: 'rules:v1',
    lifecycle: 'DERIVED',
    ...overrides,
  };
}

function packet(overrides: Partial<DomainClassificationPacketRowV1> = {}): DomainClassificationPacketRowV1 {
  return {
    packet_key: 'packet:storage-1',
    source_ref: 'repo:src/search.ts',
    source_revision: sourceRevision,
    workspace_revision_key: workspaceRevision,
    ...overrides,
  };
}

function resolvePacketKey(packetKey: string) {
  return Promise.resolve({
    canonicalPacketKey: 'pkt:canonical-1',
    storagePacketKey: packetKey,
    resolutionSource: 'V2_DIRECT' as const,
    aliasEvidenceVersion: null,
  });
}

describe('resolveDomainClassificationPacketCrosswalkV1', () => {
  it('matches exact source, source revision, workspace revision, and canonical packet identity without admission', async () => {
    const result = await resolveDomainClassificationPacketCrosswalkV1({
      rows: [proposal()],
      packetRows: [packet()],
      workspaceRevision,
      resolvePacketKey,
    });

    expect(result).toMatchObject({
      status: 'MATCHED_NOT_ADMITTED',
      canonicalAuthority: false,
      evidenceAdmission: false,
      persistenceAuthorized: false,
      writesPerformed: false,
      rows: [{ packetKey: 'packet:storage-1', canonicalPacketKey: 'pkt:canonical-1', status: 'MATCHED_NOT_ADMITTED' }],
    });
  });

  it('blocks stale source or workspace revisions', async () => {
    const result = await resolveDomainClassificationPacketCrosswalkV1({
      rows: [proposal()],
      packetRows: [packet({ source_revision: `sha256:${'c'.repeat(64)}` })],
      workspaceRevision,
      resolvePacketKey,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.rows[0]?.status).toBe('SOURCE_REVISION_MISMATCH');
  });

  it('blocks ambiguous packet rows and refuses unresolved packet aliases', async () => {
    const ambiguous = await resolveDomainClassificationPacketCrosswalkV1({
      rows: [proposal()],
      packetRows: [packet(), packet({ packet_key: 'packet:storage-2' })],
      workspaceRevision,
      resolvePacketKey,
    });
    expect(ambiguous.rows[0]?.status).toBe('AMBIGUOUS_PACKET_MATCH');

    const unresolved = await resolveDomainClassificationPacketCrosswalkV1({
      rows: [proposal()],
      packetRows: [packet()],
      workspaceRevision,
      resolvePacketKey: async () => { throw new Error('NO_CANONICAL_ALIAS'); },
    });
    expect(unresolved.rows[0]?.status).toBe('PACKET_IDENTITY_UNRESOLVED');
  });

  it('rejects duplicate classification identities and never calls the packet resolver for absent rows', async () => {
    const resolver = vi.fn(resolvePacketKey);
    await expect(resolveDomainClassificationPacketCrosswalkV1({
      rows: [proposal(), proposal()],
      packetRows: [packet()],
      workspaceRevision,
      resolvePacketKey: resolver,
    })).rejects.toThrow('DOMAIN_CLASSIFICATION_CROSSWALK_DUPLICATE_CLASSIFICATION_ID');

    const missing = await resolveDomainClassificationPacketCrosswalkV1({
      rows: [proposal()],
      packetRows: [],
      workspaceRevision,
      resolvePacketKey: resolver,
    });
    expect(missing.rows[0]?.status).toBe('PACKET_NOT_FOUND');
  });
});
