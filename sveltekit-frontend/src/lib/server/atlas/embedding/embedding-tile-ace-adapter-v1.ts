import { createHash } from 'node:crypto';
import { AceCardV2Schema, type AceCardV2 } from '../context/ace-card-selection-v2.js';
import type { EmbeddingTileV1 } from './embedding-tile-v1.js';

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

export interface EmbeddingTileAceContextV1 {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  tokenEstimate: number;
  title?: string;
  structuralText?: string | null;
  extractiveText?: string | null;
  semanticText?: string | null;
  lexicalTerms?: string[];
  concepts?: string[];
  domains?: string[];
}

/** Converts admitted tile evidence plus caller-owned source text into an ACE card. */
export function embeddingTileToAceCardV1(tile: EmbeddingTileV1, context: EmbeddingTileAceContextV1): AceCardV2 {
  if (tile.candidateOrdinal === null) throw new Error('EMBEDDING_TILE_CANDIDATE_ORDINAL_REQUIRED');
  if (!tile.workspaceRevision.startsWith('sha256:')) throw new Error('EMBEDDING_TILE_WORKSPACE_REVISION_UNQUALIFIED');
  if (!tile.sourceRevision.startsWith('sha256:')) throw new Error('EMBEDDING_TILE_SOURCE_REVISION_UNQUALIFIED');
  if (context.tokenEstimate < 0 || !Number.isInteger(context.tokenEstimate)) throw new Error('EMBEDDING_TILE_TOKEN_ESTIMATE_INVALID');
  const identity = {
    tileId: tile.tileId,
    parentId: tile.parentId,
    candidateOrdinal: tile.candidateOrdinal,
    candidateSnapshotRevision: context.candidateSnapshotRevision,
    ordinalMapChecksum: context.ordinalMapChecksum,
    vectorChecksum: tile.vectorChecksum,
  };
  const card = {
    schema: 'atlas.ace-card.v2' as const,
    cardId: `embedding-tile:${checksum(identity)}`,
    cardChecksum: checksum(identity),
    cardKind: 'SEMANTIC' as const,
    candidateOrdinal: tile.candidateOrdinal,
    workspaceRevision: tile.workspaceRevision,
    sourceRevision: tile.sourceRevision,
    candidateSnapshotRevision: context.candidateSnapshotRevision,
    ordinalMapChecksum: context.ordinalMapChecksum,
    sourceRef: tile.sourceRef,
    evidenceRefs: [tile.tileId],
    title: context.title ?? `${tile.sourceRef} tile ${tile.tileIndex}`,
    lod0Identity: `${tile.sourceRef}#${tile.byteStart}-${tile.byteEnd}`,
    lod1Structural: context.structuralText ?? null,
    lod2Extractive: context.extractiveText ?? null,
    lod3Semantic: context.semanticText ?? null,
    lexicalTerms: [...(context.lexicalTerms ?? [])].sort(),
    concepts: [...(context.concepts ?? [])].sort(),
    domains: [...(context.domains ?? [])].sort(),
    tokenEstimate: context.tokenEstimate,
    canonicalAuthority: false as const,
  };
  return AceCardV2Schema.parse(card);
}
