import { describe, expect, it } from 'vitest';

import { buildBudgetedContext, countTokens, enforceTokenBudget } from './token-budget.ts';

describe('token-budget', () => {
  it('counts tokens for non-empty text', () => {
    expect(countTokens('Gemma4 budget check')).toBeGreaterThan(0);
  });

  it('truncates input when the token budget is exceeded', () => {
    const input = 'alpha beta gamma delta epsilon '.repeat(200);
    const result = enforceTokenBudget(input, 20);

    expect(result.truncated).toBe(true);
    expect(result.tokens).toBeGreaterThan(20);
    expect(countTokens(result.text)).toBeLessThanOrEqual(20);
    expect(result.text.length).toBeLessThan(input.length);
  });

  it('wraps the budgeted context sections in tags', () => {
    const packet = buildBudgetedContext({
      system: 'system message',
      user: 'user message',
      acePacket: 'ace packet',
      toolResults: 'tool results',
      maxInputTokens: 99999,
    });

    expect(packet.text).toContain('<system>');
    expect(packet.text).toContain('<user>');
    expect(packet.text).toContain('<acePacket>');
    expect(packet.text).toContain('<toolResults>');
    expect(packet.overBudget).toBe(false);
    expect(packet.tokens).toBeGreaterThan(0);
  });
});