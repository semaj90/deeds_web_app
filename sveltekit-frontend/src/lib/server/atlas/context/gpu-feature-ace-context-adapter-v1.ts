import { createHash } from 'node:crypto';
import { buildFanoutEvidenceBundleV1, type FanoutEvidenceBundleV1 } from './fanout-evidence-bundle-v1.js';
import { AceCardV2Schema, type AceCardV2 } from './ace-card-selection-v2.js';

/** Converts already-selected ACE cards into the existing read-only fanout compiler input. */
export function aceCardsToFanoutEvidenceBundleV1(input: {
  cards: readonly AceCardV2[];
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  tokenizerRevision: string;
  tokenBudget: number;
  edgePolicyRevision: string;
  maxHopDepth: number;
  representationRevisions: Record<string, string>;
}): FanoutEvidenceBundleV1 {
  const cards = input.cards.map((card) => AceCardV2Schema.parse(card));
  const candidates = cards.map((card) => {
    if (card.candidateOrdinal === null || card.sourceRef === null || card.sourceRevision === null) {
      throw new Error(`ACE_CONTEXT_CARD_IDENTITY_INCOMPLETE:${card.cardId}`);
    }
    if (card.workspaceRevision !== input.workspaceRevision) {
      throw new Error(`ACE_CONTEXT_WORKSPACE_REVISION_MISMATCH:${card.cardId}`);
    }
    if (card.candidateSnapshotRevision !== input.candidateSnapshotRevision) {
      throw new Error(`ACE_CONTEXT_CANDIDATE_SNAPSHOT_MISMATCH:${card.cardId}`);
    }
    if (card.ordinalMapChecksum !== input.ordinalMapChecksum) {
      throw new Error(`ACE_CONTEXT_ORDINAL_MAP_MISMATCH:${card.cardId}`);
    }
    const text = [card.lod0Identity, card.lod1Structural, card.lod2Extractive, card.lod3Semantic]
      .filter((value): value is string => Boolean(value))
      .join('\n');
    return {
      candidateOrdinal: card.candidateOrdinal,
      packetKey: card.lod0Identity.split('#', 1)[0],
      sourceRef: card.sourceRef,
      sourceRevision: card.sourceRevision,
      evidence: card.evidenceRefs.map((evidenceId) => ({
        evidenceId,
        kind: card.cardKind === 'GRAPH' ? 'TOPOLOGY' as const : 'STRUCTURAL' as const,
        sourceRef: card.sourceRef,
        sourceRevision: card.sourceRevision,
        extractorRevision: `ace-card-v2:${card.cardChecksum}`,
        text: text || card.title,
        startByte: null,
        endByte: null,
        confidence: null,
      })),
    };
  });
  const evidenceOrder = candidates.flatMap((candidate) => candidate.evidence.map((evidence) => evidence.evidenceId));
  const summaryText = cards.map((card) => `${card.title}\n${card.lod3Semantic ?? card.lod0Identity}`).join('\n\n');
  const summaryBody = { tokenizerRevision: input.tokenizerRevision, tokenBudget: input.tokenBudget, text: summaryText, evidenceOrder };
  const summaryChecksum = `sha256:${createHash('sha256').update(JSON.stringify(summaryBody), 'utf8').digest('hex')}`;
  return buildFanoutEvidenceBundleV1({
    schema: 'atlas.fanout-evidence-bundle.v1',
    workspaceRevision: input.workspaceRevision,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    representationRevisions: input.representationRevisions,
    edgePolicyRevision: input.edgePolicyRevision,
    maxHopDepth: input.maxHopDepth,
    candidates,
    summary: {
      tokenizerRevision: input.tokenizerRevision,
      tokenBudget: input.tokenBudget,
      text: summaryText,
      evidenceOrder,
      checksum: summaryChecksum,
    },
    canonicalAuthority: false,
  });
}
