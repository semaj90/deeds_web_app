import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';
import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';
import { oakDagGraphExpandInputSchema } from './oak-dag-owner-input-schemas-v1.js';
import { expandAtlasGraph } from '$lib/server/atlas/graph/graph-expansion-adapter.js';

/** Exact governed owner for the OaK graph expansion implementation reference. */
export function createOakDagGraphHandlerV1(): OakDagActionHandlerV1 {
  return {
    implementationRef: 'sveltekit-frontend/src/lib/server/atlas/graph/graph-expansion-adapter.ts#expandAtlasGraph',
    operatorId: 'op:expand_graph',
    operatorKind: 'EXPAND_GRAPH',
    actionKinds: ['GRAPH_EXPAND'],
    outputContract: 'output:neighborhood',
    run: async ({ binding }: { binding: KernelDagExecutionBindingV1 }) => {
      const args = oakDagGraphExpandInputSchema.parse(binding.boundArguments);
      return expandAtlasGraph(args);
    },
  };
}
