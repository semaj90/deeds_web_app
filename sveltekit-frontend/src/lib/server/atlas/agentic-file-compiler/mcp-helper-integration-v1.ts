/**
 * Read-only helper/MCP integration alignment.
 *
 * This file does NOT register tools, start services, select retrieval winners,
 * or create another routing owner. It records how existing helper capabilities,
 * MCP surfaces, and backend executors relate so agentic callers do not invent
 * duplicate lanes.
 */

export type AtlasLogicalLaneV1 =
  | 'LEXICAL'
  | 'STRUCTURAL'
  | 'SEMANTIC_768'
  | 'GRAPH'
  | 'DOC'
  | 'WEB_ACQUISITION';

export type AtlasIntegrationRoleV1 =
  | 'HELPER'
  | 'MCP_SURFACE'
  | 'EXECUTOR'
  | 'ACQUISITION'
  | 'DIAGNOSTIC_MCP';

export interface AtlasHelperMcpIntegrationV1 {
  integrationId: string;
  logicalLane: AtlasLogicalLaneV1;
  role: AtlasIntegrationRoleV1;
  helperId: string | null;
  ownerRef: string;
  mcpTools: readonly string[];
  readOnly: boolean;
  canonicalAuthority: false;
  separateFusionVote: boolean;
  notes: string;
}

export const ATLAS_HELPER_MCP_INTEGRATION_V1: readonly AtlasHelperMcpIntegrationV1[] = [
  {
    integrationId: 'rg-exact-helper',
    logicalLane: 'LEXICAL',
    role: 'HELPER',
    helperId: 'rg-exact',
    ownerRef: 'external:rg',
    mcpTools: [],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: true,
    notes: 'Offline/read-only helper. Do not infer a request-time MCP owner from helper registration alone.',
  },
  {
    integrationId: 'ast-grep-structural-helper',
    logicalLane: 'STRUCTURAL',
    role: 'HELPER',
    helperId: 'ast-grep-structural',
    ownerRef: 'src/lib/server/atlas/features/semantic-input-compiler-v1.ts',
    mcpTools: [],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: true,
    notes: 'Structural evidence helper. AST evidence must resolve back to canonical source/symbol identity before promotion.',
  },
  {
    integrationId: 'semantic-768-helper',
    logicalLane: 'SEMANTIC_768',
    role: 'HELPER',
    helperId: 'semantic-768',
    ownerRef: 'src/lib/server/embedding/canonical-embed.ts:embedSemantic768Canonical',
    mcpTools: ['kag.multi_lane_search', 'trace.kag_search'],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: true,
    notes: 'Logical semantic lane. Query/document prefix and 768-dimension contracts must be enforced by the canonical embedding owner.',
  },
  {
    integrationId: 'pgvector-exact-executor',
    logicalLane: 'SEMANTIC_768',
    role: 'EXECUTOR',
    helperId: null,
    ownerRef: 'PostgreSQL 18 pgvector exact executor via existing retrieval contracts',
    mcpTools: [],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: false,
    notes: 'Executor/challenger for semantic_768, never an additional RRF vote.',
  },
  {
    integrationId: 'qdrant-semantic-executor',
    logicalLane: 'SEMANTIC_768',
    role: 'EXECUTOR',
    helperId: null,
    ownerRef: 'existing Qdrant semantic retrieval adapters/SearchRuntime',
    mcpTools: ['kag.multi_lane_search', 'trace.kag_search'],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: false,
    notes: 'Persistent semantic projection executor. Must resolve results through canonical identity.',
  },
  {
    integrationId: 'cuvs-cagra-semantic-executor',
    logicalLane: 'SEMANTIC_768',
    role: 'EXECUTOR',
    helperId: null,
    ownerRef: 'existing cuVS/CAGRA GPU retrieval challenger lane',
    mcpTools: [],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: false,
    notes: 'GPU executor/challenger only; lane != executor.',
  },
  {
    integrationId: 'turbovec-semantic-executor',
    logicalLane: 'SEMANTIC_768',
    role: 'EXECUTOR',
    helperId: null,
    ownerRef: 'src/lib/server/search/turbovec-search.ts',
    mcpTools: ['search.rerank'],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: false,
    notes: 'Compatibility rerank/prefilter executor over semantic candidates; never a second semantic vote.',
  },
  {
    integrationId: 'graph-ppr-helper',
    logicalLane: 'GRAPH',
    role: 'HELPER',
    helperId: 'graph-ppr',
    ownerRef: 'python/atlas_compute/cugraph_ppr.py',
    mcpTools: ['graph.expand_neighborhood', 'graph.shortest_path'],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: true,
    notes: 'Graph evidence lane. cuGraph/NetworkX executors do not mint Atlas identity.',
  },
  {
    integrationId: 'docs-corpus-helper',
    logicalLane: 'DOC',
    role: 'HELPER',
    helperId: 'docs-corpus-search',
    ownerRef: 'src/lib/server/atlas/docs/doc-intelligence-read-model.ts',
    mcpTools: ['kb.search_summary_tree'],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: true,
    notes: 'Frozen/local documentation retrieval helper.',
  },
  {
    integrationId: 'searxng-web-acquisition',
    logicalLane: 'WEB_ACQUISITION',
    role: 'ACQUISITION',
    helperId: null,
    ownerRef: 'existing webSearch/context-assembler + SEARXNG_URL acquisition path',
    mcpTools: ['kag.web_search', 'kb.search_external_research'],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: false,
    notes: 'External acquisition only. Results must be normalized/validated before corpus admission and do not receive an internal semantic-lane vote.',
  },
  {
    integrationId: 'postgres-readonly-mcp',
    logicalLane: 'DOC',
    role: 'DIAGNOSTIC_MCP',
    helperId: null,
    ownerRef: 'sveltekit-frontend/.vscode/mcp.json:postgres-readonly',
    mcpTools: ['postgres-readonly'],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: false,
    notes: 'Operator/debug MCP mount only; not the model-facing application retrieval owner.',
  },
  {
    integrationId: 'qdrant-readonly-mcp',
    logicalLane: 'SEMANTIC_768',
    role: 'DIAGNOSTIC_MCP',
    helperId: null,
    ownerRef: 'sveltekit-frontend/.vscode/mcp.json:qdrant-readonly',
    mcpTools: ['qdrant-readonly'],
    readOnly: true,
    canonicalAuthority: false,
    separateFusionVote: false,
    notes: 'Operator/debug MCP mount only; must not bypass SearchRuntime identity/fusion policy.',
  },
] as const;

export function assertAtlasHelperMcpAlignmentV1(
  entries: readonly AtlasHelperMcpIntegrationV1[] = ATLAS_HELPER_MCP_INTEGRATION_V1,
): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.integrationId)) {
      throw new Error(`DUPLICATE_INTEGRATION_ID:${entry.integrationId}`);
    }
    ids.add(entry.integrationId);

    if (entry.canonicalAuthority !== false) {
      throw new Error(`INTEGRATION_CANNOT_OWN_CANONICAL_AUTHORITY:${entry.integrationId}`);
    }

    if (
      entry.logicalLane === 'SEMANTIC_768' &&
      (entry.role === 'EXECUTOR' || entry.role === 'DIAGNOSTIC_MCP') &&
      entry.separateFusionVote
    ) {
      throw new Error(`SEMANTIC_EXECUTOR_VOTE_INFLATION:${entry.integrationId}`);
    }

    if (entry.logicalLane === 'WEB_ACQUISITION' && entry.separateFusionVote) {
      throw new Error(`WEB_ACQUISITION_CANNOT_BE_INTERNAL_FUSION_VOTE:${entry.integrationId}`);
    }
  }
}
