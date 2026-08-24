import { describe, expect, it } from 'vitest';
import {
  buildEncoderEvaluationReceiptV1,
  buildLatentProjectionReceiptV1,
  buildNeuralEncoderManifestV1,
  buildNeuralPrefillRowV1,
} from './neural-encoder-manifest-v1.js';

const H64 = (fill: string) => fill.repeat(64).slice(0, 64);

describe('NeuralEncoderManifestV1', () => {
  it('pins authority fields to false regardless of caller input', () => {
    const manifest = buildNeuralEncoderManifestV1({
      modelRevision: 'r1',
      datasetRevision: 'd1',
      normalizationRevision: 'n1',
      sourceRevision: 's1',
      featureRevision: 'f1',
      projectionRevision: 'p1',
      inputDimension: 768,
      hiddenDimensions: [256, 128],
      latentDimension: 64,
      architecture: 'nested-ae-768-256-128-64',
      weightChecksums: [H64('a'), H64('a')],
      trainingReceiptChecksum: null,
      producerRevision: 'rev1',
    });
    expect(manifest.canonicalWritesAllowed).toBe(false);
    expect(manifest.onlineTrainingAllowed).toBe(false);
    expect(manifest.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    // Duplicate weight checksums collapse to a stable sorted set.
    expect(manifest.weightChecksums).toEqual([H64('a')]);
  });

  it('is deterministic for identical input', () => {
    const input = {
      modelRevision: 'r1', datasetRevision: 'd1', normalizationRevision: 'n1',
      sourceRevision: 's1', featureRevision: 'f1', projectionRevision: 'p1',
      inputDimension: 768 as const, hiddenDimensions: [256, 128], latentDimension: 64,
      architecture: 'nested-ae-768-256-128-64', weightChecksums: [H64('a')],
      trainingReceiptChecksum: null, producerRevision: 'rev1',
    };
    expect(buildNeuralEncoderManifestV1(input).checksumSha256)
      .toBe(buildNeuralEncoderManifestV1(input).checksumSha256);
  });
});

describe('NeuralPrefillRowV1', () => {
  it('sorts feature/domain/ontology sets without mutating caller input', () => {
    const domainClassifications = ['b', 'a'];
    const row = buildNeuralPrefillRowV1({
      packetKey: 'pk1',
      sourceRef: 'src/foo.ts',
      directoryPath: 'src',
      semanticEmbeddingChecksum: H64('b'),
      featureClassesPresent: ['TOPOLOGY', 'AST'],
      domainClassifications,
      ontologyTupleRefs: ['t2', 't1', 't1'],
      topologyRevision: null,
      sourceRevision: 's1',
      featureRevision: 'f1',
      deterministicRerunChecksum: null,
      producerRevision: 'rev1',
    });
    expect(row.featureClassesPresent).toEqual(['AST', 'TOPOLOGY']);
    expect(row.ontologyTupleRefs).toEqual(['t1', 't2']);
    expect(domainClassifications).toEqual(['b', 'a']); // caller array untouched
  });
});

describe('EncoderEvaluationReceiptV1', () => {
  it('never allows promotionEligible to be set true by a caller', () => {
    const receipt = buildEncoderEvaluationReceiptV1({
      manifestChecksum: H64('c'),
      datasetSplitRevision: 'split1',
      sampleCount: 10,
      excludedCount: 0,
      exclusionReasons: [],
      reconstructionLoss: 0.1,
      retrievalPreservationRecallAtK: 0.9,
      recallK: 10,
      ndcg: 0.8,
      device: 'cpu',
      cpuRtxParityWithinTolerance: null,
      // @ts-expect-error promotionEligible is intentionally not an accepted input field
      promotionEligible: true,
      reasonCodes: ['OK'],
      producerRevision: 'rev1',
    });
    expect(receipt.promotionEligible).toBe(false);
  });
});

describe('LatentProjectionReceiptV1', () => {
  it('never allows overwritesCanonicalSemantic768 to be set true by a caller', () => {
    const receipt = buildLatentProjectionReceiptV1({
      packetKey: 'pk1',
      sourceEmbeddingChecksum: H64('d'),
      manifestChecksum: H64('e'),
      latentDimension: 64,
      truncationMode: 'LEARNED_AUTOENCODER',
      postTruncationRenormalized: true,
      qdrantCollection: null,
      valkeyNamespace: null,
      projectionRevision: 'p1',
      producerRevision: 'rev1',
    });
    expect(receipt.overwritesCanonicalSemantic768).toBe(false);
  });
});
