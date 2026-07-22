export interface AuthorityBoostInput {
  semanticScore: number;
  authorityScore: number | null;
  maximumBoost?: number;
}

export interface AuthorityBoostResult {
  semanticScore: number;
  authorityScore: number;
  authorityBoost: number;
  finalScore: number;
}

export function applyAuthorityBoost(
  input: AuthorityBoostInput,
): AuthorityBoostResult {
  const semanticScore = clamp01(input.semanticScore);
  const authorityScore = clamp01(input.authorityScore ?? 0);
  const maximumBoost = Math.min(Math.max(input.maximumBoost ?? 0.08, 0), 0.15);
  const authorityBoost = maximumBoost * authorityScore;

  return {
    semanticScore,
    authorityScore,
    authorityBoost,
    finalScore: clamp01(semanticScore + authorityBoost * semanticScore),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
