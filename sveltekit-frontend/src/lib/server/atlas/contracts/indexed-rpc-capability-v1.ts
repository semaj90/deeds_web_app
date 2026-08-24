import { z } from 'zod';

export const INDEXED_RPC_CAPABILITY_SCHEMA = 'atlas.indexed-rpc-capability.v1' as const;

export const indexedRpcOperationV1Schema = z.enum([
  'BM25_SEARCH',
  'SEMANTIC_KNN',
  'GRAPH_PPR',
  'GRAPH_COMMUNITY',
  'HYPERGRAPH_EXPAND',
  'FEATURE_SAMPLE',
  'ACE_LOOKUP',
]);

export const indexedRpcExecutorV1Schema = z.enum([
  'GO_RETRIEVAL',
  'POSTGRES',
  'QDRANT',
  'NEO4J_GDS',
  'PYTHON_CPU',
  'PYTHON_CUDA',
]);

export const indexedRpcCapabilityV1Schema = z.object({
  schema: z.literal(INDEXED_RPC_CAPABILITY_SCHEMA),
  capabilityId: z.string().min(1),
  operation: indexedRpcOperationV1Schema,
  executor: indexedRpcExecutorV1Schema,
  revisionRequirements: z.object({
    workspaceRevision: z.boolean(),
    graphRevision: z.boolean(),
    representationRevision: z.boolean(),
  }).strict(),
  proofState: z.enum(['PROVEN', 'CHALLENGER', 'UNPROVEN']),
  expectedP50Ms: z.number().finite().positive(),
  maxInput: z.number().int().positive(),
  readOnly: z.literal(true),
  canonicalAuthority: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();

export type IndexedRpcCapabilityV1 = z.infer<typeof indexedRpcCapabilityV1Schema>;

export function validateIndexedRpcCapabilityV1(input: unknown): IndexedRpcCapabilityV1 {
  return indexedRpcCapabilityV1Schema.parse(input);
}
