import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDirectoryAnalysisPriorityV1 } from './directory-analysis-priority-v1.mjs';

const base = {
  entryKind: 'FILE',
  relativePath: 'src/example.ts',
  role: 'WORKTREE_FILE',
  parserEligibility: 'PROFILE_CANDIDATE',
  editPolicy: 'INVENTORY_ONLY_NEVER_EDIT',
  dotPath: false,
};

test('priority is deterministic and explicitly not source or relevance authority', () => {
  const result = scoreDirectoryAnalysisPriorityV1(base);
  assert.deepEqual(result, scoreDirectoryAnalysisPriorityV1({ ...base }));
  assert.equal(result.analysisPriorityScore, 82);
  assert.equal(result.analysisLane, 'STRUCTURAL_ANALYSIS_CANDIDATE');
  assert.equal(result.sourceQualified, false);
  assert.equal(result.editAllowed, false);
  assert.match(result.scoreSemantics, /NOT_PROBABILITY/);
});

test('dot paths remain audit-only even if profile-mapped', () => {
  const result = scoreDirectoryAnalysisPriorityV1({ ...base, relativePath: '.github/workflows/ci.yml', dotPath: true });
  assert.equal(result.analysisPriorityScore, 54);
  assert.equal(result.analysisLane, 'AUDIT_METADATA_ONLY');
  assert.equal(result.reasonCode, 'DOT_PATH_AUDIT_ONLY');
  assert.equal(result.editAllowed, false);
});

test('audit-only parser classifications never become structural candidates', () => {
  const result = scoreDirectoryAnalysisPriorityV1({ ...base, parserEligibility: 'AUDIT_ONLY' });
  assert.equal(result.analysisLane, 'AUDIT_METADATA_ONLY');
  assert.equal(result.reasonCode, 'PARSER_AUDIT_ONLY');
});

test('dependency and binary roles receive metadata-only lanes', () => {
  const dependency = scoreDirectoryAnalysisPriorityV1({ ...base, role: 'DEPENDENCY_TREE', parserEligibility: 'NOT_PARSER_INPUT' });
  const binary = scoreDirectoryAnalysisPriorityV1({ ...base, role: 'MODEL_OR_BINARY_ARTIFACT', parserEligibility: 'NOT_PARSER_INPUT' });
  assert.equal(dependency.analysisLane, 'PACKAGE_METADATA_SELECTIVE');
  assert.equal(binary.analysisLane, 'ROLE_METADATA_ONLY');
  assert.ok(dependency.analysisPriorityScore > binary.analysisPriorityScore);
});

test('directories and malformed path rows are rejected', () => {
  assert.throws(() => scoreDirectoryAnalysisPriorityV1({ ...base, entryKind: 'DIRECTORY' }), /PATH_ROW_INVALID/);
  assert.throws(() => scoreDirectoryAnalysisPriorityV1({ ...base, relativePath: null }), /PATH_ROW_INVALID/);
});
