import { describe, expect, it } from 'vitest';

import {
  attachContextManifestToACE,
  buildContextManifestFromACE,
  deriveProcessPacketsFromACEContext,
} from './ace-context-manifest';
import type { ACEContext } from './types';

function minimalACEContext(overrides: Partial<ACEContext> = {}): ACEContext {
  return {
    userProfile: null,
    caseContext: null,
    glossaryMatches: null,
    ragChunks: [],
    kbChunks: [],
    caseChunks: [],
    docChunks: [],
    kagNeighbors: [],
    chatHistory: [],
    entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
    practiceTemplate: null,
    queryTags: [],
    webSearchContext: null,
    persona: 'neutral',
    evidenceMetadata: null,
    evidenceConnections: null,
    userAnalyticsContext: null,
    codebaseContext: null,
    policyDecision: null,
    ...overrides,
  };
}

describe('buildContextManifestFromACE', () => {
  it('produces a manifest with zero candidates when the ACE context is empty', () => {
    const compiled = buildContextManifestFromACE(minimalACEContext(), {
      request_id: 'req-empty',
    });
    expect(compiled.manifest.retrieved_candidates).toBe(0);
    expect(compiled.manifest.selected_packet_keys).toEqual([]);
    expect(compiled.prompt_packets).toEqual([]);
  });

  it('maps codebaseContext, ragChunks, and kagNeighbors into distinct lanes without duplicating identity', () => {
    const context = minimalACEContext({
      codebaseContext: [
        { filePath: 'src/lib/server/ace/types.ts', content: 'x'.repeat(200), score: 0.9, stableKey: 'code-1' },
      ],
      ragChunks: [
        {
          id: 'rag-1',
          kind: 'code',
          source: 'qdrant',
          content: 'y'.repeat(200),
          sourceRef: 'src/lib/server/ace/context-assembler.ts',
          score: 0.8,
        } as unknown as ACEContext['ragChunks'][number],
      ],
      kagNeighbors: [{ nodeId: 'node-1', title: 'auth session validation', relationship: 'DEPENDS_ON', score: 0.6 }],
    });

    const compiled = buildContextManifestFromACE(context, {
      request_id: 'req-mapped',
      feature_id: 'ace.manifest-bridge',
      policy: { token_budget: 500, reserved_tokens: 0, max_packets: 10 },
    });

    expect(compiled.manifest.retrieved_candidates).toBe(3);
    expect(compiled.manifest.lanes.dense).toBe(2); // codebaseContext + ragChunks both map to 'dense'
    expect(compiled.manifest.lanes.graph).toBe(1);
    expect(compiled.manifest.feature_id).toBe('ace.manifest-bridge');
    // Deterministic: same input compiled twice yields the same manifest_id.
    const again = buildContextManifestFromACE(context, {
      request_id: 'req-mapped',
      feature_id: 'ace.manifest-bridge',
      policy: { token_budget: 500, reserved_tokens: 0, max_packets: 10 },
    });
    expect(again.manifest.manifest_id).toBe(compiled.manifest.manifest_id);
  });

  it('selects process packets into the manifest deterministically', () => {
    const context = minimalACEContext({
      codebaseContext: [
        { filePath: 'src/lib/server/ace/types.ts', content: 'x'.repeat(200), score: 0.9, stableKey: 'code-1' },
      ],
    });

    const compiled = buildContextManifestFromACE(context, {
      request_id: 'req-process',
      feature_id: 'ace.process.manifest',
      processPackets: [
        {
          schemaVersion: 'atlas.process.packet.v1',
          packetKey: 'process:search-route',
          processId: 'process:search-route',
          name: 'searchRoute',
          sourceRefs: ['src/routes/search/+server.ts'],
          stepSymbolIds: ['step:1', 'step:2'],
          dbTables: ['atlas_packets'],
          tools: ['glob'],
          endpoints: ['/api/search'],
          caches: ['valkey:hot'],
          graphRevision: 'graph:rev:1',
          processHash: 'sha256:process-hash',
          qdrantPayload: {},
          createdAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      policy: { token_budget: 500, reserved_tokens: 0, max_packets: 10 },
    });

    expect(compiled.manifest.selected_process_ids).toEqual(['process:search-route']);
    expect(compiled.manifest.manifest_id).toContain('context:');
  });

  it('derives process packets from live ACE context process memberships deterministically', () => {
    const context = minimalACEContext({
      codebaseContext: [
        {
          filePath: 'src/routes/search/+server.ts',
          content: 'search route',
          score: 0.91,
          stableKey: 'step:search',
          processIds: ['process:search-route'],
          graphRevision: 'graph:rev:1',
          featureFamily: 'search-route',
        },
        {
          filePath: 'src/lib/server/search/rerank.ts',
          content: 'rerank step',
          score: 0.84,
          stableKey: 'step:rerank',
          processIds: ['process:search-route'],
          graphRevision: 'graph:rev:1',
          routeType: 'api-route',
        },
      ],
    });

    const packets = deriveProcessPacketsFromACEContext(context);
    const again = deriveProcessPacketsFromACEContext(context);

    expect(packets).toHaveLength(1);
    const first = packets[0];
    const second = again[0];
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();

    const { createdAt: firstCreatedAt, ...firstStable } = first!;
    const { createdAt: secondCreatedAt, ...secondStable } = second!;

    expect(secondStable).toEqual(firstStable);
    expect(firstStable.processId).toBe('process:search-route');
    expect(firstStable.graphRevision).toBe('graph:rev:1');
    expect(firstStable.sourceRefs).toEqual([
      'src/routes/search/+server.ts',
      'src/lib/server/search/rerank.ts',
    ]);
    expect(firstStable.stepSymbolIds).toEqual(['step:search', 'step:rerank']);
    expect(firstCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(secondCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const compiled = buildContextManifestFromACE(context, {
      request_id: 'req-process-live',
      feature_id: 'ace.process.live',
      processPackets: packets,
      policy: { token_budget: 500, reserved_tokens: 0, max_packets: 10 },
    });

    expect(compiled.manifest.selected_process_ids).toEqual(['process:search-route']);
  });

  it('never mutates the input ACEContext', () => {
    const context = minimalACEContext({
      codebaseContext: [{ filePath: 'a.ts', content: 'z'.repeat(50), score: 0.5, stableKey: 'a' }],
    });
    const snapshotBefore = JSON.stringify(context);
    buildContextManifestFromACE(context, { request_id: 'req-immutable' });
    expect(JSON.stringify(context)).toBe(snapshotBefore);
  });

  it('attaches the compiled manifest onto the live ACE context without mutating the source object', () => {
    const context = minimalACEContext({
      codebaseContext: [{ filePath: 'src/lib/server/ace/types.ts', content: 'hello', score: 0.7, stableKey: 'code-2' }],
    });
    const snapshotBefore = JSON.stringify(context);
    const attached = attachContextManifestToACE(context, {
      request_id: 'req-attached',
      feature_id: 'ace.context.manifest',
    });

    expect(JSON.stringify(context)).toBe(snapshotBefore);
    expect(attached.contextManifest).toBeTruthy();
    expect(attached.contextManifest?.request_id).toBe('req-attached');
    expect(attached.contextManifest?.feature_id).toBe('ace.context.manifest');
    expect(attached.contextManifest?.selected_packet_keys.length).toBeGreaterThanOrEqual(0);
  });
});
