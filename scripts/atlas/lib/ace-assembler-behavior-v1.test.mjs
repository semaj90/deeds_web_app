import assert from 'node:assert/strict';
import test from 'node:test';
import ACEAssemblerRecommendations from '../../agent/ace-assembler-recommendations.mjs';

test('rankCandidates sorts descending and enforces maxCandidates', () => {
  const assembler = new ACEAssemblerRecommendations({ maxCandidates: 2 });
  assembler.addCandidate('low', 'Low', 0.2, ['low evidence']);
  assembler.addCandidate('high', 'High', 0.9, ['high evidence']);
  assembler.addCandidate('middle', 'Middle', 0.5, ['middle evidence']);

  const ranked = assembler.rankCandidates();

  assert.deepEqual(ranked.map((candidate) => candidate.key), ['high', 'middle']);
  assert.deepEqual(ranked.map((candidate) => candidate.score), [0.9, 0.5]);
});

test('assembleContext includes only evidence from the selected top-K candidates', () => {
  const assembler = new ACEAssemblerRecommendations({ maxCandidates: 1 });
  assembler.addCandidate('selected', 'Selected candidate', 1, ['selected evidence']);
  assembler.addCandidate('excluded', 'Excluded candidate', 0.1, ['excluded evidence']);

  const context = assembler.assembleContext();

  assert.match(context, /Selected candidate/);
  assert.match(context, /selected evidence/);
  assert.doesNotMatch(context, /Excluded candidate/);
  assert.doesNotMatch(context, /excluded evidence/);
});

test('generateRecommendations preserves the ranked order and sequential rank labels', () => {
  const assembler = new ACEAssemblerRecommendations({ maxCandidates: 2 });
  assembler.addCandidate('second', 'Second', 0.6, []);
  assembler.addCandidate('first', 'First', 0.8, []);
  assembler.addCandidate('excluded', 'Excluded', 0.1, []);

  const recommendations = assembler.generateRecommendations();

  assert.deepEqual(recommendations.map((recommendation) => [recommendation.rank, recommendation.title]), [
    [1, 'First'],
    [2, 'Second'],
  ]);
});
