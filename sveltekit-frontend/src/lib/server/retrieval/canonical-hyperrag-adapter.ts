import type { SearchResult } from './search-runtime.js';
import type { HyperRagHit, HyperRagResult } from './hyperrag-compat-types.js';

export function toCanonicalHyperRagHit(packet: SearchResult['packets'][number]): HyperRagHit {
  const enriched = packet as any;
  return {
    id: String(enriched.packetKey ?? enriched.packet_key ?? enriched.chunk_id ?? enriched.sourceRef ?? enriched.source_ref ?? 'unknown'),
    sourcePath: enriched.sourceRef ?? enriched.source_ref ?? enriched.filePath ?? enriched.relative_path ?? undefined,
    title: enriched.semanticTitle ?? enriched.semantic?.title ?? enriched.title ?? enriched.symbol ?? enriched.sourceRef ?? enriched.packetKey,
    text: enriched.summary ?? enriched.content ?? '',
    score: Number(enriched.retrieval?.crossEncoderScore ?? enriched.retrieval?.xgboostScore ?? enriched.retrieval?.rrfScore ?? enriched.cross_encoder_score ?? enriched.blended_score ?? enriched.retrieval_score ?? 0),
    scoreWeightedSum: Number(enriched.retrieval?.xgboostScore ?? enriched.blended_score ?? enriched.retrieval_score ?? 0),
    signals: {
      dense: enriched.dense?.score ?? enriched.retrieval?.denseScore ?? undefined,
      graphAuthority: enriched.authority?.score ?? enriched.page_rank_score ?? enriched.topology?.pageRank ?? undefined,
      clusterMatch: enriched.som_cluster ?? enriched.topology?.somCell ?? undefined,
      pagerank: enriched.page_rank_score ?? enriched.topology?.pageRank ?? undefined,
      aceBoost: enriched.ace_boost ?? undefined,
      turbovec: enriched.turbovec_score ?? undefined,
      topoClass: enriched.domain ?? enriched.classification?.domainClass ?? undefined,
      lexicalBoost: enriched.lexical?.score ?? undefined,
      taskBoost: enriched.task_boost ?? undefined,
      activity_w: enriched.activity_w ?? undefined,
      cluster_alias: enriched.cluster_alias ?? undefined,
      recencyOrHitRate: enriched.recency?.score ?? undefined,
      engramBoost: enriched.engram_boost ?? undefined,
    },
    reasons: [
      enriched.retrieval_source ? `retrieval:${enriched.retrieval_source}` : 'retrieval:canonical',
      enriched.domain ? `domain:${enriched.domain}` : enriched.classification?.domainClass ? `domain:${enriched.classification.domainClass}` : 'domain:unknown',
    ],
    payload: enriched as Record<string, unknown>,
    vector: undefined,
  };
}

export function searchResultToHyperRagResult(
  result: SearchResult,
  options: {
    query?: string;
    synthesis?: string | null;
  } = {}
): HyperRagResult {
  return {
    query: options.query ?? result.metadata.query,
    variants: options.query ? [options.query] : [result.metadata.query],
    hits: result.packets.map(toCanonicalHyperRagHit),
    graphPaths: [],
    contextPack: null,
    summaryLenses: [],
    taskDistillate: null,
    synthesis: options.synthesis ?? null,
    provenance: {
      qdrant: result.provenance.retrievalSources.includes('qdrant'),
      turbovec: false,
      redis: result.provenance.retrievalSources.includes('postgres_trigram'),
      neo4j: result.provenance.retrievalSources.includes('ast_tree'),
      ace: false,
      taskDistillates: false,
    },
  };
}
