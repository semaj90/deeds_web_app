import { describe, expect, it } from 'vitest';
import {
  compileContextualAlignmentEnvelopeV1,
  consolidateSupersededAnalysisPassesV1,
  runCouchDbMapReduceConsolidationV1,
} from './contextual-alignment-compiler-v1.js';

describe('Contextual Alignment Compiler V1 (Bitset + TensorHandleV1 4x4x6 + MsgPack BYTEA + CouchDB MapReduce + Supersession + YOLOX/DepthAnything/SAM2 VLM)', () => {
  it('consolidates superseded analysis passes deterministically across both success and succeeded vocabulary with (createdAt DESC, id DESC) tiebreak', () => {
    const out = consolidateSupersededAnalysisPassesV1([
      {
        id: 8045,
        packetKey: 'packet:fb1a78fd2216',
        sourceRevision: 'sha256:' + 'a'.repeat(64),
        passType: 'summarization',
        passRevision: 'v1',
        inputHash: '113562',
        status: 'success',
        createdAtIso: '2026-06-30T10:00:00.000Z',
        outputSummary: 'older summary',
      },
      {
        id: 8257,
        packetKey: 'packet:fb1a78fd2216',
        sourceRevision: 'sha256:' + 'a'.repeat(64),
        passType: 'summarization',
        passRevision: 'v1',
        inputHash: '113562',
        status: 'succeeded',
        createdAtIso: '2026-11-20T03:11:49.000Z',
        outputSummary: 'newer summary lower id',
      },
      {
        id: 8258,
        packetKey: 'packet:fb1a78fd2216',
        sourceRevision: 'sha256:' + 'a'.repeat(64),
        passType: 'summarization',
        passRevision: 'v1',
        inputHash: '113562',
        status: 'succeeded',
        createdAtIso: '2026-11-20T03:11:49.000Z',
        outputSummary: 'newest summary winning tiebreak',
      },
      {
        id: 9001,
        packetKey: 'packet:fb1a78fd2216',
        sourceRevision: 'sha256:' + 'a'.repeat(64),
        passType: 'summarization',
        passRevision: 'v1',
        inputHash: '113562',
        status: 'failed',
        createdAtIso: '2026-11-21T00:00:00.000Z',
        outputSummary: 'failed pass excluded',
      },
    ]);

    expect(out.currentPasses).toHaveLength(1);
    expect(out.currentPasses[0].id).toBe(8258);
    expect(out.supersededPassIds).toEqual([8045, 8257]);
    expect(out.excludedFailedCount).toBe(1);
  });

  it('runs CouchDB MapReduce link_matrix, degree, and power-iteration PageRank consolidation', () => {
    const mr = runCouchDbMapReduceConsolidationV1([
      {
        _id: 'src/routes/api/ai/agent/+server.ts',
        type: 'codebase_file',
        imports: [
          'src/lib/server/atlas/go-retrieval-grpc-client.ts',
          'src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts',
        ],
        supersedes: ['src/routes/api/v1/legacy-agent/+server.ts'],
      },
      {
        _id: 'src/lib/server/atlas/go-retrieval-grpc-client.ts',
        type: 'codebase_file',
        imports: ['src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts'],
      },
    ]);

    expect(mr.linkMatrixEdges).toHaveLength(3);
    expect(mr.inDegree['src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts']).toBe(2);
    expect(
      mr.pagerankScores['src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts'],
    ).toBeGreaterThan(mr.pagerankScores['src/routes/api/ai/agent/+server.ts']);
    expect(mr.supersededDocIds).toEqual(['src/routes/api/v1/legacy-agent/+server.ts']);
  });

  it('compiles a full ACP/A2A contextual alignment envelope combining ATLASBIT bitset, THV1 4x4x6 tile, MsgPack BYTEA, CouchDB MapReduce, supersession, and YOLOX/DepthAnything/SAM2 VLM observations', () => {
    const env = compileContextualAlignmentEnvelopeV1({
      packetKey: 'ace:packet:31954764ce55',
      sourceRef: 'sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.svelte',
      candidateOrdinal: 42,
      kmeansClusterId: 3,
      somBmuId: 127,
      activeDomainBitIndices: [0, 3, 7, 15, 64, 128, 255],
      tileValues96: Float32Array.from({ length: 96 }, (_, i) => (i % 6) * 0.25 + (i % 16) * 0.05),
      affine2x3: [1.5, 0, 10, 0, 1.5, -4],
      latent64: Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.1)),
      manifold4d: [0.25, -0.5, 0.75, 1.0],
      vlmObservation: {
        evidenceId: '11111111-2222-4333-8444-555555555555',
        sourceRevision: 'sha256:' + '1'.repeat(64),
        workspaceRevision: 'sha256:' + '2'.repeat(64),
        yoloxDetections: [
          {
            className: 'person',
            confidence: 0.94,
            bboxNormalized: [0.12, 0.18, 0.44, 0.88],
          },
          {
            className: 'car',
            confidence: 0.87,
            bboxNormalized: [0.52, 0.35, 0.91, 0.79],
          },
        ],
        depthAnythingV2: {
          modelRevision: 'depth-anything-v2-small-hf',
          depthSha256: 'sha256:' + '3'.repeat(64),
          width: 1280,
          height: 720,
          depthType: 'relative_monocular',
          device: 'cuda',
        },
        sam2Silhouettes: [
          {
            maskSha256: 'sha256:' + '4'.repeat(64),
            iouScore: 0.96,
            device: 'cuda',
          },
        ],
        vlmSynthesisSummary:
          'Curfew beach scene screenshot with 2 YOLOX detections, Depth Anything V2 relative monocular map, and SAM 2 silhouette mask.',
      },
      passHistory: [
        {
          id: 101,
          packetKey: 'ace:packet:31954764ce55',
          sourceRevision: 'sha256:' + '1'.repeat(64),
          passType: 'vlm_screenshot',
          passRevision: 'v1',
          inputHash: 'abc',
          status: 'success',
          createdAtIso: '2026-11-20T00:00:00.000Z',
          outputSummary: 'initial vlm pass',
        },
        {
          id: 102,
          packetKey: 'ace:packet:31954764ce55',
          sourceRevision: 'sha256:' + '1'.repeat(64),
          passType: 'vlm_screenshot',
          passRevision: 'v1',
          inputHash: 'abc',
          status: 'succeeded',
          createdAtIso: '2026-11-22T00:00:00.000Z',
          outputSummary: 'updated vlm pass with sam2 mask',
        },
      ],
      couchDocs: [
        {
          _id: 'curfew-beach-scene/+page.svelte',
          type: 'codebase_file',
          imports: ['scene-runtime-three-v1.ts'],
        },
      ],
    });

    expect(env.schema).toBe('atlas.contextual-alignment-compiler-envelope.v1');
    expect(env.canonicalAuthority).toBe(false);
    expect(env.writesPerformed).toBe(false);
    expect(env.persistsRawKvOrTensors).toBe(false);
    expect(env.bitsetAlignment.magic).toBe('ATLASBIT');
    expect(env.bitsetAlignment.totalByteLength).toBe(128);
    expect(env.bitsetAlignment.popcount).toBe(7);
    expect(env.bitsetAlignment.roundTripJaccard).toBe(1);
    expect(env.tensorHandle4x4x6Alignment.magic).toBe('THV1');
    expect(env.tensorHandle4x4x6Alignment.totalByteLength).toBe(160);
    expect(env.tensorHandle4x4x6Alignment.mode7CenterWorld).toEqual([13, -1]);
    expect(env.msgpackAlignment.fp16LatentByteLength).toBe(128);
    expect(env.msgpackAlignment.fp32ManifoldByteLength).toBe(16);
    expect(env.msgpackAlignment.packetKeySurvived).toBe(true);
    expect(env.msgpackAlignment.summarySurvived).toBe(true);
    expect(env.supersessionConsolidation.currentPassIds).toEqual([102]);
    expect(env.supersessionConsolidation.supersededPassIds).toEqual([101]);
    expect(env.screenshotVlmObservation.yoloxDetectionCount).toBe(2);
    expect(env.screenshotVlmObservation.depthAnythingStatus).toBe('ESTIMATED');
    expect(env.screenshotVlmObservation.sam2SilhouetteCount).toBe(1);
    expect(env.envelopeChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
