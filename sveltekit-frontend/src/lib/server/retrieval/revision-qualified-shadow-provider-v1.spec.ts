import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../atlas/features/canonical-candidate-v1.js';
import { createChunkRetrievalProfileV2 } from '../atlas/retrieval/chunk-retrieval-profile-v2.js';
import {
  resolveRevisionQualifiedShadowSourcesV1,
  type CanonicalShadowProvidersV1,
} from './revision-qualified-shadow-provider-v1.js';

const sourceBytes = new TextEncoder().encode('export const café = "ok";');
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const sourceRevision = `sha256:${sha256(sourceBytes)}`;
const workspaceRevision = `sha256:${'a'.repeat(64)}`;

function fixture() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot:r1',
    workspaceRevision,
    producerRevision: 'candidate-map:r1',
    candidates: [{
      canonicalId: 'symbol:one',
      packetKey: 'packet:one',
      sourceRef: 'src/one.ts',
      treeNodeId: null,
      symbolVersionId: 'symbol-version:one',
      workspaceRevision,
      sourceRevision,
      graphRevision: 'graph:r1',
      semanticRevision: 'semantic_768:r1',
      degradedIdentity: false,
      evidenceRefs: ['evidence:one'],
      representationBindings: [],
    }],
  });
  const candidate = ordinalMap.candidates[0]!;
  const startByte = new TextEncoder().encode('export const ').length;
  const endByte = sourceBytes.length;
  const spanBytes = sourceBytes.subarray(startByte, endByte);
  const profile = createChunkRetrievalProfileV2({
    schemaVersion: 'atlas.chunk-retrieval-profile.v2',
    canonicalChunkId: 'chunk:one',
    chunkRowId: '11111111-1111-4111-8111-111111111111',
    packetKey: 'packet:one',
    repositoryId: 'repo:root',
    repositoryRelativePath: 'src/one.ts',
    sourceIdentityKey: 'repo:root:src/one.ts',
    sourceRef: 'src/one.ts',
    workspaceRevision,
    sourceRevision,
    lexicalStructural: { language: 'typescript', symbolName: 'café' },
    revisions: { featureRevision: 'features:r1', graphRevision: 'graph:r1' },
    evidenceRefs: ['evidence:one'],
  });
  const providerSnapshot = {
    ordinalMap,
    candidates: [{
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalCandidateId: candidate.canonicalId,
      packetKey: candidate.packetKey!,
      sourceRef: candidate.sourceRef!,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
      expectedContentSha256: sha256(sourceBytes),
      startByte,
      endByte,
      expectedSpanSha256: sha256(spanBytes),
    }],
  };
  const providers: CanonicalShadowProvidersV1 = {
    loadSnapshot: async () => providerSnapshot,
    readSource: async () => sourceBytes,
    loadProfile: async () => profile,
    loadSupplement: async () => ({
      packetKey: 'packet:one',
      retrievalFrequency: 0.2,
      executionUtility: 0.3,
      processFit: 0.4,
      featureRevision: 'features:r1',
      producerRevisions: {
        retrievalFrequency: 'frequency:r1',
        executionUtility: 'utility:r1',
        processFit: 'process:r1',
      },
      evidenceRefs: ['evidence:one'],
    }),
  };
  return { ordinalMap, providerSnapshot, providers, profile, candidate };
}

const request = {
  requestId: 'request:one',
  workspaceRevision,
  packets: [{ packet_key: 'packet:one' }],
};

describe('revision-qualified shadow source provider v1', () => {
  it('uses the canonical ordinal-map integrity verifier and remains not admitted', async () => {
    const { providers } = fixture();
    const result = await resolveRevisionQualifiedShadowSourcesV1(request, providers);
    expect(result.status).toBe('SOURCE_VERIFIED_NOT_ADMITTED');
    expect(result.admission).toBe('NOT_PERFORMED');
    expect(result.rows?.profiles).toHaveLength(1);
  });

  it('rejects a tampered ordinal map instead of trusting a boolean callback', async () => {
    const { providers, ordinalMap } = fixture();
    const tampered = { ...ordinalMap, ordinalMapChecksum: 'f'.repeat(64) };
    const result = await resolveRevisionQualifiedShadowSourcesV1(request, {
      ...providers,
      loadSnapshot: async () => ({ ...fixture().providerSnapshot, ordinalMap: tampered }),
    });
    expect(result).toMatchObject({ status: 'UNAVAILABLE', reason: 'CANONICAL_OWNER_READ_FAILED' });
  });

  it('rejects request workspace mismatch and duplicate packet identity', async () => {
    const { providers } = fixture();
    await expect(resolveRevisionQualifiedShadowSourcesV1({
      ...request, workspaceRevision: `sha256:${'b'.repeat(64)}`,
    }, providers)).resolves.toMatchObject({ status: 'UNAVAILABLE' });
    await expect(resolveRevisionQualifiedShadowSourcesV1({
      ...request, packets: [...request.packets, ...request.packets],
    }, providers)).resolves.toMatchObject({ status: 'UNAVAILABLE', reason: 'DUPLICATE_PACKET_IDENTITY' });
  });

  it('rejects stale bytes and UTF-8 spans that split a multibyte character', async () => {
    const { providers, providerSnapshot } = fixture();
    const stale = await resolveRevisionQualifiedShadowSourcesV1(request, {
      ...providers, readSource: async () => new TextEncoder().encode('changed'),
    });
    expect(stale).toMatchObject({ status: 'UNAVAILABLE', reason: 'SOURCE_CONTENT_DIGEST_MISMATCH' });

    const binding = providerSnapshot.candidates[0]!;
    const split = {
      ...providerSnapshot,
      candidates: [{ ...binding, startByte: sourceBytes.indexOf(0xc3) + 1 }],
    };
    const invalidBoundary = await resolveRevisionQualifiedShadowSourcesV1(request, {
      ...providers, loadSnapshot: async () => split,
    });
    expect(invalidBoundary).toMatchObject({ status: 'UNAVAILABLE', reason: 'UTF8_SPAN_BOUNDARY_INVALID' });
  });

  it('rejects missing or mismatched feature revisions without substituting producer revisions', async () => {
    const { providers } = fixture();
    const result = await resolveRevisionQualifiedShadowSourcesV1(request, {
      ...providers,
      loadSupplement: async () => ({
        packetKey: 'packet:one', retrievalFrequency: 0.2, executionUtility: 0.3,
        processFit: 0.4, featureRevision: 'producer:r1',
        producerRevisions: {
          retrievalFrequency: 'frequency:r1', executionUtility: 'utility:r1', processFit: 'process:r1',
        }, evidenceRefs: ['evidence:one'],
      }),
    });
    expect(result).toMatchObject({ status: 'UNAVAILABLE', reason: 'SUPPLEMENT_LINEAGE_MISSING' });
  });

  it('rejects three producer revisions with incorrect producer identities', async () => {
    const { providers } = fixture();
    const result = await resolveRevisionQualifiedShadowSourcesV1(request, {
      ...providers,
      loadSupplement: async () => ({
        packetKey: 'packet:one', retrievalFrequency: 0.2, executionUtility: 0.3,
        processFit: 0.4, featureRevision: 'features:r1',
        producerRevisions: {
          retrievalFrequency: 'frequency:r1', executionUtility: 'utility:r1', unrelated: 'other:r1',
        }, evidenceRefs: ['evidence:one'],
      }),
    });
    expect(result).toMatchObject({ status: 'UNAVAILABLE', reason: 'SUPPLEMENT_LINEAGE_MISSING' });
  });

  it('rejects incomplete profiles and bad profile checksums', async () => {
    const { providers, profile } = fixture();
    const noProfile = await resolveRevisionQualifiedShadowSourcesV1(request, {
      ...providers, loadProfile: async () => null,
    });
    expect(noProfile).toMatchObject({ status: 'UNAVAILABLE' });
    const tampered = await resolveRevisionQualifiedShadowSourcesV1(request, {
      ...providers, loadProfile: async () => ({ ...profile, checksum: 'f'.repeat(64) }),
    });
    expect(tampered).toMatchObject({ status: 'UNAVAILABLE', reason: 'PROFILE_INVALID' });
  });
});
