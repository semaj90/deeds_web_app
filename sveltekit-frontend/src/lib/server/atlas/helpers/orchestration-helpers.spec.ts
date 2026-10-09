import { describe, it, expect } from 'vitest';
import { ContextWindowCalculator } from './context-window-calculator.js';
import { TokenRemappingStrategy } from './token-remapping-strategy.js';

describe('Master Agentic Orchestration Helpers', () => {
  describe('ContextWindowCalculator', () => {
    const calc = new ContextWindowCalculator();

    it('allocates context budget accurately within normal boundaries', () => {
      const budget = calc.calculateTokenBudget(500, 1500, 65536, 2000);
      expect(budget.totalReserved).toBe(4000);
      expect(budget.availableForContext).toBe(61536);
      expect(budget.recommendedTopK).toBe(Math.floor(61536 / 200));
      expect(budget.recommendedMaxSummary).toBe(512);
    });

    it('bounds headroom when query and system prompt approach context capacity', () => {
      const budget = calc.calculateTokenBudget(30000, 34000, 65536, 2000);
      expect(budget.availableForContext).toBe(0);
      expect(budget.recommendedTopK).toBe(1);
      expect(budget.recommendedMaxSummary).toBe(0);
    });
  });

  describe('TokenRemappingStrategy', () => {
    const strategy = new TokenRemappingStrategy();

    it('returns full allocation when input fits within context window', () => {
      const res = strategy.adaptContextForGemma4(2000, 1000, 65536);
      expect(res.strategy).toBe('full');
      expect(res.compressionRatio).toBe(1.0);
      expect(res.remappedInputTokens).toBe(2000);
      expect(res.remappedCompletionTokens).toBe(1000);
    });

    it('applies truncation strategy when combined tokens exceed context window', () => {
      const res = strategy.adaptContextForGemma4(60000, 10000, 65536);
      expect(res.strategy).toBe('truncate');
      expect(res.remappedInputTokens).toBeLessThanOrEqual(Math.floor(65536 * 0.75));
      expect(res.compressionRatio).toBeLessThan(1.0);
    });
  });
});
