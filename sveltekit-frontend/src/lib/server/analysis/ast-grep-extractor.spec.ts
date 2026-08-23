import { describe, expect, it } from 'vitest';
import { extractAstFeatures } from './ast-grep-extractor.js';

describe('ast-grep evidence provenance', () => {
  it('keeps byte spans and emits a revision-qualified evidence key', async () => {
    const features = await extractAstFeatures(
      'const café = () => 1;\r\n',
      'typescript',
      {
        sourceRef: 'file:example.ts',
        sourceRevision: 'git:abc',
        providerRevision: 'ast-grep:napi-v1',
      },
    );
    const arrow = features.find((feature) => feature.type === 'ast_arrow');
    expect(arrow?.byteStart).toBeTypeOf('number');
    expect(arrow?.byteEnd).toBeTypeOf('number');
    expect(arrow?.provenance?.sourceRevision).toBe('git:abc');
    expect(arrow?.evidenceKey).toMatch(/^ast:[a-f0-9]{64}$/);
  });
});
