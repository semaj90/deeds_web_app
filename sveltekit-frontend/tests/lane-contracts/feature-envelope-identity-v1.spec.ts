import { describe, expect, it } from 'vitest';
import { FeatureEnvelopeIdentityV1Schema } from '../../src/lib/server/retrieval/feature-envelope.js';

describe('discriminated feature-envelope identity', () => {
  it('requires both canonical symbol identities for symbol envelopes', () => {
    expect(FeatureEnvelopeIdentityV1Schema.parse({
      identity_kind: 'symbol',
      stable_symbol_id: 'symbol:1',
      symbol_version_id: 'symbol-version:1',
      stable_file_id: null,
    }).identity_kind).toBe('symbol');
    expect(() => FeatureEnvelopeIdentityV1Schema.parse({
      identity_kind: 'symbol',
      stable_symbol_id: null,
      symbol_version_id: null,
      stable_file_id: 'file:1',
    })).toThrow();
  });

  it.each(['file', 'chunk'] as const)('requires explicit null symbol fields and a stable file for %s identity', (identity_kind) => {
    expect(FeatureEnvelopeIdentityV1Schema.parse({
      identity_kind,
      stable_symbol_id: null,
      symbol_version_id: null,
      stable_file_id: 'file:1',
    }).stable_file_id).toBe('file:1');
    expect(() => FeatureEnvelopeIdentityV1Schema.parse({
      identity_kind,
      stable_symbol_id: null,
      symbol_version_id: null,
      stable_file_id: null,
    })).toThrow();
  });

  it('rejects globally nullable or extra identity fields', () => {
    expect(() => FeatureEnvelopeIdentityV1Schema.parse({
      identity_kind: 'file', stable_symbol_id: null, symbol_version_id: null, stable_file_id: 'file:1',
      packet_key: 'must-not-be-smuggled-into-identity',
    })).toThrow();
    expect(() => FeatureEnvelopeIdentityV1Schema.parse({
      identity_kind: 'symbol', stable_symbol_id: 'symbol:1', symbol_version_id: null, stable_file_id: null,
    })).toThrow();
  });
});
