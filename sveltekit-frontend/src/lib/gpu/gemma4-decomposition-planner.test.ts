/**
 * Unit tests for Gemma4 Decomposition Planner
 * Tests fallback behavior (LLM services unavailable)
 */

import { describe, it, expect, vi } from 'vitest';
import { planQuery, extractKeywordsNaive } from './gemma4-decomposition-planner';

describe('Gemma4 Decomposition Planner', () => {
  it('should extract keywords from naive input', () => {
    const keywords = extractKeywordsNaive('How do I handle authentication errors?');
    expect(keywords).toContain('handle');
    expect(keywords).toContain('authentication');
  });

  it('should return valid DecomposedQuery structure', async () => {
    // Mock fetch to simulate Gemma4 unavailable
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Connection refused'))
    );

    const result = await planQuery({
      originalQuery: 'What is dependency injection?'
    });

    expect(result).toHaveProperty('originalQuery');
    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('subgoals');
    expect(result).toHaveProperty('reasoning');
    expect(Array.isArray(result.subgoals)).toBe(true);
  });

  it('should have at least one subgoal', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Connection refused'))
    );

    const result = await planQuery({
      originalQuery: 'Test query'
    });

    expect(result.subgoals.length).toBeGreaterThanOrEqual(1);
  });

  it('should assign valid IDs to subgoals', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Connection refused'))
    );

    const result = await planQuery({
      originalQuery: 'Test query'
    });

    result.subgoals.forEach((sg, idx) => {
      expect(sg.id).toBe(`sg-${idx + 1}`);
      expect(sg.priority).toBeGreaterThanOrEqual(0);
      expect(sg.priority).toBeLessThanOrEqual(1);
    });
  });

  it('should handle empty query', async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Connection refused'))
    );

    const result = await planQuery({
      originalQuery: ''
    });

    expect(result.originalQuery).toBe('');
    expect(result.subgoals.length).toBeGreaterThanOrEqual(1);
  });
});