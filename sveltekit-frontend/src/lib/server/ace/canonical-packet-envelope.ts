export type CanonicalAcePacketEnvelope = {
  packet_id: string | null;
  packet_ulid: string | null;
  packet_key: string;
  title_id: string | null;
  feature_id: string | null;
  source_ref: string;
  canonical_source_ref: string;
  som_cell: string | null;
  language: string | null;
  kind: string | null;
  page_rank_score: number;
  prompt_template_id: string | null;
  summary?: string | null;
  domain?: string | null;
  feature_label?: string | null;
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
  | 'language'
  | 'kind'
  | 'page_rank_score'
  | 'pageRankScore'
  | 'prompt_template_id'
  | 'promptTemplateId'
  | 'summary'
  | 'domain'
  | 'feature_label'
  | 'featureLabel',
  unknown
>>;

export type CanonicalAcePacketEnvelopeContext = {
  feature_id?: string | null;
  som_cell?: string | null;
  language?: string | null;
  kind?: string | null;
  page_rank_score?: number;
};

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
  const language = firstText(row.language, context.language);
  const kind = firstText(row.kind, context.kind);
  const promptTemplateId = firstText(row.prompt_template_id, row.promptTemplateId);
  const summary = firstText(row.summary);
  const domain = firstText(row.domain);
  const featureLabel = firstText(row.feature_label, row.featureLabel);

  return {
    packet_id: packetId,
    packet_ulid: packetUlid,
    packet_key: packetKey,
    title_id: titleId,
    feature_id: featureId,
    source_ref: sourceRef,
    canonical_source_ref: canonicalSourceRef,
    som_cell: somCell,
    language,
    kind,
    page_rank_score: Number(row.page_rank_score ?? row.pageRankScore ?? context.page_rank_score ?? 0) || 0,
    prompt_template_id: promptTemplateId,
    summary,
    domain,
    feature_label: featureLabel,
  };
}
