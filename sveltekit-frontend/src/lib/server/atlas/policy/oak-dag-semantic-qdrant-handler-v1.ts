import {
  OAK_SEMANTIC_QDRANT_STRICT_V1,
  oakSemanticQdrantInputV1Schema,
  oakSemanticQdrantReceiptV1Schema,
} from '@deeds/parent-atlas';
import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';
import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';
import { searchQdrantCodeStrictV1 } from '$lib/server/search/qdrant-search.js';

/** Exact governed owner for semantic_768 Qdrant execution; hybrid remains separate. */
export function createOakDagSemanticQdrantHandlerV1(): OakDagActionHandlerV1 {
  return {
    implementationRef: OAK_SEMANTIC_QDRANT_STRICT_V1,
    operatorId: 'op:search_semantic',
    operatorKind: 'SEARCH_SEMANTIC',
    actionKinds: ['FETCH_QDRANT'],
    outputContract: 'output:oak_semantic_qdrant_receipt',
    run: async ({ binding }: { binding: KernelDagExecutionBindingV1 }) => {
      const args = oakSemanticQdrantInputV1Schema.parse(binding.boundArguments);
      const results = await searchQdrantCodeStrictV1(args.embedding, args.limit, {
        collection: args.collection,
        topoClass: args.topoClass,
        exactVectorSearch: true,
      });
      return oakSemanticQdrantReceiptV1Schema.parse({
        schema: 'atlas.oak-semantic-qdrant-receipt.v1',
        implementationRef: OAK_SEMANTIC_QDRANT_STRICT_V1,
        executor: 'qdrant',
        representation: 'semantic_768',
        collection: args.collection,
        vectorName: 'content',
        candidateCount: results.length,
        projectionIds: results.map((result) => result.qdrant_id),
        writesPerformed: false,
        canonicalAuthority: false,
      });
    },
  };
}
