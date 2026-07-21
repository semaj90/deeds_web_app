import { createHash } from 'node:crypto';
import { z } from 'zod';

export const queryRoutingIntentSchema = z.enum([
  'symbol_lookup',
  'code_explanation',
  'debug_error',
  'schema_lookup',
  'dependency_trace',
  'missing_work',
  'task_board_action',
  'deep_research',
  'general',
]);

export const queryRoutingAnalysisSchema = z.object({
  query: z.string().min(1),
  normalizedQuery: z.string().min(1),
  intent: queryRoutingIntentSchema,
  intentConfidence: z.number().min(0).max(1),
  intentProbabilities: z.record(z.string(), z.number().min(0).max(1)).default({}),
  domainClass: z.string().min(1),
  domainConfidence: z.number().min(0).max(1),
  domainProbabilities: z.record(z.string(), z.number().min(0).max(1)).default({}),
  needsRetrieval: z.boolean(),
  graphExpansion: z.boolean(),
  rerank: z.boolean(),
  authorizationRequired: z.boolean(),
  analysisSource: z.enum(['miniforge', 'heuristic']),
  modelVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
});

export type QueryRoutingAnalysis = z.infer<typeof queryRoutingAnalysisSchema>;
export type QueryRoutingIntent = z.infer<typeof queryRoutingIntentSchema>;

export const aceToolCandidateSchema = z.object({
  toolId: z.string().min(1),
  toolName: z.string().min(1),
  score: z.number().finite(),
  eligible: z.boolean(),
  reasons: z.array(z.string()).default([]),
});

export const aceQueryPacketSchema = z.object({
  packetVersion: z.literal('ace-query-packet-v1'),
  queryId: z.string().min(1),
  runId: z.string().min(1),
  query: z.object({
    raw: z.string().min(1),
    normalized: z.string().min(1),
    hash: z.string().min(1),
    entities: z.array(
      z.object({
        type: z.string().min(1),
        value: z.string().min(1),
        confidence: z.number().min(0).max(1),
      }),
    ).default([]),
  }),
  classification: queryRoutingAnalysisSchema.pick({
    intent: true,
    intentConfidence: true,
    intentProbabilities: true,
    domainClass: true,
    domainConfidence: true,
    domainProbabilities: true,
    analysisSource: true,
    modelVersion: true,
  }),
  retrieval: z.object({
    candidateCount: z.number().int().nonnegative(),
    selectedEvidenceIds: z.array(z.string().min(1)).default([]),
    sourceRefs: z.array(z.string().min(1)).default([]),
    temporalPolicy: z.enum(['current', 'as-of', 'compare']).default('current'),
  }),
  toolRouting: z.object({
    selectedToolId: z.string().min(1).optional(),
    candidateTools: z.array(aceToolCandidateSchema).default([]),
    authorizationRequired: z.boolean(),
    rerank: z.boolean(),
  }),
  context: z.object({
    facts: z.array(z.string()).default([]),
    procedures: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
    unresolvedContradictions: z.array(z.string()).default([]),
  }),
  policy: z.object({
    allowedScopes: z.array(z.string()).default([]),
    prohibitedActions: z.array(z.string()).default([]),
    requiresApproval: z.boolean(),
  }),
  budget: z.object({
    maxTokens: z.number().int().positive(),
    evidenceTokens: z.number().int().nonnegative(),
    memoryTokens: z.number().int().nonnegative(),
    instructionTokens: z.number().int().nonnegative(),
  }),
  provenance: z.object({
    processingPassId: z.string().min(1),
    embeddingContractVersion: z.string().min(1),
    retrievalContractVersion: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).default([]),
    traceId: z.string().min(1),
  }),
});

export type AceQueryPacket = z.infer<typeof aceQueryPacketSchema>;
export type AceToolCandidate = z.infer<typeof aceToolCandidateSchema>;

export interface AceQueryPacketBuildInput {
  query: string;
  analysis: QueryRoutingAnalysis;
  candidateTools: AceToolCandidate[];
  selectedToolId?: string;
  selectedEvidenceIds?: string[];
  sourceRefs?: string[];
  facts?: string[];
  procedures?: string[];
  warnings?: string[];
  unresolvedContradictions?: string[];
  allowedScopes?: string[];
  prohibitedActions?: string[];
  requiresApproval?: boolean;
  maxTokens?: number;
  evidenceTokens?: number;
  memoryTokens?: number;
  instructionTokens?: number;
  processingPassId?: string;
  embeddingContractVersion?: string;
  retrievalContractVersion?: string;
  evidenceIds?: string[];
  traceId?: string;
  temporalPolicy?: 'current' | 'as-of' | 'compare';
}

export function normalizeQueryText(query: string): string {
  return String(query ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function makeQueryHash(query: string): string {
  return createHash('sha256').update(normalizeQueryText(query)).digest('hex').slice(0, 16);
}

export function buildAceQueryPacket(input: AceQueryPacketBuildInput): AceQueryPacket {
  const normalized = normalizeQueryText(input.query);
  const hash = makeQueryHash(input.query);
  const queryId = `ace-query:${hash}`;
  const packet = {
    packetVersion: 'ace-query-packet-v1' as const,
    queryId,
    runId: input.processingPassId ?? `ace-routing:${hash}`,
    query: {
      raw: input.query,
      normalized,
      hash,
      entities: [],
    },
    classification: {
      intent: input.analysis.intent,
      intentConfidence: input.analysis.intentConfidence,
      intentProbabilities: input.analysis.intentProbabilities,
      domainClass: input.analysis.domainClass,
      domainConfidence: input.analysis.domainConfidence,
      domainProbabilities: input.analysis.domainProbabilities,
      analysisSource: input.analysis.analysisSource,
      modelVersion: input.analysis.modelVersion,
    },
    retrieval: {
      candidateCount: input.candidateTools.length,
      selectedEvidenceIds: input.selectedEvidenceIds ?? [],
      sourceRefs: input.sourceRefs ?? [],
      temporalPolicy: input.temporalPolicy ?? 'current',
    },
    toolRouting: {
      selectedToolId: input.selectedToolId,
      candidateTools: input.candidateTools,
      authorizationRequired: input.requiresApproval ?? input.analysis.authorizationRequired,
      rerank: input.analysis.rerank,
    },
    context: {
      facts: input.facts ?? [],
      procedures: input.procedures ?? [],
      warnings: input.warnings ?? [],
      unresolvedContradictions: input.unresolvedContradictions ?? [],
    },
    policy: {
      allowedScopes: input.allowedScopes ?? [],
      prohibitedActions: input.prohibitedActions ?? [],
      requiresApproval: input.requiresApproval ?? input.analysis.authorizationRequired,
    },
    budget: {
      maxTokens: input.maxTokens ?? 8192,
      evidenceTokens: input.evidenceTokens ?? 4096,
      memoryTokens: input.memoryTokens ?? 1024,
      instructionTokens: input.instructionTokens ?? 512,
    },
    provenance: {
      processingPassId: input.processingPassId ?? `ace-routing:${hash}`,
      embeddingContractVersion: input.embeddingContractVersion ?? 'embeddinggemma-384',
      retrievalContractVersion: input.retrievalContractVersion ?? 'hybrid-rrf-v1',
      evidenceIds: input.evidenceIds ?? [],
      traceId: input.traceId ?? queryId,
    },
  };

  return aceQueryPacketSchema.parse(packet);
}

