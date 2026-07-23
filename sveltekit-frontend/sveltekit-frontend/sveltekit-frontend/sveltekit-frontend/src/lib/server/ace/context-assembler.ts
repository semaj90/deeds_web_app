export interface ACEPacket {
  packet_key: string;
  source_ref: string;
  summary: string;
  token_budget: number;
}

export class ACEContextAssembler {
  async assemble(candidates: any[], maxTokens: number = 4800): Promise<ACEPacket> {
    return {
      packet_key: `ace:${Date.now()}`,
      source_ref: candidates[0]?.source_ref || 'unknown',
      summary: candidates.map((c) => c.source_ref).join(', '),
      token_budget: maxTokens,
    };
  }
}

export function getACEContextAssembler(): ACEContextAssembler {
  return new ACEContextAssembler();
}
