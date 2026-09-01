import { z } from 'zod';
import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';
import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';
import { searchCodeLexicalStrictV1 } from '$lib/server/search/postgres-fts.js';

const lexicalArgumentsSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).default(20),
  topoClass: z.string().trim().min(1).optional(),
}).strict();

/** Exact governed owner for the OaK SEARCH_LEXICAL implementation reference. */
export function createOakDagLexicalHandlerV1(): OakDagActionHandlerV1 {
  return {
    implementationRef: 'sveltekit-frontend/src/lib/server/search/postgres-fts.ts#searchCodeLexicalStrictV1',
    operatorId: 'op:search_lexical',
    operatorKind: 'SEARCH_LEXICAL',
    actionKinds: ['FETCH_POSTGRES'],
    outputContract: 'output:ranked_chunks',
    run: async ({ binding }: { binding: KernelDagExecutionBindingV1 }) => {
      const args = lexicalArgumentsSchema.parse(binding.boundArguments);
      return searchCodeLexicalStrictV1(args.query, { limit: args.limit, topoClass: args.topoClass });
    },
  };
}
