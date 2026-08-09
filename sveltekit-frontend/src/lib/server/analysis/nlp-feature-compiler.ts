/**
 * NLP sidecar feature compiler contracts.
 *
 * This is the additive pass/feature surface for the miniforge NLP sidecar:
 * structural AST units, semantic cards, HMM observations, and the wide
 * experiment feature matrix with a narrow control5 summary.
 *
 * The goal is to keep the sidecar typed without turning it into a retrieval
 * owner. All promotion remains outside this module.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const EvidenceSpanSchema = z
	.object({
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1).nullable().default(null),
		packetKey: z.string().min(1).nullable().default(null),
		startByte: z.number().int().nonnegative().nullable().default(null),
		endByte: z.number().int().nonnegative().nullable().default(null),
		startLine: z.number().int().nonnegative().nullable().default(null),
		endLine: z.number().int().nonnegative().nullable().default(null),
		confidence: z.number().finite().min(0).max(1).nullable().default(null),
		excerpt: z.string().nullable().default(null),
		kind: z.string().min(1).nullable().default(null),
	})
	.strict();
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

export const AnalysisPassFamilySchema = z.enum([
	'structural',
	'lexical',
	'linguistic',
	'semantic',
	'sequence',
	'rerank',
	'grounded',
]);
export type AnalysisPassFamily = z.infer<typeof AnalysisPassFamilySchema>;

export const AnalysisPassStatusSchema = z.enum(['succeeded', 'skipped', 'failed']);
export type AnalysisPassStatus = z.infer<typeof AnalysisPassStatusSchema>;

export const AnalysisPassResultSchema = z
	.object({
		requestId: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		family: AnalysisPassFamilySchema,
		passName: z.string().min(1),
		passRevision: z.string().min(1),
		backend: z.string().min(1),
		backendVersion: z.string().min(1),
		device: z.enum(['cpu', 'cuda', 'external']),
		inputHash: z.string().min(1),
		outputHash: z.string().min(1),
		startedAt: z.string().datetime(),
		completedAt: z.string().datetime(),
		status: AnalysisPassStatusSchema,
		features: z.record(z.string(), z.union([z.number().finite(), z.boolean(), z.null()])).default({}),
		artifacts: z.record(z.string(), z.unknown()).default({}),
		evidence: z.array(EvidenceSpanSchema).default([]),
		warnings: z.array(z.string()).default([]),
	})
	.strict();
export type AnalysisPassResult = z.infer<typeof AnalysisPassResultSchema>;

export const AstUnitSchema = z
	.object({
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		treeNodeId: z.string().min(1),
		symbolVersionId: z.string().min(1).nullable().default(null),
		language: z.string().min(1),
		nodeKind: z.string().min(1),
		qualifiedSymbol: z.string().min(1).nullable().default(null),
		byteStart: z.number().int().nonnegative(),
		byteEnd: z.number().int().nonnegative(),
		lineStart: z.number().int().nonnegative(),
		lineEnd: z.number().int().nonnegative(),
		parentSymbol: z.string().min(1).nullable().default(null),
		imports: z.array(z.string().min(1)).default([]),
		exports: z.array(z.string().min(1)).default([]),
		calls: z.array(z.string().min(1)).default([]),
		references: z.array(z.string().min(1)).default([]),
		tests: z.array(z.string().min(1)).default([]),
		comments: z.array(z.string().min(1)).default([]),
		docstrings: z.array(z.string().min(1)).default([]),
		parserEngine: z.string().min(1),
		parserRevision: z.string().min(1),
		grammarRevision: z.string().min(1),
		chunker: z.string().min(1),
		chunkerRevision: z.string().min(1),
		structuralRevision: z.string().min(1),
		contentHash: z.string().min(1),
	})
	.strict();
export type AstUnit = z.infer<typeof AstUnitSchema>;

export const SemanticCodeCardSchema = z
	.object({
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		treeNodeId: z.string().min(1),
		symbolVersionId: z.string().min(1).nullable().default(null),
		language: z.string().min(1),
		symbol: z.string().min(1),
		kind: z.string().min(1),
		role: z.string().min(1),
		calls: z.array(z.string().min(1)).default([]),
		references: z.array(z.string().min(1)).default([]),
		invariants: z.array(z.string().min(1)).default([]),
		excerpt: z.string().min(1),
		lexicalFacts: z.array(z.string().min(1)).default([]),
		linguisticFacts: z.array(z.string().min(1)).default([]),
		structuralRevision: z.string().min(1),
		semanticCardRevision: z.string().min(1),
		semanticRevision: z.string().min(1),
		inputHash: z.string().min(1),
		outputHash: z.string().min(1),
	})
	.strict();
export type SemanticCodeCard = z.infer<typeof SemanticCodeCardSchema>;

export const HMMObservationSchema = z
	.object({
		requestId: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		position: z.number().int().nonnegative(),
		observation: z.string().min(1),
		weight: z.number().finite().default(1),
		sourcePass: z.string().min(1),
		stateHint: z.string().min(1).nullable().default(null),
		createdAt: z.string().datetime(),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();
export type HMMObservation = z.infer<typeof HMMObservationSchema>;

export const Control5Schema = z
	.object({
		lexical_confidence: z.number().finite().min(0).max(1).nullable().default(null),
		semantic_confidence: z.number().finite().min(0).max(1).nullable().default(null),
		structural_confidence: z.number().finite().min(0).max(1).nullable().default(null),
		topological_confidence: z.number().finite().min(0).max(1).nullable().default(null),
		execution_confidence: z.number().finite().min(0).max(1).nullable().default(null),
	})
	.strict();
export type Control5 = z.infer<typeof Control5Schema>;

const FeatureValueSchema = z.union([z.number().finite(), z.boolean(), z.null()]);

export const ExperimentFeatureMatrixSchema = z
	.object({
		requestId: z.string().min(1),
		candidateId: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		featureRevision: z.string().min(1),
		graphRevision: z.string().min(1).nullable().default(null),
		representationRevision: z.string().min(1).nullable().default(null),
		dense_cosine: z.number().finite().nullable().default(null),
		bm25: z.number().finite().nullable().default(null),
		rrf: z.number().finite().nullable().default(null),
		ast_match: z.number().finite().nullable().default(null),
		pagerank: z.number().finite().nullable().default(null),
		cheirank: z.number().finite().nullable().default(null),
		community_affinity: z.number().finite().nullable().default(null),
		hop_distance: z.number().finite().nullable().default(null),
		kmeans_distance: z.number().finite().nullable().default(null),
		som_distance: z.number().finite().nullable().default(null),
		manifold_distance: z.number().finite().nullable().default(null),
		cross_encoder_score: z.number().finite().nullable().default(null),
		mixedbread_score: z.number().finite().nullable().default(null),
		historical_execution_success: z.number().finite().nullable().default(null),
		test_impact: z.number().finite().nullable().default(null),
		reranker_score: z.number().finite().nullable().default(null),
		control5: Control5Schema.nullable().default(null),
		features: z.record(z.string(), FeatureValueSchema).default({}),
		passCount: z.number().int().nonnegative().default(0),
		inputHash: z.string().min(1),
		outputHash: z.string().min(1),
	})
	.strict();
export type ExperimentFeatureMatrix = z.infer<typeof ExperimentFeatureMatrixSchema>;

export interface CompileExperimentFeatureMatrixInput {
	requestId?: string;
	packetKey?: string | null;
	sourceRef: string;
	sourceRevision: string;
	featureRevision?: string;
	graphRevision?: string | null;
	representationRevision?: string | null;
	passResults: AnalysisPassResult[];
}

function latestPass(
	passResults: AnalysisPassResult[],
	family: AnalysisPassFamily,
	passName?: string,
): AnalysisPassResult | undefined {
	return [...passResults]
		.reverse()
		.find((passResult) => passResult.family === family && (passName ? passResult.passName === passName : true));
}

function numericFeature(passResult: AnalysisPassResult | undefined, key: string): number | null {
	const value = passResult?.features[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanFeature(passResult: AnalysisPassResult | undefined, key: string): number | null {
	const value = passResult?.features[key];
	return typeof value === 'boolean' ? (value ? 1 : 0) : null;
}

function deriveControl5(passResults: AnalysisPassResult[]): Control5 {
	const structural = latestPass(passResults, 'structural');
	const lexical = latestPass(passResults, 'lexical');
	const semantic = latestPass(passResults, 'semantic');
	const sequence = latestPass(passResults, 'sequence');
	const rerank = latestPass(passResults, 'rerank');

	return Control5Schema.parse({
		lexical_confidence:
			numericFeature(lexical, 'lexical_confidence') ??
			numericFeature(lexical, 'bm25') ??
			numericFeature(rerank, 'cross_encoder_score'),
		semantic_confidence:
			numericFeature(semantic, 'semantic_confidence') ??
			numericFeature(semantic, 'dense_cosine') ??
			numericFeature(rerank, 'mixedbread_score'),
		structural_confidence:
			numericFeature(structural, 'structural_confidence') ??
			numericFeature(structural, 'ast_match'),
		topological_confidence:
			numericFeature(sequence, 'topological_confidence') ??
			numericFeature(sequence, 'hop_distance'),
		execution_confidence:
			numericFeature(sequence, 'execution_confidence') ??
			numericFeature(sequence, 'historical_execution_success') ??
			booleanFeature(sequence, 'patch_success'),
	});
}

export function compileExperimentFeatureMatrix(
	input: CompileExperimentFeatureMatrixInput,
): { matrix: ExperimentFeatureMatrix; control5: Control5 } {
	const requestId = input.requestId ?? randomUUID();
	const structural = latestPass(input.passResults, 'structural');
	const lexical = latestPass(input.passResults, 'lexical');
	const semantic = latestPass(input.passResults, 'semantic');
	const sequence = latestPass(input.passResults, 'sequence');
	const rerank = latestPass(input.passResults, 'rerank');
	const grounded = latestPass(input.passResults, 'grounded');

	const control5 = deriveControl5(input.passResults);
	const sourceRef = input.sourceRef;
	const sourceRevision = input.sourceRevision;
	const featureRevision = input.featureRevision ?? 'nlp-feature-compiler-v1';
	const packetKey = input.packetKey ?? null;

	const matrix = ExperimentFeatureMatrixSchema.parse({
		requestId,
		candidateId: packetKey ?? sourceRef,
		packetKey,
		sourceRef,
		sourceRevision,
		featureRevision,
		graphRevision: input.graphRevision ?? null,
		representationRevision: input.representationRevision ?? null,
		dense_cosine: numericFeature(semantic, 'dense_cosine') ?? numericFeature(semantic, 'semantic_confidence'),
		bm25: numericFeature(lexical, 'bm25') ?? numericFeature(lexical, 'lexical_confidence'),
		rrf: numericFeature(rerank, 'rrf') ?? numericFeature(rerank, 'reranker_score'),
		ast_match: numericFeature(structural, 'ast_match') ?? numericFeature(structural, 'structural_confidence'),
		pagerank: numericFeature(sequence, 'pagerank'),
		cheirank: numericFeature(sequence, 'cheirank'),
		community_affinity: numericFeature(sequence, 'community_affinity'),
		hop_distance: numericFeature(sequence, 'hop_distance'),
		kmeans_distance: numericFeature(semantic, 'kmeans_distance'),
		som_distance: numericFeature(semantic, 'som_distance'),
		manifold_distance: numericFeature(semantic, 'manifold_distance'),
		cross_encoder_score: numericFeature(rerank, 'cross_encoder_score'),
		mixedbread_score: numericFeature(rerank, 'mixedbread_score'),
		historical_execution_success: numericFeature(sequence, 'historical_execution_success'),
		test_impact: numericFeature(structural, 'test_impact'),
		reranker_score: numericFeature(rerank, 'reranker_score'),
		control5,
		features: {
			...(structural?.features ?? {}),
			...(lexical?.features ?? {}),
			...(semantic?.features ?? {}),
			...(sequence?.features ?? {}),
			...(rerank?.features ?? {}),
			...(grounded?.features ?? {}),
		},
		passCount: input.passResults.length,
		inputHash: input.passResults.map((passResult) => passResult.inputHash).join(':'),
		outputHash: input.passResults.map((passResult) => passResult.outputHash).join(':'),
	});

	return { matrix, control5 };
}
