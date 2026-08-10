import type { TileDirectory } from './tile-directory';
import type { TensorPacketReader } from './packet-reader';
import type { HotMetadataCache } from './bitfrost-valkey-contract';

export interface GpuTileBackend {
  has(tileKey: string): Promise<boolean>;
  promote(tileKey: string): Promise<void>;
  demote(tileKey: string): Promise<void>;
  exactCosineTopK(tileKey: string, query: Float32Array, k: number): Promise<{ indices: number[]; scores: number[] }>;
}

export interface TensorRuntimeDeps {
  directory: TileDirectory;
  packetReader: TensorPacketReader;
  hotCache?: HotMetadataCache;
  gpu: GpuTileBackend;
}

export class TensorRuntime {
  constructor(private readonly deps: TensorRuntimeDeps) {}

  async ensureGpu(tileKey: string): Promise<void> {
    if (!(await this.deps.gpu.has(tileKey))) await this.deps.gpu.promote(tileKey);
  }
}
