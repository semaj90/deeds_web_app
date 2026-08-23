import { describe, expect, it } from 'vitest';

import type { AstProvider } from './graphify-structural-materializer.js';
import { GraphifyStructuralMaterializer } from './graphify-structural-materializer.js';
import { createNodeTreeSitterAstProvider } from './node-tree-sitter-ast-provider.js';

describe('Node Tree-sitter AstProvider challenger boundary', () => {
  it('accepts a challenger through the shared AstProvider interface without granting canonical promotion', async () => {
    const challenger: AstProvider = {
      async materialize(input) {
        return {
          provider: 'node-tree-sitter-challenger',
          status: 'PROVEN',
          diagnostics: [],
          evidence: {
            schema: 'atlas.ast.evidence.v1',
            engine: 'node-tree-sitter-challenger',
            engine_version: 'fixture',
            language: 'typescript',
            file_path: input.sourceRef,
            source_revision: input.sourceRevision,
            chunks: [{
              node_type: 'function_declaration',
              kind: 'function',
              name: 'alpha',
              parent_route: [],
              parent_context: null,
              start_byte: 0,
              end_byte: input.source.length,
              start_line: 0,
              start_column: 0,
              end_line: 0,
              end_column: input.source.length,
              calls: [],
              imports: [],
              exports: [],
            }],
            edges: [],
            diagnostics: [],
            error_tag: null,
            syntax_status: 'CLEAN',
          },
        };
      },
    };

    const result = await new GraphifyStructuralMaterializer(challenger).materialize({
      sourceRef: 'src/alpha.ts',
      sourceRevision: null,
      sourceVersionAnchor: 'content:fixture',
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
      language: 'typescript',
      source: 'export function alpha(){ return 1; }',
    });

    expect(result.provider).toBe('node-tree-sitter-challenger');
    expect(result.status).toBe('PROVEN');
    expect(result.provenanceReadiness.status).toBe('COMPATIBILITY_ONLY');
    expect(result.provenanceReadiness.canonicalPromotionAllowed).toBe(false);
    expect(result.diagnostics).toContain('STRUCTURAL_PROVENANCE_COMPATIBILITY_ONLY');
    expect(result.persistence).toBe('NOT_ATTEMPTED');
  });

  it('does not silently fall back to 8095 when the challenger fails', async () => {
    const challenger: AstProvider = {
      async materialize() {
        return {
          provider: 'node-tree-sitter-challenger',
          status: 'FAILED',
          diagnostics: ['NODE_TREE_SITTER_CHALLENGER_FAILURE:fixture'],
          errorTag: 'NODE_TREE_SITTER_CHALLENGER_FAILURE',
        };
      },
    };

    const result = await new GraphifyStructuralMaterializer(challenger).materialize({
      sourceRef: 'src/broken.ts',
      sourceRevision: null,
      sourceVersionAnchor: 'content:fixture',
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
      language: 'typescript',
      source: 'export function broken( {',
    });

    expect(result.provider).toBe('node-tree-sitter-challenger');
    expect(result.status).toBe('FAILED');
    expect(result.evidence).toBeNull();
    expect(result.normalized).toBeNull();
    expect(result.provenanceReadiness.canonicalPromotionAllowed).toBe(false);
    expect(result.fallback).toBe('NONE');
  });

  it('emits UTF-8 byte spans when CRLF and non-ASCII text precede a declaration', async () => {
    const source = 'const café = "é";\r\nfunction flushErrors() { return café; }\r\n';
    const provider = createNodeTreeSitterAstProvider();
    const result = await provider.materialize({
      sourceRef: 'src/utf8.ts',
      sourceRevision: null,
      sourceVersionAnchor: 'content:utf8-fixture',
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
      language: 'typescript',
      source,
    });

    const functionChunk = result.evidence?.chunks.find((chunk) => chunk.name === 'flushErrors');
    expect(functionChunk).toBeDefined();
    expect(functionChunk?.start_byte).toBe(Buffer.byteLength(source.slice(0, source.indexOf('function flushErrors')), 'utf8'));
    const sourceBytes = Buffer.from(source, 'utf8');
    expect(sourceBytes.subarray(functionChunk!.start_byte, functionChunk!.end_byte).toString('utf8')).toContain('function flushErrors');
  });

  it('emits named symbols for ambient function signatures and TS namespace declarations', async () => {
    // Regression test for the NAMED_SYMBOL_MISSING_LEFT class found in
    // docs/reports/node-tree-sitter-provider-parity-corpus-v2.json --
    // function_signature and internal_module node types were previously
    // absent from DECLARATION_KINDS entirely, so this provider emitted no
    // chunk at all for `declare function foo(): void` or `namespace X {}`.
    const source = [
      'declare function lexer(input: string): unknown;',
      'namespace App {',
      '  interface Locals { userId: string; }',
      '}',
      '',
    ].join('\n');
    const provider = createNodeTreeSitterAstProvider();
    const result = await provider.materialize({
      sourceRef: 'src/ambient.d.ts',
      sourceRevision: null,
      sourceVersionAnchor: 'content:ambient-fixture',
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
      language: 'typescript',
      source,
    });

    const chunks = result.evidence?.chunks ?? [];
    const lexerChunk = chunks.find((chunk) => chunk.name === 'lexer');
    expect(lexerChunk).toBeDefined();
    expect(lexerChunk?.node_type).toBe('function_signature');
    expect(lexerChunk?.kind).toBe('FUNCTION');

    const namespaceChunk = chunks.find((chunk) => chunk.name === 'App');
    expect(namespaceChunk).toBeDefined();
    expect(namespaceChunk?.node_type).toBe('internal_module');
    expect(namespaceChunk?.kind).toBe('NAMESPACE');
  });

  it('emits named symbols for ambient interface method signatures', async () => {
    // Regression test: same NAMED_SYMBOL_MISSING_LEFT class as the ambient
    // function signature test above, for method_signature nodes
    // (`interface Foo { bar(): void; }`).
    const source = [
      'interface Accelerometer {',
      '  requestAdapter(): Promise<void>;',
      '}',
      '',
    ].join('\n');
    const provider = createNodeTreeSitterAstProvider();
    const result = await provider.materialize({
      sourceRef: 'src/ambient-method.d.ts',
      sourceRevision: null,
      sourceVersionAnchor: 'content:ambient-method-fixture',
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
      language: 'typescript',
      source,
    });

    const chunks = result.evidence?.chunks ?? [];
    const methodChunk = chunks.find((chunk) => chunk.name === 'requestAdapter');
    expect(methodChunk).toBeDefined();
    expect(methodChunk?.node_type).toBe('method_signature');
    expect(methodChunk?.kind).toBe('METHOD');
  });

  it('does not emit a destructuring pattern as a symbol name', async () => {
    // Regression test for the NAMED_SYMBOL_MISSING_RIGHT class found in
    // docs/reports/node-tree-sitter-provider-parity-corpus-v2.json (60/66
    // files) -- `const { firstName, lastName } = user;` previously emitted
    // a chunk whose `name` was the literal pattern text
    // "{ firstName, lastName }", which is not a valid symbol name; the
    // sidecar correctly emits no named symbol for these.
    const source = 'const { firstName, lastName } = user;\n';
    const provider = createNodeTreeSitterAstProvider();
    const result = await provider.materialize({
      sourceRef: 'src/destructure.ts',
      sourceRevision: null,
      sourceVersionAnchor: 'content:destructure-fixture',
      sourceRevisionAuthority: 'CONTENT_ANCHOR_ONLY',
      language: 'typescript',
      source,
    });

    const chunks = result.evidence?.chunks ?? [];
    const namedChunks = chunks.filter((chunk) => chunk.name);
    expect(namedChunks.some((chunk) => chunk.name?.startsWith('{'))).toBe(false);
  });
});
