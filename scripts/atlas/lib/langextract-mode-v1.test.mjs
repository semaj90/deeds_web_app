import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLangExtractModeV1 } from './langextract-mode-v1.mjs';

test('defaults to concepts mode', () => {
  assert.equal(resolveLangExtractModeV1(undefined), 'concepts');
});

test('accepts bounded relationship proposals', () => {
  assert.equal(resolveLangExtractModeV1('relationships'), 'relationships');
});

test('rejects unsupported extraction modes', () => {
  for (const mode of ['entities', 'full', 'arbitrary']) {
    assert.throws(() => resolveLangExtractModeV1(mode), { message: 'UNSUPPORTED_EXTRACTION_MODE' });
  }
});
