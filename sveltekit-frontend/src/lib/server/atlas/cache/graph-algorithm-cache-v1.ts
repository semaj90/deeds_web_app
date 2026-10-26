import { createHash } from 'node:crypto';
import { z } from 'zod';

export const GRAPH_ALGORITHM_ARTIFACT_SCHEMA_V1 = 'atlas.graph-algorithm-artifact.v1' as const;

export type GraphAlgorithmTypeV1 = 'pagerank' | 'ppr' | 'community' | 'subgraph_projection';

export const GraphExecutorTypeV1Schema = z.enum([
	'networkx',
	'neo4j_gds',
	'cugraph',
	'nodejs_power_iter',
	'pytorch_spmm',
]);
export type GraphExecutorTypeV1 = z.infer<typeof GraphExecutorTypeV1Schema>;

export interface GraphAlgorithmCacheKeyV1Input {
	canonicalGraphRevision: string;
	algorithm: GraphAlgorithmTypeV1;
	algorithmRevision: string;
	parameterRevision: string;
	parameters?: Readonly<Record<string, unknown>>;
	projectionContractRevision?: string;
}

function sha256(data: string): string {
	return `sha256:${createHash('sha256').update(data, 'utf8').digest('hex')}`;
}

export function buildGraphAlgorithmCacheKeyV1(input: GraphAlgorithmCacheKeyV1Input): string {
	if (!input.canonicalGraphRevision.trim()) {
		throw new Error('GRAPH_CACHE_KEY_MISSING_GRAPH_REVISION');
	}
	if (!input.algorithmRevision.trim()) {
		throw new Error('GRAPH_CACHE_KEY_MISSING_ALGORITHM_REVISION');
	}

	const canonicalJson = JSON.stringify({
		algorithm: input.algorithm,
		algorithmRevision: input.algorithmRevision,
		canonicalGraphRevision: input.canonicalGraphRevision,
		parameters: input.parameters ?? {},
		parameterRevision: input.parameterRevision,
		projectionContractRevision: input.projectionContractRevision ?? null,
	});

	const digest = createHash('sha256').update(canonicalJson).digest('hex');
	return `atlas:graph-cache:v1:${input.algorithm}:${digest}`;
}

export const GraphAlgorithmArtifactRecordV1Schema = z
	.object({
		schema: z.literal(GRAPH_ALGORITHM_ARTIFACT_SCHEMA_V1),
		cacheKey: z.string().regex(/^atlas:graph-cache:v1:[a-z_]+:[a-f0-9]{64}$/),
		algorithm: z.enum(['pagerank', 'ppr', 'community', 'subgraph_projection']),
		canonicalGraphRevision: z.string().min(1),
		ordinalMapChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		algorithmRevision: z.string().min(1),
		parameterRevision: z.string().min(1),
		resultHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		arrowArtifactRef: z.string().min(1),
		byteSize: z.number().int().nonnegative(),
		residency: z.enum(['WARM_LOCAL', 'HOT_VALKEY', 'GPU_VRAM']),
		status: z.enum(['proven', 'partial', 'failed']),
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
	})
	.strict();

export type GraphAlgorithmArtifactRecordV1 = z.infer<typeof GraphAlgorithmArtifactRecordV1Schema>;

export function canReuseGraphAlgorithmArtifactV1(
	input: GraphAlgorithmCacheKeyV1Input,
	artifact: GraphAlgorithmArtifactRecordV1 | null | undefined,
	options: {
		expectedOrdinalMapChecksum: string;
	},
): boolean {
	if (!artifact) return false;
	if (artifact.status !== 'proven') return false;

	const expectedKey = buildGraphAlgorithmCacheKeyV1(input);
	if (artifact.cacheKey !== expectedKey) return false;
	if (artifact.canonicalGraphRevision !== input.canonicalGraphRevision) return false;
	if (artifact.algorithmRevision !== input.algorithmRevision) return false;
	if (artifact.parameterRevision !== input.parameterRevision) return false;
	if (artifact.ordinalMapChecksum !== options.expectedOrdinalMapChecksum) return false;

	return true;
}

export interface WarmLoadGraphProjectionDescriptorV1 {
	schema: 'atlas.warm-load-graph-projection.v1';
	arrowArtifactRef: string;
	byteSize: number;
	mmapSafe: boolean;
	vramPinned: boolean;
	targetResidency: 'WARM_LOCAL' | 'GPU_VRAM';
}

export function buildWarmLoadGraphProjectionDescriptorV1(
	artifact: GraphAlgorithmArtifactRecordV1,
	vramPinned = false,
): WarmLoadGraphProjectionDescriptorV1 {
	if (artifact.status !== 'proven') {
		throw new Error('CANNOT_WARM_LOAD_UNPROVEN_GRAPH_ARTIFACT');
	}

	return {
		schema: 'atlas.warm-load-graph-projection.v1',
		arrowArtifactRef: artifact.arrowArtifactRef,
		byteSize: artifact.byteSize,
		mmapSafe: true,
		vramPinned,
		targetResidency: vramPinned ? 'GPU_VRAM' : 'WARM_LOCAL',
	};
}

/**
 * Parity proof validating that two independent graph executors (e.g. NetworkX vs cuGraph)
 * produce identical results on the same canonical graph revision.
 */
export const GraphExecutorParityProofV1Schema = z
	.object({
		schema: z.literal('atlas.graph-executor-parity-proof.v1'),
		canonicalGraphRevision: z.string().min(1),
		algorithm: z.enum(['pagerank', 'ppr', 'community', 'subgraph_projection']),
		primaryExecutor: GraphExecutorTypeV1Schema,
		secondaryExecutor: GraphExecutorTypeV1Schema,
		maxAbsoluteError: z.number().finite().nonnegative(),
		meanAbsoluteError: z.number().finite().nonnegative(),
		spearmanCorrelation: z.number().finite().min(-1).max(1),
		topKOverlap: z.number().finite().min(0).max(1),
		maxAllowedMae: z.number().finite().default(1e-5),
		minRequiredCorrelation: z.number().finite().default(0.999),
		parityPassed: z.boolean(),
	})
	.strict();

export type GraphExecutorParityProofV1 = z.infer<typeof GraphExecutorParityProofV1Schema>;

export interface ResolveSharedArtifactResultV1 {
	logicalCacheKey: string;
	effectiveKey: string;
	sharedAcrossExecutors: boolean;
	laneVotes: 1; // Enforces executor != lane vote: always exactly 1 vote in fusion
	provenance: {
		canonicalGraphRevision: string;
		algorithm: GraphAlgorithmTypeV1;
		executors: readonly GraphExecutorTypeV1[];
		parityProven: boolean;
	};
}

/**
 * Resolves whether multiple graph executors may share a single logical cache artifact.
 *
 * Rules:
 * 1. NetworkX, Neo4j GDS, and cuGraph results may share one logical artifact ONLY after
 *    explicit parity gates pass (parityPassed === true).
 * 2. If parity has not been proven, each executor gets an isolated key and cannot masquerade.
 * 3. EXECUTOR != LANE VOTE: Multiple executors for the same algorithm produce exactly ONE
 *    lane vote in SearchRuntime / FeatureRow fusion.
 */
export function resolveSharedGraphAlgorithmArtifactV1(input: {
	cacheInput: GraphAlgorithmCacheKeyV1Input;
	executor: GraphExecutorTypeV1;
	parityProofs?: readonly GraphExecutorParityProofV1[];
}): ResolveSharedArtifactResultV1 {
	const logicalKey = buildGraphAlgorithmCacheKeyV1(input.cacheInput);
	const proofs = input.parityProofs ?? [];

	// Find any valid parity proof matching this graph revision, algorithm, and executor
	const relevantProof = proofs.find(
		(p) =>
			p.canonicalGraphRevision === input.cacheInput.canonicalGraphRevision &&
			p.algorithm === input.cacheInput.algorithm &&
			p.parityPassed &&
			(p.primaryExecutor === input.executor || p.secondaryExecutor === input.executor),
	);

	const parityProven = Boolean(relevantProof && relevantProof.parityPassed);

	// If parity is proven, the executor shares the canonical logical key.
	// Otherwise, it is isolated by appending its specific executor name.
	const effectiveKey = parityProven ? logicalKey : `${logicalKey}:isolated:${input.executor}`;

	const executorsSet = new Set<GraphExecutorTypeV1>([input.executor]);
	if (relevantProof) {
		executorsSet.add(relevantProof.primaryExecutor);
		executorsSet.add(relevantProof.secondaryExecutor);
	}

	return {
		logicalCacheKey: logicalKey,
		effectiveKey,
		sharedAcrossExecutors: parityProven,
		laneVotes: 1, // Enforce single vote invariant
		provenance: {
			canonicalGraphRevision: input.cacheInput.canonicalGraphRevision,
			algorithm: input.cacheInput.algorithm,
			executors: Array.from(executorsSet).sort(),
			parityProven,
		},
	};
}
