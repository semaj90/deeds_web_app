import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createLiveStructuralLaneRetrieverV1,
  resolveStructuralLanguageV1,
  sha256Utf8ByteSpanV1,
} from './live-structural-lane-provider.js';

describe('live structural lane provider', () => {
  it('hashes exact UTF-8 byte spans after multibyte characters', () => {
    const source = 'const π = "🛰️";';
    const bytes = Buffer.from(source, 'utf8');
    const start = bytes.indexOf(Buffer.from('"🛰️"', 'utf8'));
    const end = start + Buffer.byteLength('"🛰️"', 'utf8');

    expect(sha256Utf8ByteSpanV1(source, start, end)).toBe(
      createHash('sha256').update(Buffer.from('"🛰️"', 'utf8')).digest('hex'),
    );
  });

  it('rejects empty, out-of-range, and split-codepoint byte spans', () => {
    const source = 'π🛰️';

    expect(sha256Utf8ByteSpanV1(source, 0, 0)).toBeNull();
    expect(sha256Utf8ByteSpanV1(source, -1, 2)).toBeNull();
    expect(sha256Utf8ByteSpanV1(source, 0, 99)).toBeNull();
    expect(sha256Utf8ByteSpanV1(source, 1, 2)).toBeNull();
    expect(sha256Utf8ByteSpanV1(source, 2, 3)).toBeNull();
  });

  it('uses the sidecar language vocabulary and abstains on unsupported extensions', () => {
    expect(resolveStructuralLanguageV1('src/file.tsx')).toBe('tsx');
    expect(resolveStructuralLanguageV1('src/file.py')).toBe('python');
    expect(resolveStructuralLanguageV1('src/file.pyi')).toBe('python');
    expect(resolveStructuralLanguageV1('src/file.rs')).toBe('rust');
    expect(resolveStructuralLanguageV1('src/file.go')).toBe('go');
    expect(resolveStructuralLanguageV1('src/file.java')).toBe('java');
    expect(resolveStructuralLanguageV1('src/file.yaml')).toBeNull();
    expect(resolveStructuralLanguageV1('src/file')).toBeNull();
  });

  it('fails closed without an explicit source allowlist', async () => {
    let calls = 0;
    const retriever = createLiveStructuralLaneRetrieverV1({
      workspaceRevision: 'sha256:workspace', candidateEntries: [],
      loadSource: async () => { calls += 1; return { source: '', sourceRevision: '' }; },
      sidecar: { astChunk: async () => { calls += 1; throw new Error('must not call'); } },
    });
    expect(await retriever.retrieve({ query: 'find function', limit: 10, filters: {} })).toEqual([]);
    expect(calls).toBe(0);
  });
});
