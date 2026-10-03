import test from 'node:test';
import assert from 'node:assert/strict';
import { attachClaudeInstructionScopeV1 as attachScope } from './document-governance-instruction-scope-v1.mjs';

const claude = (path, id) => ({ documentKind: 'CLAUDE_INSTRUCTIONS', documentId: id, path, supersedes: [], supersededBy: [] });

test('records nested scope and nearest parent without creating supersession', () => {
  const [rootResult, docsResult, nestedResult] = attachScope([
    claude('CLAUDE.md', 'root-id'),
    claude('docs/CLAUDE.md', 'docs-id'),
    claude('docs/architecture/claude.md', 'nested-id'),
  ]);
  assert.deepEqual(rootResult.instructionScope, { scopePath: '.', parentInstructionDocumentId: null, parentScopeStatus: 'ROOT' });
  assert.deepEqual(docsResult.instructionScope, { scopePath: 'docs', parentInstructionDocumentId: 'root-id', parentScopeStatus: 'RESOLVED' });
  assert.deepEqual(nestedResult.instructionScope, { scopePath: 'docs/architecture', parentInstructionDocumentId: 'docs-id', parentScopeStatus: 'RESOLVED' });
  assert.deepEqual(nestedResult.supersedes, []);
  assert.deepEqual(nestedResult.supersededBy, []);
});

test('does not invent a parent when no ancestor CLAUDE file is discovered', () => {
  const [result] = attachScope([claude('packages/example/CLAUDE.md', 'child-id')]);
  assert.equal(result.instructionScope.parentInstructionDocumentId, null);
  assert.equal(result.instructionScope.parentScopeStatus, 'NO_PARENT_DISCOVERED');
});

test('does not choose arbitrarily between case-insensitive duplicate parents', () => {
  const [, , child] = attachScope([
    claude('docs/CLAUDE.md', 'upper-id'),
    claude('docs/claude.md', 'lower-id'),
    claude('docs/child/CLAUDE.md', 'child-id'),
  ]);
  assert.equal(child.instructionScope.parentInstructionDocumentId, null);
  assert.equal(child.instructionScope.parentScopeStatus, 'AMBIGUOUS');
});

test('keeps AGENTS instructions outside the CLAUDE inheritance chain', () => {
  const [result] = attachScope([{ documentKind: 'AGENT_INSTRUCTIONS', path: 'AGENTS.md' }]);
  assert.equal(result.instructionScope, null);
});
