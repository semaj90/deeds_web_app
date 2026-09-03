import { decodeKBestViterbi, type ViterbiFrame } from '../analysis/k-best-viterbi.js';

export type McpToolRegistryEntryV1 = {
  toolId: string;
  mcpName: string;
  registryRevision: string;
  readOnly: boolean;
};

export type McpToolRegistryIndexV1 = {
  content_revision?: string;
  content_checksum?: string;
  tools?: ReadonlyArray<{
    tool_name: string;
    permissions?: string;
    writes_to?: readonly string[];
  }>;
};

export type McpToolViterbiFrameV1 = ViterbiFrame<{
  toolId: string;
  mcpName: string;
}>;

export type McpToolSelectionProposalV1 = {
  status: 'PROPOSED';
  toolId: string;
  mcpName: string;
  registryRevision: string;
  pathRevisions: string[];
  proposalChecksum: string;
  executionPerformed: false;
  writesPerformed: false;
  canonicalAuthority: false;
};

export function adaptMcpToolRegistryIndexV1(index: McpToolRegistryIndexV1): {
  registryRevision: string;
  registry: McpToolRegistryEntryV1[];
} {
  const registryRevision = index.content_revision?.trim();
  if (!registryRevision || registryRevision !== index.content_checksum?.trim()) {
    throw new Error('MCP_TOOL_REGISTRY_MANIFEST_REVISION_INVALID');
  }
  const registry = (index.tools ?? []).map((tool) => ({
    toolId: tool.tool_name,
    mcpName: tool.tool_name,
    registryRevision,
    readOnly: tool.permissions === 'read_only' && (tool.writes_to?.length ?? 0) === 0,
  }));
  if (registry.length === 0) throw new Error('MCP_TOOL_REGISTRY_MANIFEST_EMPTY');
  return { registryRevision, registry };
}

function checksum(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function proposeMcpToolWithViterbiV1(input: {
  frames: readonly McpToolViterbiFrameV1[];
  registry: readonly McpToolRegistryEntryV1[];
  registryRevision: string;
}): McpToolSelectionProposalV1 {
  if (input.frames.length === 0) throw new Error('MCP_TOOL_VITERBI_NO_FRAMES');
  if (!input.registryRevision.trim()) throw new Error('MCP_TOOL_REGISTRY_REVISION_MISSING');

  const registry = new Map(input.registry.map((entry) => [entry.toolId, entry]));
  const paths = decodeKBestViterbi(input.frames, ({ previous, current }) => previous.id === current.id ? 0 : -0.05, { k: 1 });
  const path = paths[0];
  if (!path?.values.length) throw new Error('MCP_TOOL_VITERBI_NO_PROPOSAL');

  const selected = path.values[path.values.length - 1];
  const entry = registry.get(selected.toolId);
  if (!entry) throw new Error(`MCP_TOOL_REGISTRY_UNKNOWN_TOOL:${selected.toolId}`);
  if (entry.registryRevision !== input.registryRevision) throw new Error('MCP_TOOL_REGISTRY_REVISION_MISMATCH');
  if (!entry.readOnly) throw new Error(`MCP_TOOL_WRITE_CAPABLE_REQUIRES_APPROVAL:${selected.toolId}`);

  return {
    status: 'PROPOSED',
    toolId: entry.toolId,
    mcpName: entry.mcpName,
    registryRevision: entry.registryRevision,
    pathRevisions: path.revisions,
    proposalChecksum: checksum({ toolId: entry.toolId, mcpName: entry.mcpName, registryRevision: entry.registryRevision, pathRevisions: path.revisions }),
    executionPerformed: false,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}

export function proposeMcpToolFromRegistryIndexV1(input: {
  frames: readonly McpToolViterbiFrameV1[];
  manifest: McpToolRegistryIndexV1;
}): McpToolSelectionProposalV1 {
  const adapted = adaptMcpToolRegistryIndexV1(input.manifest);
  return proposeMcpToolWithViterbiV1({
    frames: input.frames,
    registry: adapted.registry,
    registryRevision: adapted.registryRevision,
  });
}

// ─── MCP-TOOL-REGISTRY-REVISION-01, Phase F ─────────────────────────────────────────────────
// proposeMcpToolWithViterbiV2: extends the proven v1 bridge above (untouched, still 3/3 passing)
// with server-qualified (serverAuthorityId, toolName) identity and split surface/policy
// revisions, per MCPRegistryAdmissionV1. Still proposal-only -- executionAuthorized is always
// false, never calls TRACE/atlas-tools.

import {
  mcpToolRefKey,
  type MCPRegistryAdmissionV1,
  type MCPToolRefV1,
  type ToolProposalV1,
} from './mcp-tool-registry-types-v1.js';
import { sha256Hex, canonicalJsonStringify } from './mcp-registry-checksum-v1.js';

export type McpToolViterbiFrameV2 = ViterbiFrame<{ ref: MCPToolRefV1; toolSchemaDigest: string }>;

/**
 * One admitted server's registry, as consumed by V2: the MCPRegistryAdmissionV1 for revision
 * checks, plus the actual per-tool permission entries (from the same MCPToolPolicyRevisionV1
 * this admission was built from) for the WRITE/ADMIN-requires-approval and unknown-permission
 * checks -- the admission record itself only carries revision hashes, not per-tool policy.
 */
export type McpAdmittedServerRegistryV2 = {
  admission: MCPRegistryAdmissionV1;
  policyEntries: ReadonlyArray<{ ref: MCPToolRefV1; permissionClass: 'READ' | 'WRITE' | 'ADMIN' | 'UNKNOWN'; approvalRequired: boolean }>;
  toolSchemaDigests: ReadonlyMap<string, string>; // keyed by mcpToolRefKey(ref)
};

export function proposeMcpToolWithViterbiV2(input: {
  frames: readonly McpToolViterbiFrameV2[];
  servers: readonly McpAdmittedServerRegistryV2[];
  /** k-best candidates to compute; the returned proposal is the top-ranked one (rank 1). */
  k?: number;
  /** If supplied, the winning tool's stored schema digest must equal this value. */
  expectedToolSchemaDigest?: string;
  /** If supplied, the winning tool's server registryRevision must equal this value (guards
   * against a proposal being admitted against a stale registry snapshot). */
  expectedRegistryRevision?: string;
}): ToolProposalV1 {
  if (input.frames.length === 0) throw new Error('MCP_TOOL_VITERBI_NO_FRAMES');

  const byServer = new Map(input.servers.map((s) => [s.admission.serverAuthorityId, s]));

  const paths = decodeKBestViterbi(
    input.frames,
    ({ previous, current }) => (mcpToolRefKey(previous.value.ref) === mcpToolRefKey(current.value.ref) ? 0 : -0.05),
    { k: Math.max(1, input.k ?? 1) },
  );
  const path = paths[0];
  if (!path?.values.length) throw new Error('MCP_TOOL_VITERBI_NO_PROPOSAL');
  const rank = 1; // paths[0] is always rank 1 (highest score) by decodeKBestViterbi's own contract.

  const selected = path.values[path.values.length - 1];
  const server = byServer.get(selected.ref.serverAuthorityId);
  if (!server) throw new Error(`MCP_TOOL_REGISTRY_UNKNOWN_SERVER:${selected.ref.serverAuthorityId}`);
  if (input.expectedRegistryRevision !== undefined && input.expectedRegistryRevision !== server.admission.registryRevision) {
    throw new Error('MCP_TOOL_REGISTRY_REVISION_MISMATCH');
  }

  const refKey = mcpToolRefKey(selected.ref);
  const storedDigest = server.toolSchemaDigests.get(refKey);
  if (storedDigest === undefined) throw new Error(`MCP_TOOL_REGISTRY_UNKNOWN_TOOL:${refKey}`);
  if (input.expectedToolSchemaDigest !== undefined && input.expectedToolSchemaDigest !== storedDigest) {
    throw new Error(`MCP_TOOL_SCHEMA_DIGEST_MISMATCH:${refKey}`);
  }

  const policyEntry = server.policyEntries.find((e) => mcpToolRefKey(e.ref) === refKey);
  if (!policyEntry) throw new Error(`MCP_TOOL_REGISTRY_UNKNOWN_TOOL:${refKey}`);
  if (policyEntry.permissionClass === 'UNKNOWN') throw new Error(`MCP_TOOL_UNKNOWN_PERMISSION_CLASS:${refKey}`);
  if ((policyEntry.permissionClass === 'WRITE' || policyEntry.permissionClass === 'ADMIN') && policyEntry.approvalRequired) {
    throw new Error(`MCP_TOOL_WRITE_CAPABLE_REQUIRES_APPROVAL:${refKey}`);
  }

  const observationsDigest = sha256Hex(canonicalJsonStringify(input.frames));

  return {
    status: 'PROPOSED',
    ref: selected.ref,
    toolSchemaDigest: storedDigest,
    registryRevision: server.admission.registryRevision,
    policyRevision: server.admission.toolPolicyRevision,
    rank,
    pathScore: path.score,
    observationsDigest,
    executionAuthorized: false,
    executionPerformed: false,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}
