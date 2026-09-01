import {
  OAK_CONTEXT_MANIFEST_ACE_V1,
  oakContextManifestInputV1Schema,
} from '@deeds/parent-atlas';
import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';
import type { ACEContext } from '$lib/server/ace/types.js';
import { buildContextManifestFromACE } from '$lib/server/ace/ace-context-manifest.js';
import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';

function isAssembledAceContext(value: Record<string, unknown>): value is Record<string, unknown> & ACEContext {
  return Array.isArray(value.ragChunks)
    && Array.isArray(value.kbChunks)
    && Array.isArray(value.caseChunks)
    && Array.isArray(value.docChunks)
    && Array.isArray(value.kagNeighbors)
    && Array.isArray(value.chatHistory)
    && typeof value.entities === 'object'
    && value.entities !== null;
}

/** Exact governed owner for compiling a manifest from existing ACE evidence. */
export function createOakDagContextManifestHandlerV1(): OakDagActionHandlerV1 {
  return {
    implementationRef: OAK_CONTEXT_MANIFEST_ACE_V1,
    operatorId: 'op:build_context',
    operatorKind: 'BUILD_CONTEXT',
    actionKinds: ['BUILD_CONTEXT'],
    outputContract: 'output:context_manifest',
    run: async ({ binding }: { binding: KernelDagExecutionBindingV1 }) => {
      const input = oakContextManifestInputV1Schema.parse(binding.boundArguments);
      if (!isAssembledAceContext(input.context)) throw new Error('OAK_CONTEXT_ACE_INPUT_INVALID');
      return buildContextManifestFromACE(input.context, {
        ...input.options,
        ...(input.options.now ? { now: new Date(input.options.now) } : {}),
      });
    },
  };
}
