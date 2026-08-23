import type { FeatureEnvelope } from '../contracts/feature-envelope';

export interface PacketWriter {
  write(packet: FeatureEnvelope): Promise<void>;
}

export function createNoopPacketWriter(): PacketWriter {
  return {
    async write(): Promise<void> {
      throw new Error('Packet writer not wired yet.');
    },
  };
}

