import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  extractAstAndEntities,
  type ExtractedFeature,
} from './ast-langextract-bridge.js';
import { computePacketKey } from '../atlas/identity/packet-key-builder.js';
import {
  buildPosConceptTaggingPacket,
  type PosConceptTaggingPacket,
} from '../atlas/pos-concept-tagging-lane.js';

const DEFAULT_REPRESENTATION_REVISION = 'semantic_768@1';
const DEFAULT_SEMANTIC_FEATURE_ENVELOPE_REVISION = 'semantic-feature-envelope.v1';
const DEFAULT_PRODUCER_ID = 'pos-concept-source-adapter';
const DEFAULT_PRODUCER_REVISION = 'pos-concept-source-adapter-v1';
const DEFAULT_FEATURE_REVISION = 'ast-grep-feature-registry-v1';

export interface SourcePosConceptPacketCitation {
  citationText: string;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  page?: number | null;
  note?: string | null;
}

export interface SourcePosConceptPacketScreenshot {
  path: string;
  caption?: string | null;
  sourceRef?: string | null;
  hash?: string | null;
}

export interface SourcePosConceptPacketToolCall {
  callId: string;
  toolName: string;
  dependencyMode?: 'independent' | 'dependent' | 'sequential';
  summary?: string | null;
  sourceRef?: string | null;
  packetKey?: string | null;
  resultDigest?: string | null;
}

export interface BuildPosConceptTaggingPacketFromSourceInput {
  packetKey?: string | null;
  sourceRef: string;
  sourceRevision: string;
  featureId?: string | null;
  featureLabel: string;
  text: string;
  isCode?: boolean;
  treeNodeId?: string | null;
  titleId?: string | null;
  workspaceRevision?: string | null;
  jsonlSourceDigest?: string | null;
  jsonlRecordIndex?: number | null;
  jsonlLineNumber?: number | null;
  jsonlParserRevision?: string | null;
  representationRevision?: string | null;
  producerId?: string | null;
  producerRevision?: string | null;
  featureRevision?: string | null;
  graphRevision?: string | null;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  partOfSpeech?: string | null;
  semanticConceptIds?: string[];
  ontologyIds?: string[];
  posCandidateLabels?: Array<{ label: string; score: number }>;
  citations?: SourcePosConceptPacketCitation[];
  screenshots?: SourcePosConceptPacketScreenshot[];
  mcpToolCalls?: SourcePosConceptPacketToolCall[];
  sourceTables?: string[];
  vectorRefs?: string[];
  rankingSignals?: {
    bm25?: number | null;
    bm42?: number | null;
    pageRank?: number | null;
    manifold?: {
      x?: number | null;
      y?: number | null;
      z?: number | null;
      w?: number | null;
    } | null;
    somCell?: string | null;
    kmeansCluster?: number | null;
    communityId?: string | number | null;
  };
  participants?: Array<{
    entityId: string;
    entityKind: string;
    role: string;
    label?: string | null;
  }>;
  concepts?: Array<{
    conceptId: string;
    label: string;
    labelKind?: string;
    labelSource?: string;
    partOfSpeech?: string | null;
    ontologyIds?: string[];
    conceptIds?: string[];
    confidence?: number;
    evidenceRefs?: string[];
    participants?: Array<{
      entityId: string;
      entityKind: string;
      role: string;
      label?: string | null;
    }>;
  }>;
  extractedFeatures?: ExtractedFeature[];
}

export interface BuildPosConceptTaggingPacketFromSourceResult {
  packet: PosConceptTaggingPacket;
  packetKey: string;
  extractedFeatures: ExtractedFeature[];
  semanticFeatureEnvelope: SemanticFeatureEnvelope;
}

export const SemanticFeatureEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(DEFAULT_SEMANTIC_FEATURE_ENVELOPE_REVISION),
    packetKey: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    treeNodeId: z.string().nullable(),
    titleId: z.string().nullable(),
    featureId: z.string().min(1),
    featureLabel: z.string().min(1),
    representationId: z.literal('semantic_768'),
    representationRevision: z.string().min(1),
    producerId: z.string().min(1),
    producerRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    graphRevision: z.string().nullable(),
    ontologyRevision: z.string().nullable(),
    modelRevision: z.string().nullable(),
    partOfSpeech: z.string().min(1),
    semanticConceptIds: z.array(z.string().min(1)),
    ontologyIds: z.array(z.string().min(1)),
    astSymbolCount: z.number().int().nonnegative(),
    extractedFeatureCount: z.number().int().nonnegative(),
    sourceTables: z.array(z.string().min(1)),
    vectorRefs: z.array(z.string().min(1)),
    provenance: z
      .object({
        jsonlSourceDigest: z.string().min(1),
        jsonlRecordIndex: z.number().int().nonnegative(),
        jsonlLineNumber: z.number().int().nonnegative(),
        jsonlParserRevision: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type SemanticFeatureEnvelope = z.infer<typeof SemanticFeatureEnvelopeSchema>;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function normalizeIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function inferPartOfSpeech(features: ExtractedFeature[], explicit?: string | null): string {
  const cleaned = explicit?.trim();
  if (cleaned) return cleaned;

  const featureTypes = new Set(features.map((feature) => feature.type));
  if ([...featureTypes].some((type) => type.startsWith('entity_'))) return 'PROPN';
  if (featureTypes.has('ast_function') || featureTypes.has('ast_method') || featureTypes.has('ast_arrow')) return 'VERB';
  if (featureTypes.has('ast_class')) return 'NOUN';
  if (featureTypes.has('ast_import')) return 'NOUN';
  return 'NOUN';
}

function buildCandidateLabels(features: ExtractedFeature[], explicitPartOfSpeech: string): Array<{ label: string; score: number }> {
  const featureTypes = new Set(features.map((feature) => feature.type));
  const labels: Array<{ label: string; score: number }> = [{ label: explicitPartOfSpeech, score: 0.96 }];

  if (featureTypes.has('ast_function') || featureTypes.has('ast_method') || featureTypes.has('ast_arrow')) {
    labels.push({ label: 'VERB', score: explicitPartOfSpeech === 'VERB' ? 0.96 : 0.88 });
  }
  if (featureTypes.has('ast_class') || featureTypes.has('ast_import')) {
    labels.push({ label: 'NOUN', score: explicitPartOfSpeech === 'NOUN' ? 0.95 : 0.84 });
  }
  if ([...featureTypes].some((type) => type.startsWith('entity_'))) {
    labels.push({ label: 'PROPN', score: explicitPartOfSpeech === 'PROPN' ? 0.97 : 0.9 });
  }

  return uniqueStrings(labels.map((entry) => entry.label)).slice(0, 8).map((label) => ({
    label,
    score: labels.find((entry) => entry.label === label)?.score ?? 0.75,
  }));
}

function buildSemanticConceptIds(
  features: ExtractedFeature[],
  explicitConceptIds: string[] | undefined
): string[] {
  const inferred = features
    .filter((feature) => feature.source === 'langextract' || feature.type.startsWith('entity_'))
    .map((feature) => `semantic:${normalizeIdSegment(feature.type)}:${normalizeIdSegment(feature.name)}`);

  return uniqueStrings([...(explicitConceptIds ?? []), ...inferred]).slice(0, 32);
}

function buildOntologyIds(explicitOntologyIds: string[] | undefined, features: ExtractedFeature[]): string[] {
  const inferred = features
    .filter((feature) => feature.type.startsWith('entity_'))
    .map((feature) => `ontology:${normalizeIdSegment(feature.type)}`);

  return uniqueStrings([...(explicitOntologyIds ?? []), ...inferred]).slice(0, 32);
}

function buildSourceTables(input: BuildPosConceptTaggingPacketFromSourceInput): string[] {
  return uniqueStrings(
    input.sourceTables?.length
      ? input.sourceTables
      : ['analysis_jobs', 'code_features', 'langextract_entities', 'analysis_pass_results']
  ).slice(0, 12);
}

function normalizeToolCalls(input: BuildPosConceptTaggingPacketFromSourceInput): Array<{
  callId: string;
  toolName: string;
  dependencyMode: 'independent' | 'dependent' | 'sequential';
  summary?: string | null;
  sourceRef?: string | null;
  packetKey?: string | null;
  resultDigest?: string | null;
}> {
  return (input.mcpToolCalls ?? []).slice(0, 3).map((call) => ({
    callId: call.callId,
    toolName: call.toolName,
    dependencyMode: call.dependencyMode ?? 'independent',
    summary: call.summary ?? null,
    sourceRef: call.sourceRef ?? null,
    packetKey: call.packetKey ?? null,
    resultDigest: call.resultDigest ?? null,
  }));
}

function normalizeRankingSignals(
  input: BuildPosConceptTaggingPacketFromSourceInput
): {
  bm25?: number | null;
  bm42?: number | null;
  pageRank?: number | null;
  manifold?: {
    x?: number | null;
    y?: number | null;
    z?: number | null;
    w?: number | null;
  } | null;
  somCell?: string | null;
  kmeansCluster?: number | null;
  communityId?: string | number | null;
} {
  const signals = input.rankingSignals ?? {};
  const normalized: {
    bm25?: number | null;
    bm42?: number | null;
    pageRank?: number | null;
    manifold?: {
      x?: number | null;
      y?: number | null;
      z?: number | null;
      w?: number | null;
    } | null;
    somCell?: string | null;
    kmeansCluster?: number | null;
    communityId?: string | number | null;
  } = {};

  if (typeof signals.bm25 === 'number' || signals.bm25 === null) normalized.bm25 = signals.bm25;
  if (typeof signals.bm42 === 'number' || signals.bm42 === null) normalized.bm42 = signals.bm42;
  if (typeof signals.pageRank === 'number' || signals.pageRank === null) normalized.pageRank = signals.pageRank;
  if (signals.manifold) {
    normalized.manifold = {
      x: typeof signals.manifold.x === 'number' || signals.manifold.x === null ? signals.manifold.x : null,
      y: typeof signals.manifold.y === 'number' || signals.manifold.y === null ? signals.manifold.y : null,
      z: typeof signals.manifold.z === 'number' || signals.manifold.z === null ? signals.manifold.z : null,
      w: typeof signals.manifold.w === 'number' || signals.manifold.w === null ? signals.manifold.w : null,
    };
  }
  if (typeof signals.somCell === 'string' || signals.somCell === null) normalized.somCell = signals.somCell;
  if (typeof signals.kmeansCluster === 'number' || signals.kmeansCluster === null) normalized.kmeansCluster = signals.kmeansCluster;
  if (typeof signals.communityId === 'string' || typeof signals.communityId === 'number' || signals.communityId === null) {
    normalized.communityId = signals.communityId;
  }

  return normalized;
}

export async function buildPosConceptTaggingPacketFromSource(
  input: BuildPosConceptTaggingPacketFromSourceInput
): Promise<BuildPosConceptTaggingPacketFromSourceResult | null> {
  const sourceRef = input.sourceRef.trim();
  const sourceRevision = input.sourceRevision.trim();
  const packetKey =
    input.packetKey?.trim() ||
    (sourceRef && input.treeNodeId && input.titleId
      ? computePacketKey(sourceRef, input.treeNodeId, input.titleId)
      : '');

  if (!packetKey || !sourceRef || !sourceRevision) {
    return null;
  }

  const isCode = input.isCode ?? true;
  const extractedFeatures = input.extractedFeatures ?? (await extractAstAndEntities(input.text, isCode));
  const featureId = (input.featureId?.trim() || packetKey).trim();
  const featureLabel = input.featureLabel.trim();
  const representationRevision = input.representationRevision?.trim() || DEFAULT_REPRESENTATION_REVISION;
  const producerId = input.producerId?.trim() || DEFAULT_PRODUCER_ID;
  const producerRevision = input.producerRevision?.trim() || DEFAULT_PRODUCER_REVISION;
  const featureRevision = input.featureRevision?.trim() || DEFAULT_FEATURE_REVISION;
  const pos = inferPartOfSpeech(extractedFeatures, input.partOfSpeech);
  const posCandidateLabels =
    input.posCandidateLabels?.length > 0
      ? input.posCandidateLabels.slice(0, 8)
      : buildCandidateLabels(extractedFeatures, pos);
  const astSymbols = uniqueStrings(
    extractedFeatures
      .filter((feature) => feature.type.startsWith('ast_'))
      .map((feature) => feature.name)
  ).slice(0, 64);
  const semanticConceptIds = buildSemanticConceptIds(extractedFeatures, input.semanticConceptIds);
  const ontologyIds = buildOntologyIds(input.ontologyIds, extractedFeatures);
  const jsonlSourceDigest =
    input.jsonlSourceDigest?.trim() || `sha256:${sha256Hex(stableStringify({ sourceRef, sourceRevision, text: input.text }))}`;

  const packet = buildPosConceptTaggingPacket({
    schemaVersion: 'pos-concept-tagging-lane.v1',
    packetKey,
    sourceRef,
    sourceRevision,
    workspaceRevision: input.workspaceRevision ?? null,
    featureId,
    featureLabel,
    treeNodeId: input.treeNodeId ?? null,
    titleId: input.titleId ?? null,
    jsonlSourceDigest,
    jsonlRecordIndex: input.jsonlRecordIndex ?? 0,
    jsonlLineNumber: input.jsonlLineNumber ?? 0,
    jsonlParserRevision: input.jsonlParserRevision ?? 'jsonl-parser-v1',
    representationId: 'semantic_768',
    representationRevision,
    producerId,
    producerRevision,
    featureRevision,
    graphRevision: input.graphRevision ?? null,
    ontologyRevision: input.ontologyRevision ?? null,
    modelRevision: input.modelRevision ?? null,
    partOfSpeech: pos,
    astSymbols,
    semanticConceptIds,
    ontologyIds,
    posCandidateLabels,
    citations: (input.citations ?? []) as any,
    screenshots: (input.screenshots ?? []) as any,
    policySummary: null,
    mcpToolCalls: normalizeToolCalls(input) as any,
    rankingSignals: normalizeRankingSignals(input),
    participants: (input.participants ?? []) as any,
    concepts: (input.concepts ?? []) as any,
    sourceTables: buildSourceTables(input),
    inputDigest: `sha256:${sha256Hex(stableStringify({
      packetKey,
      sourceRef,
      sourceRevision,
      treeNodeId: input.treeNodeId ?? null,
      titleId: input.titleId ?? null,
      featureId,
      featureLabel,
      representationRevision,
      producerId,
      producerRevision,
      featureRevision,
      graphRevision: input.graphRevision ?? null,
      ontologyRevision: input.ontologyRevision ?? null,
      modelRevision: input.modelRevision ?? null,
      partOfSpeech: pos,
      astSymbols,
      semanticConceptIds,
      ontologyIds,
      sourceTables: buildSourceTables(input),
    }))}`,
    lastVerifiedAt: null,
  });

  const semanticFeatureEnvelope = SemanticFeatureEnvelopeSchema.parse({
    schemaVersion: DEFAULT_SEMANTIC_FEATURE_ENVELOPE_REVISION,
    packetKey,
    sourceRef,
    sourceRevision,
    treeNodeId: input.treeNodeId ?? null,
    titleId: input.titleId ?? null,
    featureId,
    featureLabel,
    representationId: 'semantic_768' as const,
    representationRevision,
    producerId,
    producerRevision,
    featureRevision,
    graphRevision: input.graphRevision ?? null,
    ontologyRevision: input.ontologyRevision ?? null,
    modelRevision: input.modelRevision ?? null,
    partOfSpeech: pos,
    semanticConceptIds,
    ontologyIds,
    astSymbolCount: astSymbols.length,
    extractedFeatureCount: extractedFeatures.length,
    sourceTables: buildSourceTables(input),
    vectorRefs: uniqueStrings(input.vectorRefs ?? []),
    provenance: {
      jsonlSourceDigest,
      jsonlRecordIndex: input.jsonlRecordIndex ?? 0,
      jsonlLineNumber: input.jsonlLineNumber ?? 0,
      jsonlParserRevision: input.jsonlParserRevision ?? 'jsonl-parser-v1',
    },
  });

  return {
    packet,
    packetKey,
    extractedFeatures,
    semanticFeatureEnvelope,
  };
}
