import {
  MCPToolPolicyRevisionV1Schema,
  type MCPToolPolicyRevisionV1,
  type MCPToolPolicyEntryV1,
  type MCPToolSurfaceRevisionV1,
  type MCPPermissionClassV1,
} from './mcp-tool-registry-types-v1.js';
import { sha256Hex, canonicalJsonStringify } from './mcp-registry-checksum-v1.js';

/**
 * MCP-TOOL-REGISTRY-REVISION-01, Phase C: joins live-discovered tool refs against Parent Atlas's
 * own two existing real allowlists -- never against MCP `annotations` (untrusted per spec). This
 * is a read+reconcile layer, not a third competing execution allowlist: it adds no `execute`
 * capability and does not modify atlas-tool-registry.ts or ACPToolRegistry.ts.
 *
 * Mapping table (explicit, not inferred):
 *   atlas-tool-registry.ts AtlasToolPermission -> MCPPermissionClassV1
 *     'search:read' | 'graph:read'  -> READ
 *     'code:propose' | 'code:write' -> WRITE, approvalRequired: true
 *       (code:propose is conservatively WRITE even though it doesn't itself mutate, because it
 *       produces a write-shaped artifact for a later apply step; code:write additionally carries
 *       this repo's own humanApproval:true flag, which maps 1:1 onto approvalRequired)
 *   ACPToolRegistry.ts DRY_RUN_TOOLS membership -> WRITE, approvalRequired: true
 *     (DRY_RUN_TOOLS names every ACP tool this repo already treats as mutating/dry-runnable;
 *     absence from that set for an ACPToolRegistry-known tool -> READ, approvalRequired: false)
 *   no match in either allowlist -> UNKNOWN, approvalRequired: true, policySource: 'unclassified'
 *     (fail-closed default -- this is expected to be the common case today, since neither
 *     allowlist enumerates the full live MCP tool count; a real, honest census finding, not a bug)
 */

const ATLAS_TOOL_REGISTRY_PERMISSIONS: Record<string, { permissionClass: MCPPermissionClassV1; approvalRequired: boolean }> = {
  'atlas.search': { permissionClass: 'READ', approvalRequired: false },
  'atlas.graph.expand': { permissionClass: 'READ', approvalRequired: false },
  'atlas.graph.pagerank': { permissionClass: 'READ', approvalRequired: false },
  'atlas.patch.propose': { permissionClass: 'WRITE', approvalRequired: true },
  'atlas.patch.tournament': { permissionClass: 'WRITE', approvalRequired: true },
  'atlas.patch.apply': { permissionClass: 'WRITE', approvalRequired: true },
};

// Explicit policy for the live atlas-tools MCP surface. These names are a
// governed compatibility surface, not inferred from MCP annotations. The
// server's outcome tool is write-capable and therefore remains approval-gated.
const ATLAS_TOOLS_MCP_PERMISSIONS: Record<string, { permissionClass: MCPPermissionClassV1; approvalRequired: boolean }> = {
  classify_intent: { permissionClass: 'READ', approvalRequired: false },
  build_agentic_rag_context: { permissionClass: 'READ', approvalRequired: false },
  build_recommendation: { permissionClass: 'READ', approvalRequired: false },
  find_dependencies: { permissionClass: 'READ', approvalRequired: false },
  trace_database: { permissionClass: 'READ', approvalRequired: false },
  trace_tool_chain: { permissionClass: 'READ', approvalRequired: false },
  find_source_refs: { permissionClass: 'READ', approvalRequired: false },
  find_feature: { permissionClass: 'READ', approvalRequired: false },
  find_route: { permissionClass: 'READ', approvalRequired: false },
  record_outcome: { permissionClass: 'WRITE', approvalRequired: true },
};

const ACP_DRY_RUN_TOOLS = new Set([
  'knowledge:search', 'db:query', 'cache:get', 'cache:set', 'llm:generate',
  'error:analyze', 'fix:synthesize', 'fix:apply', 'metrics:snapshot', 'metrics:health',
  'langextract:extract', 'langextract:batch', 'search:hyperrag',
  'nlp:capabilities', 'nlp:analyze', 'nlp:ast-chunk',
  'phase89:board-workflow', 'graph:snapshot-parity:validate',
  'atlas:cugraph:pagerank', 'atlas:cugraph:pagerank:dry',
  'atlas.kanban.list', 'atlas.kanban.show',
  'atlas:bash-worker',
]);

/** ACPToolRegistry.ts's known tool names (TOOLS record keys) -- used only to distinguish
 * "known ACP tool, not in DRY_RUN_TOOLS -> READ" from "not an ACP tool at all -> unclassified".
 * Kept as an explicit list here (not re-imported) to avoid this classifier depending on
 * ACPToolRegistry's full module graph (Redis/Postgres client construction) for a pure
 * classification function; update this list if ACPToolRegistry.ts's TOOLS keys change. */
const ACP_KNOWN_TOOL_NAMES = new Set([
  ...ACP_DRY_RUN_TOOLS,
]);

function classifyByName(toolName: string): { permissionClass: MCPPermissionClassV1; approvalRequired: boolean; policySource: MCPToolPolicyEntryV1['policySource'] } {
  const atlasMatch = ATLAS_TOOL_REGISTRY_PERMISSIONS[toolName];
  if (atlasMatch) return { ...atlasMatch, policySource: 'atlas_tool_registry' };

  const atlasToolsMatch = ATLAS_TOOLS_MCP_PERMISSIONS[toolName];
  if (atlasToolsMatch) return { ...atlasToolsMatch, policySource: 'atlas_tool_registry' };

  if (ACP_DRY_RUN_TOOLS.has(toolName)) {
    return { permissionClass: 'WRITE', approvalRequired: true, policySource: 'acp_tool_registry' };
  }
  if (ACP_KNOWN_TOOL_NAMES.has(toolName)) {
    return { permissionClass: 'READ', approvalRequired: false, policySource: 'acp_tool_registry' };
  }

  return { permissionClass: 'UNKNOWN', approvalRequired: true, policySource: 'unclassified' };
}

export function classifyMcpToolPolicyV1(surface: MCPToolSurfaceRevisionV1): MCPToolPolicyRevisionV1 {
  const entries: MCPToolPolicyEntryV1[] = surface.tools.map((entry) => {
    const classified = classifyByName(entry.ref.toolName);
    return {
      ref: entry.ref,
      permissionClass: classified.permissionClass,
      approvalRequired: classified.approvalRequired,
      allowedOperations: [entry.ref.toolName],
      tenantRestrictions: null,
      policySource: classified.policySource,
    };
  });

  const classifiedCount = entries.filter((entry) => entry.policySource !== 'unclassified').length;
  const policySourceStatus: MCPToolPolicyRevisionV1['policySourceStatus'] =
    classifiedCount === 0 ? 'UNPROVEN' : classifiedCount === entries.length ? 'PROVEN' : 'PARTIAL';

  const hashInput = {
    schemaVersion: 'mcp-tool-policy-revision.v1' as const,
    serverAuthorityId: surface.serverAuthorityId,
    entries,
    policySourceStatus,
    canonicalAuthority: false as const,
    authorityScope: 'MCP_TOOL_POLICY_CLASSIFICATION' as const,
  };
  const toolPolicyRevision = sha256Hex(canonicalJsonStringify(hashInput));

  return MCPToolPolicyRevisionV1Schema.parse({ ...hashInput, toolPolicyRevision });
}
