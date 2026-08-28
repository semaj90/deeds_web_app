import { createHash } from 'node:crypto';
import type { AceCardV2 } from '../context/ace-card-selection-v2.js';
import type { AtlasExternalResearchEvidenceV1 } from './external-research-evidence-v1.js';

export interface ExternalResearchAceContextV1 {
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function terms(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9_:-]+/).filter(Boolean))].sort();
}

/**
 * Adapts external evidence into an ACE card without assigning local identity.
 * The card participates in context selection, but is never a local candidate.
 */
export function externalResearchEvidenceToAceCardV1(
  evidence: AtlasExternalResearchEvidenceV1,
  context: ExternalResearchAceContextV1,
): AceCardV2 {
  const title = evidence.title?.trim() || `${evidence.sourceKind} ${evidence.externalId}`;
  const cardBody = {
    evidenceChecksum: evidence.evidenceChecksum,
    queryId: evidence.queryId,
    externalId: evidence.externalId,
    title,
    text: evidence.text,
    semanticScore: evidence.semanticScore,
    retrievalRevision: evidence.retrievalRevision,
    url: evidence.url,
    fetchedAt: evidence.fetchedAt,
  };
  const cardId = `ace:external:${sha256({ queryId: evidence.queryId, evidenceChecksum: evidence.evidenceChecksum }).slice(7, 31)}`;
  const lexicalTerms = terms(`${title} ${evidence.text}`);

  return {
    schema: 'atlas.ace-card.v2',
    cardId,
    cardChecksum: sha256(cardBody),
    cardKind: 'SUMMARY',
    candidateOrdinal: null,
    workspaceRevision: context.workspaceRevision,
    sourceRevision: null,
    candidateSnapshotRevision: context.candidateSnapshotRevision,
    ordinalMapChecksum: context.ordinalMapChecksum,
    sourceRef: null,
    evidenceRefs: [`external:${evidence.evidenceChecksum}`],
    title,
    lod0Identity: evidence.externalId,
    lod1Structural: null,
    lod2Extractive: evidence.text,
    lod3Semantic: null,
    lexicalTerms,
    concepts: [],
    domains: [],
    tokenEstimate: Math.max(1, Math.ceil(evidence.text.split(/\s+/).length * 1.25)),
    canonicalAuthority: false,
  };
}
