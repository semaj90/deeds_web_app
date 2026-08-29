import { createHash } from 'node:crypto';
import { z } from 'zod';

export const EmbeddingTileV1Schema = z.object({
  schema: z.literal('atlas.embedding-tile.v1'),
  tileId: z.string().min(1),
  parentId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative().nullable(),
  tileIndex: z.number().int().nonnegative(),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().nonnegative(),
  tokenStart: z.number().int().nonnegative(),
  tokenEnd: z.number().int().positive(),
  tokenCount: z.number().int().positive().max(512),
  renderedInputChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  tokenTensorChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  modelRevision: z.string().min(1),
  tokenizerRevision: z.string().min(1),
  vectorChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  dimensions: z.literal(768),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.byteEnd < value.byteStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byteEnd'], message: 'BYTE_RANGE_REVERSED' });
  if (value.tokenEnd - value.tokenStart !== value.tokenCount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tokenCount'], message: 'TOKEN_RANGE_COUNT_MISMATCH' });
});

export type EmbeddingTileV1 = z.infer<typeof EmbeddingTileV1Schema>;

export interface EmbeddingTileRangeV1 {
  tileIndex: number;
  tokenStart: number;
  tokenEnd: number;
  tokenCount: number;
  byteStart: number;
  byteEnd: number;
}

/** Plans bounded tokenizer windows while preserving source byte coordinates. */
export function planEmbeddingTileRangesV1(input: {
  tokenOffsets: readonly { byteStart: number; byteEnd: number }[];
  maxTokens?: number;
  overlapTokens?: number;
}): EmbeddingTileRangeV1[] {
  const maxTokens = input.maxTokens ?? 512;
  const overlapTokens = input.overlapTokens ?? 64;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 512) throw new Error('EMBEDDING_TILE_MAX_TOKENS_INVALID');
  if (!Number.isInteger(overlapTokens) || overlapTokens < 0 || overlapTokens >= maxTokens) throw new Error('EMBEDDING_TILE_OVERLAP_INVALID');
  for (const offset of input.tokenOffsets) {
    if (!Number.isInteger(offset.byteStart) || !Number.isInteger(offset.byteEnd) || offset.byteStart < 0 || offset.byteEnd < offset.byteStart) {
      throw new Error('EMBEDDING_TILE_TOKEN_OFFSET_INVALID');
    }
  }
  const ranges: EmbeddingTileRangeV1[] = [];
  const step = maxTokens - overlapTokens;
  for (let tokenStart = 0, tileIndex = 0; tokenStart < input.tokenOffsets.length; tokenStart += step, tileIndex += 1) {
    const tokenEnd = Math.min(tokenStart + maxTokens, input.tokenOffsets.length);
    const offsets = input.tokenOffsets.slice(tokenStart, tokenEnd);
    const byteStart = Math.min(...offsets.map((offset) => offset.byteStart));
    const byteEnd = Math.max(...offsets.map((offset) => offset.byteEnd));
    ranges.push({ tileIndex, tokenStart, tokenEnd, tokenCount: tokenEnd - tokenStart, byteStart, byteEnd });
    if (tokenEnd === input.tokenOffsets.length) break;
  }
  return ranges;
}

export function deriveEmbeddingTileIdV1(input: Pick<EmbeddingTileV1, 'parentId' | 'sourceRevision' | 'tileIndex' | 'renderedInputChecksum'>): string {
  const value = [input.parentId, input.sourceRevision, input.tileIndex, input.renderedInputChecksum].join('\0');
  return `tile:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function aggregateTileScoresV1(tiles: readonly { tileIndex: number; score: number }[]): number {
  if (!tiles.length) throw new Error('EMPTY_EMBEDDING_TILE_SCORE_SET');
  const ordered = tiles.slice().sort((a, b) => a.tileIndex - b.tileIndex);
  if (ordered.some((tile) => !Number.isFinite(tile.score))) throw new Error('NONFINITE_EMBEDDING_TILE_SCORE');
  return ordered.reduce((sum, tile) => sum + tile.score, 0) / ordered.length;
}

export interface TileAggregationV1 {
  candidateOrdinal: number;
  tileCount: number;
  bestTileIndex: number;
  maxScore: number;
  meanScore: number;
}

/** Collapses tile hits into one logical candidate vote, deterministically. */
export function aggregateTilesByCandidateOrdinalV1(
  tiles: readonly { candidateOrdinal: number; tileIndex: number; score: number }[],
): TileAggregationV1[] {
  const grouped = new Map<number, Array<{ tileIndex: number; score: number }>>();
  for (const tile of tiles) {
    if (!Number.isInteger(tile.candidateOrdinal) || tile.candidateOrdinal < 0) throw new Error('INVALID_TILE_CANDIDATE_ORDINAL');
    const group = grouped.get(tile.candidateOrdinal) ?? [];
    group.push({ tileIndex: tile.tileIndex, score: tile.score });
    grouped.set(tile.candidateOrdinal, group);
  }
  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([candidateOrdinal, group]) => {
    const ordered = group.slice().sort((a, b) => b.score - a.score || a.tileIndex - b.tileIndex);
    return {
      candidateOrdinal,
      tileCount: group.length,
      bestTileIndex: ordered[0].tileIndex,
      maxScore: ordered[0].score,
      meanScore: aggregateTileScoresV1(group),
    };
  });
}
