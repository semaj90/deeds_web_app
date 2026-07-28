import { describe, expect, it } from 'vitest';

import { parsePacketIdentity, resolveRedisOverrides } from './atlas_embedding_tools.js';

describe('atlas embedding tools', () => {
  it('parses packet identity into canonical snake_case fields', () => {
    expect(parsePacketIdentity({ packetKey: 'packet:atlas:001', sourceRef: 'src/a.ts' })).toEqual({
      packet_key: 'packet:atlas:001',
      source_ref: 'src/a.ts',
    });
  });

  it('resolves redis url overrides from a connection string', () => {
    expect(resolveRedisOverrides('redis://:secret@redis.example.com:6380')).toEqual({
      host: 'redis.example.com',
      port: 6380,
      password: 'secret',
    });
  });
});
