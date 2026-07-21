import { describe, expect, it } from 'vitest';
import { buildAceQueryPacket } from './ace-query-packet.js';
import { buildQueryRoutingFallback } from '$lib/server/nlp/query-routing.js';

describe('ACE query packet', () => {
  it('builds a validated packet from routing analysis', () => {
    const analysis = buildQueryRoutingFallback('dependency graph for atlas packets', {
      domainHint: 'graph',
    });

    const packet = buildAceQueryPacket({
      query: 'dependency graph for atlas packets',
      analysis,
      candidateTools: [
        { toolId: 'trace.kag_search', toolName: 'KAG Search', score: 0.92, eligible: true, reasons: ['graph intent'] },
        { toolId: 'neo4j.dependency_closure', toolName: 'Dependency Closure', score: 0.88, eligible: true, reasons: ['graph intent'] },
      ],
      selectedToolId: 'trace.kag_search',
      selectedEvidenceIds: ['evidence:1'],
      sourceRefs: ['src/lib/server/retrieval/hmm-tool-selector.ts'],
      allowedScopes: ['graph'],
      requiresApproval: false,
      evidenceIds: ['evidence:1'],
      traceId: 'trace-123',
    });

    expect(packet.packetVersion).toBe('ace-query-packet-v1');
    expect(packet.classification.intent).toBe('dependency_trace');
    expect(packet.toolRouting.selectedToolId).toBe('trace.kag_search');
    expect(packet.retrieval.selectedEvidenceIds).toEqual(['evidence:1']);
    expect(packet.provenance.traceId).toBe('trace-123');
  });
});
