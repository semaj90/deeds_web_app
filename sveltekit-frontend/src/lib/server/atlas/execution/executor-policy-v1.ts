import { z } from 'zod';

export const AtlasDataStructureV1Schema = z.enum([
	'relational_tabular',
	'graph_topology',
	'dense_vectors',
	'tensor_transform',
	'semantic_synthesis',
	'canonical_truth',
]);
export type AtlasDataStructureV1 = z.infer<typeof AtlasDataStructureV1Schema>;

export const AtlasExecutorV1Schema = z.enum([
	'postgres',
	'duckdb',
	'polars',
	'cudf',
	'neo4j',
	'networkx',
	'cugraph',
	'qdrant',
	'cuvs_exact',
	'cagra',
	'pytorch_cpu',
	'pytorch_cuda',
	'cuda_native',
	'dspy',
	'model_runtime',
	'revisioned_artifact',
]);
export type AtlasExecutorV1 = z.infer<typeof AtlasExecutorV1Schema>;

export const AtlasOperationV1Schema = z.enum([
	'canonical_read_write',
	'snapshot_join',
	'group_reduce',
	'parquet_arrow_query',
	'pagerank',
	'personalized_pagerank',
	'louvain',
	'leiden',
	'bfs',
	'knn_exact',
	'knn_approximate',
	'gemm',
	'svd',
	'feature_projection',
	'program_synthesis',
]);
export type AtlasOperationV1 = z.infer<typeof AtlasOperationV1Schema>;

export interface ExecutorPolicyRuleV1 {
	dataStructure: AtlasDataStructureV1;
	operation: AtlasOperationV1;
	canonicalExecutor: AtlasExecutorV1 | null;
	oracleExecutors: readonly AtlasExecutorV1[];
	challengerExecutors: readonly AtlasExecutorV1[];
	forbiddenExecutors: readonly AtlasExecutorV1[];
}

/**
 * Logical ownership policy only. It does not assert that a binary/service is
 * installed or healthy on the current machine. Runtime capability probes and
 * promotion receipts decide whether a listed challenger is executable.
 */
export const EXECUTOR_POLICY_V1: readonly ExecutorPolicyRuleV1[] = [
	{
		dataStructure: 'canonical_truth',
		operation: 'canonical_read_write',
		canonicalExecutor: 'postgres',
		oracleExecutors: [],
		challengerExecutors: ['revisioned_artifact'],
		forbiddenExecutors: ['qdrant', 'cuvs_exact', 'cagra', 'cugraph'],
	},
	{
		dataStructure: 'relational_tabular',
		operation: 'snapshot_join',
		canonicalExecutor: null,
		oracleExecutors: ['duckdb', 'polars'],
		challengerExecutors: ['cudf'],
		forbiddenExecutors: ['cuvs_exact', 'cagra'],
	},
	{
		dataStructure: 'relational_tabular',
		operation: 'group_reduce',
		canonicalExecutor: null,
		oracleExecutors: ['duckdb', 'polars'],
		challengerExecutors: ['cudf'],
		forbiddenExecutors: ['cuvs_exact', 'cagra'],
	},
	{
		dataStructure: 'relational_tabular',
		operation: 'parquet_arrow_query',
		canonicalExecutor: null,
		oracleExecutors: ['duckdb', 'polars'],
		challengerExecutors: ['cudf'],
		forbiddenExecutors: ['neo4j', 'cuvs_exact'],
	},
	{
		dataStructure: 'graph_topology',
		operation: 'pagerank',
		canonicalExecutor: 'neo4j',
		oracleExecutors: ['networkx'],
		challengerExecutors: ['cugraph'],
		forbiddenExecutors: ['cuvs_exact', 'cagra'],
	},
	{
		dataStructure: 'graph_topology',
		operation: 'personalized_pagerank',
		canonicalExecutor: 'neo4j',
		oracleExecutors: ['networkx'],
		challengerExecutors: ['cugraph'],
		forbiddenExecutors: ['cuvs_exact', 'cagra'],
	},
	{
		dataStructure: 'graph_topology',
		operation: 'louvain',
		canonicalExecutor: 'neo4j',
		oracleExecutors: ['networkx'],
		challengerExecutors: ['cugraph'],
		forbiddenExecutors: ['cuvs_exact', 'cagra'],
	},
	{
		dataStructure: 'graph_topology',
		operation: 'leiden',
		canonicalExecutor: 'neo4j',
		oracleExecutors: [],
		challengerExecutors: ['cugraph'],
		forbiddenExecutors: ['cuvs_exact', 'cagra'],
	},
	{
		dataStructure: 'graph_topology',
		operation: 'bfs',
		canonicalExecutor: 'neo4j',
		oracleExecutors: ['networkx'],
		challengerExecutors: ['cugraph'],
		forbiddenExecutors: ['cuvs_exact', 'cagra'],
	},
	{
		dataStructure: 'dense_vectors',
		operation: 'knn_exact',
		canonicalExecutor: 'qdrant',
		oracleExecutors: ['cuvs_exact'],
		challengerExecutors: [],
		forbiddenExecutors: ['cugraph', 'networkx'],
	},
	{
		dataStructure: 'dense_vectors',
		operation: 'knn_approximate',
		canonicalExecutor: 'qdrant',
		oracleExecutors: ['cuvs_exact'],
		challengerExecutors: ['cagra'],
		forbiddenExecutors: ['cugraph', 'networkx'],
	},
	{
		dataStructure: 'tensor_transform',
		operation: 'gemm',
		canonicalExecutor: null,
		oracleExecutors: ['pytorch_cpu'],
		challengerExecutors: ['pytorch_cuda', 'cuda_native'],
		forbiddenExecutors: ['neo4j', 'qdrant'],
	},
	{
		dataStructure: 'tensor_transform',
		operation: 'svd',
		canonicalExecutor: null,
		oracleExecutors: ['pytorch_cpu'],
		challengerExecutors: ['pytorch_cuda'],
		forbiddenExecutors: ['neo4j', 'cuvs_exact'],
	},
	{
		dataStructure: 'tensor_transform',
		operation: 'feature_projection',
		canonicalExecutor: null,
		oracleExecutors: ['pytorch_cpu'],
		challengerExecutors: ['pytorch_cuda', 'cuda_native'],
		forbiddenExecutors: ['neo4j'],
	},
	{
		dataStructure: 'semantic_synthesis',
		operation: 'program_synthesis',
		canonicalExecutor: null,
		oracleExecutors: [],
		challengerExecutors: ['dspy', 'model_runtime'],
		forbiddenExecutors: ['cuvs_exact', 'cugraph'],
	},
] as const;

export function resolveExecutorPolicyV1(
	dataStructure: AtlasDataStructureV1,
	operation: AtlasOperationV1,
): ExecutorPolicyRuleV1 {
	const rule = EXECUTOR_POLICY_V1.find(
		(candidate) => candidate.dataStructure === dataStructure && candidate.operation === operation,
	);
	if (!rule) throw new Error(`NO_EXECUTOR_POLICY:${dataStructure}:${operation}`);
	return rule;
}

export function assertExecutorAllowedV1(input: {
	dataStructure: AtlasDataStructureV1;
	operation: AtlasOperationV1;
	executor: AtlasExecutorV1;
}): void {
	const rule = resolveExecutorPolicyV1(input.dataStructure, input.operation);
	if (rule.forbiddenExecutors.includes(input.executor)) {
		throw new Error(`EXECUTOR_FORBIDDEN:${input.dataStructure}:${input.operation}:${input.executor}`);
	}
	const allowed = new Set<AtlasExecutorV1>([
		...(rule.canonicalExecutor ? [rule.canonicalExecutor] : []),
		...rule.oracleExecutors,
		...rule.challengerExecutors,
	]);
	if (!allowed.has(input.executor)) {
		throw new Error(`EXECUTOR_UNDECLARED:${input.dataStructure}:${input.operation}:${input.executor}`);
	}
}
