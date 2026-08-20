import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  astGrepObservationSchema,
  type AstGrepObservationV1,
  type TreesitterChunkerChunkV1,
} from './structural-symbol.js';

const id = z.string().min(1);

export const astGrepRawMatchSchema = z.object({
  rule_id: id,
  text: z.string(),
  byte_start: z.number().int().nonnegative(),
  byte_end: z.number().int().nonnegative(),
  observation_kind: z.string().min(1),
  captures: z.record(z.string(), z.string()).default({}),
  confidence: z.number().finite().min(0).max(1).default(1),
}).strict().superRefine((value, ctx) => {
  if (value.byte_end <= value.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byte_end'], message: 'byte_end must be > byte_start' });
  }
});

/** Structural subset emitted by the existing frontend ast-grep extractor. */
export const astGrepExtractedFeatureCompatSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  source: z.literal('ast-grep'),
  rawText: z.string().optional(),
  byteStart: z.number().int().nonnegative().optional(),
  byteEnd: z.number().int().nonnegative().optional(),
  ruleId: z.string().min(1).optional(),
  captures: z.record(z.string(), z.string()).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
}).passthrough();

export type AstGrepRawMatchV1 = z.infer<typeof astGrepRawMatchSchema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function overlapLength(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function bestChunk(match: AstGrepRawMatchV1, chunks: readonly TreesitterChunkerChunkV1[]): TreesitterChunkerChunkV1 | undefined {
  return [...chunks]
    .map((chunk) => ({ chunk, overlap: overlapLength(match.byte_start, match.byte_end, chunk.byte_start, chunk.byte_end) }))
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.chunk.byte_start - b.chunk.byte_start)[0]?.chunk;
}

export function adaptAstGrepMatches(input: {
  source_ref: string;
  source_revision: string;
  extractor_revision: string;
  chunks: TreesitterChunkerChunkV1[];
  matches: AstGrepRawMatchV1[];
}): AstGrepObservationV1[] {
  return input.matches.map((raw) => {
    const match = astGrepRawMatchSchema.parse(raw);
    const chunk = bestChunk(match, input.chunks);
    return astGrepObservationSchema.parse({
      observation_id: `ast-grep:${sha256(JSON.stringify([
        input.source_ref,
        input.source_revision,
        match.rule_id,
        match.byte_start,
        match.byte_end,
        match.captures,
      ])).slice(0, 40)}`,
      rule_id: match.rule_id,
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      byte_start: match.byte_start,
      byte_end: match.byte_end,
      upstream_node_id: chunk?.upstream_node_id,
      upstream_chunk_id: chunk?.upstream_chunk_id,
      matched_text_hash: sha256(match.text),
      captures: match.captures,
      observation_kind: match.observation_kind,
      confidence: match.confidence,
      extractor_revision: input.extractor_revision,
      canonical_authority: false,
    });
  });
}

/** Existing frontend `ExtractedFeature` -> byte-grounded Parent Atlas match. */
export function adaptAstGrepExtractedFeature(featureInput: unknown): AstGrepRawMatchV1 | null {
  const parsed = astGrepExtractedFeatureCompatSchema.safeParse(featureInput);
  if (!parsed.success) return null;
  const feature = parsed.data;
  if (feature.byteStart == null || feature.byteEnd == null || feature.byteEnd <= feature.byteStart) return null;

  return astGrepRawMatchSchema.parse({
    rule_id: feature.ruleId ?? `legacy-ast-grep:${feature.type}`,
    text: feature.rawText ?? feature.name,
    byte_start: feature.byteStart,
    byte_end: feature.byteEnd,
    observation_kind: feature.type,
    captures: feature.captures ?? { name: feature.name },
    confidence: feature.confidence ?? 0.9,
  });
}

/** Adapter for ast-grep CLI JSON mode. */
export function adaptAstGrepJsonMatch(input: {
  rule_id: string;
  text: string;
  range: { byteOffset: { start: number; end: number } };
  observation_kind: string;
  captures?: Record<string, string>;
  confidence?: number;
}): AstGrepRawMatchV1 {
  return astGrepRawMatchSchema.parse({
    rule_id: input.rule_id,
    text: input.text,
    byte_start: input.range.byteOffset.start,
    byte_end: input.range.byteOffset.end,
    observation_kind: input.observation_kind,
    captures: input.captures ?? {},
    confidence: input.confidence ?? 1,
  });
}
