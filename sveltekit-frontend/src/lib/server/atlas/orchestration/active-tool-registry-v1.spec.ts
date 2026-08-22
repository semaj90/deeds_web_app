import { describe, expect, it } from 'vitest';

import {
  ActiveToolRegistryEntryV1Schema,
  materializeActiveToolRegistryManifestV1,
  selectRoutableToolIdsForPrefill,
  type ActiveToolRegistryEntryV1,
} from './active-tool-registry-v1.js';

function entry(overrides: Partial<ActiveToolRegistryEntryV1> = {}): ActiveToolRegistryEntryV1 {
  return {
    schema: 'atlas.active-tool-registry-entry.v1',
    entryId: 'trace:atlas.packet_search',
    toolId: 'atlas.packet_search',
    owner: 'trace-mcp',
    handlerId: 'trace:atlas.packet_search',
    dispatchSurface: 'TRACE_MCP',
    lane: 'identity',
    operationKind: 'READ',
    targetScopes: ['NONE'],
    permissions: ['code:read'],
    proofStatus: 'PROVEN',
    schemaListed: true,
    canonicalOwner: true,
    routingEligible: true,
    duplicateGroup: null,
    cachePolicy: { mode: 'NONE', scope: null },
    producerRevision: 'mcp-registry:v1',
    ...overrides,
  };
}

describe('ActiveToolRegistryV1', () => {
  it('accepts one proven canonical owner', () => {
    expect(ActiveToolRegistryEntryV1Schema.parse(entry()).routingEligible).toBe(true);
  });

  it('fails closed when an unknown ontology tool is marked routable', () => {
    expect(() => ActiveToolRegistryEntryV1Schema.parse(entry({ lane: 'unknown' }))).toThrow(
      'unknown, unlisted, duplicate-unresolved, stub, quarantined, or non-owner tools cannot be routed',
    );
  });

  it('fails closed for stub and quarantined tools', () => {
    expect(() => ActiveToolRegistryEntryV1Schema.parse(entry({ proofStatus: 'STUB' }))).toThrow();
    expect(() => ActiveToolRegistryEntryV1Schema.parse(entry({ proofStatus: 'QUARANTINED' }))).toThrow();
  });

  it('does not allow READ tools to claim mutation scopes', () => {
    expect(() => ActiveToolRegistryEntryV1Schema.parse(entry({ targetScopes: ['EPHEMERAL_WORKSPACE'] }))).toThrow(
      'READ tools must use target scope NONE',
    );
  });

  it('requires workspace:write even for disposable .tmp proposal artifacts', () => {
    expect(() => ActiveToolRegistryEntryV1Schema.parse(entry({
      entryId: 'local:patch.propose:no-write',
      toolId: 'atlas.patch.propose',
      handlerId: 'local:patch.propose:no-write',
      dispatchSurface: 'LOCAL_FUNCTION',
      lane: 'ops',
      operationKind: 'PROPOSE',
      targetScopes: ['EPHEMERAL_WORKSPACE'],
      permissions: ['code:read'],
      proofStatus: 'IMPLEMENTED_UNPROVEN',
    }))).toThrow('EPHEMERAL_WORKSPACE requires workspace:write permission');
  });

  it('permits a proposal tool to write only an ephemeral work artifact', () => {
    const proposed = entry({
      entryId: 'local:patch.propose',
      toolId: 'atlas.patch.propose',
      handlerId: 'local:patch.propose',
      dispatchSurface: 'LOCAL_FUNCTION',
      lane: 'ops',
      operationKind: 'PROPOSE',
      targetScopes: ['EPHEMERAL_WORKSPACE'],
      permissions: ['code:read', 'workspace:write'],
      proofStatus: 'IMPLEMENTED_UNPROVEN',
      cachePolicy: { mode: 'NONE', scope: null },
    });
    expect(ActiveToolRegistryEntryV1Schema.parse(proposed).targetScopes).toEqual(['EPHEMERAL_WORKSPACE']);
  });

  it('requires code:write for worktree APPLY tools', () => {
    expect(() => ActiveToolRegistryEntryV1Schema.parse(entry({
      entryId: 'local:patch.apply',
      toolId: 'atlas.patch.apply',
      handlerId: 'local:patch.apply',
      operationKind: 'APPLY',
      targetScopes: ['WORKTREE_SOURCE'],
      permissions: ['code:read'],
    }))).toThrow('WORKTREE_SOURCE requires code:write permission');
  });

  it('requires exactly one canonical owner for duplicated tool names', () => {
    const canonical = entry();
    const duplicate = entry({
      entryId: 'legacy:atlas.packet_search',
      handlerId: 'legacy:atlas.packet_search',
      dispatchSurface: 'LEGACY_MCP',
      canonicalOwner: false,
      routingEligible: false,
      duplicateGroup: 'atlas.packet_search',
      proofStatus: 'DUPLICATE_UNRESOLVED',
    });
    const manifest = materializeActiveToolRegistryManifestV1({
      registryRevision: 'registry:v1',
      generatedAt: '2026-08-22T21:00:00.000Z',
      entries: [duplicate, canonical],
    });
    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries.filter((value) => value.canonicalOwner)).toHaveLength(1);
  });

  it('rejects duplicate names when there is no canonical owner', () => {
    const left = entry({ canonicalOwner: false, routingEligible: false, proofStatus: 'DUPLICATE_UNRESOLVED' });
    const right = entry({
      entryId: 'legacy:atlas.packet_search',
      handlerId: 'legacy:atlas.packet_search',
      dispatchSurface: 'LEGACY_MCP',
      canonicalOwner: false,
      routingEligible: false,
      proofStatus: 'DUPLICATE_UNRESOLVED',
    });
    expect(() => materializeActiveToolRegistryManifestV1({
      registryRevision: 'registry:v1',
      generatedAt: '2026-08-22T21:00:00.000Z',
      entries: [left, right],
    })).toThrow('atlas.packet_search must have exactly one canonical owner; found 0');
  });

  it('selects only routable tools compatible with prefill operation and target scope', () => {
    const read = entry();
    const propose = entry({
      entryId: 'local:artifact.propose',
      toolId: 'artifact.propose',
      handlerId: 'local:artifact.propose',
      dispatchSurface: 'LOCAL_FUNCTION',
      lane: 'synthesis',
      operationKind: 'PROPOSE',
      targetScopes: ['EPHEMERAL_WORKSPACE'],
      permissions: ['workspace:write'],
      proofStatus: 'IMPLEMENTED_UNPROVEN',
    });
    const apply = entry({
      entryId: 'local:artifact.apply',
      toolId: 'artifact.apply',
      handlerId: 'local:artifact.apply',
      dispatchSurface: 'LOCAL_FUNCTION',
      lane: 'ops',
      operationKind: 'APPLY',
      targetScopes: ['WORKTREE_SOURCE'],
      permissions: ['code:write'],
      proofStatus: 'IMPLEMENTED_UNPROVEN',
    });
    const manifest = materializeActiveToolRegistryManifestV1({
      registryRevision: 'registry:v1',
      generatedAt: '2026-08-22T21:00:00.000Z',
      entries: [apply, propose, read],
    });

    expect(selectRoutableToolIdsForPrefill({
      manifest,
      allowedOperationKinds: ['READ', 'PROPOSE'],
      allowedTargetScopes: ['NONE', 'EPHEMERAL_WORKSPACE'],
    })).toEqual(['artifact.propose', 'atlas.packet_search']);
  });
});
