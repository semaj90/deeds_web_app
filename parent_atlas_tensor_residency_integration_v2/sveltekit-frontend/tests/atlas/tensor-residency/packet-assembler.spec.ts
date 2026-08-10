import { describe, expect, it } from 'vitest';
import { assemblePassResults } from '../../../src/lib/server/atlas/tensors/packet-assembler';

const envelope = (passName: string, idempotencyKey: string) => ({
  requestId: 'r', packetKey: 'p', workspaceRevision: 'w', producer: 'x', producerRevision: '1',
  passName, passRevision: '1', orderingScope: 'packet', inputHash: 'i', outputHash: 'o',
  schemaVersion: 'v1', idempotencyKey
});

describe('unordered assembly', () => {
  it('is deterministic under shuffled completion', () => {
    const a = assemblePassResults([{ envelope: envelope('semantic', 'a'), payload: 1 }, { envelope: envelope('graph', 'b'), payload: 2 }]);
    const b = assemblePassResults([{ envelope: envelope('graph', 'b'), payload: 2 }, { envelope: envelope('semantic', 'a'), payload: 1 }]);
    expect(a).toEqual(b);
  });
});
