import { describe, expect, it } from 'vitest';

import {
  AtlasAdapterUnavailableError,
  atlasBuildContextTool,
  atlasDelegateTool,
  atlasDiscoverTool,
  atlasValidateChangeTool,
} from './atlas-mastra-adapter.js';

describe('Mastra adapter unavailable seams', () => {
  it('returns an explicit non-authoritative validation result', async () => {
    const result = await atlasValidateChangeTool.execute({
      packetKey: 'packet:fixture',
      proposedChange: {},
    });

    expect(result).toEqual({
      valid: false,
      status: 'FAIL',
      errors: ['ATLAS_VALIDATION_ADAPTER_UNAVAILABLE'],
      available: false,
      canonicalAuthority: false,
      writesPerformed: false,
    });
  });

  it('does not turn missing discovery or delegation owners into success', async () => {
    const discovery = await atlasDiscoverTool.execute({ query: 'src/file.ts' });
    const delegation = await atlasDelegateTool.execute({ agentType: 'opencode', task: 'fixture' });

    expect(discovery).toMatchObject({
      status: 'UNAVAILABLE',
      packets: [],
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(delegation).toMatchObject({
      status: 'failed',
      available: false,
      writesPerformed: false,
    });
  });

  it('uses a typed error for context assembly without an ACE owner', async () => {
    await expect(
      atlasBuildContextTool.execute({ packetKeys: ['packet:fixture'], maxTokens: 128 }),
    ).rejects.toBeInstanceOf(AtlasAdapterUnavailableError);
  });
});
