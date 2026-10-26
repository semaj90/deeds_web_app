import { describe, expect, it } from 'vitest';
import { createOakDagContextManifestHandlerV1 } from './oak-dag-context-manifest-handler-v1.js';
import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';

describe('OAK ContextManifest handler owner integration', () => {
  it('runs the real ACE compiler deterministically without retrieval or persistence', async () => {
    const context = {
      ragChunks: [{
        id: 'fixture:rag:1',
        kind: 'code',
        source: 'fixture',
        sourceRef: 'fixture://oak-context-proof/source.ts',
        content: 'Fixture-only source evidence for the OAK ContextManifest owner test.',
        score: 0.9,
      }],
      kbChunks: [],
      caseChunks: [],
      docChunks: [],
      kagNeighbors: [],
      chatHistory: [],
      entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
    };
    const binding = {
      boundArguments: {
        context,
        options: {
          request_id: 'fixture:oak-context-manifest-handler',
          source_refs: ['fixture://oak-context-proof/source.ts'],
          now: '2026-10-13T12:00:00.000Z',
        },
      },
      action: {},
    } as unknown as KernelDagExecutionBindingV1;
    const handler = createOakDagContextManifestHandlerV1();

    const first = await handler.run({ action: {} as never, parentResults: [], binding });
    const replay = await handler.run({ action: {} as never, parentResults: [], binding });

    expect(handler.implementationRef).toBe('parent-atlas.context-manifest.ace.v1');
    expect(first.manifest.retrieved_candidates).toBe(1);
    expect(first.manifest.selected_packet_keys).toContain('dense:fixture://oak-context-proof/source.ts');
    expect(first.manifest.manifest_id).toBe(replay.manifest.manifest_id);
    expect(first.prompt_packets).toEqual(replay.prompt_packets);
    expect(first.manifest.source_refs).toContain('fixture://oak-context-proof/source.ts');
  });
});
