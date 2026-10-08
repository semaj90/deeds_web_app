import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { proveDomainClassifierPassV1 } from './domain-classifier-pass-proof-v1.mjs';

const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const packet = {
  packetKey: 'packet:fixture-1',
  sourceRef: 'src/example.ts',
  sourceRevision: `sha256:${'a'.repeat(64)}`,
  workspaceRevision: `sha256:${'b'.repeat(64)}`,
};
const text = 'export function example() { return true; }';

function response(overrides = {}) {
  return {
    document_id: packet.packetKey,
    pass_results: [{
      family: 'classify',
      pass_name: 'domain_classifier',
      pass_revision: 'domain_classifier-v1',
      backend: 'sklearn-lr',
      backend_version: 'domain-classifier-nblr-v1-test',
      packet_key: packet.packetKey,
      source_ref: packet.sourceRef,
      source_revision: packet.sourceRevision,
      workspace_revision: packet.workspaceRevision,
      input_hash: digest([text, 'classify', 'domain_classifier', packet.sourceRef, packet.packetKey, ''].join('||')),
      output_hash: digest('classifier output'),
      status: 'succeeded',
      features: { naive_bayes_domain_probability: 0.7, logistic_regression_domain_probability: 0.8 },
      artifacts: { model_revision: 'domain-classifier-nblr-v1-test', label: 'retrieval', naive_bayes_label: 'retrieval', logistic_regression_label: 'retrieval' },
      warnings: [],
      ...overrides,
    }],
  };
}

test('accepts one successful classifier pass bound to exact packet and input', () => {
  const result = proveDomainClassifierPassV1({ packet, text, response: response() });
  assert.equal(result.status, 'PASS_CALLER_BOUND');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.pass.modelRevision, 'domain-classifier-nblr-v1-test');
});

test('rejects response identity or input checksum drift', () => {
  const mutated = response({ source_revision: `sha256:${'c'.repeat(64)}`, input_hash: digest('other') });
  const result = proveDomainClassifierPassV1({ packet, text, response: mutated });
  assert.equal(result.status, 'UNQUALIFIED');
  assert.ok(result.failures.includes('SOURCE_REVISION_MISMATCH'));
  assert.ok(result.failures.includes('INPUT_CHECKSUM_MISMATCH'));
});

test('rejects absent provenance, failed execution, and malformed probabilities', () => {
  const result = proveDomainClassifierPassV1({
    packet,
    text,
    response: response({ status: 'skipped', backend_version: 'unknown', features: { naive_bayes_domain_probability: 3 } }),
  });
  assert.equal(result.status, 'UNQUALIFIED');
  assert.ok(result.failures.includes('CLASSIFIER_PASS_NOT_SUCCEEDED'));
  assert.ok(result.failures.includes('BACKEND_REVISION_MISSING'));
  assert.ok(result.failures.includes('NAIVE_BAYES_PROBABILITY_INVALID'));
});

test('rejects missing or ambiguous classify pass', () => {
  const missing = proveDomainClassifierPassV1({ packet, text, response: { document_id: packet.packetKey, pass_results: [] } });
  const ambiguous = proveDomainClassifierPassV1({ packet, text, response: { ...response(), pass_results: [...response().pass_results, ...response().pass_results] } });
  assert.ok(missing.failures.includes('CLASSIFIER_PASS_MISSING'));
  assert.ok(ambiguous.failures.includes('CLASSIFIER_PASS_AMBIGUOUS'));
});
