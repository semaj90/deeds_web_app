import {
	type DomainClassification,
	type DomainTaxonomyInput,
	classifyDomainTaxonomy,
} from './domain-taxonomy.js';

export const OKF_FIT_VERSION = 'okf-fit-v1';

export const OKF_FIT_SCORE_SEMANTICS = {
	kind: 'HEURISTIC' as const,
	range: [0, 1] as const,
	calibrated: false as const,
	probability: false as const,
	learnedModel: false as const,
	producerRevision: OKF_FIT_VERSION,
};

export type OkfFitDecision = 'ACCEPT' | 'REVIEW' | 'ABSTAIN';

export interface OkfFitInput {
	topicId: string;
	featureId: string;
	title: string;
	query: string;
	summary: string;
	sourceTitles?: string[];
	sourceSnippets?: string[];
	sourceUrls?: string[];
	sourceEngine?: string;
}

/**
 * BEST-FIT-SCORE-SEMANTICS-02 (openspec/changes/parent-atlas-best-fit-score-fabric):
 * heuristicPriorScore/heuristicFitScore/heuristicFitMargin are hand-specified formulas (see
 * classifyOkfFit below), NOT Naive Bayes or Logistic Regression inference — they were previously
 * misnamed naive_bayes_score/logistic_regression_score/fit_margin, which collided with the real
 * sklearn MultinomialNB/LogisticRegression predict_proba() outputs the :8095 sidecar's `classify`
 * pass produces under those same field names (see domain-taxonomy-ml-bridge.ts). The two are
 * genuinely different things: this file's scores are a rule-based classifier-adjacent heuristic;
 * the sidecar's are real domain-class probabilities. Never conflate them.
 *
 * domainTaxonomyConfidence/domainTaxonomyRevision preserve classifyDomainTaxonomy()'s own
 * confidence/classifier_version, which classifyOkfFit() previously silently overwrote with its
 * own heuristic values (BEST-FIT-SCORE-AUDIT-01 finding #2) — that overwrite is now fixed:
 * `confidence`/`classifier_version` on the returned object are DomainClassification's real,
 * unclobbered values; the heuristic fit result lives only under its own heuristic* fields.
 *
 * The naive_bayes_score/logistic_regression_score/fit_margin fields below are DEPRECATED
 * compatibility aliases, kept so existing OKF/HMM consumers don't break silently. Do not add new
 * callers of the deprecated names — read heuristicPriorScore/heuristicFitScore/heuristicFitMargin
 * instead.
 */
export interface OkfFitResult extends DomainClassification {
	heuristicPriorScore: number;
	heuristicFitScore: number;
	heuristicFitMargin: number;
	heuristicFitRevision: string;
	scoreSemantics: typeof OKF_FIT_SCORE_SEMANTICS;
	fit_decision: OkfFitDecision;
	domainTaxonomyConfidence: number;
	domainTaxonomyRevision: string;
	/** @deprecated use heuristicPriorScore */
	naive_bayes_score: number;
	/** @deprecated use heuristicFitScore */
	logistic_regression_score: number;
	/** @deprecated use heuristicFitMargin */
	fit_margin: number;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function sigmoid(value: number): number {
	return 1 / (1 + Math.exp(-value));
}

function summarizeEvidence(classification: DomainClassification): {
	structuralWeight: number;
	lexicalWeight: number;
	evidenceCount: number;
} {
	const evidenceCount = classification.evidence.length;
	const totalWeight = classification.evidence.reduce((sum, evidence) => sum + Math.max(0, evidence.weight), 0);
	const structuralWeight = classification.evidence
		.filter((evidence) => ['path', 'import', 'export', 'symbol', 'ast', 'route', 'schema', 'dependency'].includes(evidence.kind))
		.reduce((sum, evidence) => sum + Math.max(0, evidence.weight), 0);
	const lexicalWeight = classification.evidence
		.filter((evidence) => evidence.kind === 'lexical' || evidence.kind === 'semantic')
		.reduce((sum, evidence) => sum + Math.max(0, evidence.weight), 0);

	return {
		structuralWeight: totalWeight > 0 ? structuralWeight / totalWeight : 0,
		lexicalWeight: totalWeight > 0 ? lexicalWeight / totalWeight : 0,
		evidenceCount,
	};
}

export function classifyOkfFit(input: OkfFitInput): OkfFitResult {
	const taxonomyInput: DomainTaxonomyInput = {
		sourceRef: `docs:okf:topic:${input.topicId}`,
		summary: input.summary,
		title: input.title,
		symbol: input.query,
		imports: input.sourceTitles ?? [],
		dependencies: input.sourceUrls ?? [],
		metadata: input.sourceSnippets ?? [],
	};

	const classification = classifyDomainTaxonomy(taxonomyInput);
	const features = summarizeEvidence(classification);
	const topScore = classification.labels[0]?.score ?? 0;
	const secondarySpread = Math.max(
		0,
		(topScore - (classification.labels[1]?.score ?? 0))
	);

	// Cheap lexical prior: conservative, intentionally less expressive than the logistic gate.
	// NOT Naive Bayes inference -- a hand-specified formula. See BEST-FIT-SCORE-SEMANTICS-02.
	const heuristicPriorScore = clamp01(
		0.18 +
		0.52 * classification.confidence +
		0.16 * features.lexicalWeight +
		0.08 * Math.min(features.evidenceCount / 8, 1) +
		0.06 * (classification.primary_domain ? 1 : 0)
	);

	// Close-enough fit gate: use all available evidence, with a structural boost.
	// NOT Logistic Regression inference -- a hand-specified formula. See BEST-FIT-SCORE-SEMANTICS-02.
	const heuristicFitScore = clamp01(
		sigmoid(
			-1.15 +
			1.8 * classification.confidence +
			0.55 * features.structuralWeight +
			0.35 * features.lexicalWeight +
			0.22 * secondarySpread +
			0.05 * Math.min(features.evidenceCount, 12)
		)
	);

	const fitDecision: OkfFitDecision =
		heuristicFitScore >= 0.8 ? 'ACCEPT'
		: heuristicFitScore >= 0.55 ? 'REVIEW'
		: 'ABSTAIN';

	// confidence/classifier_version below are left as spread from `classification` (NOT
	// overwritten by the heuristic values) -- BEST-FIT-SCORE-AUDIT-01 finding #2 found the
	// previous version silently clobbered classifyDomainTaxonomy()'s own confidence/version with
	// the heuristic fit score/OKF_FIT_VERSION, losing the distinction between the two. Fixed here.
	return {
		...classification,
		domainTaxonomyConfidence: classification.confidence,
		domainTaxonomyRevision: classification.classifier_version,
		heuristicPriorScore,
		heuristicFitScore,
		heuristicFitMargin: heuristicFitScore - heuristicPriorScore,
		heuristicFitRevision: OKF_FIT_VERSION,
		scoreSemantics: OKF_FIT_SCORE_SEMANTICS,
		fit_decision: fitDecision,
		// Deprecated compatibility aliases -- see the OkfFitResult doc comment above.
		naive_bayes_score: heuristicPriorScore,
		logistic_regression_score: heuristicFitScore,
		fit_margin: heuristicFitScore - heuristicPriorScore,
	};
}
