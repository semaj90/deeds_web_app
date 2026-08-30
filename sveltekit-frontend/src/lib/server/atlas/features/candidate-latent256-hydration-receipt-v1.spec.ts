import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import {
  buildCandidateLatent256HydrationReceiptV1,
  type CandidateLatent256HydrationObservationV1,
} from './candidate-latent256-hydration-receipt-v1.js';

const H = (char: string) => char.repeat(64);

function ordinalMap() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:test:v1',
    workspaceRevision: `sha256:${H('a')}`,
    producerRevision: 'candidate-map:test:v1',
    candidates: [
      {
        canonicalId: 'packet:a',
        packetKey: 'packet:a',
        sourceRef: 'src/a.ts',
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision: `sha256:${H('a')}`,
        sourceRevision: `sha256:${H('b')}`,
        graphRevision: null,
        semanticRevision: 'semantic:test:v1',
        degradedIdentity: false,
        evidenceRefs: ['fixture:a'],
        representationBindings: [
          {
            representationId: 'semantic_768',
            family: 'EMBEDDINGGEMMA_MRL',
            dimensions: 768,
            modelRevision: 'semantic:test:v1',
            projectionKind: 'NONE',
            sourceRepresentationId: null,
            projectionRevision: null,
            normalized: true,
            available: true,
            availabilityReason: null,
          },
          {
            representationId: 'latent_256',
            family: 'LEARNED_LATENT',
            dimensions: 256,
            modelRevision: 'nested-ae:test:v1',
            projectionKind: 'LEARNED_AUTOENCODER',
            sourceRepresentationId: 'semantic_768',
            projectionRevision: 'checkpoint:test:v1',
            normalized: true,
            available: true,
            availabilityReason: null,
          },
        ],
      },
      {
        canonicalId: 'packet:b',
        packetKey: 'packet:b',
        sourceRef: 'src/b.ts',
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision: `sha256:${H('a')}`,
        sourceRevision: `sha256:${H('c')}`,
        graphRevision: null,
        semanticRevision: 'semantic:test:v1',
        degradedIdentity: false,
        evidenceRefs: ['fixture:b'],
        representationBindings: [
          {
            representationId: 'semantic_768',
            family: 'EMBEDDINGGEMMA_MRL',
            dimensions: 768,
            modelRevision: 'semantic:test:v1',
            projectionKind: 'NONE',
            sourceRepresentationId: null,
            projectionRevision: null,
            normalized: true,
            available: true,
            availabilityReason: null,
          },
        ],
      },
    ],
  });
}

function vector(value: number): number[] {
  return Array.from({ length: 256 }, () => value);
}

function observation(
  candidateOrdinal: number,
  overrides: Partial<CandidateLatent256HydrationObservationV1> = {},
): CandidateLatent256HydrationObservationV1 {
  const map = ordinalMap();
  const candidate = map.candidates[candidateOrdinal]!;
  return {
    candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    codebaseChunkId: candidateOrdinal === 0
      ? '7252a838-1e9b-445a-8abd-0d5ad413567d'
      : 'bec6f7b7-0a45-42e6-b7f9-0d7d16e39383',
    exactIdentityMapping: true,
    observedCheckpointRevision: 'checkpoint:test:v1',
    vector: vector(candidateOrdinal === 0 ? 0.125 : 0.25),
    ...overrides,
  };
}

describe('CandidateLatent256HydrationReceiptV1', () => {
  it('binds CandidateOrdinal to an explicit exact codebase chunk id and deterministic F32LE checksum', () => {
    const map = ordinalMap();
    const receipt = buildCandidateLatent256HydrationReceiptV1({
      ordinalMap: map,
      representationRevision: 'latent256:test:v1',
      checkpointRevision: 'checkpoint:test:v1',
      producerRevision: 'latent256-hydration:test:v1',
      observations: [observation(0), observation(1)],
    });

    expect(receipt.rowCount).toBe(2);
    expect(receipt.availableCount).toBe(2);
    expect(receipt.identityUnresolvedCount).toBe(0);
    expect(receipt.rows[0]?.codebaseChunkId).toBe('7252a838-1e9b-445a-8abd-0d5ad413567d');
    expect(receipt.rows[0]?.vectorChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);

    const replay = buildCandidateLatent256HydrationReceiptV1({
      ordinalMap: map,
      representationRevision: 'latent256:test:v1',
      checkpointRevision: 'checkpoint:test:v1',
      producerRevision: 'latent256-hydration:test:v1',
      observations: [observation(0), observation(1)],
    });
    expect(replay.mappingChecksum).toBe(receipt.mappingChecksum);
    expect(replay.vectorsChecksum).toBe(receipt.vectorsChecksum);
    expect(replay.receiptChecksum).toBe(receipt.receiptChecksum);
  });

  it('fails closed on guessed identity, wrong revision, missing vectors, and invalid shape without inventing a score', () => {
    const receipt = buildCandidateLatent256HydrationReceiptV1({
      ordinalMap: ordinalMap(),
      representationRevision: 'latent256:test:v1',
      checkpointRevision: 'checkpoint:test:v1',
      producerRevision: 'latent256-hydration:test:v1',
      observations: [
        observation(0, {
          exactIdentityMapping: false,
          codebaseChunkId: null,
        }),
        observation(1, {
          observedCheckpointRevision: 'checkpoint:other:v1',
        }),
      ],
    });

    expect(receipt.availableCount).toBe(0);
    expect(receipt.identityUnresolvedCount).toBe(1);
    expect(receipt.revisionMismatchCount).toBe(1);
    expect(receipt.rows.every((row) => row.vectorChecksum === null)).toBe(true);
  });

  it('rejects an observation that does not match the CandidateOrdinal identity', () => {
    expect(() => buildCandidateLatent256HydrationReceiptV1({
      ordinalMap: ordinalMap(),
      representationRevision: 'latent256:test:v1',
      checkpointRevision: 'checkpoint:test:v1',
      producerRevision: 'latent256-hydration:test:v1',
      observations: [
        observation(0, { packetKey: 'packet:wrong' }),
        observation(1),
      ],
    })).toThrow('LATENT256_OBSERVATION_IDENTITY_MISMATCH:0:packetKey');
  });
});
