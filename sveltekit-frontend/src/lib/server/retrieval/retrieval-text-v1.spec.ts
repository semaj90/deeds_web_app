import { describe, expect, it } from 'vitest';
import { buildRetrievalTextV1, RETRIEVAL_TEXT_MAX_SOURCE_CHARS_V1 } from './retrieval-text-v1.js';

const input = {
  canonicalChunkId: 'chunk:1', packetKey: 'packet:1', sourceRef: 'src/a.ts',
  sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace',
  repositoryRelativePath: 'src\\a.ts', symbolName: 'search', symbolKind: 'function',
  summary: 'bounded search helper', keywords: ['search', 'search'], conceptIds: ['concept:retrieval'],
  imports: ['z'], exports: ['search'], calls: ['query'], sourceText: 'const value = 1;\n',
};

describe('RetrievalTextV1', () => {
  it('builds a deterministic revisioned text representation', () => {
    const first = buildRetrievalTextV1(input);
    const second = buildRetrievalTextV1(input);
    expect(first).toEqual(second);
    expect(first.text).toContain('path: src/a.ts');
    expect(first.templateRevision).toBe('atlas.retrieval-text.v1');
    expect(first.canonicalAuthority).toBe(false);
    expect(first.writesPerformed).toBe(false);
  });

  it('normalizes unordered feature lists and changes checksum when grounded content changes', () => {
    const first = buildRetrievalTextV1(input);
    const reordered = buildRetrievalTextV1({ ...input, keywords: ['search', 'search'], imports: ['z'] });
    expect(reordered.textChecksum).toBe(first.textChecksum);
    expect(buildRetrievalTextV1({ ...input, sourceRevision: 'sha256:other' }).textChecksum).toBe(first.textChecksum);
    expect(buildRetrievalTextV1({ ...input, summary: 'different grounded summary' }).textChecksum).not.toBe(first.textChecksum);
  });

  it('bounds source text and fails closed for missing identity', () => {
    const longSource = 'x'.repeat(RETRIEVAL_TEXT_MAX_SOURCE_CHARS_V1 + 1);
    const bounded = buildRetrievalTextV1({ ...input, sourceText: longSource });
    expect(bounded.sourceTextTruncated).toBe(true);
    expect(bounded.text).toContain('x'.repeat(RETRIEVAL_TEXT_MAX_SOURCE_CHARS_V1));
    expect(() => buildRetrievalTextV1({ ...input, sourceRevision: '' })).toThrow(/sourceRevision/);
  });
});
