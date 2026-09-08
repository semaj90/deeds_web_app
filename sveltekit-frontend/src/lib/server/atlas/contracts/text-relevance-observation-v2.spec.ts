import { describe, expect, it } from 'vitest';
import {
  CalibrationIdentityV2Schema,
  TextRelevanceObservationV2Schema,
  checksumCalibrationIdentityV2,
  normalizeTextRelevanceScoreV2,
  validateTextRelevanceObservationBatchV2,
} from './text-relevance-observation-v2.js';

const base = {
  canonicalId: 'packet:one',
  modelRevision: 'model:test',
  weightRevision: 'weights:test',
  domain: 'code' as const,
  inferenceMode: 'mxbai' as const,
  quantization: 'fp16' as const,
};

describe('TextRelevanceObservationV2', () => {
  it('normalizes an mxbai margin exactly once', () => {
    const normalized = normalizeTextRelevanceScoreV2({ scoreType: 'MXBAI_MARGIN', rawScore: 0 });
    expect(normalized).toEqual({ normalizedScore: 0.5, normalization: 'SIGMOID_V1' });
    expect(TextRelevanceObservationV2Schema.parse({ ...base, scoreType: 'MXBAI_MARGIN', rawScore: 0, ...normalized })).toMatchObject(normalized);
  });

  it('normalizes an AtlasGemma cross logit with the same explicit method', () => {
    const normalized = normalizeTextRelevanceScoreV2({ scoreType: 'ATLAS_GEMMA_CROSS_LOGIT', rawScore: 2 });
    expect(normalized.normalizedScore).toBeCloseTo(0.880797077, 8);
    expect(normalized.normalization).toBe('SIGMOID_V1');
  });

  it('leaves MaxSim uncalibrated rather than applying sigmoid', () => {
    expect(normalizeTextRelevanceScoreV2({ scoreType: 'ATLAS_GEMMA_MAXSIM', rawScore: 17 })).toEqual({ normalizedScore: null, normalization: null });
  });

  it('rejects a logit observation with no sigmoid normalization', () => {
    expect(() => TextRelevanceObservationV2Schema.parse({ ...base, scoreType: 'MXBAI_MARGIN', rawScore: 1, normalizedScore: null, normalization: null })).toThrow('LOGIT_SCORE_REQUIRES_SIGMOID_V1');
  });

  it('rejects a MaxSim score disguised as a probability', () => {
    expect(() => TextRelevanceObservationV2Schema.parse({ ...base, scoreType: 'ATLAS_GEMMA_MAXSIM', inferenceMode: 'late64', rawScore: 17, normalizedScore: 0.9, normalization: 'SIGMOID_V1' })).toThrow('MAXSIM_REQUIRES_EXPLICIT_CALIBRATION');
  });

  it('keeps calibrated output distinct from normalized ranking score', () => {
    const calibrationIdentity = CalibrationIdentityV2Schema.parse({
      scoreType: 'ATLAS_GEMMA_MAXSIM',
      modelRevision: 'model:test',
      adapterRevision: 'none',
      weightRevision: 'weights:test',
      domain: 'code',
      inferenceMode: 'late64',
      quantization: 'fp16',
      labelSetRevision: 'labels:test',
      calibrationMethod: 'LATE_HEAD_V1',
    });
    const parsed = TextRelevanceObservationV2Schema.parse({
      ...base,
      scoreType: 'ATLAS_GEMMA_MAXSIM',
      inferenceMode: 'late64',
      rawScore: 17,
      normalizedScore: null,
      normalization: 'LATE_HEAD_CALIBRATION_V1',
      calibratedScore: 0.82,
      calibrationIdentity,
    });
    expect(parsed.calibratedScore).toBe(0.82);
  });

  it('rejects calibrated output without the calibration method marker', () => {
    expect(() => TextRelevanceObservationV2Schema.parse({ ...base, scoreType: 'MXBAI_MARGIN', rawScore: 1, normalizedScore: 0.73, normalization: 'SIGMOID_V1', calibratedScore: 0.8 })).toThrow('CALIBRATED_SCORE_REQUIRES_LATE_HEAD_CALIBRATION_V1');
  });

  it('rejects non-finite raw scores before normalization', () => {
    expect(() => normalizeTextRelevanceScoreV2({ scoreType: 'MXBAI_MARGIN', rawScore: Number.NaN })).toThrow('RAW_SCORE_MUST_BE_FINITE');
  });

  it('changes the calibration checksum when any identity axis changes', () => {
    const identity = CalibrationIdentityV2Schema.parse({
      scoreType: 'MXBAI_MARGIN', modelRevision: 'm1', adapterRevision: 'none', weightRevision: 'w1',
      domain: 'mixed', inferenceMode: 'mxbai', quantization: 'fp16', labelSetRevision: 'labels1', calibrationMethod: 'PLATT_V1',
    });
    const changed = { ...identity, domain: 'legal' as const };
    expect(checksumCalibrationIdentityV2(identity)).not.toBe(checksumCalibrationIdentityV2(changed));
  });

  it('rejects a calibration identity that belongs to another model revision', () => {
    const identity = CalibrationIdentityV2Schema.parse({
      scoreType: 'ATLAS_GEMMA_MAXSIM', modelRevision: 'other-model', adapterRevision: 'none', weightRevision: 'w1',
      domain: 'code', inferenceMode: 'late64', quantization: 'fp16', labelSetRevision: 'labels1', calibrationMethod: 'LATE_HEAD_V1',
    });
    expect(() => TextRelevanceObservationV2Schema.parse({
      ...base, scoreType: 'ATLAS_GEMMA_MAXSIM', inferenceMode: 'late64', rawScore: 3,
      normalizedScore: null, normalization: 'LATE_HEAD_CALIBRATION_V1', calibratedScore: 0.7, calibrationIdentity: identity,
    })).toThrow('CALIBRATION_IDENTITY_DOES_NOT_MATCH_OBSERVATION');
  });
});

describe('validateTextRelevanceObservationBatchV2 (FT-06 batch-level checks)', () => {
  function observation(canonicalId: string, rawScore = 1) {
    return TextRelevanceObservationV2Schema.parse({
      ...base,
      canonicalId,
      scoreType: 'MXBAI_MARGIN' as const,
      rawScore,
      ...normalizeTextRelevanceScoreV2({ scoreType: 'MXBAI_MARGIN', rawScore }),
    });
  }

  it('accepts a batch with unique candidate ids and no expected-set check', () => {
    const batch = [observation('packet:a'), observation('packet:b'), observation('packet:c')];
    expect(() => validateTextRelevanceObservationBatchV2(batch)).not.toThrow();
  });

  it('rejects a batch containing a duplicate candidate row', () => {
    const batch = [observation('packet:a'), observation('packet:b'), observation('packet:a')];
    expect(() => validateTextRelevanceObservationBatchV2(batch)).toThrow('DUPLICATE_CANDIDATE_ROWS: packet:a');
  });

  it('names every duplicated id when multiple candidates repeat', () => {
    const batch = [observation('packet:a'), observation('packet:a'), observation('packet:b'), observation('packet:b')];
    expect(() => validateTextRelevanceObservationBatchV2(batch)).toThrow('DUPLICATE_CANDIDATE_ROWS: packet:a, packet:b');
  });

  it('accepts a batch that covers every expected candidate id', () => {
    const batch = [observation('packet:a'), observation('packet:b')];
    expect(() => validateTextRelevanceObservationBatchV2(batch, ['packet:a', 'packet:b'])).not.toThrow();
  });

  it('rejects a batch missing a score for an expected candidate id', () => {
    const batch = [observation('packet:a')];
    expect(() => validateTextRelevanceObservationBatchV2(batch, ['packet:a', 'packet:b'])).toThrow('MISSING_SCORES_FOR_CANDIDATES: packet:b');
  });

  it('does not require every observed candidate to be in the expected set (extra scores are not an error)', () => {
    const batch = [observation('packet:a'), observation('packet:b')];
    expect(() => validateTextRelevanceObservationBatchV2(batch, ['packet:a'])).not.toThrow();
  });

  it('demonstrates why a second sigmoid must never be applied (documented danger, not a preventable case)', () => {
    // normalizeTextRelevanceScoreV2 is the ONLY sanctioned raw->normalized path.
    // Feeding an already-normalized [0,1] score back in as if it were a fresh
    // raw logit silently produces a different, wrong value -- this cannot be
    // detected from the value alone (0.5 is a valid raw logit AND a valid
    // already-normalized score), which is exactly why callers must never do it.
    const once = normalizeTextRelevanceScoreV2({ scoreType: 'MXBAI_MARGIN', rawScore: 2 });
    const twice = normalizeTextRelevanceScoreV2({ scoreType: 'MXBAI_MARGIN', rawScore: once.normalizedScore! });
    expect(twice.normalizedScore).not.toBeCloseTo(once.normalizedScore!, 5);
  });
});
