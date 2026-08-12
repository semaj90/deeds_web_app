import { describe, expect, it } from 'vitest';

import { buildContextManifestFromACE } from './ace-context-manifest';
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

  it('never mutates the input ACEContext', () => {
    const context = minimalACEContext({
      codebaseContext: [{ filePath: 'a.ts', content: 'z'.repeat(50), score: 0.5, stableKey: 'a' }],
    });
    const snapshotBefore = JSON.stringify(context);
    buildContextManifestFromACE(context, { request_id: 'req-immutable' });
    expect(JSON.stringify(context)).toBe(snapshotBefore);
  });
});
