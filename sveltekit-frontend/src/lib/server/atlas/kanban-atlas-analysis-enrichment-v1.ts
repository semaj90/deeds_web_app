import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { MiniforgeNlpSidecarClient, NlpAnalyzeResponse } from '$lib/server/nlp/miniforge-nlp-sidecar.js';

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const LearnedClassifierCandidateSchema = z.object({
  status: z.enum(['SHADOW_ONLY', 'UNAVAILABLE', 'INVALID']),
  backend: z.enum(['sklearn-lr', 'sklearn-nb']).nullable(),
  modelRevision: z.string().min(1).nullable(),
  sourceRef: z.string().min(1).nullable(),
  sourceRevision: Sha256Schema.nullable(),
  naiveBayesLabel: z.string().min(1).nullable(),
  naiveBayesScore: z.number().finite().min(0).max(1).nullable(),
  logisticRegressionLabel: z.string().min(1).nullable(),
  logisticRegressionScore: z.number().finite().min(0).max(1).nullable(),
}).strict();

export const KanbanAtlasAnalysisEnrichmentV1Schema = z.object({
  schema: z.literal('atlas.kanban-task-analysis-enrichment.v1'),
  taskId: z.string().min(1),
  featureId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: Sha256Schema,
  sourceRevisionScope: z.literal('ANALYZED_TASK_TEXT_ONLY'),
  sourceRefStatus: z.literal('WORKBOARD_REFERENCE_NOT_REVALIDATED'),
  contentSha256: Sha256Schema,
  status: z.enum(['PROPOSED', 'UNVERIFIED', 'BLOCKED']),
  authority: z.literal('PROPOSAL_ONLY'),
  canonicalAuthority: z.literal(false),
  packetEnvelopeStatus: z.literal('UNAVAILABLE_NO_CANONICAL_PACKET_BINDING'),
  nlp: z.object({
    service: z.literal('8095'),
    route: z.literal('/analyze'),
    providerRevision: z.string().min(1).nullable(),
    entityCount: z.number().int().nonnegative(),
    relationshipCount: z.number().int().nonnegative(),
    conceptCandidates: z.array(z.string().min(1)).max(32),
    classificationHelperAvailable: z.boolean(),
  }).strict(),
  domainProposal: z.object({
    status: z.enum(['PROPOSED', 'UNVERIFIED']),
    label: z.string().min(1).nullable(),
    ontologyLabels: z.array(z.string().min(1)).max(32),
    producerRevision: z.string().min(1).nullable(),
    reason: z.string().min(1).nullable(),
  }).strict(),
  learnedClassifiers: z.object({
    naiveBayes: z.literal('NOT_ADMITTED'),
    logisticRegression: z.literal('NOT_ADMITTED'),
    reason: z.literal('NO_CURRENT_ADMITTED_TRAINING_RECEIPT'),
    candidate: LearnedClassifierCandidateSchema.optional(),
  }).strict(),
}).strict();

export type KanbanAtlasAnalysisEnrichmentV1 = z.infer<typeof KanbanAtlasAnalysisEnrichmentV1Schema>;

export const KanbanAtlasAnalysisEnrichmentV2Schema = KanbanAtlasAnalysisEnrichmentV1Schema
  .omit({ schema: true, sourceRefStatus: true })
  .extend({
    schema: z.literal('atlas.kanban-task-analysis-enrichment.v2'),
    sourceRevisionScope: z.literal('WORKBOARD_TASK_FILE_AND_LINE'),
    sourceRefStatus: z.literal('SOURCE_REFERENCE_CURRENT'),
    sourceFileRevision: Sha256Schema,
    sourceLine: z.number().int().positive(),
    taskTextSha256: Sha256Schema,
    learnedClassifiers: z.object({
      naiveBayes: z.literal('NOT_ADMITTED'),
      logisticRegression: z.literal('NOT_ADMITTED'),
      reason: z.literal('NO_CURRENT_ADMITTED_TRAINING_RECEIPT'),
      candidate: LearnedClassifierCandidateSchema,
    }).strict(),
  }).strict();

export const KanbanAtlasAnalysisEnrichmentSchema = z.union([
  KanbanAtlasAnalysisEnrichmentV2Schema,
  KanbanAtlasAnalysisEnrichmentV1Schema,
]);

export type KanbanAtlasAnalysisEnrichmentV2 = z.infer<typeof KanbanAtlasAnalysisEnrichmentV2Schema>;

export type VerifiedWorkboardTaskBindingV1 = {
  status: 'SOURCE_REFERENCE_CURRENT';
  sourceFileRef: string;
  sourceLine: number;
  sourceRevision: string;
  taskTextSha256: string;
};

function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export async function analyzeKanbanTaskForAtlasV1(input: {
  client: MiniforgeNlpSidecarClient;
  taskId: string;
  featureId: string;
  sourceRef: string;
  text: string;
  sourceBinding: VerifiedWorkboardTaskBindingV1;
}): Promise<KanbanAtlasAnalysisEnrichmentV2> {
  const text = input.text;
  const sourceRevision = sha256(text);
  const sourceRefMatch = /^(.*)#L([1-9][0-9]*)$/.exec(input.sourceRef);
  const bindingMatches = input.sourceBinding?.status === 'SOURCE_REFERENCE_CURRENT'
    && sourceRefMatch !== null
    && sourceRefMatch[1] === input.sourceBinding.sourceFileRef
    && Number(sourceRefMatch[2]) === input.sourceBinding.sourceLine
    && input.sourceBinding.taskTextSha256 === sha256(text);
  if (!bindingMatches) throw new Error('KANBAN_TASK_SOURCE_BINDING_NOT_VERIFIED');
  const base = {
    schema: 'atlas.kanban-task-analysis-enrichment.v2' as const,
    taskId: input.taskId,
    featureId: input.featureId,
    sourceRef: input.sourceRef,
    sourceRevision,
    sourceRevisionScope: 'WORKBOARD_TASK_FILE_AND_LINE' as const,
    sourceRefStatus: 'SOURCE_REFERENCE_CURRENT' as const,
    sourceFileRevision: input.sourceBinding.sourceRevision,
    sourceLine: input.sourceBinding.sourceLine,
    taskTextSha256: input.sourceBinding.taskTextSha256,
    contentSha256: sourceRevision,
    authority: 'PROPOSAL_ONLY' as const,
    canonicalAuthority: false as const,
    packetEnvelopeStatus: 'UNAVAILABLE_NO_CANONICAL_PACKET_BINDING' as const,
    learnedClassifiers: {
      naiveBayes: 'NOT_ADMITTED' as const,
      logisticRegression: 'NOT_ADMITTED' as const,
      reason: 'NO_CURRENT_ADMITTED_TRAINING_RECEIPT' as const,
      candidate: {
        status: 'UNAVAILABLE' as const,
        backend: null,
        modelRevision: null,
        sourceRef: null,
        sourceRevision: null,
        naiveBayesLabel: null,
        naiveBayesScore: null,
        logisticRegressionLabel: null,
        logisticRegressionScore: null,
      },
    },
  };

  if (!text.trim() || Array.from(text).length > 8_000) {
    return KanbanAtlasAnalysisEnrichmentV2Schema.parse({
      ...base,
      status: 'BLOCKED',
      nlp: { service: '8095', route: '/analyze', providerRevision: null, entityCount: 0, relationshipCount: 0, conceptCandidates: [], classificationHelperAvailable: false },
      domainProposal: { status: 'UNVERIFIED', label: null, ontologyLabels: [], producerRevision: null, reason: text.trim() ? 'TASK_TEXT_EXCEEDS_8000_CHAR_LIMIT' : 'TASK_TEXT_EMPTY' },
    });
  }

  try {
    const response: NlpAnalyzeResponse = await input.client.analyze({
      text,
      sourceType: 'general',
      extractionMode: 'full',
      documentId: input.taskId,
      sourceRef: input.sourceRef,
      sourceRevision,
      passes: ['structural', 'lexical', 'linguistic', 'semantic', 'sequence', 'rerank', 'classify'],
      maxChars: 8_000,
    });
    const rawProposal = response.classification_proposal;
    const proposal = rawProposal && typeof rawProposal === 'object' ? rawProposal : null;
    const validBinding = proposal?.sourceRef === input.sourceRef
      && proposal?.sourceRevision === sourceRevision
      && proposal?.canonicalAuthority === false
      && proposal?.writesPerformed === false;
    const rawLabel = proposal?.domain;
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : null;
    const ontologyLabels = Array.isArray(proposal?.ontologyLabels)
      ? proposal.ontologyLabels.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).slice(0, 32)
      : [];

    const classifierPasses = (response.pass_results ?? []).filter((pass) => pass.family === 'classify');
    const classifierPass = classifierPasses.length === 1 ? classifierPasses[0] : null;
    const classifierBindingMatches = classifierPass?.sourceRef === input.sourceRef
      && classifierPass.sourceRevision === sourceRevision;
    const passArtifacts = classifierPass?.artifacts ?? {};
    const passFeatures = classifierPass?.features ?? {};
    const classifierBackend = classifierPass?.backend === 'sklearn-lr' || classifierPass?.backend === 'sklearn-nb'
      ? classifierPass.backend
      : null;
    const classifierModelRevision = typeof passArtifacts.model_revision === 'string'
      && passArtifacts.model_revision !== 'unknown' ? passArtifacts.model_revision : null;
    const candidateLabel = (value: unknown): string | null =>
      typeof value === 'string' && value.trim() ? value.trim() : null;
    const candidateScore = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
    const hasClassifierOutput = classifierPass?.status === 'succeeded'
      && classifierBindingMatches
      && classifierBackend !== null
      && classifierModelRevision !== null;
    const invalidClassifierOutput = classifierPasses.length > 1
      || (classifierPass?.status === 'succeeded' && !hasClassifierOutput);
    const learnedClassifierCandidate = {
      status: hasClassifierOutput ? 'SHADOW_ONLY' as const
        : invalidClassifierOutput ? 'INVALID' as const : 'UNAVAILABLE' as const,
      backend: hasClassifierOutput ? classifierBackend : null,
      modelRevision: hasClassifierOutput ? classifierModelRevision : null,
      sourceRef: hasClassifierOutput ? classifierPass!.sourceRef : null,
      sourceRevision: hasClassifierOutput ? classifierPass!.sourceRevision : null,
      naiveBayesLabel: hasClassifierOutput ? candidateLabel(passArtifacts.naive_bayes_label) : null,
      naiveBayesScore: hasClassifierOutput ? candidateScore(passFeatures.naive_bayes_domain_probability) : null,
      logisticRegressionLabel: hasClassifierOutput ? candidateLabel(passArtifacts.logistic_regression_label) : null,
      logisticRegressionScore: hasClassifierOutput ? candidateScore(passFeatures.logistic_regression_domain_probability) : null,
    };

    return KanbanAtlasAnalysisEnrichmentV2Schema.parse({
      ...base,
      learnedClassifiers: { ...base.learnedClassifiers, candidate: learnedClassifierCandidate },
      status: validBinding ? 'PROPOSED' : 'UNVERIFIED',
      nlp: {
        service: '8095',
        route: '/analyze',
        providerRevision: typeof response.provider_revision === 'string' ? response.provider_revision : null,
        entityCount: response.entities.length,
        relationshipCount: response.relationships.length,
        conceptCandidates: response.concepts.filter((value) => typeof value === 'string' && value.trim().length > 0).slice(0, 32),
        classificationHelperAvailable: response.capabilities.classification_helper === true,
      },
      domainProposal: {
        status: validBinding && label ? 'PROPOSED' : 'UNVERIFIED',
        label: validBinding ? label : null,
        ontologyLabels: validBinding ? ontologyLabels : [],
        producerRevision: validBinding && typeof proposal?.producerRevision === 'string' ? proposal.producerRevision : null,
        reason: validBinding ? null : 'CLASSIFICATION_PROPOSAL_MISSING_OR_SOURCE_BINDING_MISMATCH',
      },
    });
  } catch {
    return KanbanAtlasAnalysisEnrichmentV2Schema.parse({
      ...base,
      status: 'UNVERIFIED',
      nlp: { service: '8095', route: '/analyze', providerRevision: null, entityCount: 0, relationshipCount: 0, conceptCandidates: [], classificationHelperAvailable: false },
      domainProposal: { status: 'UNVERIFIED', label: null, ontologyLabels: [], producerRevision: null, reason: 'NLP_SIDECAR_UNAVAILABLE_OR_INVALID_RESPONSE' },
    });
  }
}
