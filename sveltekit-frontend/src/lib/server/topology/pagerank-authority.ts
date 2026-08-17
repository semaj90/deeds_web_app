export interface PageRankAuthorityLike {
  pagerank_raw?: number | null;
  pagerank_l1?: number | null;
  authority_percentile?: number | null;
  authority_band?: string | null;
  page_rank_score?: number | null;
  pagerank?: number | null;
  authority_score?: number | null;
}

export interface ResolvedPageRankAuthority {
  raw: number | null;
  l1: number | null;
  percentile: number | null;
  band: string | null;
  legacy: number | null;
}

/**
 * Ranking-safe PageRank evidence. This intentionally excludes every legacy
 * authority fallback. A caller cannot construct a promoted ranking feature
 * from `authority_score`, `page_rank_score`, or an unqualified scalar.
 */
export interface PromotedPageRankEvidenceV1 {
  schema: 'atlas.promoted-pagerank-evidence.v1';
  runId: string;
  runStatus: 'promoted';
  graphRevision: string;
  projectionRevision: string;
  normalizationRevision: string;
  algorithmRevision: string;
  pagerankRaw: number;
  pagerankL1: number | null;
  authorityPercentile: number;
  authorityBand: string | null;
  receiptRef: string;
}

export interface PromotedPageRankFeatureV1 {
  pagerankAuthority: number;
  evidence: PromotedPageRankEvidenceV1;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireNonEmpty(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Promoted PageRank requires ${name}`);
  }
  return value;
}

/**
 * Compatibility resolver only. It preserves historical fallbacks for old
 * surfaces, migrations, and diagnostics. New ranking code MUST use
 * resolvePromotedPageRankFeature().
 */
export function resolvePageRankAuthority(
  value: PageRankAuthorityLike | null | undefined,
): ResolvedPageRankAuthority {
  const raw = toFiniteNumber(value?.pagerank_raw);
  const l1 = toFiniteNumber(value?.pagerank_l1);
  const percentile = toFiniteNumber(value?.authority_percentile);
  const band =
    typeof value?.authority_band === 'string' &&
    value.authority_band.trim().length > 0
      ? value.authority_band
      : null;
  const legacy =
    toFiniteNumber(value?.page_rank_score) ??
    toFiniteNumber(value?.pagerank) ??
    toFiniteNumber(value?.authority_score);

  return {
    raw,
    l1,
    percentile,
    band,
    legacy,
  };
}

/**
 * Compatibility score picker. Do not use this in FeatureRow/RankingFeature
 * assembly because it can intentionally fall back to legacy authority fields.
 */
export function pickPageRankAuthorityScore(
  value: PageRankAuthorityLike | null | undefined,
): number | null {
  const resolved = resolvePageRankAuthority(value);
  return resolved.l1 ?? resolved.raw ?? resolved.legacy;
}

/**
 * Convert a promoted PageRank run into the one scalar used by ranking.
 *
 * Ranking uses authority percentile, not raw PageRank. The raw/l1 values remain
 * attached as provenance/audit evidence. This keeps the feature in [0,1] and
 * prevents the historical uniform `authority_score = 0.5` compatibility value
 * from entering the ranking matrix.
 */
export function resolvePromotedPageRankFeature(
  value: PromotedPageRankEvidenceV1,
): PromotedPageRankFeatureV1 {
  if (value.schema !== 'atlas.promoted-pagerank-evidence.v1') {
    throw new Error('Promoted PageRank evidence schema mismatch');
  }
  if (value.runStatus !== 'promoted') {
    throw new Error('Promoted PageRank requires runStatus=promoted');
  }

  requireNonEmpty(value.runId, 'runId');
  requireNonEmpty(value.graphRevision, 'graphRevision');
  requireNonEmpty(value.projectionRevision, 'projectionRevision');
  requireNonEmpty(value.normalizationRevision, 'normalizationRevision');
  requireNonEmpty(value.algorithmRevision, 'algorithmRevision');
  requireNonEmpty(value.receiptRef, 'receiptRef');

  if (!Number.isFinite(value.pagerankRaw) || value.pagerankRaw < 0) {
    throw new Error('Promoted PageRank requires finite non-negative pagerankRaw');
  }
  if (value.pagerankL1 !== null && (!Number.isFinite(value.pagerankL1) || value.pagerankL1 < 0)) {
    throw new Error('Promoted PageRank pagerankL1 must be null or finite/non-negative');
  }
  if (
    !Number.isFinite(value.authorityPercentile)
    || value.authorityPercentile < 0
    || value.authorityPercentile > 1
  ) {
    throw new Error('Promoted PageRank authorityPercentile must be within [0,1]');
  }

  return {
    pagerankAuthority: value.authorityPercentile,
    evidence: value,
  };
}
