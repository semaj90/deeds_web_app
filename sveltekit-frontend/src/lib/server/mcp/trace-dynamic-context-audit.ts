import type { TraceDynamicContextResult, TraceQuestionFamily } from '../../../../../packages/atlas-core/src/evidence/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function asUuid(value: string | undefined): string | undefined {
  return value && UUID_RE.test(value) ? value : undefined;
}

export function buildTraceDynamicContextRecommendation(
  result: TraceDynamicContextResult,
  family: TraceQuestionFamily
) {
  const failed = result.validation.failedGates.slice(0, 4);
  const unresolved = result.validation.unresolvedClaims.slice(0, 4);
  const evidenceRefs = result.evidence.slice(0, 4).map((item) => ({
    kind: item.kind,
    lane: item.lane ?? 'lexical',
    source: item.source ?? null,
    path: item.path ?? null,
    symbol: item.symbol ?? null,
    status: item.status,
  }));

  return {
    kind: result.validation.status === 'PROVEN' ? 'next_source' : 'missing_gate',
    family,
    likelyCause:
      failed.length > 0
        ? `The first evidence slice is still blocked on ${failed.join(', ')}.`
        : `The first evidence slice is bounded and can be used as a reference bundle for ${family} questions.`,
    evidenceRefs,
    nextActions: failed.length > 0
      ? [
          'Inspect the first failed gate and its joined evidence items.',
          'Verify the canonical Postgres join-back coverage for the current target.',
          'Add the smallest missing evidence lane before widening the slice.',
        ]
      : [
          'Use the returned evidence bundle as the bounded reference packet.',
          'Promote the same request through the next proof gate only if the source join remains stable.',
        ],
    validationPlan: unresolved.length > 0 ? unresolved : failed,
    safetyChecks: [
      'Do not treat the bounded slice as canonical proof unless the validation status is PROVEN.',
      'Do not widen the tool to additional lanes without an explicit failing gate.',
      'Do not use Qdrant payload text as canonical evidence.',
    ],
  };
}
