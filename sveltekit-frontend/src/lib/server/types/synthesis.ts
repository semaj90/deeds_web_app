/**
 * Synthesis pipeline type contracts.
 * Covers request/response shapes for the LLM synthesis stage,
 * citation attribution, and GRPO reward scoring.
 */

import type { ACEContextResult } from './ace.js';

export interface SynthesisRequest {
  query: string;
  userId: string;
  context: ACEContextResult;
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  grpoEnabled?: boolean;
}

export interface SynthesisCitation {
  file_path?: string;
  chunk_index?: number;
  source: string;
  score?: number;
  excerpt?: string;
}

export interface SynthesisResponse {
  answer: string;
  citations: SynthesisCitation[];
  cacheHit: 'l1' | 'l2' | 'miss';
  latencyMs: number;
  confidence: number;
  model: string;
  grpoRewardScore?: number;
}

export interface RewardScoringRequest {
  generatedEmbeddings: Float32Array;
  referenceEmbeddings: Float32Array;
  n: number;
  dim: number;
}

export interface RewardScoringResult {
  scores: Float32Array;
  meanScore: number;
  source: 'gpu' | 'cpu';
}
