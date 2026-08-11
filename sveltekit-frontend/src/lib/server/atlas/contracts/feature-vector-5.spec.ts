// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { materializeFeatureVector5 } from './feature-vector-5.js';
import { compileExecutionUtility } from './trace-execution-utility-compiler.js';

describe('FeatureVector5 Materialization & Presence Mask', () => {
  it('returns presence_mask [1, 1, 1, 1, 0] when compiled_utility is missing', () => {
    const mat = materializeFeatureVector5({
      packet_key: 'packet:03e3bacd7a74',
      entropy_norm: 0.8,
      ast_signal: 0.9,
      domain_fit: 0.85,
      authority_norm: 0.95,
      compiled_utility: null,
    });

    expect(mat.features).toEqual([0.8, 0.9, 0.85, 0.95, 0.0]);
    expect(mat.presence_mask).toEqual([1, 1, 1, 1, 0]);
  });

  it('returns presence_mask [1, 1, 1, 1, 1] when compiled_utility is present', () => {
    const compiled = compileExecutionUtility('packet:03e3bacd7a74', [
      {
        event_id: 'ev_1',
        packet_key: 'packet:03e3bacd7a74',
        event_kind: 'execution_success',
        latency_ms: 120,
        utility_score: 0.9,
        recorded_at: new Date().toISOString(),
      },
    ]);

    const mat = materializeFeatureVector5({
      packet_key: 'packet:03e3bacd7a74',
      entropy_norm: 0.8,
      ast_signal: 0.9,
      domain_fit: 0.85,
      authority_norm: 0.95,
      compiled_utility: compiled,
    });

    expect(mat.features).toEqual([0.8, 0.9, 0.85, 0.95, 0.9]);
    expect(mat.presence_mask).toEqual([1, 1, 1, 1, 1]);
  });
});
