import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createDepthAttachmentPlanV1 } from './depth-attachment-plan-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';
const bucket = 'legal-evidence';
const sourceBytes = Buffer.from('source evidence fixture');
const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;

async function png() {
  return sharp({ create: { width: 3, height: 2, channels: 3, background: '#808080' } }).png().toBuffer();
}

describe('createDepthAttachmentPlanV1', () => {
  it('returns an immutable-key JSON proposal and explicitly performs no writes', async () => {
    const plan = await createDepthAttachmentPlanV1({
      caseId, evidenceId, bucket, currentSourceRevision: sourceRevision, sourceBytes, artifactBytes: await png(),
      modelId: 'depth-anything/Depth-Anything-V2-Large-hf',
      modelRevision: 'UNVERIFIED', modelRevisionStatus: 'UNVERIFIED',
      modelLicense: 'UNVERIFIED', depthType: 'relative_monocular',
      existingAiAnalysis: { keep: { value: true } },
    });
    expect(plan.planOnly).toBe(true);
    expect(plan.writesPerformed).toBe(false);
    expect(plan.dimensions).toEqual({ width: 3, height: 2 });
    expect(plan.objectKey).toMatch(new RegExp(`${evidenceId}-depth-[a-f0-9]{64}\\.png$`));
    expect(plan.proposedAiAnalysis.keep).toEqual({ value: true });
    expect(plan.proposedAiAnalysis.depthAnalysis.modelRevision).toBe('UNVERIFIED');
  });

  it('rejects conflicting existing depth metadata and inconsistent model claims', async () => {
    const artifactBytes = await png();
    await expect(createDepthAttachmentPlanV1({
      caseId, evidenceId, bucket, currentSourceRevision: sourceRevision, sourceBytes, artifactBytes,
      modelId: 'model', modelRevision: 'UNVERIFIED', modelRevisionStatus: 'UNVERIFIED',
      modelLicense: 'UNVERIFIED', depthType: 'relative_monocular',
      existingAiAnalysis: { depthAnalysis: { depthSha256: 'b'.repeat(64) } },
    })).rejects.toThrow('EXISTING_DEPTH_METADATA_CONFLICT');
    await expect(createDepthAttachmentPlanV1({
      caseId, evidenceId, bucket, currentSourceRevision: sourceRevision, sourceBytes, artifactBytes,
      modelId: 'model', modelRevision: 'UNVERIFIED', modelRevisionStatus: 'VERIFIED',
      modelLicense: 'UNVERIFIED', depthType: 'relative_monocular',
    })).rejects.toThrow('DEPTH_MODEL_REVISION_STATUS_MISMATCH');
  });

  it('rejects source bytes that do not match the recorded revision', async () => {
    await expect(createDepthAttachmentPlanV1({
      caseId, evidenceId, bucket, currentSourceRevision: sourceRevision,
      sourceBytes: Buffer.from('different evidence'), artifactBytes: await png(),
      modelId: 'model', modelRevision: 'UNVERIFIED', modelRevisionStatus: 'UNVERIFIED',
      modelLicense: 'UNVERIFIED', depthType: 'relative_monocular',
    })).rejects.toThrow('SOURCE_REVISION_MISMATCH');
  });

  it('accepts Apache provenance only for the Small model with a verified revision', async () => {
    const plan = await createDepthAttachmentPlanV1({
      caseId, evidenceId, bucket, currentSourceRevision: sourceRevision,
      sourceBytes, artifactBytes: await png(),
      modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
      modelRevision: '5426e4f0f36572d16453bbda7a8389317b1bef99',
      modelRevisionStatus: 'VERIFIED', modelLicense: 'Apache-2.0',
      depthType: 'relative_monocular',
    });
    expect(plan.proposedAiAnalysis.depthAnalysis.modelLicense).toBe('Apache-2.0');
  });
});
