import { describe, expect, it } from 'vitest';
import { resolveStructuralLanguageV1 } from './structural-language-dispatch-v1.js';

describe('resolveStructuralLanguageV1', () => {
  it('uses an explicit LSP language ID for the existing broad sidecar', () => {
    expect(resolveStructuralLanguageV1({ sourceRef: 'src/parser.py', languageId: 'python' })).toEqual({
      status: 'RESOLVED',
      language: 'python',
      provider: 'treesitter-chunker-8095',
      source: 'LSP_LANGUAGE_ID',
    });
  });

  it('uses file extensions only when explicit language hints are absent', () => {
    expect(resolveStructuralLanguageV1({ sourceRef: 'src/view.tsx' })).toMatchObject({
      status: 'RESOLVED',
      language: 'tsx',
      source: 'FILE_EXTENSION',
    });
  });

  it('rejects conflicting LSP, explicit, and extension language evidence', () => {
    expect(resolveStructuralLanguageV1({
      sourceRef: 'src/parser.py',
      language: 'python',
      languageId: 'typescript',
    })).toEqual({ status: 'REJECTED', reason: 'LANGUAGE_HINT_CONFLICT' });
    expect(resolveStructuralLanguageV1({
      sourceRef: 'src/parser.py',
      languageId: 'typescript',
    })).toEqual({ status: 'REJECTED', reason: 'LANGUAGE_EXTENSION_CONFLICT' });
    expect(resolveStructuralLanguageV1({
      sourceRef: 'src/plain.ts',
      languageId: 'typescriptreact',
    })).toEqual({ status: 'REJECTED', reason: 'LANGUAGE_EXTENSION_CONFLICT' });
  });

  it('rejects unknown language IDs rather than guessing a parser', () => {
    expect(resolveStructuralLanguageV1({ sourceRef: 'src/file.unknown', languageId: 'unknown' })).toEqual({
      status: 'REJECTED',
      reason: 'UNSUPPORTED_LANGUAGE_HINT',
    });
  });
});
