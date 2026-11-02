import { describe, it, expect } from 'vitest';
import { CONTEXT_WINDOW_PROFILES, ContextWindowCalculator } from './context-window-calculator.js';
import { TokenRemappingStrategy, TURBO_CTX_PROFILES } from './token-remapping-strategy.js';

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

    it.each([
      ['turbo16k', 16_384],
      ['turbo65k', 65_536],
    ] as const)('budgets summaries against the %s TurboCtx profile', (profile, contextTokens) => {
      const budget = calc.calculateProfileBudget(profile, 500, 1_500);

      expect(CONTEXT_WINDOW_PROFILES[profile]).toBe(contextTokens);
      expect(budget.contextWindowSize).toBe(contextTokens);
      expect(budget.availableForContext).toBe(contextTokens - 4_000);
      expect(budget.recommendedMaxSummary).toBe(512);
    });
  });

  describe('TokenRemappingStrategy', () => {
    const strategy = new TokenRemappingStrategy();

    it.each([
      ['turbo16k', 16_384],
      ['turbo65k', 65_536],
    ] as const)('remaps against the %s TurboCtx profile', (profile, contextTokens) => {
      const result = strategy.adaptContextForProfile(profile, contextTokens, 4_096);

      expect(TURBO_CTX_PROFILES[profile]).toBe(contextTokens);
      expect(result.strategy).toBe('truncate');
      expect(result.remappedInputTokens).toBeLessThanOrEqual(Math.floor(contextTokens * 0.75));
      expect(result.remappedCompletionTokens).toBeLessThanOrEqual(contextTokens - Math.floor(contextTokens * 0.75));
    });

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
