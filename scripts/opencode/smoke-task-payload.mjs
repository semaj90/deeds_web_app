#!/usr/bin/env node
import { normalizeTaskPayload, validateTaskPayload } from './normalize-task-payload.mjs';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

function runTests() {
  console.log('Test: empty input');
  const a = normalizeTaskPayload(null);
  assert(validateTaskPayload(a), 'empty input should normalize to valid payload');

  console.log('Test: partial Engram JSON (no description)');
  const partial = { context: { user_goal: 'Find vulnerabilities' } };
  const b = normalizeTaskPayload(partial);
  assert(validateTaskPayload(b), 'partial Engram should normalize');
  assert(b.description && b.description.length > 0, 'description must be present after normalization');

  console.log('Test: title only fallback');
  const titleOnly = { title: 'Quick audit' };
  const tOnly = normalizeTaskPayload(titleOnly);
  assert(validateTaskPayload(tOnly), 'title-only should normalize');
  assert(tOnly.description.includes('Quick audit'), 'title should appear in description');

  console.log('Test: why/action only fallback');
  const whyAction = { why: 'Because of missing manifest', action: 'Run graph:manifest' };
  const wa = normalizeTaskPayload(whyAction);
  assert(validateTaskPayload(wa), 'why/action only should normalize');
  assert(wa.description.includes('Because of missing manifest') && wa.description.includes('Run graph:manifest'), 'why/action should appear in description');

  console.log('Test: ACE packet only');
  const aceOnly = { ace_packet_key: 'ace:packet:latest' };
  const c = normalizeTaskPayload(aceOnly);
  assert(validateTaskPayload(c), 'ace only should normalize');

  console.log('Test: malformed JSON string');
  const mal = '{ this is not: json }';
  const d = normalizeTaskPayload(mal);
  assert(validateTaskPayload(d), 'malformed string should fallback to default and validate');

  console.log('Test: valid full payload');
  const full = {
    description: 'Run Atlas audit using retrieved Engram context.',
    context: { user_goal: 'Audit', recent_memory: ['m1'] },
    constraints: ['Windows safe'],
    expected_output: { likely_cause: '', evidence: [], patch_targets: [], safe_next_command: '', do_not_do: [] }
  };
  const e = normalizeTaskPayload(full);
  assert(validateTaskPayload(e), 'full payload should validate');

  console.log('All smoke tests passed');
}

try {
  runTests();
} catch (err) {
  console.error('Smoke tests failed:', err.message);
  process.exit(1);
}
