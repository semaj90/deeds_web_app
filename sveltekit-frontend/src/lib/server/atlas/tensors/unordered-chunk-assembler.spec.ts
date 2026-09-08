import { describe, expect, it } from 'vitest';
import { UnorderedChunkAssembler, type ChunkEnvelope } from './unordered-chunk-assembler.js';

/**
 * Proves T8 (openspec/changes/parent-atlas-tensor-residency-integration/tasks.md):
 * "unordered packet/chunk assembly deterministic under shuffled completion" --
 * and the matching packet-assembly spec requirement ("physical completion order
 * is not semantic order... joined by canonical identity, not by physical
 * arrival order").
 *
 * This class had zero test coverage and zero live callers before this pass
 * (confirmed via repo-wide grep) -- an unwired but coherent scaffold, not dead
 * code, per this repo's own "don't delete unwired scaffolds" convention.
 */

function makeChunks(streamId: string, payload: Uint8Array[]): ChunkEnvelope[] {
  return payload.map((bytes, sequenceNumber) => ({
    streamId,
    sequenceNumber,
    chunkCount: payload.length,
    contentHash: `hash-${sequenceNumber}`,
    bytes,
  }));
}

function shuffled<T>(items: T[], seed: number): T[] {
  // Deterministic Fisher-Yates using a simple LCG so the same seed always
  // produces the same permutation (reproducible test, not Math.random noise).
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('UnorderedChunkAssembler', () => {
  const payload = [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5]),
    new Uint8Array([6, 7, 8, 9]),
    new Uint8Array([10]),
    new Uint8Array([11, 12, 13, 14, 15]),
  ];
  const expectedTotal = payload.reduce((n, b) => n + b.byteLength, 0);
  const expectedBytes = new Uint8Array(expectedTotal);
  {
    let offset = 0;
    for (const b of payload) {
      expectedBytes.set(b, offset);
      offset += b.byteLength;
    }
  }

  it('assembles in-order pushes correctly', () => {
    const assembler = new UnorderedChunkAssembler();
    const chunks = makeChunks('stream-a', payload);
    let result: Uint8Array | null = null;
    for (const chunk of chunks) result = assembler.push(chunk);
    expect(result).toEqual(expectedBytes);
  });

  it('returns null until every chunk has arrived', () => {
    const assembler = new UnorderedChunkAssembler();
    const chunks = makeChunks('stream-b', payload);
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(assembler.push(chunks[i])).toBeNull();
    }
    expect(assembler.push(chunks[chunks.length - 1])).toEqual(expectedBytes);
  });

  it('produces byte-identical output across many different shuffled arrival orders', () => {
    // This is the actual determinism property T8 asks to prove: physical
    // completion order must never affect the assembled result.
    for (let seed = 1; seed <= 20; seed++) {
      const assembler = new UnorderedChunkAssembler();
      const chunks = shuffled(makeChunks(`stream-shuffle-${seed}`, payload), seed);
      let result: Uint8Array | null = null;
      for (const chunk of chunks) result = assembler.push(chunk);
      expect(result).toEqual(expectedBytes);
    }
  });

  it('does not confuse two concurrent streams interleaved with each other', () => {
    const assembler = new UnorderedChunkAssembler();
    const chunksA = shuffled(makeChunks('stream-x', payload), 7);
    const otherPayload = [new Uint8Array([100, 101]), new Uint8Array([102, 103, 104])];
    const chunksB = shuffled(makeChunks('stream-y', otherPayload), 13);

    // Interleave pushes from both streams.
    const interleaved: ChunkEnvelope[] = [];
    const max = Math.max(chunksA.length, chunksB.length);
    for (let i = 0; i < max; i++) {
      if (chunksA[i]) interleaved.push(chunksA[i]);
      if (chunksB[i]) interleaved.push(chunksB[i]);
    }

    let resultA: Uint8Array | null = null;
    let resultB: Uint8Array | null = null;
    for (const chunk of interleaved) {
      const result = assembler.push(chunk);
      if (result && chunk.streamId === 'stream-x') resultA = result;
      if (result && chunk.streamId === 'stream-y') resultB = result;
    }

    expect(resultA).toEqual(expectedBytes);
    const expectedB = new Uint8Array([100, 101, 102, 103, 104]);
    expect(resultB).toEqual(expectedB);
  });

  it('rejects a negative sequence number', () => {
    const assembler = new UnorderedChunkAssembler();
    expect(() =>
      assembler.push({ streamId: 's', sequenceNumber: -1, chunkCount: 3, contentHash: 'h', bytes: new Uint8Array() }),
    ).toThrow('invalid sequence number');
  });

  it('rejects a sequence number at or beyond chunkCount', () => {
    const assembler = new UnorderedChunkAssembler();
    expect(() =>
      assembler.push({ streamId: 's', sequenceNumber: 3, chunkCount: 3, contentHash: 'h', bytes: new Uint8Array() }),
    ).toThrow('invalid sequence number');
  });

  it('rejects a chunkCount that changes mid-stream', () => {
    const assembler = new UnorderedChunkAssembler();
    assembler.push({ streamId: 's', sequenceNumber: 0, chunkCount: 3, contentHash: 'h', bytes: new Uint8Array([1]) });
    expect(() =>
      assembler.push({ streamId: 's', sequenceNumber: 1, chunkCount: 4, contentHash: 'h', bytes: new Uint8Array([2]) }),
    ).toThrow(/chunkCount mismatch/);
  });

  it('does not double-count a duplicate sequence number as two distinct chunks', () => {
    const assembler = new UnorderedChunkAssembler();
    const chunks = makeChunks('stream-dup', payload.slice(0, 3));
    // Push chunk 0 twice (duplicate delivery), then chunks 1 and 2 once each.
    // A naive implementation counting pushes rather than unique sequence
    // numbers would incorrectly believe the stream is complete after 3 pushes
    // even though sequence 2 never arrived.
    expect(assembler.push(chunks[0])).toBeNull();
    expect(assembler.push(chunks[0])).toBeNull(); // duplicate, still incomplete
    expect(assembler.push(chunks[1])).toBeNull();
    const result = assembler.push(chunks[2]);
    const expected = new Uint8Array(
      payload.slice(0, 3).reduce((n, b) => n + b.byteLength, 0),
    );
    {
      let offset = 0;
      for (const b of payload.slice(0, 3)) {
        expected.set(b, offset);
        offset += b.byteLength;
      }
    }
    expect(result).toEqual(expected);
  });

  it('clears stream state after completion so a later stream with the same id starts fresh', () => {
    const assembler = new UnorderedChunkAssembler();
    const first = makeChunks('stream-reuse', [new Uint8Array([1]), new Uint8Array([2])]);
    for (const chunk of first) assembler.push(chunk);

    // Same streamId, new (smaller) payload -- must not be contaminated by the
    // previous completed stream's leftover state.
    const second = makeChunks('stream-reuse', [new Uint8Array([9])]);
    const result = assembler.push(second[0]);
    expect(result).toEqual(new Uint8Array([9]));
  });
});
