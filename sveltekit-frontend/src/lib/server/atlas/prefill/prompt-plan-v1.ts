import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from './canonical-hash-v1.js';

const revision = z.string().min(1);
export const LLAMA_SERVER_CONTEXT_LIMIT_TOKENS = 65_536;
export const DEFAULT_RESERVED_OUTPUT_TOKENS = 8_192;
export const DEFAULT_MAX_INPUT_TOKENS = LLAMA_SERVER_CONTEXT_LIMIT_TOKENS - DEFAULT_RESERVED_OUTPUT_TOKENS;

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
  contextLimitTokens: z.number().int().positive().default(LLAMA_SERVER_CONTEXT_LIMIT_TOKENS),
  reservedOutputTokens: z.number().int().nonnegative().default(DEFAULT_RESERVED_OUTPUT_TOKENS),
  maxInputTokens: z.number().int().nonnegative().default(DEFAULT_MAX_INPUT_TOKENS),
  checksumSha256: sha256HexSchema,
}).strict().superRefine((value, ctx) => {
  if (value.reservedOutputTokens + value.maxInputTokens > value.contextLimitTokens) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxInputTokens'],
      message: 'maxInputTokens plus reservedOutputTokens must fit within contextLimitTokens',
    });
  }
  if (value.totalTokens > value.maxInputTokens) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['totalTokens'],
      message: 'PromptPlanV1 totalTokens exceeds its admitted input budget',
    });
  }
});

export type PromptPlanV1 = z.infer<typeof PromptPlanV1Schema>;

type PromptPlanV1BuildInput = Omit<z.input<typeof PromptPlanV1Schema>, 'schema' | 'totalTokens' | 'checksumSha256'>;

export function buildPromptPlanV1(input: PromptPlanV1BuildInput): PromptPlanV1 {
  const segments = input.segments
    .map((segment) => PromptPlanSegmentV1Schema.parse(segment))
    .sort((a, b) => a.ordinal - b.ordinal);

  const ordinals = new Set(segments.map((segment) => segment.ordinal));
  if (ordinals.size !== segments.length) throw new Error('PromptPlanV1 contains duplicate segment ordinals');
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index]?.ordinal !== index) throw new Error(`PromptPlanV1 segment ordinal gap at ${index}`);
  }

  const totalTokens = segments.reduce((sum, segment) => sum + segment.tokenCount, 0);
  const contextLimitTokens = input.contextLimitTokens ?? LLAMA_SERVER_CONTEXT_LIMIT_TOKENS;
  const reservedOutputTokens = input.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS;
  const maxInputTokens = input.maxInputTokens ?? contextLimitTokens - reservedOutputTokens;
  if (reservedOutputTokens + maxInputTokens > contextLimitTokens) {
    throw new Error('PromptPlanV1 budget exceeds contextLimitTokens');
  }
  if (totalTokens > maxInputTokens) {
    throw new Error(`PromptPlanV1 totalTokens ${totalTokens} exceeds maxInputTokens ${maxInputTokens}`);
  }
  const payload = {
    schema: 'atlas.prompt-plan.v1' as const,
    requestId: input.requestId,
    contextManifestChecksum: input.contextManifestChecksum,
    tokenizerRevision: input.tokenizerRevision,
    promptTemplateRevision: input.promptTemplateRevision,
    instructionRevision: input.instructionRevision,
    segments,
    totalTokens,
    contextLimitTokens,
    reservedOutputTokens,
    maxInputTokens,
  };
  const checksumSha256 = createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex');
  return PromptPlanV1Schema.parse({ ...payload, checksumSha256 });
}
