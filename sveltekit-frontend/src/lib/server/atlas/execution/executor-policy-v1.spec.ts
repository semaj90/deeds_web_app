import { describe, expect, it } from 'vitest';
import { assertExecutorAllowedV1, resolveExecutorPolicyV1 } from './executor-policy-v1.js';

describe('executor-policy-v1', () => {
	it('keeps cuVS/CAGRA out of graph topology operations', () => {
		expect(() => assertExecutorAllowedV1({ dataStructure: 'graph_topology', operation: 'pagerank', executor: 'cagra' }))
			.toThrow(/EXECUTOR_FORBIDDEN/);
		expect(() => assertExecutorAllowedV1({ dataStructure: 'graph_topology', operation: 'pagerank', executor: 'cuvs_exact' }))
			.toThrow(/EXECUTOR_FORBIDDEN/);
	});

	it('declares Neo4j/NetworkX/cuGraph roles for PageRank', () => {
		const rule = resolveExecutorPolicyV1('graph_topology', 'pagerank');
		expect(rule.canonicalExecutor).toBe('neo4j');
		expect(rule.oracleExecutors).toContain('networkx');
		expect(rule.challengerExecutors).toContain('cugraph');
	});

	it('declares Qdrant/cuVS/CAGRA roles for approximate semantic KNN', () => {
		const rule = resolveExecutorPolicyV1('dense_vectors', 'knn_approximate');
		expect(rule.canonicalExecutor).toBe('qdrant');
		expect(rule.oracleExecutors).toContain('cuvs_exact');
		expect(rule.challengerExecutors).toContain('cagra');
	});

	it('keeps canonical writes in Postgres', () => {
		const rule = resolveExecutorPolicyV1('canonical_truth', 'canonical_read_write');
		expect(rule.canonicalExecutor).toBe('postgres');
		expect(() => assertExecutorAllowedV1({ dataStructure: 'canonical_truth', operation: 'canonical_read_write', executor: 'qdrant' }))
			.toThrow(/EXECUTOR_FORBIDDEN/);
	});
});
