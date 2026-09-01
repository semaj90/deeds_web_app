import {
  OAK_KAG_NEIGHBOR_READ_STRICT_V1,
  oakKagNeighborInputV1Schema,
  oakKagNeighborReceiptV1Schema,
} from '@deeds/parent-atlas';
import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';
import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';
import { readKagHypergraphNeighborsStrictV1 } from '$lib/server/atlas/integration/kag-hypergraph-reader-v1.js';

/** Exact governed owner for the KAG canonical-ID neighbor read. */
export function createOakDagKagNeighborHandlerV1(): OakDagActionHandlerV1 {
  return {
    implementationRef: OAK_KAG_NEIGHBOR_READ_STRICT_V1,
    operatorId: 'op:bounded_bfs',
    operatorKind: 'BOUNDED_BFS',
    actionKinds: ['GRAPH_EXPAND'],
    outputContract: 'output:oak_kag_neighbor_receipt',
    run: async ({ binding }: { binding: KernelDagExecutionBindingV1 }) => {
      const args = oakKagNeighborInputV1Schema.parse(binding.boundArguments);
      const result = await readKagHypergraphNeighborsStrictV1(args.canonicalIds);
      return oakKagNeighborReceiptV1Schema.parse({
        schema: 'atlas.oak-kag-neighbor-receipt.v1',
        implementationRef: OAK_KAG_NEIGHBOR_READ_STRICT_V1,
        ...result,
        writesPerformed: false,
        canonicalAuthority: false,
      });
    },
  };
}
