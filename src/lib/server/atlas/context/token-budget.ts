export function estimateTokenBudget(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

