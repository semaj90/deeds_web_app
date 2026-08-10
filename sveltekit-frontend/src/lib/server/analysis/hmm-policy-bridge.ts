import type { FitDecision, HmmState, PolicyStateInput } from '../atlas/policy/policy-types';

export interface RerankSignal {
  denseScore?: number | null;
  lexicalScore?: number | null;
  astScore?: number | null;
  pageRankScore?: number | null;
  communityScore?: number | null;
  exactPathScore?: number | null;
  sourceRef?: string | null;
  packetKey?: string | null;
}

export interface OkfHmmPolicyEvidence {
  naive_bayes_score: number;
  logistic_regression_score: number;
  fit_margin: number;
  fit_decision: FitDecision;
  hmm_observation?: string;
  stateHint?: string;
}

const STATE_HINTS = new Set<HmmState>(['LOCATE', 'UNDERSTAND', 'TRACE', 'REPAIR', 'VALIDATE', 'RECOVER']);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function queryStateHint(query: string): HmmState {
  const lowered = query.toLowerCase();
  if (/(repair|fix|broken|error|fail|bug|regress)/.test(lowered)) return 'REPAIR';
  if (/(test|validate|verify|smoke|compile)/.test(lowered)) return 'VALIDATE';
  if (/(trace|dependency|path|call|flow|where)/.test(lowered)) return 'TRACE';
  if (/(recover|fallback|stale|degrade)/.test(lowered)) return 'RECOVER';
  if (/(locate|find|search|where is|show me)/.test(lowered)) return 'LOCATE';
  return 'UNDERSTAND';
}

export function normalizeStateHint(value: string | undefined): HmmState {
  if (value && STATE_HINTS.has(value as HmmState)) return value as HmmState;
  return 'UNDERSTAND';
}

export function withOkfHmmEvidence(
  base: Omit<PolicyStateInput, 'okf' | 'hmm'>,
  evidence: OkfHmmPolicyEvidence,
  posterior?: Partial<Record<HmmState, number>>,
): PolicyStateInput {
  return {
    ...base,
    okf: {
      naiveBayesScore: evidence.naive_bayes_score,
      logisticRegressionScore: evidence.logistic_regression_score,
      fitMargin: evidence.fit_margin,
      decision: evidence.fit_decision,
    },
    hmm: {
      stateHint: normalizeStateHint(evidence.stateHint),
      posterior,
    },
  };
}

export function buildPolicyStateFromRerankSignals(input: {
  query: string;
  signals: RerankSignal[];
  vramPressure?: number;
  contextPressure?: number;
  latencyPressure?: number;
  cacheHitRatio?: number;
}): PolicyStateInput {
  const scores = input.signals.flatMap((signal) => [
    signal.denseScore ?? Number.NaN,
    signal.lexicalScore ?? Number.NaN,
    signal.astScore ?? Number.NaN,
    signal.pageRankScore ?? Number.NaN,
    signal.communityScore ?? Number.NaN,
    signal.exactPathScore ?? Number.NaN,
  ]).filter(Number.isFinite) as number[];
  const sorted = [...scores].sort((a, b) => b - a);
  const best = sorted[0] ?? 0.5;
  const second = sorted[1] ?? 0.25;
  const lexicalHitCount = input.signals.filter((signal) => (signal.lexicalScore ?? 0) > 0.05).length;
  const astEvidence = Math.max(0, ...input.signals.map((signal) => signal.astScore ?? 0));
  const graphAuthority = Math.max(0, ...input.signals.map((signal) => signal.pageRankScore ?? 0));
  const communityAgreement = Math.max(0, ...input.signals.map((signal) => signal.communityScore ?? 0));
  const exactPathMatch = Math.max(0, ...input.signals.map((signal) => signal.exactPathScore ?? 0));
  const fitDecision: FitDecision =
    best >= 0.8 || (best >= 0.65 && (astEvidence >= 0.5 || exactPathMatch >= 0.5))
      ? 'ACCEPT'
      : best >= 0.55
        ? 'REVIEW'
        : 'ABSTAIN';
  const logisticRegressionScore = clamp01(0.18 + 0.56 * best + 0.12 * astEvidence + 0.08 * graphAuthority + 0.06 * exactPathMatch);
  const naiveBayesScore = clamp01(0.12 + 0.48 * best + 0.10 * lexicalHitCount + 0.08 * communityAgreement);

  return withOkfHmmEvidence(
    {
      retrieval: {
        bestCosine: best,
        cosineMargin: Math.max(0, best - second),
        lexicalHitCount,
        rrfConfidence: clamp01(0.35 + 0.25 * best + 0.20 * communityAgreement + 0.20 * exactPathMatch),
      },
      structural: {
        astEvidence,
        symbolMatch: exactPathMatch > 0 ? 1 : Math.max(0, astEvidence),
        exactPathMatch,
      },
      graph: {
        seedCount: input.signals.length,
        shortestPathAvailable: graphAuthority > 0,
        communityAgreement,
        authority: graphAuthority,
        hopBudgetRemaining: input.signals.length > 8 ? 1 : input.signals.length > 4 ? 2 : 3,
      },
      execution: {
        compileFailed: false,
        testFailed: false,
        retryCount: 0,
        historicalSuccess: clamp01(0.2 + 0.5 * exactPathMatch + 0.2 * astEvidence),
      },
      resource: {
        vramPressure: input.vramPressure ?? Math.min(1, input.signals.length / 16),
        contextPressure: input.contextPressure ?? Math.min(1, input.signals.length / 12),
        latencyPressure: input.latencyPressure ?? Math.min(1, input.signals.length / 20),
        cacheHitRatio: input.cacheHitRatio ?? 0.5,
      },
    },
    {
      naive_bayes_score: naiveBayesScore,
      logistic_regression_score: logisticRegressionScore,
      fit_margin: logisticRegressionScore - naiveBayesScore,
      fit_decision: fitDecision,
      hmm_observation: 'POLICY_ROUTING_SIGNAL',
      stateHint: queryStateHint(input.query),
    },
  );
}
