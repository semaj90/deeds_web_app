import { describe, expect, it } from 'vitest';
import { classifyObservation, aggregatePromotedUnknown } from '../../../../../scripts/atlas/lib/symbol-promoted-unknown-classifier.mjs';

// SYMBOL-PROMOTED-UNKNOWN-01 focused tests, per the review that scoped this gate. Proves the
// strict, fail-closed resolution logic actually rejects every non-EXACT path and that the
// promoted-UNKNOWN count is a genuinely distinct, deduplicated number from raw observation counts.

const REV_A = 'sha256:aaaa';
const REV_B = 'sha256:bbbb';

describe('classifyObservation (fail-closed EXACT resolution)', () => {
  it('REGISTRY_MISSING when there are zero rows for the file', () => {
    const result = classifyObservation({ utf8StartByte: 0, utf8EndByte: 10 }, REV_A, []);
    expect(result.status).toBe('REGISTRY_MISSING');
  });

  it('REVISION_MISMATCH when rows exist but under a different source_revision -- wrong sourceRevision does not count as EXACT', () => {
    const rows = [{ symbol_version_id: 'sv1', stable_symbol_id: 'ss1', source_revision: REV_B, byte_start: 0, byte_end: 10 }];
    const result = classifyObservation({ utf8StartByte: 0, utf8EndByte: 10 }, REV_A, rows);
    expect(result.status).toBe('REVISION_MISMATCH');
  });

  it('SPAN_MISMATCH when same revision has rows but none at this exact byte span -- wrong span does not count', () => {
    const rows = [{ symbol_version_id: 'sv1', stable_symbol_id: 'ss1', source_revision: REV_A, byte_start: 50, byte_end: 90 }];
    const result = classifyObservation({ utf8StartByte: 0, utf8EndByte: 10 }, REV_A, rows);
    expect(result.status).toBe('SPAN_MISMATCH');
  });

  it('AMBIGUOUS when more than one row matches the exact same revision+span -- does not count as EXACT', () => {
    const rows = [
      { symbol_version_id: 'sv1', stable_symbol_id: 'ss1', source_revision: REV_A, byte_start: 0, byte_end: 10 },
      { symbol_version_id: 'sv2', stable_symbol_id: 'ss2', source_revision: REV_A, byte_start: 0, byte_end: 10 },
    ];
    const result = classifyObservation({ utf8StartByte: 0, utf8EndByte: 10 }, REV_A, rows);
    expect(result.status).toBe('AMBIGUOUS');
  });

  it('NAME_OR_SIGNATURE_MISMATCH when span matches exactly but the names genuinely disagree -- name-only match does not count', () => {
    const rows = [{ symbol_version_id: 'sv1', stable_symbol_id: 'ss1', source_revision: REV_A, byte_start: 0, byte_end: 10, qualified_name: 'function doSomethingElse' }];
    const result = classifyObservation({ utf8StartByte: 0, utf8EndByte: 10, name: 'doThisThing' }, REV_A, rows);
    expect(result.status).toBe('NAME_OR_SIGNATURE_MISMATCH');
  });

  it('EXACT requires source_revision AND unique exact byte span (and non-conflicting name where both present)', () => {
    const rows = [{ symbol_version_id: 'sv1', stable_symbol_id: 'ss1', source_revision: REV_A, byte_start: 0, byte_end: 10, qualified_name: 'function doThisThing' }];
    const result = classifyObservation({ utf8StartByte: 0, utf8EndByte: 10, name: 'doThisThing' }, REV_A, rows);
    expect(result.status).toBe('EXACT');
    expect(result.symbolVersionId).toBe('sv1');
    expect(result.stableSymbolId).toBe('ss1');
  });

  it('a mere name match at the WRONG span does not count as promotion (name-only join forbidden)', () => {
    // Same name present elsewhere in the file at a different span -- must not resolve EXACT.
    const rows = [{ symbol_version_id: 'sv1', stable_symbol_id: 'ss1', source_revision: REV_A, byte_start: 500, byte_end: 600, qualified_name: 'function doThisThing' }];
    const result = classifyObservation({ utf8StartByte: 0, utf8EndByte: 10, name: 'doThisThing' }, REV_A, rows);
    expect(result.status).toBe('SPAN_MISMATCH');
  });
});

describe('aggregatePromotedUnknown (observation-level vs distinct-symbol dedup)', () => {
  it('a raw UNKNOWN observation alone (no EXACT resolution) does not count as promotion', () => {
    const items = [{ symbolKind: 'UNKNOWN', classification: { status: 'REGISTRY_MISSING' }, registrySymbolKind: null }];
    const agg = aggregatePromotedUnknown(items);
    expect(agg.promotedUnknown.observationLevelCount).toBe(0);
    expect(agg.promotedUnknown.registryRowCount).toBe(0);
  });

  it('EXACT UNKNOWN -> registry UNKNOWN counts as promoted UNKNOWN', () => {
    const items = [{
      symbolKind: 'UNKNOWN',
      classification: { status: 'EXACT', symbolVersionId: 'sv1', stableSymbolId: 'ss1' },
      registrySymbolKind: 'UNKNOWN',
    }];
    const agg = aggregatePromotedUnknown(items);
    expect(agg.exactResolvedUnknownObservations).toBe(1);
    expect(agg.promotedUnknown.observationLevelCount).toBe(1);
    expect(agg.promotedUnknown.registryRowCount).toBe(1);
    expect(agg.inverseAnomalies.observationUnknownRegistryTyped).toHaveLength(0);
    expect(agg.inverseAnomalies.typedObservationToUnknownRegistry).toHaveLength(0);
  });

  it('EXACT UNKNOWN -> registry FUNCTION is reported separately (observationUnknownRegistryTyped), not counted as promoted UNKNOWN', () => {
    const items = [{
      symbolKind: 'UNKNOWN',
      classification: { status: 'EXACT', symbolVersionId: 'sv1', stableSymbolId: 'ss1' },
      registrySymbolKind: 'FUNCTION',
    }];
    const agg = aggregatePromotedUnknown(items);
    expect(agg.promotedUnknown.observationLevelCount).toBe(0);
    expect(agg.inverseAnomalies.observationUnknownRegistryTyped).toHaveLength(1);
  });

  it('known FUNCTION -> registry UNKNOWN is reported separately (typedObservationToUnknownRegistry), not counted as promoted UNKNOWN', () => {
    const items = [{
      symbolKind: 'FUNCTION',
      classification: { status: 'EXACT', symbolVersionId: 'sv1', stableSymbolId: 'ss1' },
      registrySymbolKind: 'UNKNOWN',
    }];
    const agg = aggregatePromotedUnknown(items);
    expect(agg.promotedUnknown.observationLevelCount).toBe(0);
    expect(agg.inverseAnomalies.typedObservationToUnknownRegistry).toHaveLength(1);
  });

  it('multiple observations resolving to the SAME stable_symbol_id are deduplicated for the canonical registry-pollution count', () => {
    // Mirrors the review's worked example: many observations, few distinct symbol versions,
    // even fewer distinct stable symbols -- the registry-pollution count must be the smallest one.
    const items = [
      { symbolKind: 'UNKNOWN', classification: { status: 'EXACT', symbolVersionId: 'sv1', stableSymbolId: 'ss1' }, registrySymbolKind: 'UNKNOWN' },
      { symbolKind: 'UNKNOWN', classification: { status: 'EXACT', symbolVersionId: 'sv1', stableSymbolId: 'ss1' }, registrySymbolKind: 'UNKNOWN' }, // duplicate observation of the same version
      { symbolKind: 'UNKNOWN', classification: { status: 'EXACT', symbolVersionId: 'sv2', stableSymbolId: 'ss1' }, registrySymbolKind: 'UNKNOWN' }, // different version, same stable symbol
      { symbolKind: 'UNKNOWN', classification: { status: 'EXACT', symbolVersionId: 'sv3', stableSymbolId: 'ss2' }, registrySymbolKind: 'UNKNOWN' }, // genuinely different symbol
    ];
    const agg = aggregatePromotedUnknown(items);
    expect(agg.promotedUnknown.observationLevelCount).toBe(4); // raw observation count
    expect(agg.promotedUnknown.distinctSymbolVersionCount).toBe(3); // sv1, sv2, sv3
    expect(agg.promotedUnknown.distinctStableSymbolCount).toBe(2); // ss1, ss2
    expect(agg.promotedUnknown.registryRowCount).toBe(2); // the canonical pollution count -- NOT 4
  });
});
