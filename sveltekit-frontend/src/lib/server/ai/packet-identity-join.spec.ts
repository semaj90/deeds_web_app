import { describe, expect, it } from 'vitest';

import {
  collectPacketIdentityJoinMeta,
  readPacketKey,
  readSourceRef,
} from './packet-identity-join.js';

describe('packet identity join', () => {
  it('prefers canonical packet keys over path fallbacks', () => {
    const candidate = {
      packetKey: 'packet:atlas:001',
      sourceRef: 'src/lib/server/ai/openai-facade.ts',
      filePath: 'src/lib/server/ai/openai-facade.ts',
      stableKey: 'file:src/lib/server/ai/openai-facade.ts',
    };

    expect(readPacketKey(candidate)).toBe('packet:atlas:001');
    expect(readSourceRef(candidate)).toBe('src/lib/server/ai/openai-facade.ts');
  });

  it('flags path-only candidates as missing packet keys', () => {
    const meta = collectPacketIdentityJoinMeta([
      {
        filePath: 'src/lib/server/ai/openai-facade.ts',
      },
      {
        packet_key: 'packet:atlas:002',
        source_ref: 'src/lib/server/ai/packet-identity-join.ts',
      },
    ]);

    expect(meta.packetKeys).toEqual(['packet:atlas:002']);
    expect(meta.sourceRefs).toEqual([
      'src/lib/server/ai/openai-facade.ts',
      'src/lib/server/ai/packet-identity-join.ts',
    ]);
    expect(meta.packetKeyMissing).toBe(1);
    expect(meta.pathOnlyCandidates).toBe(1);
  });
});
