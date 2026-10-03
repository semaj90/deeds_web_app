import { createHash } from 'node:crypto';
import { z } from 'zod';

const identitySchema = z.object({
  source_ref: z.string().min(1),
  source_revision: z.string().min(1),
  workspace_revision: z.string().min(1),
}).strict();

const tokenAssertionSchema = z.object({
  text: z.string().min(1),
  lemma: z.string(),
  pos: z.string().min(1),
  tag: z.string(),
  dependency: z.string(),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().positive(),
}).strict().refine((value) => value.end_byte > value.start_byte, 'POS_TOKEN_SPAN_EMPTY_OR_REVERSED');

export const posTextEvidenceV1Schema = z.object({
  schema: z.literal('atlas.pos-text-evidence.v1'),
  identity: identitySchema,
  region_kind: z.enum(['COMMENT', 'DOCSTRING', 'MARKDOWN', 'NATURAL_LANGUAGE_IDENTIFIER']),
  region_start_byte: z.number().int().nonnegative(),
  region_end_byte: z.number().int().positive(),
  region_digest: z.string().regex(/^[a-f0-9]{64}$/),
  provider: z.literal('spacy'),
  provider_revision: z.string().min(1),
  coordinate_basis: z.literal('UTF8_BYTES'),
  tokens: z.array(tokenAssertionSchema),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonical_authority: z.literal(false),
}).strict().refine((value) => value.region_end_byte > value.region_start_byte, {
  message: 'POS_REGION_SPAN_EMPTY_OR_REVERSED',
});

export type PosTextEvidenceV1 = z.infer<typeof posTextEvidenceV1Schema>;

/**
 * Bind existing :8095 linguistic-pass tokens to caller-identified natural-language
 * spans. Offsets are UTF-8 bytes in the original source; this function never
 * infers the region kind, identity, or taxonomy and never persists output.
 */
export function buildPosTextEvidenceV1(input: {
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  source_bytes: Uint8Array;
  region_kind: PosTextEvidenceV1['region_kind'];
  region_start_byte: number;
  region_end_byte: number;
  provider: string;
  provider_revision: string;
  coordinate_basis: string;
  tokens: readonly z.input<typeof tokenAssertionSchema>[];
}): PosTextEvidenceV1 {
  const identity = identitySchema.parse({
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    workspace_revision: input.workspace_revision,
  });
  if (input.provider !== 'spacy') throw new Error('POS_PROVIDER_NOT_SUPPORTED');
  if (input.coordinate_basis !== 'UTF8_BYTES') throw new Error('POS_COORDINATE_BASIS_UNSUPPORTED');
  if (!input.provider_revision.trim() || /^(unknown|latest)$/i.test(input.provider_revision.trim())) {
    throw new Error('POS_PROVIDER_REVISION_NOT_IMMUTABLE');
  }
  const regionStart = input.region_start_byte;
  const regionEnd = input.region_end_byte;
  if (!Number.isInteger(regionStart) || !Number.isInteger(regionEnd) || regionStart < 0 || regionEnd <= regionStart || regionEnd > input.source_bytes.byteLength) {
    throw new Error('POS_REGION_SPAN_OUT_OF_SOURCE_BOUNDS');
  }
  const regionBytes = input.source_bytes.subarray(regionStart, regionEnd);
  const regionText = new TextDecoder('utf-8', { fatal: true }).decode(regionBytes);
  const tokens = input.tokens.map((raw) => {
    const token = tokenAssertionSchema.parse(raw);
    if (token.start_byte < regionStart || token.end_byte > regionEnd) {
      throw new Error('POS_TOKEN_OUTSIDE_GROUNDED_REGION');
    }
    const actual = new TextDecoder('utf-8', { fatal: true }).decode(input.source_bytes.subarray(token.start_byte, token.end_byte));
    if (actual !== token.text) throw new Error('POS_TOKEN_TEXT_SPAN_MISMATCH');
    return token;
  }).sort((a, b) => a.start_byte - b.start_byte || a.end_byte - b.end_byte || a.text.localeCompare(b.text));
  const payload = {
    schema: 'atlas.pos-text-evidence.v1' as const,
    identity,
    region_kind: input.region_kind,
    region_start_byte: regionStart,
    region_end_byte: regionEnd,
    region_digest: createHash('sha256').update(regionText, 'utf8').digest('hex'),
    provider: 'spacy' as const,
    provider_revision: input.provider_revision.trim(),
    coordinate_basis: 'UTF8_BYTES' as const,
    tokens,
    canonical_authority: false as const,
  };
  const checksum = createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  return posTextEvidenceV1Schema.parse({ ...payload, checksum });
}
