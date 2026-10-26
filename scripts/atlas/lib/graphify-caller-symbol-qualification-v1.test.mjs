import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyGraphifyCallerSymbolV1 } from './graphify-caller-symbol-qualification-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const symbol = {
  symbol_id: 'symbol-1',
  metadata: { workspace_revision: workspaceRevision, source_revision: sourceRevision },
};

test('qualifies a caller only when both source and workspace revisions match', () => {
  assert.deepEqual(qualifyGraphifyCallerSymbolV1({ symbol, workspaceRevision, sourceRevision }), {
    qualified: true,
    reasons: [],
  });
});

test('rejects source-matching symbols from a different workspace revision', () => {
  const result = qualifyGraphifyCallerSymbolV1({
    symbol: { ...symbol, metadata: { ...symbol.metadata, workspace_revision: `sha256:${'c'.repeat(64)}` } },
    workspaceRevision,
    sourceRevision,
  });
  assert.equal(result.qualified, false);
  assert.deepEqual(result.reasons, ['WORKSPACE_REVISION_MISMATCH']);
});

test('rejects symbols without exact source revision metadata', () => {
  const result = qualifyGraphifyCallerSymbolV1({
    symbol: { ...symbol, metadata: { workspace_revision: workspaceRevision } },
    workspaceRevision,
    sourceRevision,
  });
  assert.equal(result.qualified, false);
  assert.deepEqual(result.reasons, ['SOURCE_REVISION_MISMATCH']);
});

test('rejects malformed metadata and missing symbol identity', () => {
  assert.equal(qualifyGraphifyCallerSymbolV1({ symbol: { ...symbol, metadata: '{' }, workspaceRevision, sourceRevision }).qualified, false);
  assert.deepEqual(qualifyGraphifyCallerSymbolV1({ symbol: { metadata: symbol.metadata }, workspaceRevision, sourceRevision }), {
    qualified: false,
    reasons: ['SYMBOL_ID_MISSING'],
  });
});
