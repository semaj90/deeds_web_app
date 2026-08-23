export const TEXTURE_LOD_RESIDENCY_SCHEMA = 'atlas.texture-lod-residency.v1' as const;

export type TextureLodSwapDecision =
  | { accepted: true; targetLod: number; requiredBytes: number; remainingBytes: number }
  | { accepted: false; reason: 'INVALID_TARGET' | 'BUDGET_EXCEEDED' | 'ALREADY_RESIDENT' };

export function decideTextureLodSwap(input: {
  currentLod: number;
  targetLod: number;
  availableLodCount: number;
  requiredBytes: number;
  usedBytes: number;
  budgetBytes: number;
}): TextureLodSwapDecision {
  if (!Number.isInteger(input.targetLod) || input.targetLod < 0 || input.targetLod >= input.availableLodCount) {
    return { accepted: false, reason: 'INVALID_TARGET' };
  }
  if (input.currentLod === input.targetLod) {
    return { accepted: false, reason: 'ALREADY_RESIDENT' };
  }
  if (![input.requiredBytes, input.usedBytes, input.budgetBytes].every(Number.isFinite) || input.requiredBytes < 0 || input.usedBytes < 0 || input.budgetBytes < 0) {
    return { accepted: false, reason: 'BUDGET_EXCEEDED' };
  }
  const remainingBytes = input.budgetBytes - input.usedBytes;
  if (input.requiredBytes > remainingBytes) {
    return { accepted: false, reason: 'BUDGET_EXCEEDED' };
  }
  return { accepted: true, targetLod: input.targetLod, requiredBytes: input.requiredBytes, remainingBytes };
}
