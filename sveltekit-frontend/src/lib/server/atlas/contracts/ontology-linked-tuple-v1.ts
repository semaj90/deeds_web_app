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

export const OntologyLinkedTupleProvenanceSchema = z.object({
  sourceTables: z.array(z.string().min(1)).max(12),
  labelerVersion: z.string().min(1).nullable(),
  taggerVersion: z.string().min(1).nullable(),
  ontologyVersion: z.string().min(1).nullable(),
  nlpVersion: z.string().min(1).nullable(),
});

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
  confidence: z.number().min(0).max(1),
  evidenceState: OntologyLinkedTupleEvidenceStateSchema,
  provenance: OntologyLinkedTupleProvenanceSchema,
});

export type OntologyLinkedTupleV1 = z.infer<typeof OntologyLinkedTupleV1Schema>;

function hashTupleId(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
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
    confidence: evidenceState === 'ACTIVE_VERIFIED' ? 0.95 : 0.72,
    evidenceState,
    provenance: {
      sourceTables,
      labelerVersion: input.labelerVersion ?? input.classification.provenance?.serializerVersion ?? null,
      taggerVersion: input.taggerVersion ?? null,
      ontologyVersion: input.ontologyVersion ?? null,
      nlpVersion: input.nlpVersion ?? null,
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
      confidence: 0.7,
      evidenceState,
      provenance: {
        sourceTables,
        labelerVersion: input.labelerVersion ?? input.classification.provenance?.serializerVersion ?? null,
        taggerVersion: input.taggerVersion ?? null,
        ontologyVersion: input.ontologyVersion ?? null,
        nlpVersion: input.nlpVersion ?? null,
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
      confidence: 0.9,
      evidenceState,
      provenance: {
        sourceTables,
        labelerVersion: input.labelerVersion ?? input.classification.provenance?.serializerVersion ?? null,
        taggerVersion: input.taggerVersion ?? null,
        ontologyVersion: input.ontologyVersion ?? null,
        nlpVersion: input.nlpVersion ?? null,
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
  });
}
