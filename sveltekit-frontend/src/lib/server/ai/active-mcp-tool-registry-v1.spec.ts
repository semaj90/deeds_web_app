import { describe, expect, it } from 'vitest';
import {
  buildActiveMcpToolRegistryV1,
  decideActiveMcpToolRoutingV1,
  routableActiveMcpToolsV1,
  type ActiveMcpToolEntryV1,
} from './active-mcp-tool-registry-v1';

function baseEntry(overrides: Partial<ActiveMcpToolEntryV1> = {}): ActiveMcpToolEntryV1 {
  return {
    toolName: 'atlas.packet_search',
    owner: 'trace-mcp',
    serverId: 'trace-mcp-server',
    dispatchSurface: 'MCP_STREAMABLE_HTTP',
    lane: 'identity',
    operationKind: 'READ',
    permission: 'ALLOW',
    schemaStatus: 'VALID',
    handlerStatus: 'RESOLVED',
    duplicateStatus: 'UNIQUE',
    ontologyStatus: 'CLASSIFIED',
    proofStatus: 'PROVEN',
    evidenceRefs: ['mcp-tool-registry-parity', 'mcp-tool-ontology'],
    ...overrides,
  };
}

describe('ActiveMcpToolRegistryV1', () => {
  it('allows a unique, classified, proven READ tool', () => {
    expect(decideActiveMcpToolRoutingV1(baseEntry())).toEqual({
      toolName: 'atlas.packet_search',
      routable: true,
      reasons: [],
    });
  });

  it('fails closed for duplicate names, handler-only entries, and unknown ontology', () => {
    const decision = decideActiveMcpToolRoutingV1(
      baseEntry({
        duplicateStatus: 'DUPLICATE_NAME',
        handlerStatus: 'HANDLER_ONLY',
        ontologyStatus: 'UNKNOWN',
      }),
    );

    expect(decision.routable).toBe(false);
    expect(decision.reasons).toEqual(
      expect.arrayContaining(['DUPLICATE_NAME', 'HANDLER_HANDLER_ONLY', 'ONTOLOGY_UNKNOWN']),
    );
  });

  it('keeps STUB and quarantined implementations non-routable', () => {
    expect(decideActiveMcpToolRoutingV1(baseEntry({ proofStatus: 'STUB' })).routable).toBe(false);
    expect(
      decideActiveMcpToolRoutingV1(
        baseEntry({ toolName: 'phase18_reranker', proofStatus: 'QUARANTINED' }),
      ).reasons,
    ).toContain('PROOF_QUARANTINED');
  });

  it('requires independently proven operator gating for APPLY tools', () => {
    const unproven = decideActiveMcpToolRoutingV1(
      baseEntry({
        toolName: 'atlas.patch.apply',
        operationKind: 'APPLY',
        permission: 'ASK',
        proofStatus: 'IMPLEMENTED_UNPROVEN',
        applyGateProven: false,
      }),
    );

    expect(unproven.routable).toBe(false);
    expect(unproven.reasons).toEqual(
      expect.arrayContaining(['APPLY_REQUIRES_PROVEN_IMPLEMENTATION', 'APPLY_GATE_NOT_PROVEN']),
    );

    const proven = decideActiveMcpToolRoutingV1(
      baseEntry({
        toolName: 'atlas.patch.apply',
        operationKind: 'APPLY',
        permission: 'ASK',
        proofStatus: 'PROVEN',
        applyGateProven: true,
      }),
    );
    expect(proven.routable).toBe(true);
  });

  it('rejects duplicate registry entries and returns only routable tools', () => {
    expect(() =>
      buildActiveMcpToolRegistryV1({
        protocolRevision: 'legacy-sdk-v1-streamable-http',
        entries: [baseEntry(), baseEntry()],
      }),
    ).toThrow('ACTIVE_MCP_TOOL_REGISTRY_DUPLICATE_ENTRY:atlas.packet_search');

    const registry = buildActiveMcpToolRegistryV1({
      protocolRevision: 'legacy-sdk-v1-streamable-http',
      entries: [
        baseEntry({ toolName: 'atlas.packet_search' }),
        baseEntry({ toolName: 'phase18_reranker', proofStatus: 'QUARANTINED' }),
      ],
    });

    expect(routableActiveMcpToolsV1(registry).map((entry) => entry.toolName)).toEqual([
      'atlas.packet_search',
    ]);
  });
});
