import { z } from 'zod';
import {
  FEATURE_EXTRACTION_SCHEMA_VERSION,
  CANONICAL_SEMANTIC_REPRESENTATION_ID,
  CANONICAL_SEMANTIC_DIMENSION,
  buildFeatureVector5StaticRow,
  FeatureMatrixSetupV1Schema,
  JsonlParsedEvidenceV1Schema,
  PosCandidateLabelSchema,
  PosTaggerOutputV1Schema,
  type FeatureMatrixSetupV1,
  type JsonlParsedEvidenceV1,
  type PosCandidateLabel,
  type PosTaggerOutputV1,
} from './contracts/feature-extraction-v1.js';
import { DomainClassificationV1Schema, type DomainClassificationV1 } from './contracts/semantic-signal-v1.js';
import {
  OntologyLinkedTupleEvidenceStateSchema,
  OntologyLinkedTupleLabelKindSchema,
  OntologyLinkedTupleLabelSourceSchema,
  OntologyLinkedTupleParticipantKindSchema,
  OntologyLinkedTupleParticipantRoleSchema,
  OntologyLinkedTupleParticipantSchema,
  OntologyLinkedTupleV1Schema,
  buildOntologyLinkedTupleId,
  type OntologyLinkedTupleParticipant,
  type OntologyLinkedTupleV1,
} from './contracts/ontology-linked-tuple-v1.js';

const PosConceptEvidenceCitationSchema = z
  .object({
    citationText: z.string().min(1),
    sourceRef: z.string().min(1).optional().nullable(),
    sourceUrl: z.string().url().optional().nullable(),
    page: z.number().int().positive().optional().nullable(),
    note: z.string().min(1).optional().nullable(),
  })
  .strict();

const PosConceptScreenshotSchema = z
  .object({
    path: z.string().min(1),
    caption: z.string().min(1).optional().nullable(),
    sourceRef: z.string().min(1).optional().nullable(),
    hash: z.string().min(1).optional().nullable(),
  })
  .strict();

const PosConceptMcpToolCallSchema = z
  .object({
    callId: z.string().min(1),
    toolName: z.string().min(1),
    dependencyMode: z.enum(['independent', 'dependent', 'sequential']).default('independent'),
    summary: z.string().min(1).optional().nullable(),
    sourceRef: z.string().min(1).optional().nullable(),
    packetKey: z.string().min(1).optional().nullable(),
    resultDigest: z.string().min(1).optional().nullable(),
  })
  .strict();

const PosConceptRankingSignalsSchema = z
  .object({
    bm25: z.number().min(0).max(1).optional().nullable(),
    bm42: z.number().min(0).max(1).optional().nullable(),
    pageRank: z.number().min(0).max(1).optional().nullable(),
    manifold: z
      .object({
        x: z.number().optional().nullable(),
        y: z.number().optional().nullable(),
        z: z.number().optional().nullable(),
        w: z.number().optional().nullable(),
      })
      .optional()
      .nullable(),
    somCell: z.string().min(1).optional().nullable(),
    kmeansCluster: z.number().int().nonnegative().optional().nullable(),
    communityId: z.union([z.string(), z.number()]).optional().nullable(),
  })
  .strict();

const PosConceptNaryConceptSchema = z
  .object({
    conceptId: z.string().min(1),
    label: z.string().min(1),
    labelKind: OntologyLinkedTupleLabelKindSchema.default('tag'),
    labelSource: OntologyLinkedTupleLabelSourceSchema.default('semantic_tagger'),
    partOfSpeech: z.string().min(1).optional().nullable(),
    ontologyIds: z.array(z.string().min(1)).max(32).default([]),
    conceptIds: z.array(z.string().min(1)).max(32).default([]),
    confidence: z.number().min(0).max(1).default(0.8),
    participants: z.array(OntologyLinkedTupleParticipantSchema).max(16).min(1),
    evidenceRefs: z.array(z.string().min(1)).max(32).default([]),
  })
  .strict();

export type PosConceptNaryConcept = z.infer<typeof PosConceptNaryConceptSchema>;

export const PosConceptTaggingRequestSchema = z
  .object({
    schemaVersion: z.literal('pos-concept-tagging-lane.v1').default('pos-concept-tagging-lane.v1'),
    packetKey: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    workspaceRevision: z.string().min(1).nullable().optional(),
    featureId: z.string().min(1),
    featureLabel: z.string().min(1),
    treeNodeId: z.string().min(1).nullable().optional(),
    titleId: z.string().min(1).nullable().optional(),
    jsonlSourceDigest: z.string().min(1).nullable().optional(),
    jsonlRecordIndex: z.number().int().nonnegative().nullable().optional(),
    jsonlLineNumber: z.number().int().nonnegative().nullable().optional(),
    jsonlParserRevision: z.string().min(1).nullable().optional(),
    representationId: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID).default(CANONICAL_SEMANTIC_REPRESENTATION_ID),
    representationRevision: z.string().min(1),
    producerId: z.string().min(1).default('pos-concept-tagging-lane'),
    producerRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    graphRevision: z.string().min(1).nullable().optional(),
    ontologyRevision: z.string().min(1).nullable().optional(),
    modelRevision: z.string().min(1).nullable().optional(),
    partOfSpeech: z.string().min(1).nullable().optional(),
    astSymbols: z.array(z.string().min(1)).max(64).default([]),
    semanticConceptIds: z.array(z.string().min(1)).max(32).default([]),
    ontologyIds: z.array(z.string().min(1)).max(32).default([]),
    posCandidateLabels: z.array(PosCandidateLabelSchema).max(8).default([]),
    citations: z.array(PosConceptEvidenceCitationSchema).max(16).default([]),
    screenshots: z.array(PosConceptScreenshotSchema).max(16).default([]),
    policySummary: z.string().min(1).nullable().optional(),
    mcpToolCalls: z.array(PosConceptMcpToolCallSchema).max(3).default([]),
    rankingSignals: PosConceptRankingSignalsSchema.default({}),
    participants: z.array(OntologyLinkedTupleParticipantSchema).max(16).default([]),
    concepts: z.array(PosConceptNaryConceptSchema).max(32).default([]),
    sourceTables: z.array(z.string().min(1)).max(12).default([]),
    inputDigest: z.string().min(1).nullable().optional(),
    lastVerifiedAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export type PosConceptTaggingRequest = z.infer<typeof PosConceptTaggingRequestSchema>;

export const PosConceptTaggingPacketSchema = z
  .object({
    schemaVersion: z.literal('pos-concept-tagging-packet.v1'),
    packetKey: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    workspaceRevision: z.string().min(1).nullable().optional(),
    featureId: z.string().min(1),
    featureLabel: z.string().min(1),
    treeNodeId: z.string().min(1).nullable().optional(),
    titleId: z.string().min(1).nullable().optional(),
    jsonlSourceDigest: z.string().min(1).nullable().optional(),
    jsonlRecordIndex: z.number().int().nonnegative().nullable().optional(),
    jsonlLineNumber: z.number().int().nonnegative().nullable().optional(),
    jsonlParserRevision: z.string().min(1).nullable().optional(),
    representationId: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
    representationRevision: z.string().min(1),
    producerId: z.string().min(1),
    producerRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    graphRevision: z.string().min(1).nullable().optional(),
    ontologyRevision: z.string().min(1).nullable().optional(),
    modelRevision: z.string().min(1).nullable().optional(),
    partOfSpeech: z.string().min(1).nullable().optional(),
    astSymbols: z.array(z.string().min(1)).max(64),
    semanticConceptIds: z.array(z.string().min(1)).max(32),
    ontologyIds: z.array(z.string().min(1)).max(32),
    posCandidateLabels: z.array(PosCandidateLabelSchema).max(8),
    citations: z.array(PosConceptEvidenceCitationSchema).max(16),
    screenshots: z.array(PosConceptScreenshotSchema).max(16),
    policySummary: z.string().min(1).nullable().optional(),
    mcpToolCalls: z.array(PosConceptMcpToolCallSchema).max(3),
    rankingSignals: PosConceptRankingSignalsSchema,
    participants: z.array(OntologyLinkedTupleParticipantSchema).max(16),
    nAryConcepts: z.array(PosConceptNaryConceptSchema).max(32),
    ontologyLinkedTuples: z.array(OntologyLinkedTupleV1Schema).max(64),
    sourceTables: z.array(z.string().min(1)).max(12),
    evidenceState: OntologyLinkedTupleEvidenceStateSchema,
    inputDigest: z.string().min(1),
    outputDigest: z.string().min(1),
    generatedAt: z.string().datetime(),
    lastVerifiedAt: z.string().datetime().nullable().optional(),
    provenance: z
      .object({
        sourceRevision: z.string().min(1),
        representationId: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
        representationRevision: z.string().min(1),
        producerId: z.string().min(1),
        producerRevision: z.string().min(1),
        featureRevision: z.string().min(1),
        graphRevision: z.string().min(1).nullable().optional(),
        ontologyRevision: z.string().min(1).nullable().optional(),
        modelRevision: z.string().min(1).nullable().optional(),
      })
      .strict(),
    jsonlParsedEvidence: JsonlParsedEvidenceV1Schema,
    posTaggerOutput: PosTaggerOutputV1Schema,
    domainClassification: DomainClassificationV1Schema.nullable(),
    featureMatrixSetup: FeatureMatrixSetupV1Schema,
    featureVector5Static: z.object({ schema_version: z.literal(FEATURE_EXTRACTION_SCHEMA_VERSION), kind: z.literal('feature_matrix_5') }).passthrough(),
    featureBundle: z
      .object({
        jsonlParsedEvidence: JsonlParsedEvidenceV1Schema,
        posTaggerOutput: PosTaggerOutputV1Schema,
        domainClassification: DomainClassificationV1Schema.nullable(),
        featureMatrixSetup: FeatureMatrixSetupV1Schema,
        featureVector5Static: z.object({ schema_version: z.literal(FEATURE_EXTRACTION_SCHEMA_VERSION), kind: z.literal('feature_matrix_5') }).passthrough(),
      })
      .strict(),
  })
  .strict();

export type PosConceptTaggingPacket = z.infer<typeof PosConceptTaggingPacketSchema>;
export type PosConceptTaggingFeatureBundle = {
  jsonlParsedEvidence: JsonlParsedEvidenceV1;
  posTaggerOutput: PosTaggerOutputV1;
  domainClassification: DomainClassificationV1 | null;
  featureMatrixSetup: FeatureMatrixSetupV1;
  featureVector5Static: unknown;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}

function sha256Hex(value: string): string {
  return buildOntologyLinkedTupleId([value]);
}

function canonicalParticipantKey(participant: OntologyLinkedTupleParticipant): string {
  return [participant.entityKind, participant.role, participant.entityId, participant.label ?? ''].join('|');
}

function canonicalizeParticipants(participants: OntologyLinkedTupleParticipant[]): OntologyLinkedTupleParticipant[] {
  return Array.from(
    new Map(
      participants.map((participant) => [canonicalParticipantKey(participant), OntologyLinkedTupleParticipantSchema.parse(participant)])
    ).values()
  ).sort((left, right) => canonicalParticipantKey(left).localeCompare(canonicalParticipantKey(right))).slice(0, 16);
}

function canonicalizeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function buildJsonlParsedEvidence(input: PosConceptTaggingRequest, createdAt: string): JsonlParsedEvidenceV1 {
  return JsonlParsedEvidenceV1Schema.parse({
    schema_version: FEATURE_EXTRACTION_SCHEMA_VERSION,
    kind: 'jsonl_parsed_evidence',
    packet_key: input.packetKey,
    source_ref: input.sourceRef,
    source_revision: input.sourceRevision,
    workspace_revision: input.producerRevision,
    parser_revision: input.jsonlParserRevision ?? input.producerRevision,
    record_index: input.jsonlRecordIndex ?? 0,
    line_number: input.jsonlLineNumber ?? 0,
    raw_json: {
      packetKey: input.packetKey,
      sourceRef: input.sourceRef,
      treeNodeId: input.treeNodeId ?? null,
      titleId: input.titleId ?? null,
      featureId: input.featureId,
      featureLabel: input.featureLabel,
      partOfSpeech: input.partOfSpeech ?? null,
      sourceTables: canonicalizeStrings(input.sourceTables),
    },
    content_hash: input.inputDigest ?? input.featureRevision,
    created_at: createdAt,
  });
}

function buildPosTaggerOutput(
  input: PosConceptTaggingRequest,
  topLabels: PosCandidateLabel[],
  createdAt: string
): PosTaggerOutputV1 {
  const pos = input.partOfSpeech ?? 'UNKNOWN';

  return PosTaggerOutputV1Schema.parse({
    schema_version: FEATURE_EXTRACTION_SCHEMA_VERSION,
    kind: 'pos_tagger_output',
    packet_key: input.packetKey,
    source_ref: input.sourceRef,
    source_revision: input.sourceRevision,
    tree_node_id: input.treeNodeId ?? null,
    title_id: input.titleId ?? null,
    representation_id: input.representationId,
    representation_revision: input.representationRevision,
    producer_id: input.producerId,
    producer_revision: input.producerRevision,
    model_revision: input.modelRevision ?? null,
    head_type: 'pytorch',
    token_index: 0,
    surface: input.featureLabel,
    part_of_speech: pos,
    confidence: topLabels[0]?.score ?? 0.5,
    top_k_labels: topLabels.slice(0, 8),
    evidence_refs: buildEvidenceRefs(input),
    created_at: createdAt,
  });
}

function buildFeatureMatrixSetup(
  input: PosConceptTaggingRequest,
  parserRevision: string,
  createdAt: string
): FeatureMatrixSetupV1 {
  return FeatureMatrixSetupV1Schema.parse({
    schema_version: FEATURE_EXTRACTION_SCHEMA_VERSION,
    kind: 'feature_matrix_setup',
    packet_key: input.packetKey,
    source_ref: input.sourceRef,
    source_revision: input.sourceRevision,
    workspace_revision: input.workspaceRevision ?? input.graphRevision ?? input.sourceRevision,
    tree_node_id: input.treeNodeId ?? null,
    title_id: input.titleId ?? null,
    representation_id: input.representationId,
    representation_revision: input.representationRevision,
    semantic_dimension: CANONICAL_SEMANTIC_DIMENSION,
    feature_revision: input.featureRevision,
    producer_id: input.producerId,
    producer_revision: input.producerRevision,
    parser_revision: parserRevision,
    extractor_revision: input.featureRevision,
    pos_tagger_revision: input.modelRevision ?? input.producerRevision,
    domain_classifier_revision: input.modelRevision ?? input.producerRevision,
    graph_revision: input.graphRevision ?? null,
    jsonl_source_digest: input.inputDigest ?? input.featureRevision,
    feature_tiers: {
      static_packet: {
        enabled: true,
        tensor_name: 'feature_matrix_5',
        representation_id: 'feature_matrix_5',
        width: 5,
        column_names: [
          'authority_norm',
          'domain_fit_base',
          'ast_signal',
          'entropy_norm',
          'execution_utility',
        ],
        storage_format: 'feature_matrix_5.arrow',
        presence_mask_required: true,
        source_provenance: {
          workspace_revision: input.workspaceRevision ?? input.graphRevision ?? input.sourceRevision,
          source_revision: input.sourceRevision,
          feature_revision: input.featureRevision,
        },
      },
      candidate_query: {
        enabled: true,
        tensor_name: 'candidate_feature_matrix',
        width: 25,
        column_names: [
          'semantic_similarity_768',
          'lexical_score',
          'exact_symbol_match',
          'ast_signal',
          'authority_norm',
          'community_fit',
          'domain_fit_query',
          'concept_fit',
          'nary_relation_fit',
          'kmeans_centroid_similarity',
          'kmeans_cluster_rank',
          'som_distance',
          'som_neighbor_radius',
          'hilbert_locality',
          'summary_quality',
          'summary_provenance',
          'recency',
          'retrieval_frequency',
          'execution_utility',
          'graph_distance',
          'process_fit',
          'dependency_fanout',
          'feature_label_confidence',
          'source_revision_match',
          'representation_revision_match',
        ],
        ranking_role: 'query_time_rerank',
        top_cluster_soft_cap: 8,
        kmeans_candidates: [64, 128, 256],
        som_grid: [20, 20],
        hilbert_soft_cap: 8,
        exact_knn_top_k: 100,
        rerank_top_k: 64,
      },
      semantic: {
        enabled: true,
        tensor_name: CANONICAL_SEMANTIC_REPRESENTATION_ID,
        representation_id: CANONICAL_SEMANTIC_REPRESENTATION_ID,
        width: CANONICAL_SEMANTIC_DIMENSION,
        source_role: 'canonical_semantic_geometry',
        storage_format: 'semantic_768.arrow',
      },
    },
    derived_heads: {
      pos: {
        enabled: true,
        head_type: 'pytorch',
        max_labels: 8,
      },
      domain: {
        enabled: true,
        head_type: 'pytorch',
        max_labels: 8,
      },
    },
    created_at: createdAt,
  });
}

function buildDomainClassification(input: PosConceptTaggingRequest, evidenceRefs: string[], createdAt: string): DomainClassificationV1 | null {
  const haystack = [
    input.featureLabel,
    input.featureId,
    input.sourceRef,
    input.treeNodeId ?? '',
    input.titleId ?? '',
    ...input.astSymbols,
    ...input.semanticConceptIds,
    ...input.ontologyIds,
    ...input.sourceTables,
  ]
    .join(' ')
    .toLowerCase();

  const labels: Array<{ label: string; score: number; source: 'deterministic' | 'fallback'; evidence_kinds: string[] }> = [];
  const push = (label: string, score: number, evidenceKinds: string[]) => {
    if (labels.some((entry) => entry.label === label)) return;
    labels.push({ label, score, source: 'deterministic', evidence_kinds: evidenceKinds });
  };

  if (/\b(route|router|endpoint|api)\b/.test(haystack)) push('routing', 0.96, ['source_ref', 'ast_symbol']);
  if (/\b(test|spec|fixture)\b/.test(haystack)) push('testing', 0.94, ['source_ref', 'ast_symbol']);
  if (/\b(class|type|interface|schema)\b/.test(haystack)) push('types', 0.92, ['ast_symbol']);
  if (/\b(function|method|call|invoke)\b/.test(haystack)) push('code-execution', 0.9, ['ast_symbol']);
  if (input.partOfSpeech) push('pos-tagging', 0.89, ['part_of_speech']);
  if (input.ontologyIds.length > 0) push('ontology', 0.88, ['ontology_id']);
  if (input.semanticConceptIds.length > 0) push('semantic', 0.86, ['semantic_concept']);
  if (input.rankingSignals.pageRank != null || input.graphRevision) push('graph', 0.84, ['ranking_signal', 'graph_revision']);
  if (input.rankingSignals.kmeansCluster != null || input.rankingSignals.somCell) push('topology', 0.82, ['ranking_signal']);
  if (input.rankingSignals.bm25 != null || input.rankingSignals.bm42 != null) push('lexical', 0.8, ['ranking_signal']);

  if (labels.length === 0) {
    labels.push({
      label: 'semantic',
      score: 0.75,
      source: 'fallback',
      evidence_kinds: evidenceRefs.length > 0 ? ['evidence_ref'] : [],
    });
  }

  const limitedLabels = labels.slice(0, 8);
  const primary_label = limitedLabels[0]?.label ?? null;
  const secondary_labels = limitedLabels.slice(1).map((entry) => entry.label);
  const workspaceRevision = input.workspaceRevision ?? input.graphRevision ?? input.sourceRevision;
  const evidencePayload = canonicalizeStrings([...evidenceRefs, input.sourceRef, input.packetKey])
    .slice(0, 16)
    .map((source_ref, index) => ({
      source_ref,
      evidence_kind: index === 0 ? 'primary' : 'supporting',
      content_hash: null,
      packet_key: input.packetKey,
      tree_node_id: input.treeNodeId ?? null,
      note: null,
    }));

  return DomainClassificationV1Schema.parse({
    schema_version: 'atlas.semantic_signal.v1',
    signal_type: 'domain_classification',
    subject_id: input.packetKey,
    workspace_revision: workspaceRevision ?? input.sourceRevision,
    producer: input.producerId,
    producer_revision: input.producerRevision,
    evidence_refs: evidencePayload,
    labels: limitedLabels,
    primary_label,
    secondary_labels,
    confidence: limitedLabels[0]?.score ?? 0.75,
    ood_score: null,
    model_revision_state: input.modelRevision ? 'PROVEN' : 'NOT_PROVEN',
    created_at: createdAt,
  });
}

function buildEvidenceRefs(input: PosConceptTaggingRequest): string[] {
  return canonicalizeStrings([
    ...(input.citations.map((citation) => citation.sourceRef ?? citation.sourceUrl ?? citation.citationText)),
    ...input.screenshots.map((screenshot) => screenshot.path),
    ...input.mcpToolCalls.map((call) => call.callId),
    ...(input.astSymbols.length > 0 ? input.astSymbols : []),
    ...(input.semanticConceptIds.length > 0 ? input.semanticConceptIds : []),
    ...(input.ontologyIds.length > 0 ? input.ontologyIds : []),
  ]).slice(0, 32);
}

function buildDefaultParticipants(input: PosConceptTaggingRequest): OntologyLinkedTupleParticipant[] {
  const participants: OntologyLinkedTupleParticipant[] = [
    {
      entityId: input.packetKey,
      entityKind: 'packet',
      role: 'packet',
      label: input.featureLabel,
    },
    {
      entityId: input.sourceRef,
      entityKind: 'source_ref',
      role: 'source',
      label: input.sourceRef,
    },
  ];

  if (input.treeNodeId) {
    participants.push({
      entityId: input.treeNodeId,
      entityKind: 'tree_node',
      role: 'context',
      label: input.featureLabel,
    });
  }

  for (const symbol of input.astSymbols.slice(0, 16)) {
    participants.push({
      entityId: symbol,
      entityKind: 'ast_symbol',
      role: 'symbol',
      label: symbol,
    });
  }

  for (const conceptId of input.semanticConceptIds.slice(0, 16)) {
    participants.push({
      entityId: conceptId,
      entityKind: 'semantic_concept',
      role: 'target',
      label: conceptId,
    });
  }

  for (const citation of input.citations.slice(0, 8)) {
    participants.push({
      entityId: citation.sourceRef ?? citation.citationText,
      entityKind: 'citation',
      role: 'evidence',
      label: citation.citationText,
    });
  }

  for (const screenshot of input.screenshots.slice(0, 8)) {
    participants.push({
      entityId: screenshot.path,
      entityKind: 'screenshot',
      role: 'evidence',
      label: screenshot.caption ?? screenshot.path,
    });
  }

  return canonicalizeParticipants([...participants, ...input.participants]);
}

function buildPrimaryConcepts(input: PosConceptTaggingRequest, participants: OntologyLinkedTupleParticipant[], evidenceRefs: string[]): PosConceptNaryConcept[] {
  const baseConceptIds = canonicalizeStrings([...input.semanticConceptIds, ...input.ontologyIds]);
  const primaryConceptId = baseConceptIds[0] ?? input.featureId;
  const posTag = input.partOfSpeech ?? null;
  const concepts: PosConceptNaryConcept[] = input.concepts.length > 0
    ? input.concepts.map((concept) => PosConceptNaryConceptSchema.parse(concept))
    : [
        PosConceptNaryConceptSchema.parse({
          conceptId: primaryConceptId,
          label: input.featureLabel,
          labelKind: input.ontologyIds.length > 0 ? 'ontology' : 'tag',
          labelSource: 'semantic_tagger',
          partOfSpeech: posTag,
          ontologyIds: input.ontologyIds,
          conceptIds: baseConceptIds,
          confidence: input.rankingSignals.pageRank != null ? 0.92 : 0.88,
          participants,
          evidenceRefs,
        }),
      ];

  if (posTag) {
    concepts.push(
      PosConceptNaryConceptSchema.parse({
        conceptId: `pos:${posTag}`,
        label: posTag,
        labelKind: 'pos',
        labelSource: 'pos_tagger',
        partOfSpeech: posTag,
        ontologyIds: [],
        conceptIds: [],
        confidence: 0.94,
        participants,
        evidenceRefs,
      })
    );
  }

  return concepts
    .map((concept) => ({
      ...concept,
      participants: canonicalizeParticipants(concept.participants),
      evidenceRefs: canonicalizeStrings(concept.evidenceRefs),
    }))
    .sort((left, right) => left.conceptId.localeCompare(right.conceptId));
}

function buildTupleId(input: PosConceptTaggingRequest, concept: PosConceptNaryConcept, evidenceRefs: string[], participants: OntologyLinkedTupleParticipant[]): string {
  return buildOntologyLinkedTupleId([
    'pos-concept-tagging-lane.v1',
    input.packetKey,
    input.sourceRef,
    input.sourceRevision,
    input.representationId,
    input.representationRevision,
    input.producerId,
    input.producerRevision,
    input.featureRevision,
    input.graphRevision ?? '',
    input.ontologyRevision ?? '',
    input.modelRevision ?? '',
    input.featureId,
    concept.conceptId,
    concept.label,
    concept.labelKind,
    concept.labelSource,
    concept.partOfSpeech ?? '',
    ...participants.map(canonicalParticipantKey),
  ]);
}

function buildTupleProvenance(input: PosConceptTaggingRequest, outputDigest: string, generatedAt: string) {
  return {
    sourceTables: canonicalizeStrings(input.sourceTables),
    labelerVersion: input.producerRevision,
    taggerVersion: input.producerRevision,
    ontologyVersion: input.ontologyRevision ?? null,
    nlpVersion: input.modelRevision ?? null,
    sourceRevision: input.sourceRevision,
    representationId: input.representationId,
    representationRevision: input.representationRevision,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
    featureRevision: input.featureRevision,
    graphRevision: input.graphRevision ?? null,
    ontologyRevision: input.ontologyRevision ?? null,
    modelRevision: input.modelRevision ?? null,
    inputDigest: input.inputDigest ?? null,
    outputDigest,
    generatedAt,
    lastVerifiedAt: input.lastVerifiedAt ?? generatedAt,
  };
}

function buildPacketProvenance(input: PosConceptTaggingRequest) {
  return {
    sourceRevision: input.sourceRevision,
    representationId: input.representationId,
    representationRevision: input.representationRevision,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
    featureRevision: input.featureRevision,
    graphRevision: input.graphRevision ?? null,
    ontologyRevision: input.ontologyRevision ?? null,
    modelRevision: input.modelRevision ?? null,
  };
}

function buildRankingSignalRefs(input: PosConceptTaggingRequest): string[] {
  const refs: string[] = [];
  if (input.rankingSignals.bm25 != null) refs.push(`bm25:${input.rankingSignals.bm25.toFixed(4)}`);
  if (input.rankingSignals.bm42 != null) refs.push(`bm42:${input.rankingSignals.bm42.toFixed(4)}`);
  if (input.rankingSignals.pageRank != null) refs.push(`pagerank:${input.rankingSignals.pageRank.toFixed(4)}`);
  if (input.rankingSignals.somCell) refs.push(`som:${input.rankingSignals.somCell}`);
  if (input.rankingSignals.kmeansCluster != null) refs.push(`kmeans:${input.rankingSignals.kmeansCluster}`);
  if (input.rankingSignals.communityId != null) refs.push(`community:${String(input.rankingSignals.communityId)}`);
  if (input.rankingSignals.manifold) {
    const coords = [input.rankingSignals.manifold.x, input.rankingSignals.manifold.y, input.rankingSignals.manifold.z, input.rankingSignals.manifold.w]
      .map((value) => (value == null ? 'null' : value.toFixed(4)))
      .join(',');
    refs.push(`manifold:${coords}`);
  }
  return canonicalizeStrings(refs);
}

export function buildPosConceptTaggingPacket(input: PosConceptTaggingRequest): PosConceptTaggingPacket {
  const request = PosConceptTaggingRequestSchema.parse(input);
  const participants = buildDefaultParticipants(request);
  const evidenceRefs = buildEvidenceRefs(request);
  const nAryConcepts = buildPrimaryConcepts(request, participants, evidenceRefs);
  const generatedAt = new Date().toISOString();
  const rankingSignalRefs = buildRankingSignalRefs(request);
  const jsonlParsedEvidence = buildJsonlParsedEvidence(request, generatedAt);
  const candidateLabels = request.posCandidateLabels.length > 0
    ? request.posCandidateLabels
    : [
        {
          label: request.partOfSpeech ?? 'UNKNOWN',
          score: request.partOfSpeech ? 0.94 : 0.5,
        },
        ...canonicalizeStrings([request.semanticConceptIds[0] ?? null, request.ontologyIds[0] ?? null])
          .slice(0, 7)
          .map((label, index) => ({
            label,
            score: Math.max(0.1, 0.85 - index * 0.05),
          })),
      ];
  const posTaggerOutput = buildPosTaggerOutput(
    request,
    candidateLabels,
    generatedAt
  );
  const domainClassification = buildDomainClassification(request, evidenceRefs, generatedAt);
  const featureMatrixSetup = buildFeatureMatrixSetup(request, jsonlParsedEvidence.parser_revision, generatedAt);
  const featureVector5Static = buildFeatureVector5StaticRow({
    packetKey: request.packetKey,
    sourceRef: request.sourceRef,
    sourceRevision: request.sourceRevision,
    workspaceRevision: request.workspaceRevision ?? request.graphRevision ?? request.sourceRevision,
    representationRevision: request.representationRevision,
    featureRevision: request.featureRevision,
    authorityNorm: request.rankingSignals.pageRank ?? null,
    domainFitBase: domainClassification?.confidence ?? null,
    astSignal: canonicalizeStrings(request.astSymbols).length > 0 ? Math.min(1, canonicalizeStrings(request.astSymbols).length / 12) : null,
    entropyNorm: null,
    executionUtility: null,
    createdAt: generatedAt,
  });
  const inputDigest = request.inputDigest ?? sha256Hex(stableStringify({
    schemaVersion: request.schemaVersion,
    packetKey: request.packetKey,
    sourceRef: request.sourceRef,
    sourceRevision: request.sourceRevision,
    workspaceRevision: request.workspaceRevision ?? null,
    jsonlSourceDigest: request.jsonlSourceDigest ?? null,
    jsonlRecordIndex: request.jsonlRecordIndex ?? null,
    jsonlLineNumber: request.jsonlLineNumber ?? null,
    jsonlParserRevision: request.jsonlParserRevision ?? null,
    featureId: request.featureId,
    featureLabel: request.featureLabel,
    treeNodeId: request.treeNodeId ?? null,
    titleId: request.titleId ?? null,
    representationId: request.representationId,
    representationRevision: request.representationRevision,
    producerId: request.producerId,
    producerRevision: request.producerRevision,
    featureRevision: request.featureRevision,
    graphRevision: request.graphRevision ?? null,
    ontologyRevision: request.ontologyRevision ?? null,
    modelRevision: request.modelRevision ?? null,
    partOfSpeech: request.partOfSpeech ?? null,
    astSymbols: request.astSymbols,
    semanticConceptIds: request.semanticConceptIds,
    ontologyIds: request.ontologyIds,
    posCandidateLabels: request.posCandidateLabels,
    citations: request.citations,
    screenshots: request.screenshots,
    policySummary: request.policySummary ?? null,
    mcpToolCalls: request.mcpToolCalls,
    rankingSignals: request.rankingSignals,
    participants,
    concepts: request.concepts,
    sourceTables: request.sourceTables,
  }));

  const provisionalOutputDigest = request.inputDigest ?? sha256Hex(
    stableStringify({
      packetKey: request.packetKey,
      sourceRef: request.sourceRef,
      sourceRevision: request.sourceRevision,
      featureId: request.featureId,
      featureLabel: request.featureLabel,
      workspaceRevision: request.workspaceRevision ?? null,
      jsonlSourceDigest: request.jsonlSourceDigest ?? null,
      jsonlRecordIndex: request.jsonlRecordIndex ?? null,
      jsonlLineNumber: request.jsonlLineNumber ?? null,
      jsonlParserRevision: request.jsonlParserRevision ?? null,
      representationId: request.representationId,
      representationRevision: request.representationRevision,
      producerId: request.producerId,
      producerRevision: request.producerRevision,
      featureRevision: request.featureRevision,
      graphRevision: request.graphRevision ?? null,
      ontologyRevision: request.ontologyRevision ?? null,
      modelRevision: request.modelRevision ?? null,
      partOfSpeech: request.partOfSpeech ?? null,
      astSymbols: request.astSymbols,
      semanticConceptIds: request.semanticConceptIds,
    ontologyIds: request.ontologyIds,
    posCandidateLabels: candidateLabels,
    citations: request.citations,
    screenshots: request.screenshots,
      policySummary: request.policySummary ?? null,
      mcpToolCalls: request.mcpToolCalls,
      rankingSignals: request.rankingSignals,
      participants,
      concepts: nAryConcepts.map((concept) => ({
        conceptId: concept.conceptId,
        label: concept.label,
        labelKind: concept.labelKind,
        labelSource: concept.labelSource,
        partOfSpeech: concept.partOfSpeech ?? null,
      })),
      sourceTables: request.sourceTables,
    })
  );

  const ontologyLinkedTuples = nAryConcepts.map((concept) => {
    const tupleId = buildTupleId(request, concept, [...evidenceRefs, ...rankingSignalRefs], participants);
    return OntologyLinkedTupleV1Schema.parse({
      tupleId,
      schemaVersion: 'ontology-linked-tuple.v1',
      packetKey: request.packetKey,
      sourceRef: request.sourceRef,
      treeNodeId: request.treeNodeId ?? undefined,
      titleId: request.titleId ?? undefined,
      surfaceText: concept.label,
      tokenIndex: concept.partOfSpeech ? 0 : null,
      partOfSpeech: concept.partOfSpeech ?? null,
      label: concept.label,
      labelKind: concept.labelKind,
      labelSource: concept.labelSource,
      ontologyIds: canonicalizeStrings([...concept.ontologyIds]),
      conceptIds: canonicalizeStrings([...concept.conceptIds]),
      participants: concept.participants,
      evidenceRefs: canonicalizeStrings([...concept.evidenceRefs, ...rankingSignalRefs]).slice(0, 32),
      confidence: concept.confidence,
      evidenceState: input.rankingSignals.pageRank != null || input.semanticConceptIds.length > 0
        ? 'ACTIVE_VERIFIED'
        : 'REFERENCE_ONLY',
      provenance: buildTupleProvenance(request, provisionalOutputDigest, generatedAt),
    });
  });

  const outputDigest = sha256Hex(
    stableStringify({
      tupleIds: ontologyLinkedTuples.map((tuple) => tuple.tupleId),
      rankingSignals: request.rankingSignals,
      concepts: nAryConcepts.map((concept) => ({
        conceptId: concept.conceptId,
        label: concept.label,
        labelKind: concept.labelKind,
        labelSource: concept.labelSource,
      })),
    })
  );

  const tuples = ontologyLinkedTuples.map((tuple) =>
    OntologyLinkedTupleV1Schema.parse({
      ...tuple,
      provenance: {
        ...tuple.provenance,
        outputDigest,
      },
    })
  );

  return PosConceptTaggingPacketSchema.parse({
    schemaVersion: 'pos-concept-tagging-packet.v1',
    packetKey: request.packetKey,
    sourceRef: request.sourceRef,
    sourceRevision: request.sourceRevision,
    featureId: request.featureId,
    featureLabel: request.featureLabel,
    treeNodeId: request.treeNodeId ?? null,
    titleId: request.titleId ?? null,
    representationId: request.representationId,
    representationRevision: request.representationRevision,
    producerId: request.producerId,
    producerRevision: request.producerRevision,
    featureRevision: request.featureRevision,
    graphRevision: request.graphRevision ?? null,
    ontologyRevision: request.ontologyRevision ?? null,
    modelRevision: request.modelRevision ?? null,
    partOfSpeech: request.partOfSpeech ?? null,
    astSymbols: canonicalizeStrings(request.astSymbols).slice(0, 64),
    semanticConceptIds: canonicalizeStrings(request.semanticConceptIds).slice(0, 32),
    ontologyIds: canonicalizeStrings(request.ontologyIds).slice(0, 32),
    posCandidateLabels: candidateLabels,
    citations: request.citations.map((citation) => PosConceptEvidenceCitationSchema.parse(citation)),
    screenshots: request.screenshots.map((screenshot) => PosConceptScreenshotSchema.parse(screenshot)),
    policySummary: request.policySummary ?? null,
    mcpToolCalls: request.mcpToolCalls.map((call) => PosConceptMcpToolCallSchema.parse(call)),
    rankingSignals: request.rankingSignals,
    participants,
    nAryConcepts,
    ontologyLinkedTuples: tuples,
    sourceTables: canonicalizeStrings(request.sourceTables),
    evidenceState: input.rankingSignals.pageRank != null || input.semanticConceptIds.length > 0
      ? 'ACTIVE_VERIFIED'
      : 'REFERENCE_ONLY',
    inputDigest,
    outputDigest,
    generatedAt,
    lastVerifiedAt: request.lastVerifiedAt ?? generatedAt,
    provenance: buildPacketProvenance(request),
    jsonlParsedEvidence,
    posTaggerOutput,
    featureMatrixSetup,
    domainClassification,
    featureVector5Static,
    featureBundle: {
      jsonlParsedEvidence,
      posTaggerOutput,
      domainClassification,
      featureMatrixSetup,
      featureVector5Static,
    },
  });
}
