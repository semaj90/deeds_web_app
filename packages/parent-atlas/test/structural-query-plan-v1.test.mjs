import assert from 'node:assert/strict';
import test from 'node:test';

// Contract fixture: the runtime implementation remains non-executable until a
// live AST executor resolves its results through CandidateOrdinal.
test('structural query plan fixture preserves non-authoritative boundary', () => {
  const plan = {
    schema: 'atlas.structural-query-plan.v1',
    query: 'where is CandidateOrdinal checksum validated?',
    queryDigest: 'fixture',
    enabled: true,
    literalTerms: ['CandidateOrdinal', 'checksum', 'validated'],
    nodeKinds: ['function_declaration'],
    structuralPredicates: ['REFERENCES'],
    astGrepMode: 'ast',
    targetSymbols: ['CandidateOrdinal'],
    canonicalAuthority: false,
    executable: false,
  };
  assert.equal(plan.schema, 'atlas.structural-query-plan.v1');
  assert.equal(plan.canonicalAuthority, false);
  assert.equal(plan.executable, false);
  assert.ok(plan.targetSymbols.includes('CandidateOrdinal'));
});
