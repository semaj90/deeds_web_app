import {
  readAcePacketById,
  readLatestAcePacket,
  readAcePacketBySourceRef,
  readAcePacketByCluster,
  readAcePacketsByFeature,
  readAcePacketByTask,
  type AceFullPacket,
} from './ace-packet-store.js';

export interface AcePacketReaderOptions {
  source?: string;
}

export interface PacketLoadResult {
  packet: AceFullPacket | null;
  source: string;
}

export class AcePacketReader {
  constructor(private readonly options: AcePacketReaderOptions = {}) {}

  /** Read a v3 packet only through the exact revision/checksum BitFrost owner. */
  async readRevisionQualifiedV3FromBitfrost(
    redis: Pick<Redis, 'get'>,
    input: {
      cacheIdentity: AceBitfrostCacheIdentityV1;
      expected: AceCacheExpectationV3;
      embedAllowedPacketKeys: ReadonlySet<string>;
    },
  ): Promise<AcePacketV3BitfrostReadV1> {
    return readAcePacketV3FromBitfrostV1(redis, input);
  }

  async readById(packetId: string): Promise<PacketLoadResult> {
    return {
      packet: await readAcePacketById(packetId),
      source: this.options.source ?? 'redis',
    };
  }

  async readLatest(): Promise<PacketLoadResult> {
    return {
      packet: await readLatestAcePacket(),
      source: this.options.source ?? 'redis',
    };
  }

  async readBySourceRef(sourceRef: string): Promise<PacketLoadResult> {
    return {
      packet: await readAcePacketBySourceRef(sourceRef),
      source: this.options.source ?? 'redis',
    };
  }

  async readByCluster(row: number, col: number): Promise<PacketLoadResult> {
    return {
      packet: await readAcePacketByCluster(row, col),
      source: this.options.source ?? 'redis',
    };
  }

  async readByFeature(featureId: string, limit = 5): Promise<AceFullPacket[]> {
    return readAcePacketsByFeature(featureId, limit);
  }

  async readByTask(taskId: string): Promise<PacketLoadResult> {
    return {
      packet: await readAcePacketByTask(taskId),
      source: this.options.source ?? 'redis',
    };
  }
}

export function createAcePacketReader(options: AcePacketReaderOptions = {}): AcePacketReader {
  return new AcePacketReader(options);
}
import type Redis from 'ioredis';
import type { AceCacheExpectationV3 } from '@deeds/parent-atlas';
import {
  readAcePacketV3FromBitfrostV1,
  type AcePacketV3BitfrostReadV1,
} from '$lib/server/atlas/cache/bitfrost-residency-warming-v1.js';
import type { AceBitfrostCacheIdentityV1 } from '$lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.js';
