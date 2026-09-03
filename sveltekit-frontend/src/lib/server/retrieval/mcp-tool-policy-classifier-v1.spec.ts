import { describe, expect, it } from 'vitest';
import { classifyMcpToolPolicyV1 } from './mcp-tool-policy-classifier-v1.js';
import { MCPToolSurfaceRevisionV1Schema, type MCPToolSurfaceRevisionV1 } from './mcp-tool-registry-types-v1.js';

const SERVER = 'parent-atlas:mcp:atlas-tools';
const HEX64 = 'a'.repeat(64);

function surfaceWithTools(toolNames: string[]): MCPToolSurfaceRevisionV1 {
  const tools = toolNames.map((toolName) => ({
    ref: { serverAuthorityId: SERVER, toolName },
    title: null,
    description: null,
    inputSchemaDigest: HEX64,
    outputSchemaDigest: null,
    executionMetadataDigest: null,
  }));
  return MCPToolSurfaceRevisionV1Schema.parse({
    schemaVersion: 'mcp-tool-surface-revision.v1',
    serverAuthorityId: SERVER,
    serverAuthorityFingerprint: HEX64,
    transportType: 'stdio',
    tools,
    toolCount: tools.length,
    listChangedSupported: false,
    discoveredAtRevision: HEX64,
    discoveredAt: new Date().toISOString(),
    toolSurfaceRevision: HEX64,
    canonicalAuthority: false,
    authorityScope: 'MCP_TOOL_SURFACE_DISCOVERY',
  });
}

describe('classifyMcpToolPolicyV1', () => {
  it('classifies a known atlas-tool-registry READ tool correctly', () => {
    const policy = classifyMcpToolPolicyV1(surfaceWithTools(['atlas.search']));
    expect(policy.entries[0].permissionClass).toBe('READ');
    expect(policy.entries[0].approvalRequired).toBe(false);
    expect(policy.entries[0].policySource).toBe('atlas_tool_registry');
  });

  it('classifies the live atlas-tools surface explicitly and gates record_outcome', () => {
    const policy = classifyMcpToolPolicyV1(surfaceWithTools([
      'classify_intent',
      'build_agentic_rag_context',
      'build_recommendation',
      'find_dependencies',
      'trace_database',
      'trace_tool_chain',
      'find_source_refs',
      'find_feature',
      'find_route',
      'record_outcome',
    ]));

    expect(policy.policySourceStatus).toBe('PROVEN');
    expect(policy.entries.filter((entry) => entry.permissionClass === 'READ')).toHaveLength(9);
    expect(policy.entries.find((entry) => entry.ref.toolName === 'record_outcome')).toMatchObject({
      permissionClass: 'WRITE',
      approvalRequired: true,
    });
  });

  it('classifies a known atlas-tool-registry WRITE tool with approval required', () => {
    const policy = classifyMcpToolPolicyV1(surfaceWithTools(['atlas.patch.apply']));
    expect(policy.entries[0].permissionClass).toBe('WRITE');
    expect(policy.entries[0].approvalRequired).toBe(true);
  });

  it('classifies a known ACP DRY_RUN_TOOLS entry as WRITE with approval required', () => {
    const policy = classifyMcpToolPolicyV1(surfaceWithTools(['fix:apply']));
    expect(policy.entries[0].permissionClass).toBe('WRITE');
    expect(policy.entries[0].approvalRequired).toBe(true);
    expect(policy.entries[0].policySource).toBe('acp_tool_registry');
  });

  it('classifies an unrecognized tool name as UNKNOWN/unclassified, fail-closed', () => {
    const policy = classifyMcpToolPolicyV1(surfaceWithTools(['totally.unknown.tool']));
    expect(policy.entries[0].permissionClass).toBe('UNKNOWN');
    expect(policy.entries[0].approvalRequired).toBe(true);
    expect(policy.entries[0].policySource).toBe('unclassified');
  });

  it('sets policySourceStatus to PROVEN only when every entry is classified', () => {
    const policy = classifyMcpToolPolicyV1(surfaceWithTools(['atlas.search', 'atlas.graph.expand']));
    expect(policy.policySourceStatus).toBe('PROVEN');
  });

  it('sets policySourceStatus to PARTIAL when some entries are unclassified', () => {
    const policy = classifyMcpToolPolicyV1(surfaceWithTools(['atlas.search', 'totally.unknown.tool']));
    expect(policy.policySourceStatus).toBe('PARTIAL');
  });

  it('sets policySourceStatus to UNPROVEN when no entries are classified', () => {
    const policy = classifyMcpToolPolicyV1(surfaceWithTools(['totally.unknown.tool']));
    expect(policy.policySourceStatus).toBe('UNPROVEN');
  });

  it('is deterministic: identical surface input produces identical toolPolicyRevision', () => {
    const a = classifyMcpToolPolicyV1(surfaceWithTools(['atlas.search', 'fix:apply']));
    const b = classifyMcpToolPolicyV1(surfaceWithTools(['atlas.search', 'fix:apply']));
    expect(a.toolPolicyRevision).toBe(b.toolPolicyRevision);
  });

  it('produces a different toolPolicyRevision when the tool set differs', () => {
    const a = classifyMcpToolPolicyV1(surfaceWithTools(['atlas.search']));
    const b = classifyMcpToolPolicyV1(surfaceWithTools(['atlas.search', 'atlas.graph.expand']));
    expect(a.toolPolicyRevision).not.toBe(b.toolPolicyRevision);
  });
});
