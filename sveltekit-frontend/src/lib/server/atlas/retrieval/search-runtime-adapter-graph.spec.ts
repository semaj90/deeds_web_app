// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAtlasSearchAdapter } from './search-runtime-adapter.js';

describe('Atlas SearchRuntime graph expansion ownership', () => {
  it('does not expose a second unqualified projection traversal', async () => {
    const runtimeSearch = vi.fn().mockResolvedValue({
      packets: [{ packet_key: 'pkt:fused-top' }],
      denseSeedPacketKeys: ['pkt:dense-seed'],
      metadata: {},
      provenance: {},
    });
    const adapter = createAtlasSearchAdapter({ runtime: { search: runtimeSearch } as never });

    const result = await adapter.search({
      query: 'find neighbors',
      lexicalExpansion: ['drizzle-orm', 'sveltekit route'],
      withGraphExpansion: true,
      workspaceRevision: `sha256:${'a'.repeat(64)}`,
    });

    expect(runtimeSearch).toHaveBeenCalledOnce();
    expect(runtimeSearch).toHaveBeenCalledWith(expect.objectContaining({
      text: 'find neighbors',
      lexicalExpansion: ['drizzle-orm', 'sveltekit route'],
    }));
    expect(result.topPacketKeys).toEqual(['pkt:fused-top']);
    expect(result.graphExpansionStatus).toBe('DELEGATED_TO_SEARCH_RUNTIME');
    expect(result).not.toHaveProperty('graphExpanded');
  });

  it('preserves the SearchRuntime result when no graph revision is supplied', async () => {
    const packets = [{ packet_key: 'pkt:lexical-only' }];
    const adapter = createAtlasSearchAdapter({
      runtime: { search: vi.fn().mockResolvedValue({ packets, metadata: {}, provenance: {} }) } as never,
    });

    const result = await adapter.search({ query: 'lexical only', withGraphExpansion: true });

    expect(result.packets).toBe(packets);
    expect(result.graphExpansionStatus).toBe('BLOCKED_TRUSTED_WORKSPACE_REVISION_MISSING');
    expect(result).not.toHaveProperty('graphExpanded');
  });
});
