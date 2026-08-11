import { z } from 'zod';
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
    featureId: z.string().min(1),
    featureLabel: z.string().min(1),
    treeNodeId: z.string().min(1).nullable().optional(),
    titleId: z.string().min(1).nullable().optional(),
    representationId: z.literal('semantic_768').default('semantic_768'),
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
    featureId: z.string().min(1),
    featureLabel: z.string().min(1),
    treeNodeId: z.string().min(1).nullable().optional(),
    titleId: z.string().min(1).nullable().optional(),
    representationId: z.literal('semantic_768'),
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
        representationId: z.literal('semantic_768'),
        representationRevision: z.string().min(1),
        producerId: z.string().min(1),
        producerRevision: z.string().min(1),
        featureRevision: z.string().min(1),
        graphRevision: z.string().min(1).nullable().optional(),
        ontologyRevision: z.string().min(1).nullable().optional(),
        modelRevision: z.string().min(1).nullable().optional(),
      })
      .strict(),
  })
  .strict();

export type PosConceptTaggingPacket = z.infer<typeof PosConceptTaggingPacketSchema>;

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
  const inputDigest = request.inputDigest ?? sha256Hex(stableStringify({
    schemaVersion: request.schemaVersion,
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
    astSymbols: request.astSymbols,
    semanticConceptIds: request.semanticConceptIds,
    ontologyIds: request.ontologyIds,
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
  });
}
