import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePacketSummary } from './validate-packet-summary-v1.mjs';

// Excerpts copied from the live canonical packet scan (2026-10-13), not invented.
const DRAFTING = [
  'The summary needs to be 1-2 sentences and should explain the function of the endpoint.',
  '**Drafting the summary:** (Focus on *what* it does and *why* it\'s important.)This endpoint provides a diagnostic health check.',
  '5. **Synthesize the summary:** The function acts as a central API endpoint. **Drafting the summary (1-2 sentences):**',
  'Constraint Checklist:\n1. Role: Legal code analyzer.\n2. Length: 1-2 sentences.',
  '*Draft 1:* This endpoint executes a MapReduce matrix analysis across pipelines.',
  'The goal is to summarize this in 1-2 concise and precise sentences.',
];

const CLEAN = [
  'This endpoint provides a diagnostic health check for the data synchronization process between Postgres and Qdrant.',
  'This code disables Server-Side Rendering (SSR) for the Tiptap editor. The editor relies on browser-only DOM APIs.',
  'This function immediately returns empty metadata to ensure fast initial page rendering.',
];

test('drafting text from the live scan is rejected', () => {
  for (const s of DRAFTING) {
    const r = validatePacketSummary(s);
    assert.equal(r.ok, false, `expected rejection: ${s.slice(0, 60)}`);
    assert.notEqual(r.reason, 'OK');
  }
});

test('finished one- or two-sentence summaries pass', () => {
  for (const s of CLEAN) {
    assert.deepEqual(validatePacketSummary(s), { ok: true, reason: 'OK' }, s.slice(0, 60));
  }
});

test('empty and oversized summaries are rejected', () => {
  assert.equal(validatePacketSummary('').reason, 'EMPTY_SUMMARY');
  assert.equal(validatePacketSummary('   ').reason, 'EMPTY_SUMMARY');
  const long = 'One. Two. Three. Four. Five.';
  assert.equal(validatePacketSummary(long).reason, 'TOO_LONG');
});
