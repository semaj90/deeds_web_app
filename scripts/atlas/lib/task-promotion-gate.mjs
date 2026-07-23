/**
 * Daily Graphify task admission policy.
 *
 * This is intentionally separate from ranking: a high recommendation score is
 * not sufficient to create work. Unknown duplicate risk is conservative.
 */
export const TASK_PROMOTION_THRESHOLDS = Object.freeze({
  retrievalConfidence: 0.8,
  evidenceCompleteness: 0.85,
  maximumDuplicateProbability: 0.2,
});

export function evaluateTaskPromotion(input) {
  const failure_reasons = [];
  if (!input.actionable) failure_reasons.push('NOT_ACTIONABLE');
  if (!input.acceptance_criteria_present) failure_reasons.push('MISSING_ACCEPTANCE_CRITERIA');
  if (input.permission_mode === 'read_only') failure_reasons.push('READ_ONLY_PERMISSION');

  if (failure_reasons.length > 0) {
    return { ...input, gate_decision: 'REJECT', failure_reasons };
  }

  if (!input.affected_paths_known) failure_reasons.push('AFFECTED_PATHS_UNKNOWN');
  if (!input.permissions_resolved) failure_reasons.push('PERMISSIONS_UNRESOLVED');
  if (input.retrieval_confidence < TASK_PROMOTION_THRESHOLDS.retrievalConfidence) failure_reasons.push('RETRIEVAL_CONFIDENCE_BELOW_THRESHOLD');
  if (input.evidence_completeness < TASK_PROMOTION_THRESHOLDS.evidenceCompleteness) failure_reasons.push('EVIDENCE_COMPLETENESS_BELOW_THRESHOLD');
  if (input.duplicate_task_probability > TASK_PROMOTION_THRESHOLDS.maximumDuplicateProbability) failure_reasons.push('DUPLICATE_TASK_RISK');

  return {
    ...input,
    gate_decision: failure_reasons.length === 0 ? 'PROMOTE' : 'REVIEW_REQUIRED',
    failure_reasons,
  };
}
