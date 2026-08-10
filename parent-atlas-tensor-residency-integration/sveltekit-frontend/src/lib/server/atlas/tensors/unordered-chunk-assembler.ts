export interface ChunkEnvelope {
  streamId: string;
  sequenceNumber: number;
  chunkCount: number;
  contentHash: string;
  bytes: Uint8Array;
}

export class UnorderedChunkAssembler {
  private readonly streams = new Map<string, Map<number, ChunkEnvelope>>();

  push(chunk: ChunkEnvelope): Uint8Array | null {
    if (chunk.sequenceNumber < 0 || chunk.sequenceNumber >= chunk.chunkCount) throw new Error('invalid sequence number');
    const stream = this.streams.get(chunk.streamId) ?? new Map<number, ChunkEnvelope>();
    stream.set(chunk.sequenceNumber, chunk);
    this.streams.set(chunk.streamId, stream);
    if (stream.size !== chunk.chunkCount) return null;
    const ordered = [...stream.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const total = ordered.reduce((n, c) => n + c.bytes.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of ordered) {
      out.set(c.bytes, offset);
      offset += c.bytes.byteLength;
    }
    this.streams.delete(chunk.streamId);
    return out;
  }
}
