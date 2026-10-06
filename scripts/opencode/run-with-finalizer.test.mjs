// ANSWER-FINALIZER-02: pure-function tests for the finalizer harness (no opencode spawn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINALIZER, needsFinalizer, parseEvents, stripThink, summarizeEvents } from './run-with-finalizer.mjs';

const ev = (o) => JSON.stringify(o);

test('stripThink removes think blocks and trims', () => {
  assert.equal(stripThink('<think>\n</think>'), '');
  assert.equal(stripThink('<think>x</think>  answer '), 'answer');
});

test('needsFinalizer: empty, short and think-only answers trigger; a real answer does not', () => {
  assert.equal(needsFinalizer(''), true);
  assert.equal(needsFinalizer(stripThink('<think></think>')), true);
  assert.equal(needsFinalizer('too short'), true);
  assert.equal(needsFinalizer('a'.repeat(40)), false);
});

test('parseEvents skips non-JSON lines and malformed JSON', () => {
  const out = [ev({ type: 'step_start' }), 'plain log line', '{bad json', ev({ type: 'text', part: { text: 'x' } })].join('\r\n');
  assert.equal(parseEvents(out).length, 2);
  assert.deepEqual(parseEvents(undefined), []);
});

test('summarizeEvents counts steps, calls per step, atlas-tools and write attempts', () => {
  const events = [
    { type: 'step_start', sessionID: 'ses_1' },
    { type: 'tool_use', part: { tool: 'todowrite' } },
    { type: 'step_finish', part: { tokens: { total: 1000 } } },
    { type: 'step_start' },
    { type: 'tool_use', part: { tool: 'grep' } },
    { type: 'tool_use', part: { tool: 'atlas-tools_find_feature' } },
    { type: 'tool_use', part: { tool: 'atlas-tools_record_outcome' } },
    { type: 'step_finish', part: { tokens: { total: 2500 } } },
    { type: 'step_start' },
    { type: 'text', part: { text: '<think></think>' } },
  ];
  const s = summarizeEvents(events);
  assert.equal(s.sessionId, 'ses_1');
  assert.equal(s.steps, 3);
  assert.equal(s.maxCallsInOneStep, 3);
  assert.equal(s.atlasToolsCalls, 2);
  assert.equal(s.writeAttempts, 1);
  assert.equal(s.toolCalls.grep, 1);
  assert.equal(s.lastContextTokens, 2500);
  assert.equal(s.peakContextTokens, 2500);
  assert.equal(s.finalText, '');
  assert.equal(needsFinalizer(s.finalText), true);
});

test('summarizeEvents on no events is all-zero and has a null session', () => {
  const s = summarizeEvents([]);
  assert.equal(s.steps, 0);
  assert.equal(s.sessionId, null);
  assert.equal(s.peakContextTokens, 0);
});

test('FINALIZER message forbids more tool calls', () => {
  assert.match(FINALIZER, /Do not call any more tools/);
});
