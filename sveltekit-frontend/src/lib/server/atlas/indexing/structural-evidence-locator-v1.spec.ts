import { describe, expect, it } from 'vitest';

import type { ExtractedFeature } from '$lib/server/analysis/ast-grep-extractor.js';
import {
  locateAstGrepFeatureV1,
  locateStructuralChunkV1,
  materializeStructuralEvidenceLocatorV1,
} from './structural-evidence-locator-v1.js';

describe('StructuralEvidenceLocatorV1', () => {
  it('binds UTF-8 byte spans to source revision without claiming identity authority', () => {
    const source = 'const café = () => 1;\r\n';
    const bytes = Buffer.from(source, 'utf8');
    const startByte = bytes.indexOf(Buffer.from('café', 'utf8'));
    const endByte = bytes.indexOf(Buffer.from(';', 'utf8')) + 1;

    const locator = materializeStructuralEvidenceLocatorV1({
      provider: 'node-tree-sitter',
      sourceRef: 'src/example.ts',
      sourceRevision: 'sha256:source-v1',
      source,
      startByte,
      endByte,
      name: 'café',
      rawKind: 'FUNCTION',
      rawNodeType: 'variable_declarator',
    });

    expect(locator.spanValid).toBe(true);
    expect(locator.sourceFingerprint.utf8ByteLength).toBe(bytes.byteLength);
    expect(locator.symbolKind).toBe('FUNCTION');
    expect(locator.identityAuthority).toBe(false);
    expect(locator.comparisonKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it('gives exact equivalent provider observations the same comparison key', () => {
    const source = 'export function alpha() { return 1; }\n';
    const bytes = Buffer.from(source, 'utf8');
    const endByte = bytes.byteLength - 1;
    const astFeature: ExtractedFeature = {
      type: 'ast_function',
      name: 'alpha',
      description: 'Function alpha()',
      source: 'ast-grep',
      byteStart: 0,
      byteEnd: endByte,
      ruleId: 'function_declaration',
    };

    const left = locateAstGrepFeatureV1({
      sourceRef: 'src/a.ts',
      sourceRevision: 'sha256:abc',
      source,
      feature: astFeature,
    });
    const right = locateStructuralChunkV1({
      provider: 'node-tree-sitter',
      sourceRef: 'src/a.ts',
      sourceRevision: 'sha256:abc',
      source,
      chunk: {
        node_type: 'function_declaration',
        kind: 'FUNCTION',
        name: 'alpha',
        start_byte: 0,
        end_byte: endByte,
        start_line: 0,
        start_column: 0,
        end_line: 0,
        end_column: endByte,
        calls: [],
        imports: [],
        exports: ['alpha'],
      },
    });

    expect(left.comparisonKey).toBe(right.comparisonKey);
    expect(left.spanSha256).toBe(right.spanSha256);
  });

  it('does not hide chunk-boundary disagreement behind name equality', () => {
    const source = 'const alpha = () => 1;\n';
    const narrow = materializeStructuralEvidenceLocatorV1({
      provider: 'ast-grep',
      sourceRef: 'src/a.ts',
      sourceRevision: 'sha256:abc',
      source,
      startByte: 6,
      endByte: 21,
      name: 'alpha',
      rawKind: 'FUNCTION',
      rawNodeType: 'arrow_function',
    });
    const broad = materializeStructuralEvidenceLocatorV1({
      provider: 'treesitter-chunker',
      sourceRef: 'src/a.ts',
      sourceRevision: 'sha256:abc',
      source,
      startByte: 0,
      endByte: Buffer.from(source, 'utf8').byteLength,
      name: 'alpha',
      rawKind: 'FUNCTION',
      rawNodeType: 'declaration',
    });

    expect(narrow.name).toBe(broad.name);
    expect(narrow.comparisonKey).not.toBe(broad.comparisonKey);
  });

  it('rejects invalid spans rather than manufacturing compatibility', () => {
    expect(() => materializeStructuralEvidenceLocatorV1({
      provider: 'treesitter-chunker',
      sourceRef: 'src/a.ts',
      sourceRevision: 'sha256:abc',
      source: 'const a = 1;',
      startByte: 0,
      endByte: 999,
      name: 'a',
      rawKind: 'VARIABLE',
      rawNodeType: 'variable_declarator',
    })).toThrow('STRUCTURAL_LOCATOR_SPAN_INVALID');
  });
});
