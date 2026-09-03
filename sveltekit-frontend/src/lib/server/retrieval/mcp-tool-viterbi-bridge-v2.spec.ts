import { describe, expect, it } from 'vitest';
import { proposeMcpToolWithViterbiV2, type McpAdmittedServerRegistryV2, type McpToolViterbiFrameV2 } from './mcp-tool-viterbi-bridge-v1.js';
import { mcpToolRefKey, type MCPRegistryAdmissionV1 } from './mcp-tool-registry-types-v1.js';
import { sha256Hex } from './mcp-registry-checksum-v1.js';

const ATLAS = 'parent-atlas:mcp:atlas-tools';
const TRACE = 'parent-atlas:mcp:trace';

function admission(serverAuthorityId: string, toolSurfaceRevision: string, toolPolicyRevision: string): MCPRegistryAdmissionV1 {
  return {
    schemaVersion: 'mcp-registry-admission.v1',
    serverAuthorityId,
    toolSurfaceRevision,
    toolPolicyRevision,
    registryRevision: sha256Hex(toolSurfaceRevision + toolPolicyRevision),
    admittedAt: new Date().toISOString(),
    canonicalAuthority: false,
  };
}

const SURFACE_A = 'a'.repeat(64);
const POLICY_A = 'b'.repeat(64);
const SCHEMA_SEARCH = 'c'.repeat(64);

function baseServer(overrides: Partial<McpAdmittedServerRegistryV2> = {}): McpAdmittedServerRegistryV2 {
  const ref = { serverAuthorityId: ATLAS, toolName: 'search' };
  return {
    admission: admission(ATLAS, SURFACE_A, POLICY_A),
    policyEntries: [{ ref, permissionClass: 'READ', approvalRequired: false }],
    toolSchemaDigests: new Map([[mcpToolRefKey(ref), SCHEMA_SEARCH]]),
    ...overrides,
  };
}

function frame(ref: { serverAuthorityId: string; toolName: string }, digest = SCHEMA_SEARCH): McpToolViterbiFrameV2 {
  return {
    revision: 'obs-1',
    candidates: [{ id: mcpToolRefKey(ref), value: { ref, toolSchemaDigest: digest }, emissionScore: 1 }],
  };
}

describe('proposeMcpToolWithViterbiV2', () => {
  it('returns a proposal-only ToolProposalV1 for a known READ tool', () => {
    const server = baseServer();
    const proposal = proposeMcpToolWithViterbiV2({ frames: [frame({ serverAuthorityId: ATLAS, toolName: 'search' })], servers: [server] });
    expect(proposal.status).toBe('PROPOSED');
    expect(proposal.ref).toEqual({ serverAuthorityId: ATLAS, toolName: 'search' });
    expect(proposal.rank).toBe(1);
    expect(proposal.executionAuthorized).toBe(false);
    expect(proposal.executionPerformed).toBe(false);
    expect(proposal.writesPerformed).toBe(false);
    expect(proposal.registryRevision).toBe(server.admission.registryRevision);
  });

  it('FAIL: unknown server', () => {
    const server = baseServer();
    expect(() => proposeMcpToolWithViterbiV2({
      frames: [frame({ serverAuthorityId: 'parent-atlas:mcp:nonexistent', toolName: 'search' })],
      servers: [server],
    })).toThrow(/MCP_TOOL_REGISTRY_UNKNOWN_SERVER/);
  });

  it('FAIL: unknown tool', () => {
    const server = baseServer();
    expect(() => proposeMcpToolWithViterbiV2({
      frames: [frame({ serverAuthorityId: ATLAS, toolName: 'nonexistent' })],
      servers: [server],
    })).toThrow(/MCP_TOOL_REGISTRY_UNKNOWN_TOOL/);
  });

  it('FAIL: schema checksum mismatch', () => {
    const server = baseServer();
    expect(() => proposeMcpToolWithViterbiV2({
      frames: [frame({ serverAuthorityId: ATLAS, toolName: 'search' })],
      servers: [server],
      expectedToolSchemaDigest: 'd'.repeat(64),
    })).toThrow(/MCP_TOOL_SCHEMA_DIGEST_MISMATCH/);
  });

  it('FAIL: old registry revision', () => {
    const server = baseServer();
    expect(() => proposeMcpToolWithViterbiV2({
      frames: [frame({ serverAuthorityId: ATLAS, toolName: 'search' })],
      servers: [server],
      expectedRegistryRevision: 'stale-revision',
    })).toThrow(/MCP_TOOL_REGISTRY_REVISION_MISMATCH/);
  });

  it('FAIL: unknown permission class', () => {
    const ref = { serverAuthorityId: ATLAS, toolName: 'mystery' };
    const server = baseServer({
      policyEntries: [{ ref, permissionClass: 'UNKNOWN', approvalRequired: true }],
      toolSchemaDigests: new Map([[mcpToolRefKey(ref), SCHEMA_SEARCH]]),
    });
    expect(() => proposeMcpToolWithViterbiV2({ frames: [frame(ref)], servers: [server] }))
      .toThrow(/MCP_TOOL_UNKNOWN_PERMISSION_CLASS/);
  });

  it('FAIL: WRITE without approval satisfied', () => {
    const ref = { serverAuthorityId: ATLAS, toolName: 'apply' };
    const server = baseServer({
      policyEntries: [{ ref, permissionClass: 'WRITE', approvalRequired: true }],
      toolSchemaDigests: new Map([[mcpToolRefKey(ref), SCHEMA_SEARCH]]),
    });
    expect(() => proposeMcpToolWithViterbiV2({ frames: [frame(ref)], servers: [server] }))
      .toThrow(/MCP_TOOL_WRITE_CAPABLE_REQUIRES_APPROVAL/);
  });

  it('FAIL: ADMIN without approval satisfied (generalizes the WRITE check)', () => {
    const ref = { serverAuthorityId: ATLAS, toolName: 'admin-op' };
    const server = baseServer({
      policyEntries: [{ ref, permissionClass: 'ADMIN', approvalRequired: true }],
      toolSchemaDigests: new Map([[mcpToolRefKey(ref), SCHEMA_SEARCH]]),
    });
    expect(() => proposeMcpToolWithViterbiV2({ frames: [frame(ref)], servers: [server] }))
      .toThrow(/MCP_TOOL_WRITE_CAPABLE_REQUIRES_APPROVAL/);
  });

  it('same live lists + same policy -> identical registryRevision', () => {
    const a = admission(ATLAS, SURFACE_A, POLICY_A);
    const b = admission(ATLAS, SURFACE_A, POLICY_A);
    expect(a.registryRevision).toBe(b.registryRevision);
  });

  it('different tool schema -> different toolSurfaceRevision, same toolPolicyRevision (independent axes)', () => {
    const a = admission(ATLAS, SURFACE_A, POLICY_A);
    const differentSurface = 'x'.repeat(64);
    const b = admission(ATLAS, differentSurface, POLICY_A);
    expect(a.toolSurfaceRevision).not.toBe(b.toolSurfaceRevision);
    expect(a.toolPolicyRevision).toBe(b.toolPolicyRevision);
    expect(a.registryRevision).not.toBe(b.registryRevision);
  });

  it('policy-only change -> same toolSurfaceRevision, different toolPolicyRevision', () => {
    const a = admission(ATLAS, SURFACE_A, POLICY_A);
    const differentPolicy = 'y'.repeat(64);
    const b = admission(ATLAS, SURFACE_A, differentPolicy);
    expect(a.toolSurfaceRevision).toBe(b.toolSurfaceRevision);
    expect(a.toolPolicyRevision).not.toBe(b.toolPolicyRevision);
    expect(a.registryRevision).not.toBe(b.registryRevision);
  });

  it('same toolName on two different servers -> two distinct, independently-selectable refs, no ambiguity', () => {
    const atlasRef = { serverAuthorityId: ATLAS, toolName: 'search' };
    const traceRef = { serverAuthorityId: TRACE, toolName: 'search' };
    const atlasServer = baseServer();
    const traceServer = baseServer({
      admission: admission(TRACE, 'e'.repeat(64), 'f'.repeat(64)),
      policyEntries: [{ ref: traceRef, permissionClass: 'READ', approvalRequired: false }],
      toolSchemaDigests: new Map([[mcpToolRefKey(traceRef), SCHEMA_SEARCH]]),
    });

    // Both refs share the bare name 'search' but resolve independently -- proves the k-best
    // decoder's duplicate-id guard does not fire, because composite (serverAuthorityId,toolName)
    // ids differ even though toolName alone collides.
    const atlasProposal = proposeMcpToolWithViterbiV2({ frames: [frame(atlasRef)], servers: [atlasServer, traceServer] });
    const traceProposal = proposeMcpToolWithViterbiV2({ frames: [frame(traceRef)], servers: [atlasServer, traceServer] });

    expect(atlasProposal.ref.serverAuthorityId).toBe(ATLAS);
    expect(traceProposal.ref.serverAuthorityId).toBe(TRACE);
    expect(mcpToolRefKey(atlasProposal.ref)).not.toBe(mcpToolRefKey(traceProposal.ref));
  });

  it('never calls a tool -- executionAuthorized/executionPerformed/writesPerformed are always false', () => {
    const server = baseServer();
    const proposal = proposeMcpToolWithViterbiV2({ frames: [frame({ serverAuthorityId: ATLAS, toolName: 'search' })], servers: [server] });
    expect(proposal.executionAuthorized).toBe(false);
    expect(proposal.executionPerformed).toBe(false);
    expect(proposal.writesPerformed).toBe(false);
    expect(proposal.canonicalAuthority).toBe(false);
  });
});
