import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FeatureTokenBindingV1Schema = z.object({
  schema: z.literal('atlas.feature-token-binding.v1'),
  tokenIndex: z.number().int().nonnegative(),
  tokenId: z.number().int().nonnegative(),
  tokenText: z.string().nullable(),
  sourceRef: z.string().min(1).nullable(),
  sourceRevision: z.string().min(1).nullable(),
  candidateOrdinal: z.number().int().nonnegative().nullable(),
  byteStart: z.number().int().nonnegative().nullable(),
  byteEnd: z.number().int().nonnegative().nullable(),
  tokenizerRevision: z.string().min(1),
  inputTextChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  bindingRevision: z.string().min(1),
  exactSpan: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.byteStart !== null && value.byteEnd !== null && value.byteEnd < value.byteStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byteEnd'], message: 'BYTE_RANGE_REVERSED' });
  }
});

export const FeatureTokenBindingSetV1Schema = z.object({
  schema: z.literal('atlas.feature-token-binding-set.v1'),
  inputTextChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  tokenizerRevision: z.string().min(1),
  bindings: z.array(FeatureTokenBindingV1Schema),
  bindingChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  canonicalAuthority: z.literal(false),
}).strict();

export type FeatureTokenBindingV1 = z.infer<typeof FeatureTokenBindingV1Schema>;
export type FeatureTokenBindingSetV1 = z.infer<typeof FeatureTokenBindingSetV1Schema>;

export function checksumFeatureTokenBindingsV1(bindings: readonly FeatureTokenBindingV1[]): string {
  const canonical = bindings
    .slice()
    .sort((a, b) => a.tokenIndex - b.tokenIndex)
    .map(({ schema, ...binding }) => binding);
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')}`;
}

