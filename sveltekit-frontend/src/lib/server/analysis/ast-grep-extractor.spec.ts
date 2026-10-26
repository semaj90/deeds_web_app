import { describe, expect, it } from 'vitest';
import { extractAstFeatures } from './ast-grep-extractor.js';

describe('ast-grep evidence provenance', () => {
  it('does not parse unsupported language hints as TypeScript', async () => {
    await expect(extractAstFeatures('def helper(value):\n    return value\n', 'python')).resolves.toEqual([]);
    await expect(extractAstFeatures('function helper() {}', 'unknown-language')).resolves.toEqual([]);
  });

  it('recognizes explicit JavaScript and TypeScript language identifiers and paths', async () => {
    const source = 'export function helper() { return 1; }';
    await expect(extractAstFeatures(source, 'python')).resolves.toEqual([]);
    await expect(extractAstFeatures(source, 'javascript')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'helper', type: 'ast_function' })]),
    );
    await expect(extractAstFeatures(source, 'src/helper.ts')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'helper', type: 'ast_function' })]),
    );
  });

  it('recognizes LSP React language identifiers without broad fallback', async () => {
    const tsx = 'export function Helper() { return <div />; }';
    const jsx = 'export function Helper() { return <div />; }';

    await expect(extractAstFeatures(tsx, 'typescriptreact')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Helper', type: 'ast_function' })]),
    );
    await expect(extractAstFeatures(jsx, 'javascriptreact')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Helper', type: 'ast_function' })]),
    );
  });

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
