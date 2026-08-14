import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ClassificationEnvelopeV1 } from './classification-envelope-v1.js';
import type { FeatureMatrixRowV1 } from '../feature-matrix-schema.js';

export const OntologyLinkedTupleEvidenceStateSchema = z.enum([
  'ACTIVE_VERIFIED',
  'ACTIVE_DEGRADED',
  'GATED',
  'REFERENCE_ONLY',
  'SUPERSEDED',
  'FAILED',
]);

export const OntologyLinkedTupleLabelKindSchema = z.enum([
  'pos',
  'tag',
  'ontology',
]);

export const OntologyLinkedTupleLabelSourceSchema = z.enum([
  'pos_tagger',
  'semantic_tagger',
  'regex',
  'ner',
  'llm',
  'manual',
]);

export const OntologyLinkedTupleParticipantRoleSchema = z.enum([
  'actor',
  'target',
  'input',
  'output',
  'tool',
  'packet',
  'symbol',
  'task',
  'workflow',
  'evidence',
  'cause',
  'effect',
  'citation',
  'screenshot',
  'summary',
  'policy',
  'source',
  'topology',
  'manifold',
  'context',
]);

export const OntologyLinkedTupleParticipantKindSchema = z.enum([
  'packet',
  'source_ref',
  'tree_node',
  'ast_symbol',
  'semantic_concept',
  'concept',
  'topic',
  'citation',
  'screenshot',
  'policy_summary',
  'tool_call',
  'topology_node',
  'manifold_point',
  'page_rank',
  'bm25',
  'bm42',
  'mcp_tool_call',
  'summary',
]);

export const OntologyLinkedTupleParticipantSchema = z.object({
  entityId: z.string().min(1),
  entityKind: OntologyLinkedTupleParticipantKindSchema,
  role: OntologyLinkedTupleParticipantRoleSchema,
  label: z.string().min(1).nullable().optional(),
});

export const OntologyLinkedTupleProvenanceSchema = z.object({
  sourceTables: z.array(z.string().min(1)).max(12),
  labelerVersion: z.string().min(1).nullable(),
  taggerVersion: z.string().min(1).nullable(),
  ontologyVersion: z.string().min(1).nullable(),
  nlpVersion: z.string().min(1).nullable(),
  sourceRevision: z.string().min(1).nullable().optional(),
  representationId: z.string().min(1).nullable().optional(),
  representationRevision: z.string().min(1).nullable().optional(),
  producerId: z.string().min(1).nullable().optional(),
  producerRevision: z.string().min(1).nullable().optional(),
  featureRevision: z.string().min(1).nullable().optional(),
  graphRevision: z.string().min(1).nullable().optional(),
  ontologyRevision: z.string().min(1).nullable().optional(),
  modelRevision: z.string().min(1).nullable().optional(),
  inputDigest: z.string().min(1).nullable().optional(),
  outputDigest: z.string().min(1).nullable().optional(),
  generatedAt: z.string().datetime().nullable().optional(),
  lastVerifiedAt: z.string().datetime().nullable().optional(),
});

export const OntologyLinkedTupleEvidenceSpanSchema = z.object({
  sourceRef: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
}).superRefine((span, ctx) => {
  if (span.end < span.start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end'],
      message: 'evidence span end must be greater than or equal to start',
    });
  }
});

export const OntologyLinkedTupleLifecycleSchema = z.enum([
  'OBSERVED',
  'DERIVED',
  'SUPERSEDED',
]);

export const OntologyLinkedTupleV1Schema = z.object({
  tupleId: z.string().min(1),
  schemaVersion: z.literal('ontology-linked-tuple.v1'),
  packetKey: z.string().min(1).optional(),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  titleId: z.string().min(1).optional(),
  surfaceText: z.string().min(1),
  tokenIndex: z.number().int().nonnegative().optional().nullable(),
  partOfSpeech: z.string().min(1).optional().nullable(),
  label: z.string().min(1),
  labelKind: OntologyLinkedTupleLabelKindSchema,
  labelSource: OntologyLinkedTupleLabelSourceSchema,
  ontologyIds: z.array(z.string().min(1)).max(32),
  conceptIds: z.array(z.string().min(1)).max(32),
  participants: z.array(OntologyLinkedTupleParticipantSchema).max(16).default([]),
  evidenceRefs: z.array(z.string().min(1)).max(32).default([]),
  relationRevision: z.string().min(1).optional(),
  evidenceSpan: OntologyLinkedTupleEvidenceSpanSchema.optional(),
  confidence: z.number().min(0).max(1),
  evidenceState: OntologyLinkedTupleEvidenceStateSchema,
  lifecycle: OntologyLinkedTupleLifecycleSchema.default('OBSERVED'),
  provenance: OntologyLinkedTupleProvenanceSchema,
});

export type OntologyLinkedTupleV1 = z.infer<typeof OntologyLinkedTupleV1Schema>;
export type OntologyLinkedTupleParticipant = z.infer<typeof OntologyLinkedTupleParticipantSchema>;

function hashTupleId(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

export function buildOntologyLinkedTupleId(parts: string[]): string {
  return hashTupleId(parts);
}

function normalizeSourceTables(sourceTables: string[]): string[] {
  return Array.from(new Set(sourceTables.map((entry) => entry.trim()).filter(Boolean))).slice(0, 12);
}

export function buildOntologyLinkedTuplesFromClassification(input: {
  classification: Pick<ClassificationEnvelopeV1, 'identity' | 'signals' | 'provenance' | 'validation'>;
  featureRow?: Pick<FeatureMatrixRowV1, 'identity' | 'lexical' | 'domain_class' | 'secondary_domains' | 'ontology_ids' | 'concept_ids' | 'evidence_state'> | null;
  sourceTables: string[];
  labelerVersion?: string | null;
  taggerVersion?: string | null;
  ontologyVersion?: string | null;
  nlpVersion?: string | null;
  sourceRevision?: string | null;
  representationId?: string | null;
  representationRevision?: string | null;
  producerId?: string | null;
  producerRevision?: string | null;
  featureRevision?: string | null;
  graphRevision?: string | null;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  inputDigest?: string | null;
  outputDigest?: string | null;
  generatedAt?: string | null;
  lastVerifiedAt?: string | null;
  participants?: OntologyLinkedTupleParticipant[] | null;
  evidenceRefs?: string[] | null;
}): OntologyLinkedTupleV1[] {
  const sourceTables = normalizeSourceTables(input.sourceTables);
  const treeNodeId = input.classification.identity.treeNodeId ?? input.featureRow?.identity.tree_node_id ?? undefined;
  const titleId = input.classification.identity.titleId ?? input.featureRow?.identity.title_id ?? undefined;
  const ontologyIds = input.classification.signals.ontologyIds.length > 0
    ? input.classification.signals.ontologyIds
    : input.featureRow?.ontology_ids ?? [];
  const conceptIds = input.classification.signals.conceptIds.length > 0
    ? input.classification.signals.conceptIds
    : input.featureRow?.concept_ids ?? [];
  const domainLabel = input.classification.signals.domainClass ?? input.featureRow?.domain_class ?? input.classification.identity.featureLabel;
  const secondaryDomains = (input.classification.signals.secondaryDomains ?? []).length > 0
    ? (input.classification.signals.secondaryDomains ?? [])
    : input.featureRow?.secondary_domains ?? [];
  const partOfSpeech = input.classification.signals.partOfSpeech ?? input.featureRow?.lexical?.part_of_speech ?? null;
  const evidenceState = input.classification.signals.evidenceState;
  const participants = Array.from(
    new Map(
      (input.participants ?? []).map((participant) => [
        [participant.entityKind, participant.role, participant.entityId, participant.label ?? ''].join('|'),
        OntologyLinkedTupleParticipantSchema.parse(participant),
      ])
    ).values()
  ).sort((left, right) => {
    const leftKey = [left.entityKind, left.role, left.entityId, left.label ?? ''].join('|');
    const rightKey = [right.entityKind, right.role, right.entityId, right.label ?? ''].join('|');
    return leftKey.localeCompare(rightKey);
  });
  const evidenceRefs = Array.from(new Set((input.evidenceRefs ?? []).map((ref) => ref.trim()).filter(Boolean)));

  const tuples: OntologyLinkedTupleV1[] = [];

  tuples.push(OntologyLinkedTupleV1Schema.parse({
    tupleId: hashTupleId([
      'ontology-linked-tuple.v1',
      input.classification.identity.packetKey,
      input.classification.identity.sourceRef,
      treeNodeId ?? '',
      String(titleId ?? ''),
      String(domainLabel ?? ''),
      'primary',
    ]),
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: input.classification.identity.packetKey,
    sourceRef: input.classification.identity.sourceRef,
    treeNodeId,
    titleId,
    surfaceText: input.classification.identity.featureLabel,
    tokenIndex: 0,
    partOfSpeech: null,
    label: String(domainLabel ?? input.classification.identity.featureLabel),
    labelKind: ontologyIds.length > 0 ? 'ontology' : 'tag',
    labelSource: 'semantic_tagger',
    ontologyIds,
    conceptIds,
    participants,
    evidenceRefs,
    confidence: evidenceState === 'ACTIVE_VERIFIED' ? 0.95 : 0.72,
    evidenceState,
    provenance: {
      sourceTables,
      labelerVersion: input.labelerVersion ?? input.classification.provenance?.serializerVersion ?? null,
      taggerVersion: input.taggerVersion ?? null,
      ontologyVersion: input.ontologyVersion ?? null,
      nlpVersion: input.nlpVersion ?? null,
      sourceRevision: input.sourceRevision ?? null,
      representationId: input.representationId ?? null,
      representationRevision: input.representationRevision ?? null,
      producerId: input.producerId ?? null,
      producerRevision: input.producerRevision ?? null,
      featureRevision: input.featureRevision ?? null,
      graphRevision: input.graphRevision ?? null,
      ontologyRevision: input.ontologyRevision ?? null,
      modelRevision: input.modelRevision ?? null,
      inputDigest: input.inputDigest ?? null,
      outputDigest: input.outputDigest ?? null,
      generatedAt: input.generatedAt ?? null,
      lastVerifiedAt: input.lastVerifiedAt ?? null,
    },
  }));

  for (const [index, secondaryDomain] of secondaryDomains.entries()) {
    tuples.push(OntologyLinkedTupleV1Schema.parse({
      tupleId: hashTupleId([
        'ontology-linked-tuple.v1',
        input.classification.identity.packetKey,
        input.classification.identity.sourceRef,
        treeNodeId ?? '',
        String(titleId ?? ''),
        secondaryDomain,
        `secondary:${index}`,
      ]),
      schemaVersion: 'ontology-linked-tuple.v1',
      packetKey: input.classification.identity.packetKey,
      sourceRef: input.classification.identity.sourceRef,
      treeNodeId,
      titleId,
      surfaceText: secondaryDomain,
      tokenIndex: index + 1,
      partOfSpeech: null,
      label: secondaryDomain,
      labelKind: 'tag',
      labelSource: 'semantic_tagger',
      ontologyIds: [],
      conceptIds: [],
      participants,
      evidenceRefs,
      confidence: 0.7,
      evidenceState,
      provenance: {
        sourceTables,
        labelerVersion: input.labelerVersion ?? input.classification.provenance?.serializerVersion ?? null,
        taggerVersion: input.taggerVersion ?? null,
        ontologyVersion: input.ontologyVersion ?? null,
        nlpVersion: input.nlpVersion ?? null,
        sourceRevision: input.sourceRevision ?? null,
        representationId: input.representationId ?? null,
        representationRevision: input.representationRevision ?? null,
        producerId: input.producerId ?? null,
        producerRevision: input.producerRevision ?? null,
        featureRevision: input.featureRevision ?? null,
        graphRevision: input.graphRevision ?? null,
        ontologyRevision: input.ontologyRevision ?? null,
        modelRevision: input.modelRevision ?? null,
        inputDigest: input.inputDigest ?? null,
        outputDigest: input.outputDigest ?? null,
        generatedAt: input.generatedAt ?? null,
        lastVerifiedAt: input.lastVerifiedAt ?? null,
      },
    }));
  }

  if (partOfSpeech) {
    tuples.push(OntologyLinkedTupleV1Schema.parse({
      tupleId: hashTupleId([
        'ontology-linked-tuple.v1',
        input.classification.identity.packetKey,
        input.classification.identity.sourceRef,
        treeNodeId ?? '',
        String(titleId ?? ''),
        partOfSpeech,
        'pos',
      ]),
      schemaVersion: 'ontology-linked-tuple.v1',
      packetKey: input.classification.identity.packetKey,
      sourceRef: input.classification.identity.sourceRef,
      treeNodeId,
      titleId,
      surfaceText: partOfSpeech,
      tokenIndex: 0,
      partOfSpeech,
      label: partOfSpeech,
      labelKind: 'pos',
      labelSource: 'pos_tagger',
      ontologyIds: [],
      conceptIds: [],
      participants,
      evidenceRefs,
      confidence: 0.9,
      evidenceState,
      provenance: {
        sourceTables,
        labelerVersion: input.labelerVersion ?? input.classification.provenance?.serializerVersion ?? null,
        taggerVersion: input.taggerVersion ?? null,
        ontologyVersion: input.ontologyVersion ?? null,
        nlpVersion: input.nlpVersion ?? null,
        sourceRevision: input.sourceRevision ?? null,
        representationId: input.representationId ?? null,
        representationRevision: input.representationRevision ?? null,
        producerId: input.producerId ?? null,
        producerRevision: input.producerRevision ?? null,
        featureRevision: input.featureRevision ?? null,
        graphRevision: input.graphRevision ?? null,
        ontologyRevision: input.ontologyRevision ?? null,
        modelRevision: input.modelRevision ?? null,
        inputDigest: input.inputDigest ?? null,
        outputDigest: input.outputDigest ?? null,
        generatedAt: input.generatedAt ?? null,
        lastVerifiedAt: input.lastVerifiedAt ?? null,
      },
    }));
  }

  return tuples;
}

export function buildOntologyLinkedTuplesFromFeatureRow(input: {
  featureRow: Pick<FeatureMatrixRowV1, 'identity' | 'lexical' | 'domain_class' | 'secondary_domains' | 'ontology_ids' | 'concept_ids' | 'evidence_state'>;
  packetKey: string;
  sourceRef: string;
  featureLabel: string;
  sourceTables: string[];
  labelerVersion?: string | null;
  taggerVersion?: string | null;
  ontologyVersion?: string | null;
  nlpVersion?: string | null;
  sourceRevision?: string | null;
  representationId?: string | null;
  representationRevision?: string | null;
  producerId?: string | null;
  producerRevision?: string | null;
  featureRevision?: string | null;
  graphRevision?: string | null;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  inputDigest?: string | null;
  outputDigest?: string | null;
  generatedAt?: string | null;
  lastVerifiedAt?: string | null;
  participants?: OntologyLinkedTupleParticipant[] | null;
  evidenceRefs?: string[] | null;
}): OntologyLinkedTupleV1[] {
  return buildOntologyLinkedTuplesFromClassification({
    classification: {
      identity: {
        packetKey: input.packetKey,
        sourceRef: input.sourceRef,
        contentHash: '',
        workspaceRevision: '',
        featureId: input.featureRow.identity.feature_id,
        featureLabel: input.featureLabel,
        titleId: input.featureRow.identity.title_id ?? null,
        treeNodeId: input.featureRow.identity.tree_node_id ?? null,
        qdrantPointId: null,
      },
      signals: {
        laneStatus: 'ACTIVE',
        evidenceState: input.featureRow.evidence_state ?? 'ACTIVE_VERIFIED',
        knowledgeResolution: 'RESOLVED',
        domainClass: input.featureRow.domain_class ?? null,
        secondaryDomains: input.featureRow.secondary_domains ?? [],
        ontologyIds: input.featureRow.ontology_ids ?? [],
        conceptIds: input.featureRow.concept_ids ?? [],
        runtimeEvidenceRefs: [],
        testEvidenceRefs: [],
        partOfSpeech: input.featureRow.lexical?.part_of_speech ?? null,
      },
      provenance: {
        packetSchemaVersion: 'feature-matrix-row-v1',
        featureSchemaVersion: 'feature-matrix-row-v1',
        validationSchemaVersion: 'feature-matrix-row-v1',
        ledgerSchemaVersion: 'feature-matrix-row-v1',
        createdAt: new Date().toISOString(),
      },
      validation: {
        layer: 'validation',
        packetKey: input.packetKey,
        sourceRef: input.sourceRef,
        contentHash: '',
        workspaceRevision: '',
        validatedBy: 'feature-row-bridge',
        phase: 'feature-row-bridge',
        canPromotion: 'NOT_PROVEN',
        isValid: true,
        outcome: 'bridge',
        ledgerPath: null,
        recordedAt: new Date().toISOString(),
      },
    },
    featureRow: input.featureRow,
    sourceTables: input.sourceTables,
    labelerVersion: input.labelerVersion,
    taggerVersion: input.taggerVersion,
    ontologyVersion: input.ontologyVersion,
    nlpVersion: input.nlpVersion,
    sourceRevision: input.sourceRevision,
    representationId: input.representationId,
    representationRevision: input.representationRevision,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
    featureRevision: input.featureRevision,
    graphRevision: input.graphRevision,
    ontologyRevision: input.ontologyRevision,
    modelRevision: input.modelRevision,
    inputDigest: input.inputDigest,
    outputDigest: input.outputDigest,
    generatedAt: input.generatedAt,
    lastVerifiedAt: input.lastVerifiedAt,
    participants: input.participants,
    evidenceRefs: input.evidenceRefs,
  });
}
