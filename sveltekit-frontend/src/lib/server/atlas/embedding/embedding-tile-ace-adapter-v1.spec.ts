import { describe, expect, it } from 'vitest';
import { embeddingTileToAceCardV1 } from './embedding-tile-ace-adapter-v1.js';
import type { EmbeddingTileV1 } from './embedding-tile-v1.js';

const hash = (letter: string) => `sha256:${letter.repeat(64)}`;
const tile: EmbeddingTileV1 = {
  schema: 'atlas.embedding-tile.v1', tileId: 'tile:one', parentId: 'packet:p1', packetKey: 'packet:p1',
  sourceRef: 'src/a.ts', sourceRevision: hash('s'), workspaceRevision: hash('w'), candidateOrdinal: 4,
  tileIndex: 0, byteStart: 0, byteEnd: 100, tokenStart: 0, tokenEnd: 8, tokenCount: 8,
  renderedInputChecksum: hash('a'), tokenTensorChecksum: hash('b'), representationId: 'semantic_768',
  representationRevision: 'semantic:r1', modelRevision: 'model:r1', tokenizerRevision: 'tokenizer:r1',
  vectorChecksum: hash('c'), dimensions: 768, canonicalAuthority: false,
};

describe('EmbeddingTileAceAdapterV1', () => {
  it('preserves tile evidence and candidate identity in an ACE card', () => {
    const card = embeddingTileToAceCardV1(tile, {
      candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: hash('o'), tokenEstimate: 12,
      title: 'a.ts', semanticText: 'export function example() {}', lexicalTerms: ['function'],
    });
    expect(card.cardKind).toBe('SEMANTIC');
    expect(card.candidateOrdinal).toBe(4);
    expect(card.evidenceRefs).toEqual(['tile:one']);
    expect(card.canonicalAuthority).toBe(false);
  });

  it('rejects tiles without a CandidateOrdinal', () => {
    expect(() => embeddingTileToAceCardV1({ ...tile, candidateOrdinal: null }, {
      candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: hash('o'), tokenEstimate: 1,
    })).toThrow('EMBEDDING_TILE_CANDIDATE_ORDINAL_REQUIRED');
  });

  it('rejects unqualified revisions instead of manufacturing checksums', () => {
    expect(() => embeddingTileToAceCardV1({ ...tile, sourceRevision: 'source:r1' }, {
      candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: hash('o'), tokenEstimate: 1,
    })).toThrow('EMBEDDING_TILE_SOURCE_REVISION_UNQUALIFIED');
  });
});
