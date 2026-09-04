import { describe, expect, it } from 'vitest';
import {
  MCPToolSurfaceRevisionV1Schema,
  MCPToolPolicyRevisionV1Schema,
  MCPToolPolicyEntryV1Schema,
  mcpToolRefKey,
} from './mcp-tool-registry-types-v1.js';

const SERVER = 'parent-atlas:mcp:atlas-tools';
const HEX64 = 'a'.repeat(64);

function surfaceFixture(overrides: Partial<Parameters<typeof MCPToolSurfaceRevisionV1Schema.parse>[0]> = {}) {
  return {
    schemaVersion: 'mcp-tool-surface-revision.v1' as const,
    serverAuthorityId: SERVER,
    serverAuthorityFingerprint: HEX64,
    transportType: 'stdio' as const,
    tools: [{
      ref: { serverAuthorityId: SERVER, toolName: 'search' },
      title: null,
      description: null,
      inputSchemaDigest: HEX64,
      outputSchemaDigest: null,
      executionMetadataDigest: null,
    }],
    toolCount: 1,
    listChangedSupported: false,
    discoveredAtRevision: HEX64,
    discoveredAt: new Date().toISOString(),
    toolSurfaceRevision: HEX64,
    canonicalAuthority: false as const,
    authorityScope: 'MCP_TOOL_SURFACE_DISCOVERY' as const,
    ...overrides,
  };
}

describe('mcpToolRefKey', () => {
  it('produces distinct keys for the same toolName on different servers', () => {
    const a = mcpToolRefKey({ serverAuthorityId: 'parent-atlas:mcp:atlas-tools', toolName: 'search' });
    const b = mcpToolRefKey({ serverAuthorityId: 'parent-atlas:mcp:trace', toolName: 'search' });
    expect(a).not.toBe(b);
  });
});

describe('MCPToolSurfaceRevisionV1Schema', () => {
  it('accepts a well-formed surface revision', () => {
    expect(() => MCPToolSurfaceRevisionV1Schema.parse(surfaceFixture())).not.toThrow();
  });

  it('rejects toolCount not matching tools.length', () => {
    expect(() => MCPToolSurfaceRevisionV1Schema.parse(surfaceFixture({ toolCount: 2 })))
      .toThrow(/MCP_TOOL_SURFACE_TOOL_COUNT_MISMATCH/);
  });

  it('rejects a duplicate (serverAuthorityId, toolName) within one surface', () => {
    const fixture = surfaceFixture({
      tools: [
        { ref: { serverAuthorityId: SERVER, toolName: 'search' }, title: null, description: null, inputSchemaDigest: HEX64, outputSchemaDigest: null, executionMetadataDigest: null },
        { ref: { serverAuthorityId: SERVER, toolName: 'search' }, title: null, description: null, inputSchemaDigest: HEX64, outputSchemaDigest: null, executionMetadataDigest: null },
      ],
      toolCount: 2,
    });
    expect(() => MCPToolSurfaceRevisionV1Schema.parse(fixture)).toThrow(/MCP_TOOL_SURFACE_DUPLICATE_TOOL_REF/);
  });

  it('rejects a tool entry whose ref.serverAuthorityId disagrees with the surface itself', () => {
    const fixture = surfaceFixture({
      tools: [{ ref: { serverAuthorityId: 'parent-atlas:mcp:trace', toolName: 'search' }, title: null, description: null, inputSchemaDigest: HEX64, outputSchemaDigest: null, executionMetadataDigest: null }],
    });
    expect(() => MCPToolSurfaceRevisionV1Schema.parse(fixture)).toThrow(/MCP_TOOL_SURFACE_ENTRY_SERVER_AUTHORITY_MISMATCH/);
  });
});

function policyEntryFixture(overrides: Partial<Parameters<typeof MCPToolPolicyEntryV1Schema.parse>[0]> = {}) {
  return {
    ref: { serverAuthorityId: SERVER, toolName: 'search' },
    permissionClass: 'READ' as const,
    approvalRequired: false,
    allowedOperations: ['search'],
    tenantRestrictions: null,
    policySource: 'atlas_tool_registry' as const,
    ...overrides,
  };
}

describe('MCPToolPolicyEntryV1Schema', () => {
  it('accepts a well-formed READ entry with a real policy source', () => {
    expect(() => MCPToolPolicyEntryV1Schema.parse(policyEntryFixture())).not.toThrow();
  });

  it('rejects an unclassified entry that is not permissionClass=UNKNOWN', () => {
    expect(() => MCPToolPolicyEntryV1Schema.parse(policyEntryFixture({ policySource: 'unclassified', permissionClass: 'READ' })))
      .toThrow(/MCP_TOOL_POLICY_UNCLASSIFIED_MUST_BE_UNKNOWN_PERMISSION_CLASS/);
  });

  it('rejects UNKNOWN permission class without approvalRequired', () => {
    expect(() => MCPToolPolicyEntryV1Schema.parse(policyEntryFixture({ policySource: 'unclassified', permissionClass: 'UNKNOWN', approvalRequired: false })))
      .toThrow(/MCP_TOOL_POLICY_UNKNOWN_PERMISSION_CLASS_REQUIRES_APPROVAL/);
  });

  it('rejects WRITE without approvalRequired', () => {
    expect(() => MCPToolPolicyEntryV1Schema.parse(policyEntryFixture({ permissionClass: 'WRITE', approvalRequired: false })))
      .toThrow(/MCP_TOOL_POLICY_WRITE_OR_ADMIN_REQUIRES_APPROVAL/);
  });

  it('rejects ADMIN without approvalRequired', () => {
    expect(() => MCPToolPolicyEntryV1Schema.parse(policyEntryFixture({ permissionClass: 'ADMIN', approvalRequired: false })))
      .toThrow(/MCP_TOOL_POLICY_WRITE_OR_ADMIN_REQUIRES_APPROVAL/);
  });
});

describe('MCPToolPolicyRevisionV1Schema', () => {
  function policyFixture(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 'mcp-tool-policy-revision.v1' as const,
      serverAuthorityId: SERVER,
      entries: [policyEntryFixture()],
      policySourceStatus: 'PROVEN' as const,
      toolPolicyRevision: HEX64,
      canonicalAuthority: false as const,
      authorityScope: 'MCP_TOOL_POLICY_CLASSIFICATION' as const,
      ...overrides,
    };
  }

  it('accepts PROVEN when every entry has a real policy source', () => {
    expect(() => MCPToolPolicyRevisionV1Schema.parse(policyFixture())).not.toThrow();
  });

  it('rejects PROVEN when any entry is unclassified', () => {
    const fixture = policyFixture({ entries: [policyEntryFixture({ policySource: 'unclassified', permissionClass: 'UNKNOWN', approvalRequired: true })] });
    expect(() => MCPToolPolicyRevisionV1Schema.parse(fixture)).toThrow(/MCP_TOOL_POLICY_PROVEN_REQUIRES_EVERY_ENTRY_CLASSIFIED/);
  });

  it('rejects UNPROVEN when any entry is classified', () => {
    expect(() => MCPToolPolicyRevisionV1Schema.parse(policyFixture({ policySourceStatus: 'UNPROVEN' })))
      .toThrow(/MCP_TOOL_POLICY_UNPROVEN_MUST_HAVE_NO_CLASSIFIED_ENTRIES/);
  });

  it('rejects a duplicate ref across entries', () => {
    const entry = policyEntryFixture();
    expect(() => MCPToolPolicyRevisionV1Schema.parse(policyFixture({ entries: [entry, entry] })))
      .toThrow(/MCP_TOOL_POLICY_DUPLICATE_TOOL_REF/);
  });
});
