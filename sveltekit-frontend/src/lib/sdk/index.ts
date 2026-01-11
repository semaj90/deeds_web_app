/**
 * Unified AI SDK for Legal Platform
 *
 * Combines RAG, KAG, and DAG capabilities into a cohesive TypeScript SDK
 *
 * Usage:
 * ```typescript
 * import { RAGClient, KAGClient, DAGClient } from '$lib/sdk';
 *
 * const rag = new RAGClient({ ... });
 * const kag = new KAGClient({ ... });
 * const dag = new DAGClient({ ... });
 * ```
 */

// RAG (Retrieval Augmented Generation)
export {
    RAGClient, type RAGConfig, type RAGDocument,
    type RAGQuery,
    type RAGResult
} from './rag';

// KAG (Knowledge Augmented Generation)
export {
    KAGClient, type KAGConfig, type KAGEntity, type KAGQuery, type KAGRelationship, type KAGSubgraph
} from './kag';

// DAG (Data Augmented Generation)
export {
    DAGClient, type DAGConfig, type DAGQuery,
    type DAGResult
} from './dag';

// ============================================================================
// UNIFIED ORCHESTRATOR
// ============================================================================

import DAGClient from './dag';
import KAGClient from './kag';
import RAGClient from './rag';

export interface UnifiedAIConfig {
	rag: { collectionName: string;
		embeddingModel: string; vectorSize: number;
	};
	kag: { neo4jUri: string;
		neo4jUser: string; neo4jPassword: string;
	};
	dag: { schema: Record<string, unknown>;
	};
}

/**
 * Orchestrates all three augmentation strategies (RAG + KAG + DAG)
 */
export class UnifiedAIClient {
	public rag: RAGClient;
	public kag: KAGClient;
	public dag: DAGClient;

	constructor(config: UnifiedAIConfig) {
		this.rag = new RAGClient(config.rag);
		this.kag = new KAGClient(config.kag);
		this.dag = new DAGClient(config.dag);
	}

	/**
	 * Initialize all clients
	 */
	async initialize(deps: { qdrant: any; neo4j: any; db: any }): Promise<void> {
		await Promise.all([
			this.rag.initialize(deps.qdrant),
			this.kag.initialize(deps.neo4j),
			this.dag.initialize(deps.db)
		]);
	}

	/**
	 * Hybrid augmentation: Combine RAG + KAG + DAG context
	 */
	async hybridAugment(userPrompt: string): Promise<string> {
		// Parallel retrieval
		const [ragResult, kagResult, dagResult] = await Promise.all([
			this.rag.search({ query: userPrompt, topK: 3 }),
			this.kag.querySubgraph({ startEntity: userPrompt, maxDepth: 2 }),
			this.dag.query({ table: 'cases', limit: 5 })
		]);

		// Combine contexts
		const ragContext = this.rag.augmentPrompt(userPrompt, ragResult.documents);
		const kagContext = this.kag.augmentPrompt(userPrompt, kagResult);
		const dagContext = this.dag.augmentPrompt(userPrompt, dagResult);

		return `
${ragContext}

${kagContext}

${dagContext}

Now, synthesize the above context to answer the user's question.
		`.trim();
	}

	/**
	 * System health check
	 */
	async healthCheck(): Promise<{ rag: boolean; kag: boolean; dag: boolean }> {
		const [rag, kag, dag] = await Promise.all([
			this.rag.healthCheck(),
			this.kag.healthCheck(),
			this.dag.healthCheck()
		]);

		return { rag, kag, dag };
	}
}




