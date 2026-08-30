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
  /**
   * ABSENT: pagerank_l1 field was never populated (normal for rows computed before this
   * column existed, or PageRank not yet run for this graph revision).
   * PRESENT: pagerank_l1 held a valid finite value.
   * CORRUPT: pagerank_l1 was populated but is NaN/Infinity -- a real data-integrity signal,
   * not a legitimate "missing" state. GA8-HARDEN-FINAL item 1: this must never be silently
   * masked by falling back to pagerank_raw/legacy -- see pickPageRankAuthorityScore().
   */
  l1Status: 'ABSENT' | 'PRESENT' | 'CORRUPT';
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

  const l1Present = value?.pagerank_l1 !== null && value?.pagerank_l1 !== undefined;
  const l1Status: ResolvedPageRankAuthority['l1Status'] = !l1Present
    ? 'ABSENT'
    : l1 !== null
      ? 'PRESENT'
      : 'CORRUPT';

  return {
    raw,
    l1,
    percentile,
    band,
    legacy,
    l1Status,
  };
}

/**
 * Fails closed on a corrupt (present-but-non-finite) pagerank_l1 rather than silently
 * substituting pagerank_raw/legacy -- a corrupt l1 is a data-integrity bug, not a routine
 * "not computed yet" absence, and masking it produces a plausible-looking score from a
 * different (possibly stale or differently-normalized) source with no caller-visible signal
 * that the canonical value was broken. Absence (l1Status === 'ABSENT') is still a legitimate
 * fallback case -- e.g. rows predating this column.
 */
export function pickPageRankAuthorityScore(
  value: PageRankAuthorityLike | null | undefined,
): number | null {
  const resolved = resolvePageRankAuthority(value);
  if (resolved.l1Status === 'CORRUPT') {
    throw new Error('PAGERANK_L1_CORRUPT_FAIL_CLOSED');
  }
  return resolved.l1 ?? resolved.raw ?? resolved.legacy;
}

