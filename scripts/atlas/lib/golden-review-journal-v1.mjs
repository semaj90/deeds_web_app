import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

export function readGoldenReviewValidationEvidenceV1(root, args) {
  const selectedReport = args.find((arg) => arg.startsWith('--golden-validation-report='))?.split('=').slice(1).join('=');
  const selectedInput = args.find((arg) => arg.startsWith('--golden-review-input='))?.split('=').slice(1).join('=');
  const result = { path: selectedReport ?? null, exists: false, value: {
    status: 'GOLDEN_VALIDATION_UNSELECTED', canonicalAuthority: false,
    firstBlockingInvariant: 'EXPLICIT_GOLDEN_RECEIPT_AND_INPUT_REQUIRED',
  } };
  if (!selectedReport || !selectedInput) return result;
  try {
    const reportBytes = readFileSync(path.resolve(root, selectedReport));
    const receipt = JSON.parse(reportBytes.toString('utf8'));
    const inputBytes = readFileSync(path.resolve(root, selectedInput));
    if (receipt.schema !== 'atlas.golden-relevance-review-queue-validation-v1') throw new Error('GOLDEN_VALIDATION_SCHEMA_MISMATCH');
    if (receipt.inputChecksum !== hashGoldenReviewCohortV1(inputBytes)) throw new Error('GOLDEN_VALIDATION_INPUT_CHECKSUM_MISMATCH');
    if (path.resolve(root, receipt.inputPath ?? '') !== path.resolve(root, selectedInput)) throw new Error('GOLDEN_VALIDATION_INPUT_PATH_MISMATCH');
    if (receipt.canonicalAuthority !== false || receipt.importAllowed !== false || receipt.databaseWrites !== false) throw new Error('GOLDEN_VALIDATION_AUTHORITY_FLAGS_INVALID');
    const rows = inputBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const queryKeys = new Set();
    const judgments = [];
    for (const row of rows) {
      if (row?.schema !== 'atlas.golden-relevance-review-item.v1' || !row.queryPacketKey ||
          !row.querySourceRef || !row.queryText || queryKeys.has(row.queryPacketKey) ||
          !Array.isArray(row.judgments) || row.judgments.length === 0) throw new Error('GOLDEN_VALIDATION_INPUT_STRUCTURE_INVALID');
      queryKeys.add(row.queryPacketKey);
      const packetKeys = new Set();
      for (const judgment of row.judgments) {
        if (!judgment?.packetKey || packetKeys.has(judgment.packetKey)) throw new Error('GOLDEN_VALIDATION_CANDIDATE_IDENTITY_INVALID');
        packetKeys.add(judgment.packetKey);
        judgments.push(judgment);
      }
    }
    const completed = judgments.filter((judgment) => judgment.relevanceGrade != null && goldenHumanJudgmentErrorsV1(judgment).length === 0);
    const counts = {
      queryCount: rows.length, judgmentCount: judgments.length, completedJudgmentCount: completed.length,
      blankJudgmentCount: judgments.filter((judgment) => judgment.relevanceGrade == null).length,
      invalidJudgmentCount: judgments.filter((judgment) => judgment.relevanceGrade != null && goldenHumanJudgmentErrorsV1(judgment).length > 0).length,
      hardNegativeCount: completed.filter((judgment) => judgment.isHardNegative === true).length,
    };
    if (Object.entries(counts).some(([key, value]) => receipt[key] !== value)) throw new Error('GOLDEN_VALIDATION_COUNTS_MISMATCH');
    return { path: selectedReport, exists: true, value: {
      status: 'GOLDEN_VALIDATION_INPUT_BOUND', canonicalAuthority: false,
      inputPath: selectedInput, inputChecksum: hashGoldenReviewCohortV1(inputBytes),
      validationReceiptChecksum: hashGoldenReviewCohortV1(reportBytes),
      ...counts, importAllowed: false,
      firstBlockingInvariant: completed.length === 0 ? 'HUMAN_REVIEWED_JUDGMENTS_PENDING' : 'JOURNAL_COHORT_SOURCE_AUTHORITY_NOT_ESTABLISHED',
    } };
  } catch (error) {
    return { ...result, value: { ...result.value, status: 'GOLDEN_VALIDATION_REJECTED',
      firstBlockingInvariant: error instanceof Error && error.message.startsWith('GOLDEN_VALIDATION_')
        ? error.message : 'GOLDEN_VALIDATION_READBACK_FAILED',
    } };
  }
}

export function goldenHumanJudgmentErrorsV1(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return ['JUDGMENT_INVALID'];
  if (!Number.isInteger(input.relevanceGrade) || input.relevanceGrade < 0 || input.relevanceGrade > 3) errors.push('JUDGMENT_GRADE_INVALID');
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) errors.push('JUDGMENT_CONFIDENCE_INVALID');
  if (typeof input.reviewerId !== 'string' || !input.reviewerId.trim()) errors.push('JUDGMENT_REVIEWER_REQUIRED');
  if (input.judgmentSource !== 'HUMAN_REVIEWED') errors.push('JUDGMENT_HUMAN_REVIEW_REQUIRED');
  if (input.isHardNegative != null && typeof input.isHardNegative !== 'boolean') errors.push('HARD_NEGATIVE_FLAG_INVALID');
  if (input.isHardNegative === true && input.relevanceGrade !== 0) errors.push('HARD_NEGATIVE_MUST_BE_IRRELEVANT');
  return errors;
}

export function createGoldenReviewJudgmentEventV1(input) {
  if (!input.cohortChecksum || !input.queryPacketKey || !input.packetKey) throw new Error('JUDGMENT_IDENTITY_REQUIRED');
  const errors = goldenHumanJudgmentErrorsV1({ ...input, judgmentSource: 'HUMAN_REVIEWED' });
  if (errors.length) throw new Error(errors[0]);

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
    if (!event.queryPacketKey || !event.packetKey || !event.eventId || goldenHumanJudgmentErrorsV1(event).length) {
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
