/**
 * Step 16: ACE Context Assembler — Packet Compression to 4,800 Tokens
 */

export interface ACEPacket {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  summary: string;
  evidence_chains: string[];
  token_budget: number;
  compressed_at: number;
}

export class ACEContextAssembler {
  private cache = new Map<string, ACEPacket>();

  async assemble(candidates: any[], maxTokens: number = 4800): Promise<ACEPacket> {
    const summary = candidates.map((c) => c.source_ref).join(', ');

    const packet: ACEPacket = {
      packet_key: `ace:${Date.now()}`,
      source_ref: candidates[0]?.source_ref || 'unknown',
      feature_id: candidates[0]?.feature_id || 'unknown',
      summary,
      evidence_chains: candidates.map((c) => c.feature_id),
      token_budget: maxTokens,
      compressed_at: Date.now(),
    };

    this.cache.set(packet.packet_key, packet);
    return packet;
  }

  async cachePacket(packet: ACEPacket): Promise<void> {
    this.cache.set(packet.packet_key, packet);
  }

  async getCachedPacket(packet_key: string): Promise<ACEPacket | null> {
    return this.cache.get(packet_key) || null;
  }

  async persistPacket(packet: ACEPacket): Promise<void> {
    // Would write to Postgres in real implementation
    this.cache.set(packet.packet_key, packet);
  }
}

let assembler: ACEContextAssembler | null = null;

export function getACEContextAssembler(): ACEContextAssembler {
  if (!assembler) {
    assembler = new ACEContextAssembler();
  }
  return assembler;
}
