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
      astGrepRevision: '@ast-grep/napi:0.45.3',
      loadSource: async () => { calls += 1; return { source: '', sourceRevision: '' }; },
      sidecar: { astChunk: async () => { calls += 1; throw new Error('must not call'); } },
    });
    expect(await retriever.retrieve({ query: 'find function', limit: 10, filters: {} })).toEqual([]);
    expect(calls).toBe(0);
  });

  it('combines real AST-grep matches with validated 8095 Tree-sitter spans', async () => {
    const sourceRef = 'src/target.ts';
    const source = 'export function computeTarget(value: number) { return value + 1; }';
    const sourceBytes = Buffer.from(source, 'utf8');
    const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
    let sidecarCalls = 0;
    const retriever = createLiveStructuralLaneRetrieverV1({
      workspaceRevision: 'sha256:workspace-current',
      astGrepRevision: '@ast-grep/napi:0.45.3',
      candidateEntries: [{
        candidateOrdinal: 7,
        canonicalId: 'symbol-version:7',
        packetKey: 'packet:7',
        sourceRef,
        sourceRevision,
        workspaceRevision: 'sha256:workspace-current',
      }],
      loadSource: async () => ({ source, sourceRevision }),
      sidecar: {
        astChunk: async (request) => {
          sidecarCalls += 1;
          expect(request.sourceRevision).toBe(sourceRevision);
          return {
            schema: 'atlas.ast.evidence.v1',
            engine: 'treesitter-chunker',
            engine_version: 'fixture-1',
            language: 'typescript',
            file_path: sourceRef,
            source_revision: sourceRevision,
            chunks: [{
              upstream_node_id: 'node:7',
              upstream_file_id: 'file:7',
              upstream_chunk_id: 'chunk:7',
              node_type: 'function_declaration',
              kind: 'function',
              name: 'computeTarget',
              parent_route: [],
              start_byte: 0,
              end_byte: sourceBytes.length,
              start_line: 1,
              start_column: 0,
              end_line: 1,
              end_column: sourceBytes.length,
              calls: [],
              imports: [],
              exports: [],
            }],
            edges: [],
            diagnostics: [],
            syntax_status: 'CLEAN',
          };
        },
      },
    });

    const candidates = await retriever.retrieve({
      query: 'find function computeTarget',
      limit: 5,
      filters: { sourceRefs: [sourceRef] },
    });

    expect(sidecarCalls).toBe(1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ packetKey: 'packet:7', lane: 'ast', sourceRevision });
  });

  it('rejects AST-grep matches without a native Tree-sitter identity join', async () => {
    const sourceRef = 'src/target.ts';
    const source = 'export function computeTarget() { return 1; }';
    const sourceRevision = `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
    const retriever = createLiveStructuralLaneRetrieverV1({
      workspaceRevision: 'sha256:workspace-current',
      astGrepRevision: '@ast-grep/napi:0.45.3',
      candidateEntries: [{
        candidateOrdinal: 7,
        canonicalId: 'symbol-version:7',
        packetKey: 'packet:7',
        sourceRef,
        sourceRevision,
        workspaceRevision: 'sha256:workspace-current',
      }],
      loadSource: async () => ({ source, sourceRevision }),
      sidecar: {
        astChunk: async () => ({
          schema: 'atlas.ast.evidence.v1',
          engine: 'treesitter-chunker',
          engine_version: 'fixture-1',
          language: 'typescript',
          file_path: sourceRef,
          source_revision: sourceRevision,
          chunks: [],
          edges: [],
          diagnostics: [],
          syntax_status: 'CLEAN',
        }),
      },
    });

    await expect(retriever.retrieve({
      query: 'find function computeTarget',
      limit: 5,
      filters: { sourceRefs: [sourceRef] },
    })).resolves.toEqual([]);
  });

  it('does not call 8095 when loaded source bytes do not match the candidate revision', async () => {
    const sourceRef = 'src/target.ts';
    const staleSource = 'export function computeTarget() { return 1; }';
    const currentSource = 'export function computeTarget() { return 2; }';
    const sourceRevision = `sha256:${createHash('sha256').update(staleSource, 'utf8').digest('hex')}`;
    let sidecarCalls = 0;
    const retriever = createLiveStructuralLaneRetrieverV1({
      workspaceRevision: 'sha256:workspace-current',
      astGrepRevision: '@ast-grep/napi:0.45.3',
      candidateEntries: [{
        candidateOrdinal: 7,
        canonicalId: 'symbol-version:7',
        packetKey: 'packet:7',
        sourceRef,
        sourceRevision,
        workspaceRevision: 'sha256:workspace-current',
      }],
      loadSource: async () => ({ source: currentSource, sourceRevision }),
      sidecar: {
        astChunk: async () => {
          sidecarCalls += 1;
          throw new Error('stale source must not reach the parser');
        },
      },
    });

    await expect(retriever.retrieve({
      query: 'find function computeTarget',
      limit: 5,
      filters: { sourceRefs: [sourceRef] },
    })).resolves.toEqual([]);
    expect(sidecarCalls).toBe(0);
  });
});
