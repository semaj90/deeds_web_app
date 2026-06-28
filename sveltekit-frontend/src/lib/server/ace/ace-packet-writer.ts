import {
  writeAcePacket,
  updateAcePacket,
  deleteAcePacket,
  type AceFullPacket,
} from './ace-packet-store.js';

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
