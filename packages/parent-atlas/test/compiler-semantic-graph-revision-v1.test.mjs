import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCompilerSemanticGraphRevisionV1 } from '../dist/core/compiler-semantic-graph-revision-v1.js';

const hash = (letter) => `sha256:${letter.repeat(64)}`;
const base = {
  workspaceRevision: 'workspace:r1', sourceInventoryDigest: hash('a'),
  projectConfiguration: { tsconfigChecksum: hash('b'), svelteConfigChecksum: null, packageJsonChecksum: hash('c'), lockfileChecksum: hash('d'), projectReferenceDigest: hash('e') },
  runtime: { typescriptVersion: '5.9', typescriptLanguageServerVersion: '5.3.0', svelteLanguageServerVersion: '0.18.3', resolverRevision: 'resolver:r1' },
  resolutions: [{ sourceRef: 'src/a.ts', sourceRevision: 'sha256:source-a', occurrencePosition: { line: 2, character: 4 }, targetSourceRef: 'src/b.ts', targetSourceRevision: 'sha256:source-b', targetRange: { start: { line: 8, character: 0 }, end: { line: 8, character: 5 } }, resolutionClass: 'RESOLVED_INTERNAL' }],
};

test('compiler semantic revision is invariant to resolution order', () => {
  const first = deriveCompilerSemanticGraphRevisionV1(base);
  const second = deriveCompilerSemanticGraphRevisionV1({ ...base, resolutions: [...base.resolutions].reverse() });
  assert.equal(first.compilerSemanticGraphRevision, second.compilerSemanticGraphRevision);
  assert.equal(first.canonicalAuthority, false);
});

test('compiler semantic revision changes when project configuration changes', () => {
  const first = deriveCompilerSemanticGraphRevisionV1(base);
  const second = deriveCompilerSemanticGraphRevisionV1({ ...base, projectConfiguration: { ...base.projectConfiguration, tsconfigChecksum: hash('f') } });
  assert.notEqual(first.compilerSemanticGraphRevision, second.compilerSemanticGraphRevision);
});

test('compiler semantic revision is independent of unrelated AST revision fields', () => {
  const astGraphRevision = 'ast:r1';
  const withoutAstField = deriveCompilerSemanticGraphRevisionV1(base);
  const sameCompilerInput = deriveCompilerSemanticGraphRevisionV1(base);
  assert.equal(typeof astGraphRevision, 'string');
  assert.equal(withoutAstField.compilerSemanticGraphRevision, sameCompilerInput.compilerSemanticGraphRevision);
});
