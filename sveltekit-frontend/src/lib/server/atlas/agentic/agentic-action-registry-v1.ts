import {
  AgenticActionV1Schema,
  type AgenticActionKindV1,
  type AgenticActionMutabilityV1,
  type AgenticActionV1,
} from './contracts/agentic-action-v1.js';

/**
 * AR-03 seed registry -- code-defined for now (AR-02, the registry-owner
 * census, has not decided whether this becomes a Postgres-backed
 * BM25-searchable table; see this change's design.md D3). Contains exactly
 * the example moves the operator listed for the first deterministic fixture
 * (AR-15, not yet built).
 */

const REGISTRY_REVISION = 'agentic-action-registry:v1';

function action(input: {
  actionId: string;
  kind: AgenticActionKindV1;
  tool?: string;
  inputSchema: string;
  outputSchema: string;
  prerequisites?: string[];
  effects?: string[];
  mutability: AgenticActionMutabilityV1;
  requiresHumanApproval?: boolean;
  validator?: string;
}): AgenticActionV1 {
  return AgenticActionV1Schema.parse({
    schema: 'atlas.agentic-action.v1',
    actionId: input.actionId,
    actionRevision: REGISTRY_REVISION,
    kind: input.kind,
    tool: input.tool ?? null,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    prerequisites: input.prerequisites ?? [],
    effects: input.effects ?? [],
    mutability: input.mutability,
    requiresHumanApproval: input.requiresHumanApproval ?? false,
    validator: input.validator ?? null,
  });
}

export const AGENTIC_ACTION_REGISTRY_V1_SEED: readonly AgenticActionV1[] = [
  action({
    actionId: 'AST_EXPAND',
    kind: 'EXPAND',
    tool: 'ast-grep',
    inputSchema: 'atlas.ast-expand-request.v1',
    outputSchema: 'atlas.ast-expand-result.v1',
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'RG_EXACT_SEARCH',
    kind: 'SEARCH',
    tool: 'ripgrep',
    inputSchema: 'atlas.exact-search-request.v1',
    outputSchema: 'atlas.exact-search-result.v1',
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'BM25_SEARCH',
    kind: 'SEARCH',
    tool: 'postgres-fts',
    inputSchema: 'atlas.lexical-search-request.v1',
    outputSchema: 'atlas.lexical-search-result.v1',
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'SEMANTIC_SEARCH',
    kind: 'SEARCH',
    tool: 'qdrant',
    inputSchema: 'atlas.semantic-search-request.v1',
    outputSchema: 'atlas.semantic-search-result.v1',
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'OAK_RESOLVE',
    kind: 'CLASSIFY',
    tool: 'oak-kernel',
    inputSchema: 'atlas.oak-resolution-request.v1',
    outputSchema: 'atlas.oak-resolution-evidence.v1',
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'HYPERGRAPH_EXPAND',
    kind: 'EXPAND',
    inputSchema: 'atlas.hypergraph-expand-request.v1',
    outputSchema: 'atlas.hypergraph-expand-result.v1',
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'APPLY_SOURCE_PATCH',
    kind: 'MUTATE',
    inputSchema: 'atlas.source-patch-request.v1',
    outputSchema: 'atlas.source-patch-result.v1',
    mutability: 'SOURCE_WRITE',
    requiresHumanApproval: true,
    validator: 'RUN_TYPECHECK',
  }),
  action({
    actionId: 'RUN_TYPECHECK',
    kind: 'VALIDATE',
    tool: 'tsgo',
    inputSchema: 'atlas.typecheck-request.v1',
    outputSchema: 'atlas.typecheck-result.v1',
    prerequisites: ['APPLY_SOURCE_PATCH'],
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'RUN_TESTS',
    kind: 'VALIDATE',
    tool: 'vitest',
    inputSchema: 'atlas.test-run-request.v1',
    outputSchema: 'atlas.test-run-result.v1',
    prerequisites: ['RUN_TYPECHECK'],
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'AWAIT_OPERATOR',
    kind: 'AWAIT',
    inputSchema: 'atlas.await-request.v1',
    outputSchema: 'atlas.await-result.v1',
    mutability: 'READ_ONLY',
    requiresHumanApproval: true,
  }),
  action({
    actionId: 'RETRY_WITH_MORE_CONTEXT',
    kind: 'RETRY',
    inputSchema: 'atlas.retry-request.v1',
    outputSchema: 'atlas.retry-result.v1',
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'STOP_SUCCESS',
    kind: 'STOP',
    inputSchema: 'atlas.stop-request.v1',
    outputSchema: 'atlas.stop-result.v1',
    mutability: 'READ_ONLY',
  }),
  action({
    actionId: 'STOP_BLOCKED',
    kind: 'STOP',
    inputSchema: 'atlas.stop-request.v1',
    outputSchema: 'atlas.stop-result.v1',
    mutability: 'READ_ONLY',
  }),
];

export function findAgenticActionV1(actionId: string): AgenticActionV1 | null {
  return AGENTIC_ACTION_REGISTRY_V1_SEED.find((entry) => entry.actionId === actionId) ?? null;
}

export function filterAgenticActionsV1(filter: {
  kind?: AgenticActionKindV1;
  mutability?: AgenticActionMutabilityV1;
}): AgenticActionV1[] {
  return AGENTIC_ACTION_REGISTRY_V1_SEED.filter(
    (entry) =>
      (filter.kind === undefined || entry.kind === filter.kind) &&
      (filter.mutability === undefined || entry.mutability === filter.mutability)
  );
}
