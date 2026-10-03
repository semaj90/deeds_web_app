import assert from 'node:assert/strict';
import test from 'node:test';
import { judgeLedger, parseClassification } from './audit-openspec-ledger-classification-v1.mjs';

const block = (over = {}) => {
  const f = { artifactRole: 'CONSOLIDATION_LEDGER', openspecChange: 'false', strictValidationEligible: 'false', canonicalRequirementAuthority: 'false', ...over };
  return `# t\n<!-- openspec-ledger-classification\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n')}\n-->\ntext`;
};

test('a correctly classified ledger passes', () => {
  assert.equal(judgeLedger('x', block()).verdict, 'CLASSIFIED_LEDGER');
});

test('an unclassified tasks-only directory fails unless it is tolerated debt', () => {
  assert.equal(judgeLedger('new-one', '# no marker').verdict, 'FAIL');
  assert.equal(judgeLedger('old', '# no marker', { tolerated: new Set(['old']) }).verdict, 'UNCLASSIFIED_TOLERATED');
});

test('a ledger claiming to be a change, strict-eligible or requirement authority fails', () => {
  for (const [k, v, code] of [
    ['openspecChange', 'true', 'CLAIMS_TO_BE_AN_OPENSPEC_CHANGE'],
    ['strictValidationEligible', 'true', 'CLAIMS_STRICT_VALIDATION_ELIGIBILITY'],
    ['canonicalRequirementAuthority', 'true', 'CLAIMS_REQUIREMENT_AUTHORITY'],
    ['artifactRole', 'SPEC', 'ARTIFACT_ROLE_NOT_CONSOLIDATION_LEDGER']
  ]) {
    const r = judgeLedger('x', block({ [k]: v }));
    assert.equal(r.verdict, 'FAIL');
    assert.ok(r.violations.includes(code));
  }
});

test('a ledger claiming strict validation passed fails', () => {
  const r = judgeLedger('x', `${block()}\nopenspec validate x --strict: passed`);
  assert.ok(r.violations.includes('CLAIMS_STRICT_VALIDATION_PASSED'));
  const other = judgeLedger('x', `${block()}\nopenspec validate other-change --strict: valid`);
  assert.equal(other.verdict, 'CLASSIFIED_LEDGER');
});

test('parser returns null without a marker', () => {
  assert.equal(parseClassification('nothing'), null);
});
