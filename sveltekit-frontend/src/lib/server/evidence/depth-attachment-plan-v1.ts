import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';

const revisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const inputSchema = z.object({
  caseId: z.string().uuid().nullable(),
  evidenceId: z.string().uuid(),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,62}$/i),
  currentSourceRevision: revisionSchema,
  sourceBytes: z.instanceof(Buffer),
  artifactBytes: z.instanceof(Buffer),
  modelId: z.string().min(1).max(256),
  modelRevision: z.union([z.string().regex(/^[a-f0-9]{40}$/i), z.literal('UNVERIFIED')]),
  modelRevisionStatus: z.enum(['VERIFIED', 'UNVERIFIED']),
  modelLicense: z.enum(['Apache-2.0', 'UNVERIFIED']),
  depthType: z.literal('relative_monocular'),
  existingAiAnalysis: z.record(z.string(), z.unknown()).default({}),
}).strict();

export async function createDepthAttachmentPlanV1(input: z.input<typeof inputSchema>) {
  const parsed = inputSchema.parse(input);
  if ((parsed.modelRevisionStatus === 'VERIFIED') !== /^[a-f0-9]{40}$/i.test(parsed.modelRevision)) {
    throw new Error('DEPTH_MODEL_REVISION_STATUS_MISMATCH');
  }
  if (parsed.modelLicense === 'Apache-2.0' && (
    parsed.modelId !== 'depth-anything/Depth-Anything-V2-Small-hf' ||
    parsed.modelRevisionStatus !== 'VERIFIED'
  )) {
    throw new Error('DEPTH_MODEL_LICENSE_CLAIM_UNVERIFIED');
  }
  if (parsed.artifactBytes.length === 0 || parsed.artifactBytes.length > 32 * 1024 * 1024) {
    throw new Error('DEPTH_ARTIFACT_SIZE_INVALID');
  }
  const actualSourceRevision = `sha256:${createHash('sha256').update(parsed.sourceBytes).digest('hex')}`;
  if (actualSourceRevision !== parsed.currentSourceRevision.toLowerCase()) {
    throw new Error('SOURCE_REVISION_MISMATCH');
  }

  const metadata = await sharp(parsed.artifactBytes, { failOn: 'error' }).metadata();
  if (metadata.format !== 'png' || !metadata.width || !metadata.height ||
    metadata.width > 8192 || metadata.height > 8192 || metadata.width * metadata.height > 40_000_000) {
    throw new Error('DEPTH_ARTIFACT_MUST_BE_VALID_PNG');
  }
  await sharp(parsed.artifactBytes, { failOn: 'error' }).raw().toBuffer();
  const depthSha256 = createHash('sha256').update(parsed.artifactBytes).digest('hex');
  const previous = parsed.existingAiAnalysis.depthAnalysis;
  const expectedSourceRevision = parsed.currentSourceRevision.toLowerCase();

  if (previous !== undefined && previous !== null) {
    const previousRecord = typeof previous === 'object' && !Array.isArray(previous)
      ? previous as Record<string, unknown>
      : null;
    if (!previousRecord || previousRecord.depthSha256 !== depthSha256 ||
      previousRecord.sourceRevision !== expectedSourceRevision) {
      throw new Error('EXISTING_DEPTH_METADATA_CONFLICT');
    }
  }

  const key = `evidence/${parsed.caseId ?? 'default'}/${parsed.evidenceId}-depth-${depthSha256}.png`;
  const proposedDepthAnalysis = {
    artifactKind: 'monocular_depth_map_2d',
    is3DReconstruction: false,
    depthMapUrl: `seaweed://${parsed.bucket}/${key}`,
    depthSha256,
    sourceRevision: expectedSourceRevision,
    width: metadata.width,
    height: metadata.height,
    modelId: parsed.modelId,
    modelRevision: parsed.modelRevision,
    modelRevisionStatus: parsed.modelRevisionStatus,
    modelLicense: parsed.modelLicense,
    depthType: parsed.depthType,
  };
  return {
    planOnly: true as const,
    writesPerformed: false as const,
    evidenceId: parsed.evidenceId,
    expectedSourceRevision,
    depthSha256,
    objectKey: key,
    proposedAiAnalysis: {
      ...parsed.existingAiAnalysis,
      depthAnalysis: proposedDepthAnalysis,
    },
    dimensions: { width: metadata.width, height: metadata.height },
  };
}
