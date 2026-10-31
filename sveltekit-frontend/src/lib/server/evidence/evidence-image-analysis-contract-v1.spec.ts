import { describe, expect, it } from 'vitest';
import { executeBoundedImageAnalysisV1 } from './process-evidence-document-v1.js';

const VALID_SHA256 = 'a'.repeat(64);
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';

describe('EvidenceImageAnalysisReceiptSchemaV1 & executeBoundedImageAnalysisV1', () => {
  it('1. validates YOLO detections, VLM proposal, and 2D monocular depth map without claiming 3D reconstruction', async () => {
    const receipt = await executeBoundedImageAnalysisV1(
      {
        caseId: CASE_ID,
        evidenceId: EVIDENCE_ID,
        sourceRevision: 'rev-001',
        sourceSha256: VALID_SHA256,
        mimeType: 'image/png',
        imageBytes: new Uint8Array([137, 80, 78, 71]),
      },
      {
        runYoloDetections: async () => ({
          status: 'EXECUTED',
          detections: [{ label: 'document_seal', confidence: 0.94, bboxNormalized: [0.1, 0.2, 0.4, 0.5] }],
        }),
        runVlmAnalysis: async () => ({
          status: 'EXECUTED',
          proposal: {
            description: 'Signed contract page with notary stamp',
            extractedSceneText: 'EXHIBIT A - NOTARIZED',
            modelId: 'ornith-vlm-1.5',
            modelRevision: 'sha256:beef',
          },
        }),
        runMonocularDepth: async () => ({
          status: 'EXECUTED',
          depthMap: {
            depthObjectKey: 'depth/2222.png',
            depthSha256: 'b'.repeat(64),
            width: 512,
            height: 512,
            modelRevision: 'depth-anything-v2-small',
          },
        }),
      }
    );

    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.vlmProposal?.proposalOnly).toBe(true);
    expect(receipt.depthMap?.artifactKind).toBe('monocular_depth_map_2d');
    expect(receipt.depthMap?.is3DReconstruction).toBe(false);
  });

  it('2. degrades gracefully when YOLO model or VLM/depth services are offline', async () => {
    const receipt = await executeBoundedImageAnalysisV1(
      {
        caseId: CASE_ID,
        evidenceId: EVIDENCE_ID,
        sourceRevision: 'rev-002',
        sourceSha256: VALID_SHA256,
        mimeType: 'image/jpeg',
        imageBytes: new Uint8Array([255, 216, 255]),
      },
      {}
    );

    expect(receipt.yoloStatus).toBe('MODEL_UNAVAILABLE_SKIPPED');
    expect(receipt.vlmStatus).toBe('OFFLINE_SKIPPED');
    expect(receipt.depthStatus).toBe('OFFLINE_SKIPPED');
    expect(receipt.depthMap).toBeNull();
  });

  it('3. rejects non-image MIME types fail-closed', async () => {
    await expect(
      executeBoundedImageAnalysisV1(
        {
          caseId: CASE_ID,
          evidenceId: EVIDENCE_ID,
          sourceRevision: 'rev-003',
          sourceSha256: VALID_SHA256,
          mimeType: 'application/pdf',
          imageBytes: new Uint8Array([37, 80, 68, 70]),
        },
        {}
      )
    ).rejects.toThrow(/UNSUPPORTED_IMAGE_EVIDENCE_MIME/);
  });
});
