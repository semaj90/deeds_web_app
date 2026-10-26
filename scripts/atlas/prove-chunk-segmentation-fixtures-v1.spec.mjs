import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareStoredAgainstGenerated,
  SCHEMA_V1,
  GATE_NAME,
} from './prove-chunk-segmentation-fixtures-v1.mjs';

describe('ChunkSegmentationFixturesV1 Evaluator', () => {
  test('accurately classifies chunks by matching segmentation strategies', () => {
    const sourceText = 'function a() { return 1; }\n\nfunction b() { return 2; }\n';
    const storedChunks = [
      { id: '1', content: 'function a() { return 1; }' },
      { id: '2', content: 'function nonExistent() {}' },
    ];

    const res = compareStoredAgainstGenerated(storedChunks, sourceText);

    assert.equal(res.comparisons.length, 2);
    assert.equal(res.comparisons[0].isSubstringOfCurrentSource, true);
    assert.equal(res.comparisons[1].isSubstringOfCurrentSource, false);
    assert.equal(res.comparisons[1].matchedStrategy, 'NO_CURRENT_SOURCE_MATCH');
  });
});
