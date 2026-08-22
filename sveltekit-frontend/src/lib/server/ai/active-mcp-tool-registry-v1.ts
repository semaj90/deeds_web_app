export const ACTIVE_MCP_TOOL_REGISTRY_SCHEMA_VERSION = 'active-mcp-tool-registry.v1' as const;

export type McpOperationKindV1 = 'READ' | 'AUDIT' | 'PROPOSE' | 'APPLY';
export type McpDispatchSurfaceV1 =
  | 'MCP_STREAMABLE_HTTP'
  | 'MCP_STDIO'
  | 'TRPC'
  | 'MASTRA'
  | 'OPENCODE_LOCAL';
export type McpPermissionV1 = 'ALLOW' | 'ASK' | 'DENY';
export type McpSchemaStatusV1 = 'VALID' | 'MISSING' | 'INVALID';
export type McpHandlerStatusV1 = 'RESOLVED' | 'HANDLER_ONLY' | 'LISTED_WITHOUT_HANDLER';
export type McpDuplicateStatusV1 = 'UNIQUE' | 'DUPLICATE_NAME';
export type McpOntologyStatusV1 = 'CLASSIFIED' | 'UNKNOWN';
export type McpProofStatusV1 =
  | 'PROVEN'
  | 'IMPLEMENTED_UNPROVEN'
  | 'STUB'
  | 'QUARANTINED';

export interface ActiveMcpToolEntryV1 {
  toolName: string;
  owner: string;
  serverId: string;
  dispatchSurface: McpDispatchSurfaceV1;
  lane: string;
  operationKind: McpOperationKindV1;
  permission: McpPermissionV1;
  schemaStatus: McpSchemaStatusV1;
  handlerStatus: McpHandlerStatusV1;
  duplicateStatus: McpDuplicateStatusV1;
  ontologyStatus: McpOntologyStatusV1;
  proofStatus: McpProofStatusV1;
  /**
   * APPLY is intentionally stronger than READ/AUDIT/PROPOSE: a mutating tool
   * cannot become routable merely because a handler exists. The apply gate must
   * be independently proven and operator authorization remains external.
   */
  applyGateProven?: boolean;
  archived?: boolean;
  evidenceRefs?: string[];
}

export interface ActiveMcpToolRegistryV1 {
  schemaVersion: typeof ACTIVE_MCP_TOOL_REGISTRY_SCHEMA_VERSION;
  protocolRevision: string;
  entries: ActiveMcpToolEntryV1[];
}

export interface ActiveMcpToolRoutingDecisionV1 {
  toolName: string;
  routable: boolean;
  reasons: string[];
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function validateActiveMcpToolEntryV1(entry: ActiveMcpToolEntryV1): string[] {
  const errors: string[] = [];

  if (!nonEmpty(entry.toolName)) errors.push('TOOL_NAME_REQUIRED');
  if (!nonEmpty(entry.owner)) errors.push('OWNER_REQUIRED');
  if (!nonEmpty(entry.serverId)) errors.push('SERVER_ID_REQUIRED');
  if (!nonEmpty(entry.lane)) errors.push('LANE_REQUIRED');

  if (entry.schemaStatus !== 'VALID') errors.push(`SCHEMA_${entry.schemaStatus}`);
  if (entry.handlerStatus !== 'RESOLVED') errors.push(`HANDLER_${entry.handlerStatus}`);
  if (entry.duplicateStatus !== 'UNIQUE') errors.push(entry.duplicateStatus);
  if (entry.ontologyStatus !== 'CLASSIFIED') errors.push('ONTOLOGY_UNKNOWN');
  if (entry.permission === 'DENY') errors.push('PERMISSION_DENY');
  if (entry.archived) errors.push('ARCHIVED');

  if (entry.proofStatus === 'STUB') errors.push('PROOF_STUB');
  if (entry.proofStatus === 'QUARANTINED') errors.push('PROOF_QUARANTINED');

  if (entry.operationKind === 'APPLY') {
    if (entry.permission !== 'ASK') errors.push('APPLY_REQUIRES_ASK_PERMISSION');
    if (entry.proofStatus !== 'PROVEN') errors.push('APPLY_REQUIRES_PROVEN_IMPLEMENTATION');
    if (entry.applyGateProven !== true) errors.push('APPLY_GATE_NOT_PROVEN');
  }

  return errors;
}

export function decideActiveMcpToolRoutingV1(
  entry: ActiveMcpToolEntryV1,
): ActiveMcpToolRoutingDecisionV1 {
  const reasons = validateActiveMcpToolEntryV1(entry);
  return {
    toolName: entry.toolName,
    routable: reasons.length === 0,
    reasons,
  };
}

export function buildActiveMcpToolRegistryV1(input: {
  protocolRevision: string;
  entries: ActiveMcpToolEntryV1[];
}): ActiveMcpToolRegistryV1 {
  if (!nonEmpty(input.protocolRevision)) {
    throw new Error('ACTIVE_MCP_TOOL_REGISTRY_PROTOCOL_REVISION_REQUIRED');
  }

  const seen = new Set<string>();
  for (const entry of input.entries) {
    if (seen.has(entry.toolName)) {
      throw new Error(`ACTIVE_MCP_TOOL_REGISTRY_DUPLICATE_ENTRY:${entry.toolName}`);
    }
    seen.add(entry.toolName);
  }

  return {
    schemaVersion: ACTIVE_MCP_TOOL_REGISTRY_SCHEMA_VERSION,
    protocolRevision: input.protocolRevision,
    entries: [...input.entries].sort((a, b) => a.toolName.localeCompare(b.toolName)),
  };
}

export function routableActiveMcpToolsV1(registry: ActiveMcpToolRegistryV1): ActiveMcpToolEntryV1[] {
  return registry.entries.filter((entry) => decideActiveMcpToolRoutingV1(entry).routable);
}

/**
 * Apply the ownership registry only to an MCP descriptor catalog. Built-in
 * OpenCode/Node tools such as read/grep/glob/lsp/bash are intentionally outside
 * this registry and must not be passed to this helper.
 *
 * Missing registry entries fail closed: an MCP tool is not eligible simply
 * because it appeared in tools/list or in a generated manifest.
 */
export function filterRoutableMcpToolDescriptorsV1<T extends { name: string }>(
  descriptors: T[],
  registry: ActiveMcpToolRegistryV1,
): T[] {
  const byName = new Map(registry.entries.map((entry) => [entry.toolName, entry] as const));
  return descriptors.filter((descriptor) => {
    const entry = byName.get(descriptor.name);
    return entry ? decideActiveMcpToolRoutingV1(entry).routable : false;
  });
}
