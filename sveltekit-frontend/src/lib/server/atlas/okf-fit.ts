import {
	type DomainClassification,
	type DomainTaxonomyInput,
	classifyDomainTaxonomy,
} from './domain-taxonomy.js';

export const OKF_FIT_VERSION = 'okf-fit-v1';

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

export interface OkfFitResult extends DomainClassification {
	naive_bayes_score: number;
	logistic_regression_score: number;
	fit_margin: number;
	fit_decision: OkfFitDecision;
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
	const naiveBayesScore = clamp01(
		0.18 +
		0.52 * classification.confidence +
		0.16 * features.lexicalWeight +
		0.08 * Math.min(features.evidenceCount / 8, 1) +
		0.06 * (classification.primary_domain ? 1 : 0)
	);

	// Close-enough fit gate: use all available evidence, with a structural boost.
	const logisticRegressionScore = clamp01(
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
		logisticRegressionScore >= 0.8 ? 'ACCEPT'
		: logisticRegressionScore >= 0.55 ? 'REVIEW'
		: 'ABSTAIN';

	return {
		...classification,
		confidence: logisticRegressionScore,
		naive_bayes_score: naiveBayesScore,
		logistic_regression_score: logisticRegressionScore,
		fit_margin: logisticRegressionScore - naiveBayesScore,
		fit_decision: fitDecision,
		classifier_version: OKF_FIT_VERSION,
	};
}
