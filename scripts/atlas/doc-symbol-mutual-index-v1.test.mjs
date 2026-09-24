import test from 'node:test';
import assert from 'node:assert/strict';
import { matchApiRuleToSymbols } from './lib/doc-symbol-mutual-index-v1.mjs';

const docRevision = `sha256:${'a'.repeat(64)}`;
const codeRevision = `sha256:${'b'.repeat(64)}`;
const symbol = {
  canonicalQualifiedName: 'Graph.from_cudf_edgelist',
  stableSymbolId: 'stable-symbol:graph-method',
  symbolVersionId: 'symbol-version:graph-method',
  sourceRef: 'src/graph.py',
  sourceRevision: codeRevision,
};
const rule = {
  apiSymbol: 'Graph.from_cudf_edgelist',
  evidenceSpan: { sourceRevision: docRevision },
  targetSourceRevision: codeRevision,
};

test('matches exact symbol using a distinct explicit code revision', () => {
  const result = matchApiRuleToSymbols(rule, [symbol]);
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.matches[0].documentationSourceRevision, docRevision);
  assert.equal(result.matches[0].codeSourceRevision, codeRevision);
});

test('does not treat a documentation revision as a code revision', () => {
  const result = matchApiRuleToSymbols({ ...rule, targetSourceRevision: undefined }, [symbol]);
  assert.equal(result.status, 'UNRESOLVED');
  assert.equal(result.reason, 'TARGET_CODE_SOURCE_REVISION_MISSING');
});

test('rejects stale target code revisions', () => {
  const result = matchApiRuleToSymbols({ ...rule, targetSourceRevision: `sha256:${'c'.repeat(64)}` }, [symbol]);
  assert.equal(result.status, 'STALE_CODE_SOURCE');
});

test('rejects duplicate exact-revision symbol matches as ambiguous', () => {
  const result = matchApiRuleToSymbols(rule, [symbol, { ...symbol, symbolVersionId: 'symbol-version:duplicate' }]);
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.matches.length, 2);
});

test('rejects malformed documentation revisions and unmapped symbols', () => {
  assert.equal(matchApiRuleToSymbols({ ...rule, evidenceSpan: { sourceRevision: 'workspace:0' } }, [symbol]).status, 'UNRESOLVED');
  assert.equal(matchApiRuleToSymbols({ ...rule, apiSymbol: 'Missing.symbol' }, [symbol]).reason, 'SYMBOL_NOT_FOUND');
});
