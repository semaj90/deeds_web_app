import type Redis from 'ioredis';
import type { AcePacketV3 } from '@deeds/parent-atlas';
import {
  writeAcePacket,
  updateAcePacket,
  deleteAcePacket,
  type AceFullPacket,
} from './ace-packet-store.js';
import {
  writeAcePacketV3ToBitfrostV1,
  type AcePacketV3BitfrostWriteV1,
} from '$lib/server/atlas/cache/bitfrost-residency-warming-v1.js';
import type { AceBitfrostCacheIdentityV1 } from '$lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.js';

export interface AcePacketWriterOptions {
  ttl?: number;
  asLatest?: boolean;
}

export interface PacketPersistResult {
  packet: AceFullPacket;
  packetId: string;
}

export class AcePacketWriter {
  constructor(private readonly options: AcePacketWriterOptions = {}) {}

  /** Explicit opt-in disposable cache write; this never writes canonical packet state. */
  async writeRevisionQualifiedV3ToBitfrost(
    redis: Pick<Redis, 'set'>,
    input: {
      packet: AcePacketV3;
      cacheIdentity: AceBitfrostCacheIdentityV1;
      embedAllowedPacketKeys: ReadonlySet<string>;
      ttlSeconds?: number;
    },
  ): Promise<AcePacketV3BitfrostWriteV1> {
    return writeAcePacketV3ToBitfrostV1(redis, input);
  }

  async write(packet: Omit<AceFullPacket, 'packet_id' | 'created_at'>): Promise<PacketPersistResult> {
    const persisted = await writeAcePacket(packet, this.options);
    return { packet: persisted, packetId: persisted.packet_id };
  }

  async update(
    packetId: string,
    patch: Partial<Pick<AceFullPacket, 'prompt_context' | 'ranked_cards' | 'cache_hit' | 'latency_ms' | 'degraded'>>
  ): Promise<AceFullPacket | null> {
    return updateAcePacket(packetId, patch);
  }

  async delete(packetId: string): Promise<boolean> {
    return deleteAcePacket(packetId);
  }
}

export function createAcePacketWriter(options: AcePacketWriterOptions = {}): AcePacketWriter {
  return new AcePacketWriter(options);
}
