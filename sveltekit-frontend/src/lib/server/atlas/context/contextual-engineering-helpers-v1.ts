import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { decodeFeatureRowRpcPacketV1 } from '../transport/feature-row-rpc-packet-v1.js';

export const CodePageFeatureProfileV1Schema = z.object({
	schema: z.literal('atlas.code-page-feature-profile.v1'),
	profileId: z.string().min(1),
	canonicalId: z.string().min(1),
	sourceRef: z.string().min(1),
	filePath: z.string().min(1),
	language: z.enum(['typescript', 'javascript', 'python', 'rust', 'go', 'cuda', 'cpp']),

	// 1. Concrete Syntax Tree (CST)
	cst: z.object({
		nodeType: z.string().min(1),
		startByte: z.number().int().nonnegative(),
		endByte: z.number().int().nonnegative(),
		parentFieldPath: z.string().min(1),
		spanChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	}),

	// 2. Abstract Syntax Tree (AST-grep / Semantic)
	ast: z.object({
		treeNodeId: z.string().min(1),
		symbolVersionId: z.string().min(1),
		symbolKind: z.enum(['function', 'method', 'class', 'interface', 'variable', 'type', 'module']),
		parameters: z.array(z.string()),
		returnType: z.string().optional(),
		cyclomaticComplexity: z.number().nonnegative(),
	}),

	// 3. Language Server Protocol (LSP) / Compiler Facts
	lsp: z.object({
		definitionRef: z.string().min(1),
		referenceCount: z.number().int().nonnegative(),
		isExported: z.boolean(),
		diagnosticsCount: z.number().int().nonnegative(),
	}),

	// 4. NES LUT & Domain Query Lookup
	nesLut: z.object({
		tableSource: z.literal('atlas_nes_lut_v1'),
		domainClass: z.string().min(1),
		clusterBucketId: z.number().int().nonnegative(),
		taxonomyConfidence: z.number().min(0).max(1),
	}),

	// 5. 10-Column Multi-Lane Feature Row
	featureRow: z.object({
		dense: z.number(),
		sparse: z.number(),
		rrf: z.number(),
		ast: z.number(),
		pagerankAuthority: z.number(),
		pprAffinity: z.number().nullable(),
		domainAffinity: z.number(),
		freshness: z.number(),
		crossEncoder: z.number().nullable(),
		executionUtility: z.number(),
	}),

	tokenAnchor: z.string().min(1),
	workspaceRevision: z.string().min(1),
	canonicalAuthority: z.literal(false),
}).strict();

export type CodePageFeatureProfileV1 = z.infer<typeof CodePageFeatureProfileV1Schema>;

export const PaginatedEngineeringRecommendationV1Schema = z.object({
	schema: z.literal('atlas.paginated-engineering-recommendation.v1'),
	page: z.number().int().positive(),
	pageSize: z.number().int().positive(),
	totalCandidates: z.number().int().nonnegative(),
	totalPages: z.number().int().positive(),
	queryDomain: z.string().min(1),
	items: z.array(z.object({
		rank: z.number().int().positive(),
		canonicalId: z.string().min(1),
		sourceRef: z.string().min(1),
		symbolKind: z.string().min(1),
		moduleName: z.string().min(1),
		tokenAnchor: z.string().min(1),
		compositeScore: z.number().min(0).max(1),
		domainAlignment: numberOrZero(),
		denseScore: z.number(),
		sparseScore: z.number(),
		pagerankScore: z.number(),
		evidenceRefs: z.array(z.string().min(1)),
	})),
	generationRecoveryGuide: z.object({
		instruction: z.string(),
		driftThreshold: z.number(),
		allowedSourceRefs: z.array(z.string()),
	}),
}).strict();

function numberOrZero() {
	return z.number().default(0);
}

export type PaginatedEngineeringRecommendationV1 = z.infer<typeof PaginatedEngineeringRecommendationV1Schema>;

/**
 * Builds a contextual engineering helper profile for a symbol on a page,
 * joining CST, AST, LSP, and NES LUT domain features into a grounded token anchor.
 */
export function buildCodePageFeatureProfileV1(input: {
	canonicalId: string;
	sourceRef: string;
	filePath: string;
	language: 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'cuda' | 'cpp';
	cst: CodePageFeatureProfileV1['cst'];
	ast: CodePageFeatureProfileV1['ast'];
	lsp: CodePageFeatureProfileV1['lsp'];
	nesLut: CodePageFeatureProfileV1['nesLut'];
	featureRow: CodePageFeatureProfileV1['featureRow'];
	workspaceRevision: string;
}): CodePageFeatureProfileV1 {
	const tokenAnchor = `${input.canonicalId}::${input.sourceRef}#[${input.cst.startByte}-${input.cst.endByte}]`;
	const profileId = `prof-${createHash('sha256').update(`${tokenAnchor}:${input.workspaceRevision}`).digest('hex').slice(0, 16)}`;

	return CodePageFeatureProfileV1Schema.parse({
		schema: 'atlas.code-page-feature-profile.v1',
		profileId,
		canonicalId: input.canonicalId,
		sourceRef: input.sourceRef,
		filePath: input.filePath,
		language: input.language,
		cst: input.cst,
		ast: input.ast,
		lsp: input.lsp,
		nesLut: input.nesLut,
		featureRow: input.featureRow,
		tokenAnchor,
		workspaceRevision: input.workspaceRevision,
		canonicalAuthority: false,
	});
}

/**
 * Generates paginated Top-K function, module, and library recommendations from an
 * ingested RPC packet and NES LUT domain query.
 * When generative LLM tokens drift or get lost, this provides strict token anchor breadcrumbs.
 */
export function buildPaginatedEngineeringRecommendationsV1(input: {
	decodedPacket: ReturnType<typeof decodeFeatureRowRpcPacketV1>;
	profiles: readonly CodePageFeatureProfileV1[];
	domainQuery: string;
	page?: number;
	pageSize?: number;
	authorization: {
		actorId: string;
		workspaceGrantAdmitted: boolean;
	};
}): PaginatedEngineeringRecommendationV1 {
	// Strict fail-closed authorization check
	if (!input.authorization.workspaceGrantAdmitted) {
		throw new Error('WORKSPACE_NOT_ADMITTED: Cannot build engineering recommendations without verified workspace grant');
	}

	const page = Math.max(1, input.page ?? 1);
	const pageSize = Math.max(1, input.pageSize ?? 5);

	const profileMap = new Map<string, CodePageFeatureProfileV1>();
	for (const p of input.profiles) {
		profileMap.set(p.canonicalId, p);
	}

	const totalCandidates = input.decodedPacket.shape[0];
	const cols = input.decodedPacket.shape[1];

	const candidates: PaginatedEngineeringRecommendationV1['items'] = [];

	for (let row = 0; row < totalCandidates; row++) {
		const canonicalId = input.decodedPacket.canonicalIds[row];
		const sourceRef = input.decodedPacket.sourceRefs[row];
		const offset = row * cols;

		const dense = input.decodedPacket.tensor[offset + 0] ?? 0;
		const sparse = input.decodedPacket.tensor[offset + 1] ?? 0;
		const rrf = input.decodedPacket.tensor[offset + 2] ?? 0;
		const ast = input.decodedPacket.tensor[offset + 3] ?? 0;
		const pagerank = input.decodedPacket.tensor[offset + 4] ?? 0;
		const crossEncoder = input.decodedPacket.tensor[offset + 8] ?? 0;

		const profile = profileMap.get(canonicalId);
		const domainAlignment = profile?.featureRow.domainAffinity ?? 0;
		const symbolKind = profile?.ast.symbolKind ?? 'function';
		const moduleName = profile?.filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'unknown_module';
		const tokenAnchor = profile?.tokenAnchor ?? `${canonicalId}::${sourceRef}#[0-0]`;

		const compositeScore = Math.min(
			1,
			Math.max(
				0,
				dense * 0.3 +
				sparse * 0.15 +
				rrf * 0.15 +
				ast * 0.15 +
				pagerank * 0.1 +
				(crossEncoder ?? 0) * 0.15,
			),
		);

		candidates.push({
			rank: 0,
			canonicalId,
			sourceRef,
			symbolKind,
			moduleName,
			tokenAnchor,
			compositeScore: Number(compositeScore.toFixed(4)),
			domainAlignment,
			denseScore: dense,
			sparseScore: sparse,
			pagerankScore: pagerank,
			evidenceRefs: input.decodedPacket.evidenceRefs[row] ?? [],
		});
	}

	candidates.sort((a, b) => b.compositeScore - a.compositeScore);
	candidates.forEach((c, i) => {
		c.rank = i + 1;
	});

	const totalPages = Math.max(1, Math.ceil(totalCandidates / pageSize));
	const startIndex = (page - 1) * pageSize;
	const items = candidates.slice(startIndex, startIndex + pageSize);

	return PaginatedEngineeringRecommendationV1Schema.parse({
		schema: 'atlas.paginated-engineering-recommendation.v1',
		page,
		pageSize,
		totalCandidates,
		totalPages,
		queryDomain: input.domainQuery,
		items,
		generationRecoveryGuide: {
			instruction: 'Anchor generation to tokenAnchor when token entropy exceeds threshold.',
			driftThreshold: 0.85,
			allowedSourceRefs: input.decodedPacket.sourceRefs,
		},
	});
}

/**
 * Resolves a drifting generative token anchor against an admitted profile.
 * Prevents hallucinated function or module names during generative synthesis.
 */
export function resolveTokenAnchorRecoveryV1(
	driftingToken: string,
	recommendations: PaginatedEngineeringRecommendationV1,
): {
	recovered: boolean;
	targetItem?: PaginatedEngineeringRecommendationV1['items'][0];
	suggestedAnchor?: string;
} {
	const match = recommendations.items.find(
		(it) => it.canonicalId.includes(driftingToken) || it.moduleName.includes(driftingToken) || it.sourceRef.includes(driftingToken),
	);

	if (!match) {
		return { recovered: false };
	}

	return {
		recovered: true,
		targetItem: match,
		suggestedAnchor: match.tokenAnchor,
	};
}
