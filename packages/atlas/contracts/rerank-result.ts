/**
 * Rerank result contract for the Atlas retrieval pipeline.
 * All reranker implementations must produce this shape.
 */

import type { RerankRequest } from './rerank-request.js';

export interface RerankResultItem {
  packetKey: string;
  sourceRef: string;
  rerankScore: number;
  originalScore: number;
  rank: number;
  modelVersion: string;
}

export interface RerankResult {
  ranked: RerankResultItem[];
  modelVersion: string;
  fallbackReason?: string;
  durationMs: number;
}

export interface Reranker {
  rerank(req: RerankRequest): Promise<RerankResult>;
  readonly modelVersion: string;
}
