import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from './canonical-hash-v1.js';

const revision = z.string().min(1);

export const PromptPlanSegmentV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  kind: z.enum(['SYSTEM', 'INSTRUCTION', 'EVIDENCE', 'TOOL_SCHEMA', 'USER_QUERY']),
  packetKey: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)),
  contentChecksum: sha256HexSchema,
  tokenCount: z.number().int().nonnegative(),
}).strict();

export type PromptPlanSegmentV1 = z.infer<typeof PromptPlanSegmentV1Schema>;

export const PromptPlanV1Schema = z.object({
  schema: z.literal('atlas.prompt-plan.v1'),
  requestId: z.string().min(1),
  contextManifestChecksum: sha256HexSchema,
  tokenizerRevision: revision,
  promptTemplateRevision: revision,
  instructionRevision: revision,
  segments: z.array(PromptPlanSegmentV1Schema).min(1),
  totalTokens: z.number().int().nonnegative(),
  checksumSha256: sha256HexSchema,
}).strict();

export type PromptPlanV1 = z.infer<typeof PromptPlanV1Schema>;

export function buildPromptPlanV1(input: Omit<PromptPlanV1, 'schema' | 'totalTokens' | 'checksumSha256'>): PromptPlanV1 {
  const segments = input.segments
    .map((segment) => PromptPlanSegmentV1Schema.parse(segment))
    .sort((a, b) => a.ordinal - b.ordinal);

  const ordinals = new Set(segments.map((segment) => segment.ordinal));
  if (ordinals.size !== segments.length) throw new Error('PromptPlanV1 contains duplicate segment ordinals');
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index]?.ordinal !== index) throw new Error(`PromptPlanV1 segment ordinal gap at ${index}`);
  }

  const totalTokens = segments.reduce((sum, segment) => sum + segment.tokenCount, 0);
  const payload = {
    schema: 'atlas.prompt-plan.v1' as const,
    requestId: input.requestId,
    contextManifestChecksum: input.contextManifestChecksum,
    tokenizerRevision: input.tokenizerRevision,
    promptTemplateRevision: input.promptTemplateRevision,
    instructionRevision: input.instructionRevision,
    segments,
    totalTokens,
  };
  const checksumSha256 = createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex');
  return PromptPlanV1Schema.parse({ ...payload, checksumSha256 });
}
