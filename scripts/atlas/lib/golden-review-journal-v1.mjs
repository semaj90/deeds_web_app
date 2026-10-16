import { createHash, randomUUID } from 'node:crypto';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function checksum(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

export function hashGoldenReviewCohortV1(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

export function createGoldenReviewJudgmentEventV1(input) {
  if (!input.cohortChecksum || !input.queryPacketKey || !input.packetKey) throw new Error('JUDGMENT_IDENTITY_REQUIRED');
  if (!Number.isInteger(input.relevanceGrade) || input.relevanceGrade < 0 || input.relevanceGrade > 3) throw new Error('JUDGMENT_GRADE_INVALID');
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw new Error('JUDGMENT_CONFIDENCE_INVALID');
  if (typeof input.reviewerId !== 'string' || !input.reviewerId.trim()) throw new Error('JUDGMENT_REVIEWER_REQUIRED');
  if (input.isHardNegative === true && input.relevanceGrade !== 0) throw new Error('HARD_NEGATIVE_MUST_BE_IRRELEVANT');

  const event = {
    schema: 'atlas.golden-relevance-judgment-event.v1',
    eventId: input.eventId ?? randomUUID(),
    cohortChecksum: input.cohortChecksum,
    queryPacketKey: input.queryPacketKey,
    packetKey: input.packetKey,
    evaluationUnit: 'SOURCE_FILE',
    relevanceGrade: input.relevanceGrade,
    confidence: input.confidence,
    judgmentSource: 'HUMAN_REVIEWED',
    reviewerId: input.reviewerId.trim(),
    notes: input.notes ?? null,
    isHardNegative: input.isHardNegative === true,
    sourceAuthorityStatus: 'NOT_ESTABLISHED_BY_RELEVANCE_REVIEW',
    trainingEligible: false,
    canonicalAuthority: false,
    supersedesEventId: input.previousEvent?.eventId ?? null,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  return { ...event, eventChecksum: checksum(event) };
}

export function isDuplicateGoldenReviewDecisionV1(previousEvent, input) {
  if (!previousEvent) return false;
  return previousEvent.relevanceGrade === input.relevanceGrade
    && previousEvent.confidence === input.confidence
    && previousEvent.reviewerId === input.reviewerId.trim()
    && (previousEvent.notes ?? null) === (input.notes ?? null)
    && previousEvent.isHardNegative === (input.isHardNegative === true);
}

export function readGoldenReviewJournalV1(contents, expectedCohortChecksum) {
  const events = contents.split(/\r?\n/).filter(Boolean).map((line, index) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`JOURNAL_JSON_INVALID_AT_LINE_${index + 1}`);
    }
    if (event.schema !== 'atlas.golden-relevance-judgment-event.v1') throw new Error(`JOURNAL_SCHEMA_INVALID_AT_LINE_${index + 1}`);
    if (event.cohortChecksum !== expectedCohortChecksum) throw new Error(`JOURNAL_COHORT_MISMATCH_AT_LINE_${index + 1}`);
    if (event.trainingEligible !== false || event.canonicalAuthority !== false || event.sourceAuthorityStatus !== 'NOT_ESTABLISHED_BY_RELEVANCE_REVIEW') {
      throw new Error(`JOURNAL_AUTHORITY_FLAGS_INVALID_AT_LINE_${index + 1}`);
    }
    if (!event.queryPacketKey || !event.packetKey || !event.eventId || !event.reviewerId || !Number.isInteger(event.relevanceGrade)
      || event.relevanceGrade < 0 || event.relevanceGrade > 3 || typeof event.confidence !== 'number'
      || !Number.isFinite(event.confidence) || event.confidence < 0 || event.confidence > 1
      || (event.isHardNegative === true && event.relevanceGrade !== 0)) {
      throw new Error(`JOURNAL_JUDGMENT_INVALID_AT_LINE_${index + 1}`);
    }
    const { eventChecksum, ...body } = event;
    if (eventChecksum !== checksum(body)) throw new Error(`JOURNAL_CHECKSUM_MISMATCH_AT_LINE_${index + 1}`);
    return event;
  });

  const latest = new Map();
  const eventIds = new Set();
  for (const event of events) {
    if (eventIds.has(event.eventId)) throw new Error('JOURNAL_DUPLICATE_EVENT_ID');
    eventIds.add(event.eventId);
    const key = `${event.queryPacketKey}|${event.packetKey}`;
    const previous = latest.get(key) ?? null;
    if (event.supersedesEventId !== (previous?.eventId ?? null)) throw new Error('JOURNAL_SUPERSESSION_CHAIN_INVALID');
    latest.set(key, event);
  }
  return { events, latest };
}
