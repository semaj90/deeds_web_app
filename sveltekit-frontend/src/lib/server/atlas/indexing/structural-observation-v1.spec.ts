import { describe, expect, it } from 'vitest';

import {
  fingerprintStructuralSource,
  normalizeStructuralSymbolKind,
  projectStructuralObservation,
} from './structural-observation-v1.js';

describe('StructuralObservationV1', () => {
  it('keeps fragment unknown instead of fabricating variable parity', () => {
    expect(normalizeStructuralSymbolKind('fragment', 'fragment')).toBe('UNKNOWN');
    expect(normalizeStructuralSymbolKind('VARIABLE', 'variable_declarator')).toBe('VARIABLE');
    expect(normalizeStructuralSymbolKind('FUNCTION', 'variable_declarator')).toBe('FUNCTION');
  });

  it('fingerprints CRLF source as UTF-8 bytes', () => {
    const source = 'const a = 1;\r\nconst b = 2;\r\n';
    const fingerprint = fingerprintStructuralSource(source);
    expect(fingerprint.utf8ByteLength).toBe(Buffer.from(source, 'utf8').byteLength);
    expect(fingerprint.crlfCount).toBe(2);
    expect(fingerprint.lfCount).toBe(2);
    expect(fingerprint.loneLfCount).toBe(0);
  });

  it('checks provider spans against the original request bytes', () => {
    const source = 'const alpha = () => 1;\r\nconst beta = () => 2;\r\n';
    const bytes = Buffer.from(source, 'utf8');
    const startByte = bytes.indexOf(Buffer.from('alpha', 'utf8'));
    const endByte = bytes.indexOf(Buffer.from(';', 'utf8'), startByte) + 1;
    const observation = projectStructuralObservation('node', source, {
      node_type: 'variable_declarator',
      kind: 'FUNCTION',
      name: 'alpha',
      parent_route: [],
      parent_context: 'lexical_declaration',
      start_byte: startByte,
      end_byte: endByte,
      start_line: 0,
      start_column: 6,
      end_line: 0,
      end_column: 21,
      calls: [],
      imports: [],
      exports: [],
    });

    expect(observation.spanValid).toBe(true);
    expect(observation.spanContainsName).toBe(true);
  });
});
