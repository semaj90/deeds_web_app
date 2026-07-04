import { z } from 'zod';

export type CanonicalAcePacketEnvelope = {
  packet_id: string | null;
  packet_ulid: string | null;
  packet_key: string;
  title_id: string | null;
  feature_id: string | null;
  source_ref: string;
  canonical_source_ref: string;
  som_cell: string | null;
  som_row?: number | null;
  som_col?: number | null;
  community_id?: string | number | null;
  kmeans_cluster?: number | null;
  language: string | null;
  kind: string | null;
  page_rank_score: number;
  prompt_template_id: string | null;
  summary?: string | null;
  domain?: string | null;
  feature_label?: string | null;
  used_concepts?: string[];
  lexical_nouns?: string[];
  lexical_verbs?: string[];
  lexical_adverbs_ly?: string[];
  relationship_hints?: string[];
  routing_hints?: string[];
  adjacency_packet_keys?: string[];
  adjacency_feature_ids?: string[];
  adjacency_source_refs?: string[];
  packed_arrays?: {
    packet_keys: string[];
    feature_ids: string[];
    source_refs: string[];
    title_ids: string[];
  };
  columnar_tables?: string[];
  mmap_vector_refs?: string[];
};

export type CanonicalAcePacketEnvelopeRow = Partial<Record<
  | 'packet_id'
  | 'packetId'
  | 'packet_ulid'
  | 'packetUlid'
  | 'packet_key'
  | 'packetKey'
  | 'title_id'
  | 'titleId'
  | 'feature_id'
  | 'featureId'
  | 'source_ref'
  | 'sourceRef'
  | 'canonical_source_ref'
  | 'canonicalSourceRef'
  | 'som_cell'
  | 'somCell'
  | 'som_cluster'
  | 'somCluster'
  | 'som_row'
  | 'somRow'
  | 'som_col'
  | 'somCol'
  | 'community_id'
  | 'communityId'
  | 'kmeans_cluster'
  | 'kmeansCluster'
  | 'language'
  | 'kind'
  | 'page_rank_score'
  | 'pageRankScore'
  | 'prompt_template_id'
  | 'promptTemplateId'
  | 'summary'
  | 'domain'
  | 'feature_label'
  | 'featureLabel'
  | 'used_concepts'
  | 'usedConcepts'
  | 'concepts'
  | 'keywords'
  | 'entities'
  | 'lexical_nouns'
  | 'lexicalNouns'
  | 'lexical_verbs'
  | 'lexicalVerbs'
  | 'lexical_adverbs_ly'
  | 'lexicalAdverbsLy'
  | 'relationship_hints'
  | 'relationshipHints'
  | 'routing_hints'
  | 'routingHints'
  | 'adjacency_packet_keys'
  | 'adjacencyPacketKeys'
  | 'adjacency_feature_ids'
  | 'adjacencyFeatureIds'
  | 'adjacency_source_refs'
  | 'adjacencySourceRefs'
  | 'packed_arrays'
  | 'packedArrays'
  | 'columnar_tables'
  | 'columnarTables'
  | 'mmap_vector_refs'
  | 'mmapVectorRefs',
  unknown
>>;

export type CanonicalAcePacketEnvelopeContext = {
  feature_id?: string | null;
  som_cell?: string | null;
  som_row?: number | null;
  som_col?: number | null;
  community_id?: string | number | null;
  kmeans_cluster?: number | null;
  language?: string | null;
  kind?: string | null;
  page_rank_score?: number;
};

export const CanonicalAcePacketEnvelopeSchema = z.object({
  packet_id: z.string().min(1).nullable(),
  packet_ulid: z.string().min(1).nullable(),
  packet_key: z.string().min(1),
  title_id: z.string().min(1).nullable(),
  feature_id: z.string().min(1).nullable(),
  source_ref: z.string().min(1),
  canonical_source_ref: z.string().min(1),
  som_cell: z.string().min(1).nullable(),
  som_row: z.number().int().nonnegative().nullable().optional(),
  som_col: z.number().int().nonnegative().nullable().optional(),
  community_id: z.union([z.string(), z.number()]).nullable().optional(),
  kmeans_cluster: z.number().int().nonnegative().nullable().optional(),
  language: z.string().min(1).nullable(),
  kind: z.string().min(1).nullable(),
  page_rank_score: z.number(),
  prompt_template_id: z.string().min(1).nullable(),
  summary: z.string().nullable().optional(),
  domain: z.string().min(1).nullable().optional(),
  feature_label: z.string().min(1).nullable().optional(),
  used_concepts: z.array(z.string().min(1)).default([]),
  lexical_nouns: z.array(z.string().min(1)).default([]),
  lexical_verbs: z.array(z.string().min(1)).default([]),
  lexical_adverbs_ly: z.array(z.string().min(1)).default([]),
  relationship_hints: z.array(z.string().min(1)).default([]),
  routing_hints: z.array(z.string().min(1)).default([]),
  adjacency_packet_keys: z.array(z.string().min(1)).default([]),
  adjacency_feature_ids: z.array(z.string().min(1)).default([]),
  adjacency_source_refs: z.array(z.string().min(1)).default([]),
  packed_arrays: z.object({
    packet_keys: z.array(z.string().min(1)).default([]),
    feature_ids: z.array(z.string().min(1)).default([]),
    source_refs: z.array(z.string().min(1)).default([]),
    title_ids: z.array(z.string().min(1)).default([]),
  }).default({
    packet_keys: [],
    feature_ids: [],
    source_refs: [],
    title_ids: [],
  }),
  columnar_tables: z.array(z.string().min(1)).default([]),
  mmap_vector_refs: z.array(z.string().min(1)).default([]),
}).strict();

function stringArray(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const text = String(item ?? '').trim();
      if (text) out.push(text);
    }
  }
  return [...new Set(out)];
}

function numberOrNull(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function normalizePackedArrays(row: CanonicalAcePacketEnvelopeRow): CanonicalAcePacketEnvelope['packed_arrays'] {
  return {
    packet_keys: stringArray((row as { packet_keys?: unknown }).packet_keys, (row as { packetKeys?: unknown }).packetKeys),
    feature_ids: stringArray((row as { feature_ids?: unknown }).feature_ids, (row as { featureIds?: unknown }).featureIds),
    source_refs: stringArray((row as { source_refs?: unknown }).source_refs, (row as { sourceRefs?: unknown }).sourceRefs),
    title_ids: stringArray((row as { title_ids?: unknown }).title_ids, (row as { titleIds?: unknown }).titleIds),
  };
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function canonicalFeatureId(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    if (/^(db|routes|ai|api|ui|graph|search|retrieval|packet)$/i.test(text)) continue;
    if (/^[a-z]{1,4}$/.test(text) && !/[./:_-]/.test(text)) continue;
    return text;
  }
  return null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

export function buildCanonicalAcePacketEnvelope(
  row: CanonicalAcePacketEnvelopeRow,
  context: CanonicalAcePacketEnvelopeContext = {}
): CanonicalAcePacketEnvelope {
  const packetId = firstText(row.packet_id, row.packetId);
  const packetUlid = firstText(row.packet_ulid, row.packetUlid);
  const packetKey = firstText(row.packet_key, row.packetKey, packetId, packetUlid) ?? '';
  const sourceRef = firstText(row.source_ref, row.sourceRef) ?? '';
  const canonicalSourceRef = firstText(row.canonical_source_ref, row.canonicalSourceRef, sourceRef) ?? sourceRef;
  const titleId = firstText(row.title_id, row.titleId);
  const featureId = canonicalFeatureId(row.feature_id, row.featureId, context.feature_id);
  const somCell = firstText(row.som_cell, row.somCell, row.som_cluster, row.somCluster, context.som_cell);
  const somRow = numberOrNull(row.som_row, row.somRow, context.som_row);
  const somCol = numberOrNull(row.som_col, row.somCol, context.som_col);
  const communityId = firstText(row.community_id, row.communityId, context.community_id);
  const kmeansCluster = numberOrNull(row.kmeans_cluster, row.kmeansCluster, context.kmeans_cluster);
  const language = firstText(row.language, context.language);
  const kind = firstText(row.kind, context.kind);
  const promptTemplateId = firstText(row.prompt_template_id, row.promptTemplateId);
  const summary = firstText(row.summary);
  const domain = firstText(row.domain);
  const featureLabel = firstText(row.feature_label, row.featureLabel);
  const usedConcepts = stringArray(
    row.used_concepts,
    row.usedConcepts,
    row.concepts,
    row.keywords,
    row.entities,
    titleId,
    featureId,
    featureLabel,
    domain,
    sourceRef
  );
  const lexicalNouns = stringArray(row.lexical_nouns, row.lexicalNouns);
  const lexicalVerbs = stringArray(row.lexical_verbs, row.lexicalVerbs);
  const lexicalAdverbsLy = stringArray(row.lexical_adverbs_ly, row.lexicalAdverbsLy);
  const relationshipHints = stringArray(row.relationship_hints, row.relationshipHints);
  const routingHints = stringArray(row.routing_hints, row.routingHints);
  const adjacencyPacketKeys = stringArray(row.adjacency_packet_keys, row.adjacencyPacketKeys);
  const adjacencyFeatureIds = stringArray(row.adjacency_feature_ids, row.adjacencyFeatureIds);
  const adjacencySourceRefs = stringArray(row.adjacency_source_refs, row.adjacencySourceRefs);
  const packedArrays = normalizePackedArrays(row);
  const columnarTables = stringArray(row.columnar_tables, row.columnarTables);
  const mmapVectorRefs = stringArray(row.mmap_vector_refs, row.mmapVectorRefs);

  const envelope = {
    packet_id: packetId,
    packet_ulid: packetUlid,
    packet_key: packetKey,
    title_id: titleId,
    feature_id: featureId,
    source_ref: sourceRef,
    canonical_source_ref: canonicalSourceRef,
    som_cell: somCell,
    som_row: somRow,
    som_col: somCol,
    community_id: communityId,
    kmeans_cluster: kmeansCluster,
    language,
    kind,
    page_rank_score: Number(row.page_rank_score ?? row.pageRankScore ?? context.page_rank_score ?? 0) || 0,
    prompt_template_id: promptTemplateId,
    summary,
    domain,
    feature_label: featureLabel,
    used_concepts: usedConcepts,
    lexical_nouns: lexicalNouns,
    lexical_verbs: lexicalVerbs,
    lexical_adverbs_ly: lexicalAdverbsLy,
    relationship_hints: relationshipHints,
    routing_hints: routingHints,
    adjacency_packet_keys: adjacencyPacketKeys,
    adjacency_feature_ids: adjacencyFeatureIds,
    adjacency_source_refs: adjacencySourceRefs,
    packed_arrays: packedArrays,
    columnar_tables: columnarTables,
    mmap_vector_refs: mmapVectorRefs,
  };

  return CanonicalAcePacketEnvelopeSchema.parse(envelope);
}

export function validateCanonicalAcePacketEnvelope(
  value: unknown
): { ok: boolean; envelope?: CanonicalAcePacketEnvelope; error?: string } {
  const result = CanonicalAcePacketEnvelopeSchema.safeParse(value);
  if (result.success) {
    return { ok: true, envelope: result.data };
  }
  return { ok: false, error: result.error.message };
}
