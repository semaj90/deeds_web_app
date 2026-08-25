import { describe, expect, it } from 'vitest';
import { classifyCodeSymbolProvenance, provenanceScore } from './code-symbol-provenance.js';

describe('classifyCodeSymbolProvenance', () => {
  it('returns unknown when no evidence is provided at all — never guesses', () => {
    expect(classifyCodeSymbolProvenance({})).toBe('unknown');
  });

  it('classifies a Co-Authored-By: Claude trailer as ai_generated', () => {
    const result = classifyCodeSymbolProvenance({
      commitMessage: 'Add feature X\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>',
    });
    expect(result).toBe('ai_generated');
  });

  it('classifies other known AI co-authorship trailers as ai_generated', () => {
    expect(classifyCodeSymbolProvenance({
      commitMessage: 'Fix bug\n\nCo-authored-by: GPT-4 <bot@openai.com>',
    })).toBe('ai_generated');
    expect(classifyCodeSymbolProvenance({
      commitMessage: 'Refactor\n\nCo-Authored-By: Copilot <copilot@github.com>',
    })).toBe('ai_generated');
  });

  it('classifies a known AI-tooling author email as ai_generated even without a trailer', () => {
    const result = classifyCodeSymbolProvenance({ authorEmail: 'noreply@anthropic.com' });
    expect(result).toBe('ai_generated');
  });

  it('classifies a plain human commit (no AI markers) as code, not unknown', () => {
    const result = classifyCodeSymbolProvenance({
      commitMessage: 'Fix off-by-one error in pagination',
      authorName: 'Jane Doe',
      authorEmail: 'jane@example.com',
    });
    expect(result).toBe('code');
  });

  it('does not overload user_note for human-authored code', () => {
    const result = classifyCodeSymbolProvenance({ authorName: 'Jane Doe' });
    expect(result).not.toBe('user_note');
    expect(result).toBe('code');
  });

  it('is case-insensitive for AI trailer matching', () => {
    const result = classifyCodeSymbolProvenance({
      commitMessage: 'co-authored-by: CLAUDE <noreply@anthropic.com>',
    });
    expect(result).toBe('ai_generated');
  });
});

describe('provenanceScore', () => {
  it('returns undefined for unknown — never fabricates a neutral score', () => {
    expect(provenanceScore('unknown')).toBeUndefined();
  });

  it('defaults to favoring code (human-authored)', () => {
    expect(provenanceScore('code')).toBe(1);
    expect(provenanceScore('ai_generated')).toBe(0);
  });

  it('respects an explicit favor override', () => {
    expect(provenanceScore('ai_generated', 'ai_generated')).toBe(1);
    expect(provenanceScore('code', 'ai_generated')).toBe(0);
  });
});
