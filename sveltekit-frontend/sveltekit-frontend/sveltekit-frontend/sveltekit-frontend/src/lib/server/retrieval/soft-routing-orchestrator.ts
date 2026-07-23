export interface RetrievalCandidate {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  qdrant_score?: number;
  timing: { qdrant_ms?: number; turbovec_ms?: number };
}

export class SoftRoutingOrchestrator {
  async search(embedding: number[], query: string): Promise<RetrievalCandidate[]> {
    return [
      {
        packet_key: 'test:1',
        source_ref: 'src/test.ts',
        feature_id: 'test',
        qdrant_score: 0.95,
        timing: { qdrant_ms: 50 },
      },
    ];
  }
}

export function getSoftRoutingOrchestrator(): SoftRoutingOrchestrator {
  return new SoftRoutingOrchestrator();
}
