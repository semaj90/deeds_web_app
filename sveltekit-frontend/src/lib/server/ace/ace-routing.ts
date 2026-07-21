import {
  buildAceQueryPacket,
  type AceQueryPacket,
  type AceToolCandidate,
  type QueryRoutingAnalysis,
} from './ace-query-packet.js';

export function buildAceRoutingPacket(input: {
  query: string;
  analysis: QueryRoutingAnalysis;
  selectedToolId?: string;
  rankedTools: Array<{ toolId: string; toolName: string; score: number; eligible: boolean }>;
  selectedEvidenceIds?: string[];
  sourceRefs?: string[];
  facts?: string[];
  procedures?: string[];
  warnings?: string[];
  unresolvedContradictions?: string[];
  allowedScopes?: string[];
  prohibitedActions?: string[];
  requiresApproval?: boolean;
  processingPassId?: string;
  embeddingContractVersion?: string;
  retrievalContractVersion?: string;
  evidenceIds?: string[];
  traceId?: string;
}): AceQueryPacket {
  const candidateTools: AceToolCandidate[] = input.rankedTools.map((tool) => ({
    toolId: tool.toolId,
    toolName: tool.toolName,
    score: tool.score,
    eligible: tool.eligible,
    reasons: [
      tool.eligible ? 'eligible' : 'ineligible',
      tool.toolId === input.selectedToolId ? 'selected' : 'ranked',
    ],
  }));

  return buildAceQueryPacket({
    query: input.query,
    analysis: input.analysis,
    candidateTools,
    selectedToolId: input.selectedToolId,
    selectedEvidenceIds: input.selectedEvidenceIds,
    sourceRefs: input.sourceRefs,
    facts: input.facts,
    procedures: input.procedures,
    warnings: input.warnings,
    unresolvedContradictions: input.unresolvedContradictions,
    allowedScopes: input.allowedScopes,
    prohibitedActions: input.prohibitedActions,
    requiresApproval: input.requiresApproval,
    processingPassId: input.processingPassId,
    embeddingContractVersion: input.embeddingContractVersion,
    retrievalContractVersion: input.retrievalContractVersion,
    evidenceIds: input.evidenceIds,
    traceId: input.traceId,
    evidenceTokens: 256,
    memoryTokens: 128,
    instructionTokens: 256,
    maxTokens: 4096,
  });
}

