export type GraphAlgorithmId =
	| 'pagerank'
	| 'personalized_pagerank'
	| 'katz'
	| 'eigenvector'
	| 'hits'
	| 'degree'
	| 'betweenness'
	| 'closeness'
	| 'bfs'
	| 'sssp'
	| 'kcore'
	| 'k_truss'
	| 'triangles'
	| 'louvain'
	| 'leiden'
	| 'exact_knn'
	| 'cagra'
	| 'pca'
	| 'truncated_svd'
	| 'kmeans'
	| 'umap';

export type GraphAlgorithmRegistryEntryV1 = {
	schema: 'atlas.graph-algorithm-registry-entry.v1';
	algorithm: GraphAlgorithmId;
	graphKind: 'DIRECTED' | 'UNDIRECTED' | 'VECTOR';
	cpuBackend: 'NETWORKX' | 'CUML' | null;
	gpuBackend: 'CUGRAPH' | 'CUVS' | 'CUML' | null;
	output: 'NODE_SCORE' | 'TRAVERSAL' | 'COMMUNITY_ID' | 'VECTOR_NEIGHBORS' | 'REPRESENTATION';
	projectionRequired: string | null;
	executionOwner: 'LIBRARY';
};

const entry = (algorithm: GraphAlgorithmId, graphKind: GraphAlgorithmRegistryEntryV1['graphKind'], cpuBackend: GraphAlgorithmRegistryEntryV1['cpuBackend'], gpuBackend: GraphAlgorithmRegistryEntryV1['gpuBackend'], output: GraphAlgorithmRegistryEntryV1['output'], projectionRequired: string | null = null): GraphAlgorithmRegistryEntryV1 => ({
	schema: 'atlas.graph-algorithm-registry-entry.v1', algorithm, graphKind, cpuBackend, gpuBackend, output, projectionRequired, executionOwner: 'LIBRARY'
});

export const graphAlgorithmRegistryV1: readonly GraphAlgorithmRegistryEntryV1[] = [
	entry('pagerank', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('personalized_pagerank', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('katz', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('eigenvector', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('hits', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('degree', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('betweenness', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('closeness', 'DIRECTED', 'NETWORKX', null, 'NODE_SCORE'),
	entry('bfs', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'TRAVERSAL'),
	entry('sssp', 'DIRECTED', 'NETWORKX', 'CUGRAPH', 'TRAVERSAL'),
	entry('kcore', 'UNDIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('k_truss', 'UNDIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE', 'STRUCTURAL_AFFINITY'),
	entry('triangles', 'UNDIRECTED', 'NETWORKX', 'CUGRAPH', 'NODE_SCORE'),
	entry('louvain', 'UNDIRECTED', 'NETWORKX', 'CUGRAPH', 'COMMUNITY_ID'),
	entry('leiden', 'UNDIRECTED', null, 'CUGRAPH', 'COMMUNITY_ID'),
	entry('exact_knn', 'VECTOR', null, 'CUVS', 'VECTOR_NEIGHBORS'),
	entry('cagra', 'VECTOR', null, 'CUVS', 'VECTOR_NEIGHBORS'),
	entry('pca', 'VECTOR', null, 'CUML', 'REPRESENTATION'),
	entry('truncated_svd', 'VECTOR', null, 'CUML', 'REPRESENTATION'),
	entry('kmeans', 'VECTOR', null, 'CUML', 'REPRESENTATION'),
	entry('umap', 'VECTOR', null, 'CUML', 'REPRESENTATION'),
];

export function getGraphAlgorithmRegistryEntryV1(algorithm: GraphAlgorithmId): GraphAlgorithmRegistryEntryV1 {
	const found = graphAlgorithmRegistryV1.find((candidate) => candidate.algorithm === algorithm);
	if (!found) throw new Error(`GRAPH_ALGORITHM_NOT_REGISTERED:${algorithm}`);
	return found;
}
