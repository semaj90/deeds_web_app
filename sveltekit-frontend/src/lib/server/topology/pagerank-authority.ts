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

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

export function pickPageRankAuthorityScore(
  value: PageRankAuthorityLike | null | undefined,
): number | null {
  const resolved = resolvePageRankAuthority(value);
  return resolved.l1 ?? resolved.raw ?? resolved.legacy;
}

