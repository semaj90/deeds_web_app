import { describe, expect, it } from 'vitest';
import { extractAstFeatures } from './ast-grep-extractor.js';

const code = `export function rankCandidates(x: number) {\n  return x + 1;\n}\n`;

const context = {
  sourceRef: 'src/rank.ts',
  workspaceRevision: 'workspace:abc',
  sourceRevision: 'source:def',
  providerRevision: 'ast-grep:0.44.0',
  producerRevision: 'atlas:ast-grep-lineage:v1',
};

describe('ast-grep extractor lineage', () => {
  it('keeps legacy callers readable without inventing revisions', async () => {
    const rows = await extractAstFeatures(code, 'ts');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.lineageQualified).toBe(false);
    expect(rows[0]?.evidenceKey).toBeUndefined();
  });

  it('emits deterministic revision-qualified evidence keys when context is supplied', async () => {
    const first = await extractAstFeatures(code, 'ts', context);
    const second = await extractAstFeatures(code, 'ts', context);

    expect(first[0]?.lineageQualified).toBe(true);
    expect(first[0]?.sourceRevision).toBe(context.sourceRevision);
    expect(first[0]?.evidenceKey).toMatch(/^astgrep:[a-f0-9]{64}$/);
    expect(first[0]?.evidenceKey).toBe(second[0]?.evidenceKey);
  });

  it('changes evidence identity when source revision changes', async () => {
    const first = await extractAstFeatures(code, 'ts', context);
    const second = await extractAstFeatures(code, 'ts', {
      ...context,
      sourceRevision: 'source:changed',
    });

    expect(first[0]?.evidenceKey).not.toBe(second[0]?.evidenceKey);
  });
});
