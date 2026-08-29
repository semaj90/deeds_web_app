import { describe, expect, it } from 'vitest';
import { aggregateTileScoresV1, aggregateTilesByCandidateOrdinalV1, deriveEmbeddingTileIdV1, EmbeddingTileV1Schema, planEmbeddingTileRangesV1 } from './embedding-tile-v1.js';

const hash = (letter: string) => `sha256:${letter.repeat(64)}`;

describe('EmbeddingTileV1', () => {
  it('binds a 512-token tile to stable parent identity', () => {
    const tile = EmbeddingTileV1Schema.parse({
      schema: 'atlas.embedding-tile.v1', tileId: 'pending', parentId: 'packet:p1', packetKey: 'packet:p1',
      sourceRef: 'src/a.ts', sourceRevision: 'source:r1', workspaceRevision: 'workspace:r1', candidateOrdinal: 4,
      tileIndex: 0, byteStart: 0, byteEnd: 1000, tokenStart: 0, tokenEnd: 512, tokenCount: 512,
      renderedInputChecksum: hash('a'), tokenTensorChecksum: hash('b'), representationId: 'semantic_768',
      representationRevision: 'semantic:r1', modelRevision: 'model:r1', tokenizerRevision: 'tokenizer:r1',
      vectorChecksum: hash('c'), dimensions: 768, canonicalAuthority: false,
    });
    expect(deriveEmbeddingTileIdV1(tile)).toMatch(/^tile:[a-f0-9]{64}$/);
  });

  it('aggregates scores deterministically by tile index', () => {
    expect(aggregateTileScoresV1([{ tileIndex: 1, score: 0.4 }, { tileIndex: 0, score: 0.8 }])).toBeCloseTo(0.6);
  });

  it('collapses multiple tiles into one logical CandidateOrdinal vote', () => {
    const result = aggregateTilesByCandidateOrdinalV1([
      { candidateOrdinal: 2, tileIndex: 1, score: 0.4 },
      { candidateOrdinal: 1, tileIndex: 0, score: 0.7 },
      { candidateOrdinal: 2, tileIndex: 0, score: 0.8 },
    ]);
    expect(result).toMatchObject([
      { candidateOrdinal: 1, tileCount: 1, bestTileIndex: 0, maxScore: 0.7 },
      { candidateOrdinal: 2, tileCount: 2, bestTileIndex: 0, maxScore: 0.8 },
    ]);
    expect(result[0].meanScore).toBeCloseTo(0.7);
    expect(result[1].meanScore).toBeCloseTo(0.6);
  });

  it('plans overlapping bounded token windows with byte spans', () => {
    const ranges = planEmbeddingTileRangesV1({
      tokenOffsets: Array.from({ length: 10 }, (_, index) => ({ byteStart: index * 3, byteEnd: index * 3 + 2 })),
      maxTokens: 4,
      overlapTokens: 1,
    });
    expect(ranges).toEqual([
      { tileIndex: 0, tokenStart: 0, tokenEnd: 4, tokenCount: 4, byteStart: 0, byteEnd: 11 },
      { tileIndex: 1, tokenStart: 3, tokenEnd: 7, tokenCount: 4, byteStart: 9, byteEnd: 20 },
      { tileIndex: 2, tokenStart: 6, tokenEnd: 10, tokenCount: 4, byteStart: 18, byteEnd: 29 },
    ]);
  });
});
