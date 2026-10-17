import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoldenReviewJudgmentEventV1,
  hashGoldenReviewCohortV1,
  isDuplicateGoldenReviewDecisionV1,
  readGoldenReviewJournalV1,
  goldenHumanJudgmentErrorsV1,
} from './golden-review-journal-v1.mjs';

const cohortChecksum = hashGoldenReviewCohortV1('frozen-cohort');
const eventInput = {
  cohortChecksum,
  queryPacketKey: 'query-1',
  packetKey: 'candidate-1',
  relevanceGrade: 0,
  confidence: 0.9,
  reviewerId: 'reviewer-1',
  isHardNegative: true,
  eventId: 'event-1',
  recordedAt: '2026-10-15T00:00:00.000Z',
};

test('creates a non-authoritative, non-training-eligible human judgment event', () => {
  const event = createGoldenReviewJudgmentEventV1(eventInput);
  assert.equal(event.judgmentSource, 'HUMAN_REVIEWED');
  assert.equal(event.trainingEligible, false);
  assert.equal(event.canonicalAuthority, false);
  assert.equal(event.sourceAuthorityStatus, 'NOT_ESTABLISHED_BY_RELEVANCE_REVIEW');
  assert.match(event.eventChecksum, /^sha256:[a-f0-9]{64}$/);
});

test('records corrections as a chained supersession instead of replacing history', () => {
  const first = createGoldenReviewJudgmentEventV1(eventInput);
  const correction = createGoldenReviewJudgmentEventV1({
    ...eventInput,
    eventId: 'event-2',
    relevanceGrade: 1,
    isHardNegative: false,
    previousEvent: first,
    recordedAt: '2026-10-15T00:01:00.000Z',
  });
  const journal = readGoldenReviewJournalV1([first, correction].map((event) => JSON.stringify(event)).join('\n'), cohortChecksum);
  assert.equal(journal.events.length, 2);
  assert.equal(journal.latest.get('query-1|candidate-1').eventId, 'event-2');
  assert.equal(journal.latest.get('query-1|candidate-1').supersedesEventId, 'event-1');
});

test('treats an identical reviewer submission as an idempotent replay', () => {
  const first = createGoldenReviewJudgmentEventV1(eventInput);
  assert.equal(isDuplicateGoldenReviewDecisionV1(first, eventInput), true);
  assert.equal(isDuplicateGoldenReviewDecisionV1(first, { ...eventInput, reviewerId: 'reviewer-2' }), false);
  assert.equal(isDuplicateGoldenReviewDecisionV1(first, { ...eventInput, relevanceGrade: 1, isHardNegative: false }), false);
});

test('rejects modified decisions, cohort mismatch, and broken supersession chains', () => {
  const first = createGoldenReviewJudgmentEventV1(eventInput);
  const tampered = { ...first, confidence: 0.8 };
  assert.throws(() => readGoldenReviewJournalV1(JSON.stringify(tampered), cohortChecksum), /JOURNAL_CHECKSUM_MISMATCH/);
  assert.throws(() => readGoldenReviewJournalV1(JSON.stringify(first), hashGoldenReviewCohortV1('other')), /JOURNAL_COHORT_MISMATCH/);
  const broken = createGoldenReviewJudgmentEventV1({
    ...eventInput,
    eventId: 'event-2',
    previousEvent: { eventId: 'not-event-1' },
    recordedAt: '2026-10-15T00:01:00.000Z',
  });
  assert.throws(() => readGoldenReviewJournalV1([first, broken].map((event) => JSON.stringify(event)).join('\n'), cohortChecksum), /JOURNAL_SUPERSESSION_CHAIN_INVALID/);
});

test('rejects invalid human judgment fields', () => {
  assert.throws(() => createGoldenReviewJudgmentEventV1({ ...eventInput, relevanceGrade: 4 }), /JUDGMENT_GRADE_INVALID/);
  assert.throws(() => createGoldenReviewJudgmentEventV1({ ...eventInput, confidence: Number.NaN }), /JUDGMENT_CONFIDENCE_INVALID/);
  assert.throws(() => createGoldenReviewJudgmentEventV1({ ...eventInput, reviewerId: ' ' }), /JUDGMENT_REVIEWER_REQUIRED/);
  assert.throws(() => createGoldenReviewJudgmentEventV1({ ...eventInput, relevanceGrade: 1 }), /HARD_NEGATIVE_MUST_BE_IRRELEVANT/);
});

test('requires finite confidence, explicit human source, nonblank reviewer and consistent negative flags', () => {
  const valid = { ...eventInput, judgmentSource: 'HUMAN_REVIEWED' };
  assert.deepEqual(goldenHumanJudgmentErrorsV1(valid), []);
  for (const confidence of [NaN, Infinity, -Infinity]) {
    assert.ok(goldenHumanJudgmentErrorsV1({ ...valid, confidence }).includes('JUDGMENT_CONFIDENCE_INVALID'));
  }
  for (const judgmentSource of ['MODEL_PROXY', 'langextract', '', null, undefined]) {
    assert.ok(goldenHumanJudgmentErrorsV1({ ...valid, judgmentSource }).includes('JUDGMENT_HUMAN_REVIEW_REQUIRED'));
  }
  assert.ok(goldenHumanJudgmentErrorsV1({ ...valid, reviewerId: ' ' }).includes('JUDGMENT_REVIEWER_REQUIRED'));
  assert.ok(goldenHumanJudgmentErrorsV1({ ...valid, isHardNegative: 'true' }).includes('HARD_NEGATIVE_FLAG_INVALID'));
});

test('journal read rejects proxy-source and whitespace-reviewer events before accepting them', () => {
  const event = createGoldenReviewJudgmentEventV1(eventInput);
  for (const patch of [{ judgmentSource: 'MODEL_PROXY' }, { reviewerId: ' ' }]) {
    assert.throws(() => readGoldenReviewJournalV1(JSON.stringify({ ...event, ...patch }), cohortChecksum),
      /JOURNAL_JUDGMENT_INVALID/);
  }
});
