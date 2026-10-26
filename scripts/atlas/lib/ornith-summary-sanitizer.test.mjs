import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasOrnithReasoningLeak,
  isUsableOrnithSummary,
  sanitizeOrnithSummary,
} from './ornith-summary-sanitizer.mjs';

const LEGAL_MARKDOWN = `# 30-Day Notice for Month-to-Month Leases

To answer this question properly, let me think through the relevant legal principles.

## The General Rule

Month-to-month tenancies renew automatically each month until terminated.

## The Common Standard

The most widely applicable rule requires **30 days' written notice**.`;

// Exact reply from ornith-1.5-9b on :8090 (2026-10-26), prompt: "think step by step about a 30-day notice".
const LIVE_ORNITH_REPLY = `# 30-Day Notice for Month-to-Month Leases

To answer this question properly, let me think through the relevant legal principles.

## The General Rule

Month-to-month tenancies are "at-will" leases that renew automatically each month until terminated. The standard legal framework in most U.S. jurisdictions requires **advance written notice** to terminate this arrangement.

## The Common Standard

The most widely applicable rule requires **30 days' written notice**, delivered from either party:
- **Landlord → Tenant:** To terminate the tenancy
- **Tenant → Landlord:** To end the arrangement early

## Important Caveats

However, several factors can change this answer:

| Factor | Effect |
|--------|--------|
| **State law** | Some states require 30, 60, or other notice periods |
| **Local ordinances** | Cities may impose longer requirements |
| **Lease agreement** | A written lease may specify a different (but not shorter) term |
| **Just-cause jurisdictions** | Rent-controlled areas may require additional procedural safeguards |

## Conclusion

**Yes, generally a 30-day written notice is required to terminate a month-to-month lease, though the exact requirement may vary by state law, local rules, or the terms of the specific lease agreement.**`;

test('live Ornith reply keeps its structure and is not flagged as leaky', () => {
  const out = sanitizeOrnithSummary(LIVE_ORNITH_REPLY);
  assert.match(out.summary, /^# 30-Day Notice for Month-to-Month Leases$/m);
  assert.match(out.summary, /^## The General Rule$/m);
  assert.match(out.summary, /^## Important Caveats$/m);
  assert.match(out.summary, /^## Conclusion$/m);
  assert.match(out.summary, /To answer this question properly, let me think through the relevant legal principles\./);
  assert.match(out.summary, /^\| \*\*State law\*\* \| Some states require 30, 60, or other notice periods \|$/m);
  assert.equal(out.leaky, false);
  assert.equal(out.safe, true);
});

test('plain summary passes through unchanged', () => {
  const input = 'On March 3 the tenant reported a broken boiler. The landlord promised repair by March 20.';
  const out = sanitizeOrnithSummary(input);
  assert.equal(out.summary, input);
  assert.equal(out.changed, false);
  assert.equal(out.leaky, false);
  assert.equal(out.safe, true);
});

test('markdown reply keeps headings on their own lines and keeps mid-line content', () => {
  const out = sanitizeOrnithSummary(LEGAL_MARKDOWN);
  // The Gemma copy joined "## The General Rule" into the previous line. Headings must stay separate.
  assert.match(out.summary, /^# 30-Day Notice for Month-to-Month Leases$/m);
  assert.match(out.summary, /^## The General Rule$/m);
  assert.match(out.summary, /^## The Common Standard$/m);
  assert.match(out.summary, /Month-to-month tenancies renew automatically/);
  assert.match(out.summary, /30 days' written notice/);
});

test('"let me" mid-sentence in legal prose is kept and is not a leak', () => {
  const out = sanitizeOrnithSummary(LEGAL_MARKDOWN);
  assert.match(out.summary, /To answer this question properly, let me think through the relevant legal principles\./);
  assert.equal(out.leaky, false);
  assert.equal(out.safe, true);
});

test('a line-start "Let me" sentence is removed and the raw reply is flagged as leaky', () => {
  const out = sanitizeOrnithSummary('Let me think about the deadline.\nThe notice period is 30 days.');
  assert.equal(out.summary, 'The notice period is 30 days.');
  assert.equal(out.leaky, true);
  assert.equal(out.safe, true);
});

test('ChatML tokens are stripped and flagged as leaks', () => {
  const raw = '<|im_start|>assistant\nThe lease terminates after 30 days.<|im_end|>';
  assert.equal(hasOrnithReasoningLeak(raw), true);
  const out = sanitizeOrnithSummary(raw);
  assert.equal(out.summary, 'The lease terminates after 30 days.');
  assert.equal(out.safe, true);
});

test('<endoftext> is stripped', () => {
  const out = sanitizeOrnithSummary('The notice was served on June 1.<|endoftext|>');
  assert.equal(out.summary, 'The notice was served on June 1.');
});

test('<think> blocks are removed with their contents', () => {
  const raw = '<think>We should check the statute first.</think>The notice period is 30 days.';
  const out = sanitizeOrnithSummary(raw);
  assert.equal(out.summary, 'The notice period is 30 days.');
  assert.equal(out.safe, true);
});

test('unclosed <think> is flagged as unsafe and its body is not returned as the answer', () => {
  const out = sanitizeOrnithSummary('<think>\n1. The landlord promised repairs by March 20\n2. The tenant withheld rent');
  assert.equal(out.leaky, true);
  assert.equal(out.safe, false);
  assert.equal(out.summary, '');
});

test('unclosed reasoning channel is unsafe', () => {
  const out = sanitizeOrnithSummary('<|channel|>thought We need to list the clauses first');
  assert.equal(out.safe, false);
  assert.equal(out.summary, '');
});

test('"Note:" and "Important:" legal content is kept by default', () => {
  const raw = 'Note: the exhibit list is incomplete.\nImportant: the deposition was taken under seal on May 2.';
  const kept = sanitizeOrnithSummary(raw);
  assert.match(kept.summary, /^Note: the exhibit list is incomplete\.$/m);
  assert.match(kept.summary, /^Important: the deposition was taken under seal on May 2\.$/m);
});

test('dropMetaLines:true removes "Note:" and "Important:" lines when a caller opts in', () => {
  const raw = 'Note: the exhibit list is incomplete.\nImportant: the deposition was taken under seal on May 2.';
  const dropped = sanitizeOrnithSummary(raw, { dropMetaLines: true });
  assert.doesNotMatch(dropped.summary, /^Note:/m);
  assert.doesNotMatch(dropped.summary, /^Important:/m);
});

test('isUsableOrnithSummary rejects unsafe and too-short input', () => {
  assert.equal(isUsableOrnithSummary('<think>unclosed reasoning here and more text'), false);
  assert.equal(isUsableOrnithSummary('Short.'), false);
  assert.equal(
    isUsableOrnithSummary('The tenant reported a broken boiler and the landlord promised repair by March twenty, but failed.'),
    true,
  );
});
