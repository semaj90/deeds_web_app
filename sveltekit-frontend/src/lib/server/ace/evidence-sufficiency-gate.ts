/**
 * Evidence Sufficiency Gate
 *
 * Deterministic pre-synthesis gate. Computes a coverage score before allowing
 * the agent to emit a confident final answer. Only generate synthesis when the
 * gate passes. For legal work, add jurisdiction/authority/citation dimensions.
 *
 * coverage = issue_coverage × authority_coverage × source_integrity × temporal_validity
 */

export type SufficiencyDomain = 'software' | 'legal' | 'general';

export interface EvidenceSufficiencyInput {
  /** How well the retrieved sources address the query issue (0-1) */
  issueCoverage: number;
  /** Fraction of expected authoritative sources present (0-1) */
  authorityCoverage: number;
  /** Integrity of sources: no broken links, valid checksums, non-stale (0-1) */
  sourceIntegrity: number;
  /** Temporal validity: effective dates within scope, no superseded law (0-1) */
  temporalValidity: number;

  /** Legal domain extras (optional — ignored when domain !== 'legal') */
  jurisdictionMatch?: number;      // 0-1, controlling jurisdiction found
  authorityHierarchy?: number;     // 0-1, hierarchy correctly ordered
  effectiveDateCheck?: number;     // 0-1, law in force at relevant date
  citationValidity?: number;       // 0-1, citations parseable + resolvable
  negativeTreatmentPenalty?: number; // 0-1, 0 = heavily negative-treated

  /** Number of detected contradictions across sources */
  contradictionCount: number;

  /** List of specific evidence gaps found during retrieval */
  missingEvidence: string[];

  domain: SufficiencyDomain;
}

export interface EvidenceSufficiencyResult {
  /** Composite coverage score (0-1) */
  coverage: number;
  /** True when coverage meets threshold and no hard blockers */
  passed: boolean;
  missing: string[];
  contradictions: number;
  /**
   * Recommended next action when gate fails:
   *   'expand_graph'   — fetch more Neo4j neighbors
   *   'widen_retrieval' — re-query with looser filters
   *   'cite_check'     — resolve citation failures
   *   'date_check'     — verify temporal scope
   *   'synthesize'     — gate passed, proceed
   */
  recommendedAction: 'expand_graph' | 'widen_retrieval' | 'cite_check' | 'date_check' | 'synthesize';
  /** Human-readable diagnostic */
  diagnosis: string;
}

/** Minimum composite coverage to consider evidence sufficient */
export const COVERAGE_THRESHOLD = 0.65;
const COVERAGE_THRESHOLD_PCT = `${(COVERAGE_THRESHOLD * 100).toFixed(0)}%`;

/**
 * Compute evidence sufficiency score and gate decision.
 *
 * The base score is the geometric mean of the four core dimensions, which
 * penalises any single weak dimension proportionally more than an arithmetic
 * mean would. For legal work, a weighted legal-extras factor is blended in.
 */
export function computeEvidenceSufficiency(
  input: EvidenceSufficiencyInput
): EvidenceSufficiencyResult {
  const {
    issueCoverage,
    authorityCoverage,
    sourceIntegrity,
    temporalValidity,
    contradictionCount,
    missingEvidence,
    domain,
  } = input;

  // Geometric mean of the four core dimensions — any weak dimension drags the score
  const baseScore =
    Math.pow(
      issueCoverage * authorityCoverage * sourceIntegrity * temporalValidity,
      1 / 4
    );

  let coverage = baseScore;

  if (domain === 'legal') {
    const jm = input.jurisdictionMatch ?? 1;
    const ah = input.authorityHierarchy ?? 1;
    const ed = input.effectiveDateCheck ?? 1;
    const cv = input.citationValidity ?? 1;
    const nt = input.negativeTreatmentPenalty ?? 1; // 0 = heavy penalty

    // Legal extras geometric mean
    const legalFactor = Math.pow(jm * ah * ed * cv * nt, 1 / 5);
    // Blend: 60% base, 40% legal extras
    coverage = 0.6 * baseScore + 0.4 * legalFactor;
  }

  // Contradiction penalty: each contradiction reduces score by 5 %, floor 0
  const contradictionPenalty = Math.min(contradictionCount * 0.05, 0.25);
  coverage = Math.max(0, coverage - contradictionPenalty);

  const passed = coverage >= COVERAGE_THRESHOLD && missingEvidence.length === 0;

  const recommendedAction = decideAction(coverage, input);

  const diagnosis = buildDiagnosis(coverage, input, passed);

  return { coverage, passed, missing: missingEvidence, contradictions: contradictionCount, recommendedAction, diagnosis };
}

function decideAction(coverage: number, input: EvidenceSufficiencyInput): EvidenceSufficiencyResult['recommendedAction'] {
  if (coverage >= COVERAGE_THRESHOLD && input.missingEvidence.length === 0) return 'synthesize';
  if (input.domain === 'legal' && (input.citationValidity ?? 1) < 0.5) return 'cite_check';
  if (input.temporalValidity < 0.5) return 'date_check';
  if (input.authorityCoverage < 0.4) return 'expand_graph';
  return 'widen_retrieval';
}

function buildDiagnosis(coverage: number, input: EvidenceSufficiencyInput, passed: boolean): string {
  const pct = (coverage * 100).toFixed(1);
  if (passed) return `Gate passed — coverage ${pct}%. Evidence is sufficient for synthesis.`;

  const parts: string[] = [`Gate failed — coverage ${pct}% (threshold ${COVERAGE_THRESHOLD_PCT}).`];
  if (input.issueCoverage < 0.5) parts.push('Issue coverage is weak.');
  if (input.authorityCoverage < 0.5) parts.push('No controlling authority found.');
  if (input.sourceIntegrity < 0.7) parts.push('Source integrity is low.');
  if (input.temporalValidity < 0.7) parts.push('Temporal validity concern.');
  if (input.contradictionCount > 0) parts.push(`${input.contradictionCount} contradiction(s) detected.`);
  if (input.missingEvidence.length > 0) parts.push(`Missing: ${input.missingEvidence.join('; ')}.`);
  return parts.join(' ');
}
