import test from 'node:test';
import assert from 'node:assert/strict';
import { isGraphifySymbolExcludedArtifactV1, isGraphifySymbolExcludedArtifactV2, selectBoundedSupportedExtractorCandidates } from './graphify-symbol-candidate-selection-v1.mjs';

test('generated and evaluation JSON artifacts are excluded from symbol-source coverage', () => {
  const excluded = [
    'sveltekit-frontend/memory/runs/2026-05-07/graph_nodes.json',
    'scripts/memory/graphify/gds/run.json',
    'sveltekit-frontend/drizzle/meta/0041_snapshot.json',
    'vectors/content_768_f32_row_map.json',
    'sveltekit-frontend/phase110_ground_truth/ground_truth_k50.json',
    'sveltekit-frontend/static/phase72/route-ast-graph.json',
    'sveltekit-frontend/scripts/atlas/.stage1-prior-snapshot.json',
    'sveltekit-frontend/unreachable-classified.json',
  ];
  for (const sourceRef of excluded) assert.equal(isGraphifySymbolExcludedArtifactV1(sourceRef), true, sourceRef);
  assert.equal(isGraphifySymbolExcludedArtifactV1('sveltekit-frontend/package.json'), false);
  assert.equal(isGraphifySymbolExcludedArtifactV1('docs/architecture/retrieval.json'), false);
});

test('generated artifacts cannot occupy or enter a frozen symbol-extraction batch', () => {
  const rows = [
    { source_ref: 'sveltekit-frontend/memory/runs/r1/graph_nodes.json' },
    { source_ref: 'sveltekit-frontend/package.json' },
    { source_ref: 'docs/architecture/retrieval.json' },
  ];
  const result = selectBoundedSupportedExtractorCandidates(rows, () => 'json', 2);
  assert.deepEqual(result.candidates.map(({ row }) => row.source_ref), [
    'sveltekit-frontend/package.json', 'docs/architecture/retrieval.json',
  ]);
  assert.equal(result.supportedCandidatePoolRows, 2);
  assert.equal(result.skippedUnsupported, 1);
});

test('unsupported refs do not consume the bounded admitted extraction limit', () => {
  const rows = [
    { source_ref: 'a.lock' },
    { source_ref: 'b.bin' },
    { source_ref: 'c.md' },
    { source_ref: 'd.ts' },
    { source_ref: 'e.json' },
  ];
  const classify = (ref) => ref.endsWith('.md') ? 'markdown'
    : ref.endsWith('.ts') ? 'ts_js'
      : ref.endsWith('.json') ? 'json'
        : 'unsupported';

  const result = selectBoundedSupportedExtractorCandidates(rows, classify, 2);

  assert.deepEqual(result.candidates.map(({ row }) => row.source_ref), ['c.md', 'd.ts']);
  assert.equal(result.candidatePoolRows, 5);
  assert.equal(result.supportedCandidatePoolRows, 3);
  assert.equal(result.skippedUnsupported, 2);
});

test('candidate selector rejects non-positive or unsafe limits', () => {
  assert.throws(() => selectBoundedSupportedExtractorCandidates([], () => 'unsupported', 0), {
    message: 'EXTRACTOR_CANDIDATE_LIMIT_INVALID',
  });
});

test('stale or missing admitted bytes do not consume the bounded extraction limit', () => {
  const rows = [
    { source_ref: 'a.md', eligible: false },
    { source_ref: 'b.ts', eligible: 'MISSING' },
    { source_ref: 'c.json', eligible: true },
    { source_ref: 'd.ts', eligible: true },
  ];
  const classify = (ref) => ref.endsWith('.md') ? 'markdown'
    : ref.endsWith('.ts') ? 'ts_js'
      : ref.endsWith('.json') ? 'json'
        : 'unsupported';

  const result = selectBoundedSupportedExtractorCandidates(rows, classify, 2, (row) => row.eligible);

  assert.deepEqual(result.candidates.map(({ row }) => row.source_ref), ['c.json', 'd.ts']);
  assert.equal(result.precheckRowsExamined, 4);
  assert.equal(result.precheckRevisionMismatchRows, 1);
  assert.equal(result.precheckMissingSourceRows, 1);
  assert.deepEqual(result.sourceRevisionRejectSample, ['a.md']);
});

test('V2 excludes generated tool-output JSON that is not strict JSON, and V1 stays frozen', () => {
  const v2Only = [
    'sveltekit-frontend/svelte-errors.json',
    'sveltekit-frontend/svelte-errors-utf8.json',
    'docs/reports/drizzle-audit-current-utf8.json',
    'sveltekit-frontend/drizzle/sidecar-audit-validated.json',
    'sveltekit-frontend/drizzle/sidecar-audit-report.json',
    'mcp_tools.json',
    'mcp_init.json',
  ];
  for (const sourceRef of v2Only) {
    assert.equal(isGraphifySymbolExcludedArtifactV2(sourceRef), true, sourceRef);
    assert.equal(isGraphifySymbolExcludedArtifactV1(sourceRef), false, `V1 must not change: ${sourceRef}`);
  }
  // everything V1 excludes is still excluded by V2
  for (const sourceRef of ['sveltekit-frontend/drizzle/meta/0041_snapshot.json', 'sveltekit-frontend/unreachable-classified.json']) {
    assert.equal(isGraphifySymbolExcludedArtifactV2(sourceRef), true, sourceRef);
  }
  // authored files and nested lookalikes stay included
  for (const sourceRef of ['sveltekit-frontend/package.json', 'docs/architecture/retrieval.json', 'sveltekit-frontend/tsconfig.frontend.json', 'sveltekit-frontend/src/mcp_tools.json']) {
    assert.equal(isGraphifySymbolExcludedArtifactV2(sourceRef), false, sourceRef);
  }
});
