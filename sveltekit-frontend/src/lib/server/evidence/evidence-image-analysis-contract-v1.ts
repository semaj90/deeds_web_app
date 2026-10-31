import { z } from 'zod';

export const ALLOWED_IMAGE_EVIDENCE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
] as const;

export const YoloDetectionBoxSchemaV1 = z.object({
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  bboxNormalized: z.tuple([
    z.number().min(0).max(1), // xMin
    z.number().min(0).max(1), // yMin
    z.number().min(0).max(1), // xMax
    z.number().min(0).max(1), // yMax
  ]),
});

export const MonocularDepthMapMetadataSchemaV1 = z.object({
  artifactKind: z.literal('monocular_depth_map_2d'),
  is3DReconstruction: z.literal(false),
  depthObjectKey: z.string().min(1),
  depthSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  modelRevision: z.string().min(1),
});

export const VlmCaptionProposalSchemaV1 = z.object({
  description: z.string().min(1).max(8000),
  extractedSceneText: z.string().default(''),
  modelId: z.string().min(1),
  modelRevision: z.string().min(1),
  proposalOnly: z.literal(true),
  canonicalAuthority: z.literal(false),
});

export const EvidenceImageAnalysisReceiptSchemaV1 = z.object({
  schemaId: z.literal('atlas.evidence-image-analysis.v1'),
  caseId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  sourceRevision: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  mimeType: z.enum(ALLOWED_IMAGE_EVIDENCE_MIMES),
  yoloStatus: z.enum(['EXECUTED', 'MODEL_UNAVAILABLE_SKIPPED', 'FAILED']),
  yoloDetections: z.array(YoloDetectionBoxSchemaV1).default([]),
  vlmStatus: z.enum(['EXECUTED', 'OFFLINE_SKIPPED', 'FAILED']),
  vlmProposal: VlmCaptionProposalSchemaV1.nullable().default(null),
  depthStatus: z.enum(['EXECUTED', 'OFFLINE_SKIPPED', 'FAILED']),
  depthMap: MonocularDepthMapMetadataSchemaV1.nullable().default(null),
  canonicalAuthority: z.literal(false),
});

export type EvidenceImageAnalysisReceiptV1 = z.infer<
  typeof EvidenceImageAnalysisReceiptSchemaV1
>;

export function isSupportedImageEvidenceMime(
  mime: string
): mime is (typeof ALLOWED_IMAGE_EVIDENCE_MIMES)[number] {
  return (ALLOWED_IMAGE_EVIDENCE_MIMES as readonly string[]).includes(
    mime.trim().toLowerCase()
  );
}
