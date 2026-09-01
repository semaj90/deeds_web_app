import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';
import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';
import { oakDagAstEvidenceInputSchema } from './oak-dag-owner-input-schemas-v1.js';
import { readAtlasAstEvidenceV1 } from '$lib/server/atlas/integration/atlas-ast-evidence-reader-v1.js';

/** Exact governed owner for the OaK GET_AST_EVIDENCE implementation reference. */
export function createOakDagAstEvidenceHandlerV1(): OakDagActionHandlerV1 {
  return {
    implementationRef: 'sveltekit-frontend/src/lib/server/atlas/integration/atlas-ast-evidence-reader-v1.ts#readAtlasAstEvidenceV1',
    operatorId: 'op:get_ast_evidence',
    operatorKind: 'GET_AST_EVIDENCE',
    actionKinds: ['AST_SCAN'],
    outputContract: 'output:ast_node_row',
    run: async ({ binding }: { binding: KernelDagExecutionBindingV1 }) => {
      const args = oakDagAstEvidenceInputSchema.parse(binding.boundArguments);
      return readAtlasAstEvidenceV1(args);
    },
  };
}
