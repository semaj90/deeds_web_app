export interface MtpObservation {
  acceptanceEma: number;
  recentZeroAcceptStreak: number;
  contextTokens: number;
  batchSize: number;
  freeGpuBytes: number;
  draftLatencyMs?: number | null;
  verifyLatencyMs?: number | null;
}

export interface MtpStateDecision {
  enabled: boolean;
  draftLength: number;
  draftKvTier: 'FP16' | 'BF16' | 'Q8' | 'ISOQUANT_4' | 'ISOQUANT_3' | 'TURBOQUANT' | 'POLARQUANT' | 'EVICTABLE';
  targetKvTier: 'FP16' | 'BF16' | 'Q8';
  reason: string;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Adaptive speculation heuristic inspired by Tang's "do useful work in a compact
 * representation" principle. This is not Tang's recommendation theorem.
 * llama.cpp/TensorRT-LLM target verification remains authoritative.
 */
export function chooseMtpState(observed: MtpObservation): MtpStateDecision {
  const acceptance = clamp01(observed.acceptanceEma);
  if (observed.freeGpuBytes < 256 * 1024 * 1024) {
    return { enabled: false, draftLength: 0, draftKvTier: 'EVICTABLE', targetKvTier: 'Q8', reason: 'insufficient VRAM headroom for speculative state' };
  }
  if (observed.recentZeroAcceptStreak >= 3 || acceptance < 0.25) {
    return { enabled: false, draftLength: 0, draftKvTier: 'EVICTABLE', targetKvTier: 'Q8', reason: 'recent MTP utility is too low' };
  }

  const batchPenalty = Math.max(0, observed.batchSize - 1);
  const contextPenalty = observed.contextTokens > 32768 ? 1 : observed.contextTokens > 16384 ? 0.5 : 0;
  let draftLength = acceptance >= 0.8 ? 4 : acceptance >= 0.65 ? 3 : acceptance >= 0.45 ? 2 : 1;
  draftLength = Math.max(1, Math.floor(draftLength - batchPenalty * 0.5 - contextPenalty));

  const draftKvTier: MtpStateDecision['draftKvTier'] =
    observed.freeGpuBytes < 512 * 1024 * 1024 ? 'Q8' :
    acceptance >= 0.75 ? 'BF16' : 'ISOQUANT_4';

  return {
    enabled: true,
    draftLength,
    draftKvTier,
    targetKvTier: observed.freeGpuBytes < 512 * 1024 * 1024 ? 'Q8' : 'BF16',
    reason: 'bounded draft depth selected from observed acceptance, context, batch, and VRAM utility',
  };
}

export interface InferenceResidencyCandidate {
  id: string;
  reuseProbability: number;
  priorExecutionSuccess: number;
  byteCost: number;
  recency: number;
}

/** Prioritizes inference state residency; never changes logits or model identity. */
export function rankInferenceResidency(candidates: InferenceResidencyCandidate[]): InferenceResidencyCandidate[] {
  return [...candidates].sort((a, b) => {
    const score = (x: InferenceResidencyCandidate) =>
      0.4 * clamp01(x.reuseProbability) + 0.3 * clamp01(x.priorExecutionSuccess) + 0.2 * clamp01(x.recency) - 0.1 * Math.min(1, x.byteCost / (256 * 1024 * 1024));
    return score(b) - score(a) || a.id.localeCompare(b.id);
  });
}
