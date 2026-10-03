import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLanguageRegistryV1, resolveLanguageLabelV1 } from '../dist/core/language-registry-v1.js';

const vocabularies = [
  { sourceOwner: 'ast-schema', sourceRevision: 'ddl:rev1', namespace: 'AST_PARSER_LANGUAGE', labels: ['typescript', 'svelte'] },
  { sourceOwner: 'node-tree-sitter', sourceRevision: 'pkg:rev1', namespace: 'PARSER_GRAMMAR_ID', labels: ['typescript', 'tsx', 'javascript', 'jsx'] },
  { sourceOwner: 'extension-catalog', sourceRevision: 'catalog:rev1', namespace: 'FILE_EXTENSION', labels: ['.ts', '.tsx', '.js', '.jsx'] },
];

test('keeps same spelling in different vocabularies distinct and resolves only explicit bindings', () => {
  const registry = buildLanguageRegistryV1({
    vocabularies,
    bindings: [{
      fromNamespace: 'FILE_EXTENSION', fromLabel: '.tsx', toNamespace: 'PARSER_GRAMMAR_ID', toLabel: 'tsx',
      authorityOwner: 'node-tree-sitter-provider', authorityRevision: 'commit:abc', evidenceRefs: ['provider:normalizeLanguage'],
    }],
  });
  assert.equal(resolveLanguageLabelV1(registry, { namespace: 'FILE_EXTENSION', label: '.tsx' }).targetLabel, 'tsx');
  assert.equal(resolveLanguageLabelV1(registry, { namespace: 'AST_PARSER_LANGUAGE', label: 'typescript' }).status, 'UNMAPPED');
  assert.equal(resolveLanguageLabelV1(registry, { namespace: 'FILE_EXTENSION', label: '.py' }).status, 'UNSUPPORTED');
  assert.equal(registry.canonicalAuthority, false);
  assert.equal(registry.writesPerformed, false);
});

test('fails closed for conflicting explicit aliases and preserves the evidence', () => {
  const registry = buildLanguageRegistryV1({
    vocabularies,
    bindings: [
      { fromNamespace: 'FILE_EXTENSION', fromLabel: '.js', toNamespace: 'PARSER_GRAMMAR_ID', toLabel: 'javascript', authorityOwner: 'owner-a', authorityRevision: 'r1', evidenceRefs: ['a'] },
      { fromNamespace: 'FILE_EXTENSION', fromLabel: '.js', toNamespace: 'PARSER_GRAMMAR_ID', toLabel: 'jsx', authorityOwner: 'owner-b', authorityRevision: 'r2', evidenceRefs: ['b'] },
    ],
  });
  const result = resolveLanguageLabelV1(registry, { namespace: 'FILE_EXTENSION', label: '.JS' });
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.targetLabel, null);
  assert.deepEqual(result.evidenceRefs, ['a', 'b']);
});

test('build and resolution output are stable when owner snapshots arrive in a different order', () => {
  const binding = {
    fromNamespace: 'FILE_EXTENSION', fromLabel: '.ts', toNamespace: 'PARSER_GRAMMAR_ID', toLabel: 'typescript',
    authorityOwner: 'node-tree-sitter-provider', authorityRevision: 'commit:abc', evidenceRefs: ['z', 'a', 'a'],
  };
  const first = buildLanguageRegistryV1({ vocabularies, bindings: [binding] });
  const second = buildLanguageRegistryV1({ vocabularies: [...vocabularies].reverse(), bindings: [binding] });
  assert.deepEqual(first, second);
  assert.deepEqual(
    resolveLanguageLabelV1(first, { namespace: 'FILE_EXTENSION', label: '.ts' }),
    resolveLanguageLabelV1(second, { namespace: 'FILE_EXTENSION', label: '.ts' }),
  );
});

test('rejects alias bindings whose source or target was not observed in its owner vocabulary', () => {
  assert.throws(() => buildLanguageRegistryV1({
    vocabularies,
    bindings: [{
      fromNamespace: 'FILE_EXTENSION', fromLabel: '.py', toNamespace: 'PARSER_GRAMMAR_ID', toLabel: 'python',
      authorityOwner: 'owner', authorityRevision: 'r1', evidenceRefs: ['proof'],
    }],
  }), /LANGUAGE_ALIAS_SOURCE_NOT_IN_VOCABULARY/);
});
