import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateAtlasOkfProfileV1,
  validateOkfConceptV02,
} from './okf-v02-conformance-v1.mjs';

test('base OKF concept validity does not require Atlas profile metadata', () => {
  const document = { type: 'Concept' };

  assert.deepEqual(validateOkfConceptV02(document), { valid: true, missing: [] });
  assert.deepEqual(validateAtlasOkfProfileV1(document), {
    valid: false,
    missing: ['provenance', 'trust', 'lifecycle'],
  });
});

test('Atlas profile metadata does not substitute for the required OKF type', () => {
  const document = { provenance: { source: 'test' }, trust: 'local', lifecycle: 'draft' };

  assert.deepEqual(validateOkfConceptV02(document), { valid: false, missing: ['type'] });
  assert.deepEqual(validateAtlasOkfProfileV1(document), { valid: true, missing: [] });
});

test('rejects blank types and non-object inputs', () => {
  for (const document of [{ type: '  ' }, null, [], 'Concept']) {
    assert.equal(validateOkfConceptV02(document).valid, false);
  }
});

test('accepts optional Atlas metadata when the OKF type is present', () => {
  const document = {
    type: 'Concept',
    provenance: { source: 'fixture' },
    trust: { level: 'reviewed' },
    lifecycle: { status: 'draft' },
  };

  assert.equal(validateOkfConceptV02(document).valid, true);
  assert.equal(validateAtlasOkfProfileV1(document).valid, true);
});
